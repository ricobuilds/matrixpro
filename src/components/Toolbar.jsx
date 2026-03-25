import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useApp } from '../store/AppContext'
import { detectColType } from '../lib/data'
import s from './Toolbar.module.css'

// ─── Type badge config ────────────────────────────────────────────────────────
const TB = {
  numeric: { label: '#', cls: s.tbNum  },
  date:    { label: 'D', cls: s.tbDate },
  boolean: { label: 'B', cls: s.tbBool },
  text:    { label: 'T', cls: s.tbCat  },
}

// ─── Column visibility dropdown ───────────────────────────────────────────────
function ColMenu ({ ds }) {
  const { dispatch } = useApp()
  const hidden    = new Set(ds.hiddenCols || [])
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)

  useEffect(() => { if (ds.cols.length > 8) searchRef.current?.focus() }, [])

  const toggle = col => {
    const next = hidden.has(col)
      ? [...hidden].filter(c => c !== col)
      : [...hidden, col]
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { hiddenCols: next } })
  }

  const showAll = () =>
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { hiddenCols: [] } })

  const filtered = search.trim()
    ? ds.cols.filter(c => c.toLowerCase().includes(search.toLowerCase()))
    : ds.cols

  return (
    <div className={s.colMenu}>
      <div className={s.colMenuHd}>
        <span className={s.colMenuTitle}>Columns</span>
        {hidden.size > 0 && (
          <button className={s.colMenuReset} onClick={showAll}>Show all</button>
        )}
      </div>

      {ds.cols.length > 8 && (
        <div className={s.colSearchWrap}>
          <svg className={s.colSearchIco} width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l3 3"/>
          </svg>
          <input
            ref={searchRef}
            className={s.colSearch}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search columns…"
          />
        </div>
      )}

      <div className={s.colMenuList}>
        {filtered.map(col => {
          const visible = !hidden.has(col)
          const ct = detectColType(ds, col)
          const tb = TB[ct]
          return (
            <div key={col} className={s.colRow} onClick={() => toggle(col)}>
              <span className={`${s.colCheck} ${visible ? s.colCheckOn : ''}`}>
                {visible && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2 6l3 3 5-5"/>
                  </svg>
                )}
              </span>
              <span className={`${s.colTypeBadge} ${tb.cls}`}>{tb.label}</span>
              <span className={`${s.colName} ${!visible ? s.colNameHidden : ''}`}>{col}</span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className={s.colEmpty}>No columns match</div>
        )}
      </div>
    </div>
  )
}

// ─── Export dropdown ──────────────────────────────────────────────────────────
function ExportMenu ({ onCSV, onJSON, onClose }) {
  return (
    <div className={s.exportMenu}>
      <button className={s.exportItem} onClick={() => { onCSV(); onClose() }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6z"/><path d="M9 2v4h4"/>
        </svg>
        Export CSV
        <span className={s.exportKb}>⌘E</span>
      </button>
      <button className={s.exportItem} onClick={() => { onJSON(); onClose() }}>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 3c-1 0-2 .6-2 2v1c0 .8-.4 1-1 1s1 .2 1 1v1c0 1.4 1 2 2 2M11 3c1 0 2 .6 2 2v1c0 .8.4 1 1 1s-1 .2-1 1v1c0 1.4-1 2-2 2"/>
        </svg>
        Export JSON
      </button>
    </div>
  )
}

// ─── Main toolbar ─────────────────────────────────────────────────────────────
export default function Toolbar ({ ds, onRename, onDelete, onSaveGraph, onExportCSV, onExportJSON, onGroup, onClearFilters }) {
  const { state, dispatch } = useApp()
  const isGraph = state.view === 'graph'
  const isSql   = state.view === 'sql'
  const isTable = state.view === 'table'

  const [colMenuOpen,    setColMenuOpen]    = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const colBtnRef    = useRef(null)
  const exportBtnRef = useRef(null)

  const hiddenCount = (ds.hiddenCols || []).length
  const filterCount = Object.keys(ds.filters || {}).length

  // Filtered row count — recomputes only when filters or rows change
  const filteredCount = useMemo(() => {
    const fns = Object.values(ds.filters || {})
    if (!fns.length) return ds.rows.length
    return fns.reduce((rows, fn) => rows.filter(fn), ds.rows).length
  }, [ds.filters, ds.rows])

  // Close col menu on outside click
  useEffect(() => {
    if (!colMenuOpen) return
    const handler = e => {
      if (colBtnRef.current && !colBtnRef.current.contains(e.target)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colMenuOpen])

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return
    const handler = e => {
      if (exportBtnRef.current && !exportBtnRef.current.contains(e.target)) setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportMenuOpen])

  return (
    <div className={s.bar}>

      {/* ── Dataset identity ── */}
      <div className={s.meta}>
        <span className={s.colorDot} style={{ background: ds.color }} />
        <span className={s.name} title={ds.name}>{ds.name}</span>
        <span className={s.pill}>
          {filterCount > 0 ? (
            <>
              <span className={s.pillFiltered}>{filteredCount.toLocaleString()}</span>
              <span className={s.pillSep}>/</span>
              <span className={s.pillTotal}>{ds.rows.length.toLocaleString()}</span>
            </>
          ) : (
            ds.rows.length.toLocaleString()
          )}
          {' '}rows
        </span>

        {filterCount > 0 && (
          <button className={s.clearFiltersBtn} onClick={onClearFilters} title="Clear all filters">
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
            </svg>
            {filterCount} {filterCount === 1 ? 'filter' : 'filters'}
          </button>
        )}

        <button className={s.iconBtn} onClick={onRename} title="Rename dataset">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 2.5l2.5 2.5-8 8H3V10.5l8-8z" />
          </svg>
        </button>
        <button className={[s.iconBtn, s.danger].join(' ')} onClick={onDelete} title="Delete dataset">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" />
          </svg>
        </button>
      </div>

      <div className={s.div} />

      {/* ── View switcher ── */}
      <div className={s.viewSw}>
        <button
          className={[s.vbtn, isTable && s.active].filter(Boolean).join(' ')}
          onClick={() => dispatch({ type: 'SET_VIEW', view: 'table' })}
          title="Table view (⌘1)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <path d="M1 5h14M1 10h14M5 5v9M11 5v9" />
          </svg>
          Table
        </button>
        <button
          className={[s.vbtn, isGraph && s.active].filter(Boolean).join(' ')}
          onClick={() => dispatch({ type: 'SET_VIEW', view: 'graph' })}
          title="Graph view (⌘2)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1,13 5,7 9,10 13,3 15,5" />
          </svg>
          Graph
        </button>
        <button
          className={[s.vbtn, isSql && s.active].filter(Boolean).join(' ')}
          onClick={() => dispatch({ type: 'SET_VIEW', view: 'sql' })}
          title="SQL view (⌘3)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4h12M2 8h8M2 12h5" /><path d="M12 9l2 2-2 2" />
          </svg>
          SQL
        </button>
      </div>

      {/* ── Axis selectors (graph view) ── */}
      {isGraph && (
        <div className={s.axBar}>
          <span className={s.axLbl}>X</span>
          <select
            className={s.axSel}
            value={state.axisX}
            onChange={e => dispatch({ type: 'SET_AXIS', which: 'X', value: e.target.value })}
          >
            {ds.cols.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className={s.axDiv} />
          <span className={s.axLbl}>Y</span>
          <select
            className={s.axSel}
            value={state.axisY}
            onChange={e => dispatch({ type: 'SET_AXIS', which: 'Y', value: e.target.value })}
          >
            {ds.cols.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      <div className={s.sp} />

      {/* ── Group ── */}
      {!isSql && (
        <button className={s.btn} onClick={onGroup} title="Group & aggregate">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="1" width="6" height="6" rx="1.5" /><rect x="9" y="1" width="6" height="6" rx="1.5" />
            <rect x="1" y="9" width="6" height="6" rx="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.5" />
          </svg>
          Group
        </button>
      )}

      {/* ── Column visibility — table view only ── */}
      {isTable && (
        <div className={s.colWrap} ref={colBtnRef}>
          <button
            className={[s.btn, colMenuOpen && s.btnOn].filter(Boolean).join(' ')}
            onClick={() => setColMenuOpen(v => !v)}
            title="Toggle column visibility"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 4h14M1 8h14M1 12h14" />
              <rect x="4" y="2" width="3" height="4" rx="1" fill="currentColor" stroke="none" />
              <rect x="10" y="6" width="3" height="4" rx="1" fill="currentColor" stroke="none" />
              <rect x="6" y="10" width="3" height="4" rx="1" fill="currentColor" stroke="none" />
            </svg>
            Columns
            {hiddenCount > 0 && (
              <span className={s.badge}>{hiddenCount} hidden</span>
            )}
          </button>
          {colMenuOpen && <ColMenu ds={ds} onClose={() => setColMenuOpen(false)} />}
        </div>
      )}

      {/* ── Filters toggle ── */}
      {!isSql && (
        <button
          className={[s.btn, state.panelOpen && s.btnOn].filter(Boolean).join(' ')}
          onClick={() => dispatch({ type: 'TOGGLE_PANEL' })}
          title="Toggle filters panel (⌘\\)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3h12l-4.5 5.5v5.5l-3-2v-3.5L2 3z" />
          </svg>
          Filters
          {filterCount > 0 && (
            <span className={s.badge}>{filterCount}</span>
          )}
        </button>
      )}

      {/* ── Save graph ── */}
      {isGraph && (
        <button className={[s.btn, s.primary].join(' ')} onClick={onSaveGraph} title="Save graph (⌘S)">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 2h8l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
            <path d="M5 14V9h6v5M5 2v4h5" />
          </svg>
          Save graph
        </button>
      )}

      <div className={s.div} />

      {/* ── Export dropdown ── */}
      <div className={s.exportWrap} ref={exportBtnRef}>
        <button
          className={[s.btn, exportMenuOpen && s.btnOn].filter(Boolean).join(' ')}
          onClick={() => setExportMenuOpen(v => !v)}
          title="Export data (⌘E)"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 12l4 2 4-2M8 14V6M3 9l-1 4h12l-1-4" />
          </svg>
          Export
          <svg className={`${s.caret} ${exportMenuOpen ? s.caretOpen : ''}`} width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M2 4l4 4 4-4"/>
          </svg>
        </button>
        {exportMenuOpen && (
          <ExportMenu
            onCSV={onExportCSV}
            onJSON={onExportJSON}
            onClose={() => setExportMenuOpen(false)}
          />
        )}
      </div>

    </div>
  )
}
