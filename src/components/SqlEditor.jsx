import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useApp } from '../store/AppContext'
import { makeDS } from '../lib/data'
import { useToast } from './Toast'
import s from './SqlEditor.module.css'

const isElectron = !!window.MP

// ─── sql.js loader via script tag (UMD bundle sets window.initSqlJs) ────────
let sqlPromise = null
function getSql () {
  if (!sqlPromise) {
    sqlPromise = new Promise((resolve, reject) => {
      const init = () => {
        if (typeof window.initSqlJs !== 'function') {
          reject(new Error('initSqlJs not found after script load'))
          return
        }
        window.initSqlJs({
          locateFile: () =>
            isElectron && window.MP?.resourcesPath
              ? `file://${window.MP.resourcesPath}/sql-wasm.wasm`
              : '/sql-wasm.wasm',
        }).then(resolve).catch(reject)
      }
      if (typeof window.initSqlJs === 'function') { init(); return }
      const script = document.createElement('script')
      script.src = '/sql-wasm.js'
      script.onload  = init
      script.onerror = () => reject(new Error('Failed to load sql-wasm.js'))
      document.head.appendChild(script)
    })
  }
  return sqlPromise
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildTableNames (tabs) {
  const map  = {}
  const seen = new Map()
  tabs.forEach(ds => {
    let base = ds.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!base || /^\d/.test(base)) base = 't' + (base || 'bl')
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    map[ds.id] = n === 0 ? base : `${base}_${n + 1}`
  })
  return map
}

async function buildDB (SQL, tabs, tableMap) {
  const db = new SQL.Database()
  for (const ds of tabs) {
    const tbl     = tableMap[ds.id]
    const colDefs = ds.cols.map(c => `"${c.replace(/"/g, '""')}" TEXT`).join(', ')
    db.run(`CREATE TABLE "${tbl}" (${colDefs})`)
    if (ds.rows.length) {
      const ph   = ds.cols.map(() => '?').join(', ')
      const stmt = db.prepare(`INSERT INTO "${tbl}" VALUES (${ph})`)
      for (const row of ds.rows) stmt.run(ds.cols.map(c => String(row[c] ?? '')))
      stmt.free()
    }
  }
  return db
}

function execSql (db, sql) {
  const t0  = performance.now()
  const res = db.exec(sql.trim())
  const ms  = +(performance.now() - t0).toFixed(2)
  if (!res.length) return { cols: [], rows: [], ms }
  const { columns, values } = res[0]
  const rows = values.map(v => Object.fromEntries(columns.map((c, i) => [c, v[i]])))
  return { cols: columns, rows, ms }
}

// ─── Schema sidebar ───────────────────────────────────────────────────────────
function SchemaPane ({ tabs, tableMap, onInsert }) {
  const [collapsed, setCollapsed] = useState({})
  const toggle = id => setCollapsed(p => ({ ...p, [id]: !p[id] }))

  if (!tabs.length) {
    return (
      <div className={s.schema}>
        <div className={s.schemaHd}>Schema</div>
        <div className={s.schemaEmpty}>No open datasets</div>
      </div>
    )
  }

  return (
    <div className={s.schema}>
      <div className={s.schemaHd}>Schema</div>
      {tabs.map(ds => {
        const tbl  = tableMap[ds.id] || ds.name
        const open = !collapsed[ds.id]
        return (
          <div key={ds.id} className={s.schemaSect}>
            <div className={s.schemaTblRow} onClick={() => toggle(ds.id)}>
              <svg
                className={s.schemaChev + (open ? ' ' + s.schemaChevOpen : '')}
                width="8" height="8" viewBox="0 0 16 16"
                fill="none" stroke="currentColor" strokeWidth="2.5"
              >
                <path d="M4 6l4 4 4-4"/>
              </svg>
              <span
                className={s.schemaTblName}
                onClick={e => { e.stopPropagation(); onInsert(tbl) }}
                title="Click to insert table name"
              >
                {tbl}
              </span>
              <span className={s.schemaTblCount}>{ds.rows.length.toLocaleString()}</span>
            </div>

            {open && ds.cols.map(col => {
              const isNum = ds.rows.slice(0, 10).some(r => r[col] !== '' && r[col] != null) &&
                ds.rows.slice(0, 10).every(r => r[col] === '' || r[col] == null || !isNaN(parseFloat(r[col])))
              return (
                <div
                  key={col}
                  className={s.schemaColRow}
                  onClick={() => onInsert(`"${col}"`)}
                  title={`Insert "${col}"`}
                >
                  <span className={s.schemaType + ' ' + (isNum ? s.schemaTypeNum : s.schemaTypeCat)}>
                    {isNum ? '#' : 'A'}
                  </span>
                  <span className={s.schemaColName}>{col}</span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ─── Results table ────────────────────────────────────────────────────────────
function ResultsTable ({ cols, rows }) {
  return (
    <div className={s.resScroll}>
      <table className={s.resTbl}>
        <thead>
          <tr>
            <th className={s.resThIdx}>#</th>
            {cols.map(c => <th key={c} className={s.resTh}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 1 ? s.resTrAlt : ''}>
              <td className={s.resTdIdx}>{i + 1}</td>
              {cols.map(c => <td key={c} className={s.resTd}>{row[c] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SqlEditor () {
  const { state, dispatch } = useApp()
  const toast = useToast()

  const openTabs = state.tabs.filter(t => t.open !== false)
  const activeDs = state.tabs.find(t => t.id === state.activeId)

  const tableMap = useMemo(
    () => buildTableNames(openTabs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openTabs.map(t => t.id).join(',')]
  )

  const defaultQuery = activeDs
    ? `SELECT *\nFROM ${tableMap[activeDs.id] || 'data'}\nLIMIT 100`
    : 'SELECT * FROM data LIMIT 100'

  const [query,   setQuery]   = useState(defaultQuery)
  const [results, setResults] = useState(null)
  const [error,   setError]   = useState(null)
  const [dbReady, setDbReady] = useState(false)

  const dbRef       = useRef(null)
  const textareaRef = useRef(null)

  // ── Rebuild DB when open tabs change ────────────────────────────────────────
  const tabKey = openTabs.map(t => `${t.id}:${t.rows.length}`).join(',')

  useEffect(() => {
    let cancelled = false
    setDbReady(false)
    if (dbRef.current) { try { dbRef.current.close() } catch {} dbRef.current = null }
    if (!openTabs.length) return

    getSql()
      .then(SQL => buildDB(SQL, openTabs, tableMap))
      .then(db  => { if (!cancelled) { dbRef.current = db; setDbReady(true) } })
      .catch(err => { if (!cancelled) setError('SQL engine failed to load: ' + err.message) })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey])

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => () => {
    if (dbRef.current) { try { dbRef.current.close() } catch {} dbRef.current = null }
  }, [])

  // ── Run query ────────────────────────────────────────────────────────────────
  const run = useCallback(() => {
    if (!dbRef.current || !query.trim()) return
    setError(null)
    try {
      setResults(execSql(dbRef.current, query))
    } catch (e) {
      setError(e.message)
      setResults(null)
    }
  }, [query])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  const onKeyDown = useCallback(e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run() }
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target, ss = ta.selectionStart, se = ta.selectionEnd
      const next = query.slice(0, ss) + '  ' + query.slice(se)
      setQuery(next)
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = ss + 2 })
    }
  }, [query, run])

  // ── Insert text at cursor ────────────────────────────────────────────────────
  const insert = useCallback(text => {
    const ta = textareaRef.current
    if (!ta) { setQuery(q => q + ' ' + text); return }
    const ss = ta.selectionStart, se = ta.selectionEnd
    const next = query.slice(0, ss) + text + query.slice(se)
    setQuery(next)
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = ss + text.length })
  }, [query])

  // ── Open results as new dataset ──────────────────────────────────────────────
  const openAsDataset = useCallback(() => {
    if (!results?.rows.length) return
    const ds = makeDS('Query result', results.rows, state.tabs.length)
    dispatch({ type: 'ADD_TAB', ds })
    dispatch({ type: 'SET_VIEW', view: 'table' })
    toast(`Opened ${results.rows.length.toLocaleString()} rows as new dataset`, '📊')
  }, [results, state.tabs.length, dispatch, toast])

  const clear = useCallback(() => { setQuery(''); setResults(null); setError(null) }, [])

  return (
    <div className={s.root}>

      {/* ── Schema sidebar ── */}
      <SchemaPane tabs={openTabs} tableMap={tableMap} onInsert={insert} />

      {/* ── Editor + Results ── */}
      <div className={s.main}>

        {/* Editor */}
        <div className={s.edArea}>
          <textarea
            ref={textareaRef}
            className={s.textarea}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={'SELECT *\nFROM your_table\nLIMIT 100'}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          <div className={s.runBar}>
            <button className={s.runBtn} onClick={run} disabled={!dbReady || !query.trim()}>
              {dbReady ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2l11 6-11 6V2z"/>
                  </svg>
                  Run
                </>
              ) : (
                <>
                  <span className={s.spinner} />
                  Loading…
                </>
              )}
            </button>
            <button className={s.clearBtn} onClick={clear}>Clear</button>
            <span className={s.kbHint}>⌘↵ to run</span>
          </div>
        </div>

        {/* Results */}
        <div className={s.resArea}>
          {error && (
            <div className={s.errBox}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 11v.4"/>
              </svg>
              {error}
            </div>
          )}

          {!error && results && (
            <>
              <div className={s.resMeta}>
                <span className={s.resCount}>
                  {results.rows.length.toLocaleString()} {results.rows.length === 1 ? 'row' : 'rows'}
                </span>
                <span className={s.resMs}>{results.ms}ms</span>
                {results.rows.length > 0 && (
                  <button className={s.openDsBtn} onClick={openAsDataset}>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M8 3v10M3 8h10"/>
                    </svg>
                    Open as dataset
                  </button>
                )}
              </div>
              {results.cols.length > 0
                ? <ResultsTable cols={results.cols} rows={results.rows} />
                : <div className={s.emptyRes}><span>Query executed — no rows returned</span></div>
              }
            </>
          )}

          {!error && !results && (
            <div className={s.emptyRes}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <path d="M4 6h16M4 10h16M4 14h8M4 18h5"/>
              </svg>
              <span>Run a query to see results</span>
              <span className={s.emptyResSub}>All open datasets are available as tables — click any name in the schema to insert it</span>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
