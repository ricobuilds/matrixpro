import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useApp } from '../store/AppContext'
import { PALETTES, CHART_TYPES, COL_TYPES } from '../lib/constants'
import { isNumericCol, detectColType, fmtN, parseNumeric, parseDate } from '../lib/data'
import s from './Panel.module.css'

// ─── AI Suggestions ──────────────────────────────────────────────────────────
function AISuggestions ({ ds, onApply }) {
  const [status, setStatus]    = useState('idle')
  const [sugs,   setSugs]      = useState([])
  const [errMsg, setErrMsg]    = useState('')
  const [activeIdx, setActive] = useState(null)
  const abortRef = useRef(null)

  const run = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setStatus('loading'); setSugs([]); setErrMsg(''); setActive(null)

    const colSummary = ds.cols.slice(0, 12).map(col => {
      const vals = ds.rows.map(r => r[col]).filter(v => v !== undefined && v !== '')
      if (isNumericCol(ds, col)) {
        const ns = vals.map(Number)
        return `${col} [numeric] min=${fmtN(Math.min(...ns))} max=${fmtN(Math.max(...ns))} avg=${fmtN(ns.reduce((a,b)=>a+b,0)/ns.length)}`
      }
      return `${col} [categorical] values: ${[...new Set(vals)].slice(0, 6).join(', ')}`
    }).join('\n')

    const prompt = `You are a senior data analyst. Dataset: "${ds.name}" (${ds.rows.length} rows).

Column summary:
${colSummary}

Generate exactly 5 specific, actionable insight suggestions. Rules:
- Column names in x/y MUST exactly match column names listed above
- chart must be one of: bar, line, area, scatter, bubble, doughnut, bar-stacked, radar, polar
- title max 7 words, desc max 18 words
- Return ONLY a valid JSON array, no markdown

Format: [{"title":"...","desc":"...","chart":"bar","x":"ColName","y":"ColName","icon":"💡"}]`

    try {
      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama3.2', prompt, stream: false }),
        signal: abortRef.current.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { response } = await res.json()
      const match = (response || '').match(/\[[\s\S]*?\]/)
      if (!match) throw new Error('No JSON array in response')
      setSugs(JSON.parse(match[0]))
      setStatus('done')
    } catch (err) {
      if (err.name === 'AbortError') return
      setErrMsg(
        err.message.includes('fetch') || err.message.includes('Failed')
          ? 'Ollama not found at localhost:11434. Run `ollama serve` to enable AI insights.'
          : err.name === 'TimeoutError'
          ? 'Request timed out. Is a model loaded?'
          : err.message
      )
      setStatus('error')
    }
  }, [ds])

  const apply = useCallback((sug, idx) => {
    setActive(idx)
    const findCol = name => ds.cols.find(c => c.toLowerCase() === (name || '').toLowerCase()) || name
    onApply({ ct: sug.chart || 'bar', x: findCol(sug.x), y: findCol(sug.y) })
  }, [ds, onApply])

  return (
    <div className={s.aiWrap}>
      <div className={s.aiHd}>
        <div className={s.aiBadge}>
          <span className={s.aiPulse} />
          AI Insights
        </div>
        <button className={s.aiRefresh + (status === 'loading' ? ' ' + s.spinning : '')} onClick={run}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 8a7 7 0 0112.9-3.9M15 8a7 7 0 01-12.9 3.9"/>
            <path d="M13 1v4h-4M3 15v-4h4"/>
          </svg>
          {status === 'idle' ? 'Generate' : 'Refresh'}
        </button>
      </div>

      {status === 'idle' && (
        <div className={s.aiPrompt}>
          Click <b>Generate</b> to get AI-powered insight suggestions for this dataset.
        </div>
      )}

      {status === 'loading' && (
        <div className={s.loadingWrap}>
          <div className={s.loadingOrb}>
            <span className={s.orbRing} />
            <span className={s.orbCore} />
          </div>
          <div className={s.loadingLabel}>
            <span className={s.loadingText}>Analysing dataset</span>
            <span className={s.loadingDots}>
              <span /><span /><span />
            </span>
          </div>
          <div className={s.skels}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className={s.skel} style={{ '--i': i }} />
            ))}
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className={s.aiErr}>
          <div className={s.aiErrMsg}>{errMsg}</div>
          <span className={s.aiRetry} onClick={run}>Retry</span>
        </div>
      )}

      {status === 'done' && sugs.map((sug, i) => (
        <div
          key={i}
          className={s.sug + (activeIdx === i ? ' ' + s.sugActive : '')}
          onClick={() => apply(sug, i)}
        >
          <div className={s.sugTop}>
            <span className={s.sugIco}>{sug.icon || '💡'}</span>
            <span className={s.sugTitle}>{sug.title}</span>
          </div>
          <div className={s.sugDesc}>{sug.desc}</div>
          <span className={s.sugCt}>{sug.chart || 'bar'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Numeric range filter ─────────────────────────────────────────────────────
function NumericFilter ({ col, ds, pal, onFilterAdd, onFilterRemove }) {
  const vals = useMemo(() =>
    ds.rows.map(r => r[col]).filter(v => v !== '' && v != null).map(parseNumeric).filter(n => !isNaN(n)),
    [ds.rows, col]
  )
  const mn = Math.min(...vals), mx = Math.max(...vals)

  const [lo, setLo] = useState('')
  const [hi, setHi] = useState('')

  const apply = () => {
    const loN = lo !== '' ? parseNumeric(lo) : null
    const hiN = hi !== '' ? parseNumeric(hi) : null
    if (loN === null && hiN === null) { onFilterRemove(col); return }
    const parts = []
    if (loN !== null) parts.push(`≥ ${fmtN(loN)}`)
    if (hiN !== null) parts.push(`≤ ${fmtN(hiN)}`)
    onFilterAdd(col,
      r => { const n = parseNumeric(r[col]); return !isNaN(n) && (loN === null || n >= loN) && (hiN === null || n <= hiN) },
      parts.join(', ')
    )
  }

  const clear = () => { setLo(''); setHi(''); onFilterRemove(col) }

  // Mini histogram
  const B = 16, bw = (mx - mn) / B || 1
  const cnts = Array(B).fill(0)
  vals.forEach(v => { const i = Math.min(Math.floor((v - mn) / bw), B - 1); cnts[i]++ })
  const mc = Math.max(...cnts) || 1

  return (
    <div className={s.fWidget}>
      <div className={s.miniHist}>
        {cnts.map((c, i) => (
          <div key={i} className={s.miniBar}
            style={{ height: Math.max(2, c / mc * 28), background: pal[i % pal.length] }}
            title={`${fmtN(mn + i * bw)}–${fmtN(mn + (i+1) * bw)}: ${c}`}
          />
        ))}
      </div>
      <div className={s.rangeRow}>
        <input
          className={s.rangeIn} value={lo}
          onChange={e => setLo(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && apply()}
          placeholder={`Min`}
        />
        <span className={s.rangeDash}>–</span>
        <input
          className={s.rangeIn} value={hi}
          onChange={e => setHi(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && apply()}
          placeholder={`Max`}
        />
      </div>
      <div className={s.fActions}>
        <button className={s.applyBtn} onClick={apply}>Apply</button>
        {(lo || hi) && <button className={s.clearFBtn} onClick={clear}>Clear</button>}
        <span className={s.fHint}>{fmtN(mn)} – {fmtN(mx)}</span>
      </div>
    </div>
  )
}

// ─── Categorical multi-select filter ─────────────────────────────────────────
function CatFilter ({ col, ds, pal, onFilterAdd, onFilterRemove }) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState(new Set())

  const entries = useMemo(() => {
    const cnt = {}
    ds.rows.forEach(r => {
      const v = r[col]
      if (v !== '' && v != null) cnt[v] = (cnt[v] || 0) + 1
    })
    return Object.entries(cnt).sort((a, b) => b[1] - a[1])
  }, [ds.rows, col])

  const visible = search
    ? entries.filter(([v]) => String(v).toLowerCase().includes(search.toLowerCase()))
    : entries

  const toggle = val => {
    const next = new Set(selected)
    next.has(val) ? next.delete(val) : next.add(val)
    setSelected(next)
    if (next.size === 0) {
      onFilterRemove(col)
    } else {
      const preview = [...next].slice(0, 3).join(', ') + (next.size > 3 ? ` +${next.size - 3}` : '')
      onFilterAdd(col, r => next.has(r[col]), `= ${preview}`)
    }
  }

  const clear = () => { setSelected(new Set()); onFilterRemove(col) }

  return (
    <div className={s.fWidget}>
      {entries.length > 7 && (
        <input
          className={s.catSearch}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search values…"
        />
      )}
      <div className={s.catList}>
        {visible.slice(0, 60).map(([v, cnt], i) => {
          const on = selected.has(v)
          return (
            <div key={v} className={s.catRow + (on ? ' ' + s.catRowOn : '')} onClick={() => toggle(v)}>
              <span className={s.catCheck + (on ? ' ' + s.catCheckOn : '')}>
                {on && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2 6l3 3 5-5"/>
                  </svg>
                )}
              </span>
              <span className={s.catVal}>{String(v)}</span>
              <span className={s.catCnt}>{cnt}</span>
            </div>
          )
        })}
        {visible.length === 0 && <div className={s.empty}>No matches</div>}
      </div>
      {selected.size > 0 && (
        <button className={s.clearFBtn} style={{ marginTop: 6 }} onClick={clear}>
          Clear {selected.size} selected
        </button>
      )}
    </div>
  )
}

// ─── Text contains filter ──────────────────────────────────────────────────────
function TextFilter ({ col, ds, onFilterAdd, onFilterRemove }) {
  const [q, setQ] = useState('')

  const apply = () => {
    if (!q.trim()) { onFilterRemove(col); return }
    onFilterAdd(col,
      r => String(r[col] ?? '').toLowerCase().includes(q.toLowerCase()),
      `contains "${q}"`
    )
  }

  const clear = () => { setQ(''); onFilterRemove(col) }

  return (
    <div className={s.fWidget}>
      <div className={s.textRow}>
        <input
          className={s.textIn}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && apply()}
          placeholder="Contains…"
        />
        {q && <button className={s.textClear} onClick={clear}>✕</button>}
      </div>
      <div className={s.fActions}>
        <button className={s.applyBtn} onClick={apply}>Apply</button>
      </div>
    </div>
  )
}

// ─── Boolean filter ───────────────────────────────────────────────────────────
function BoolFilter ({ col, ds, onFilterAdd, onFilterRemove }) {
  const vals    = useMemo(() => [...new Set(ds.rows.map(r => r[col]).filter(v => v !== '' && v != null))], [ds.rows, col])
  const [sel, setSel] = useState(null)   // null | value string

  const pick = v => {
    if (sel === v) { setSel(null); onFilterRemove(col); return }
    setSel(v)
    onFilterAdd(col, r => String(r[col]).trim() === String(v).trim(), `= ${v}`)
  }

  return (
    <div className={s.fWidget}>
      <div className={s.boolRow}>
        {vals.map(v => (
          <button
            key={v}
            className={s.boolBtn + (sel === v ? ' ' + s.boolBtnOn : '')}
            onClick={() => pick(v)}
          >
            {String(v)}
          </button>
        ))}
        {sel && (
          <button className={s.clearFBtn} onClick={() => { setSel(null); onFilterRemove(col) }}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Date filter ──────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function DateFilter ({ col, ds, onFilterAdd, onFilterRemove }) {
  const dates = useMemo(() =>
    ds.rows.map(r => r[col]).filter(v => v !== '' && v != null).map(v => parseDate(v)).filter(d => !isNaN(d.getTime())),
    [ds.rows, col]
  )

  const years  = useMemo(() => [...new Set(dates.map(d => d.getFullYear()))].sort((a, b) => a - b), [dates])
  const months = useMemo(() => [...new Set(dates.map(d => d.getMonth()))].sort((a, b) => a - b), [dates])

  const [selYears,  setSelYears]  = useState(new Set())
  const [selMonths, setSelMonths] = useState(new Set())
  const [fromStr,   setFromStr]   = useState('')
  const [toStr,     setToStr]     = useState('')

  const buildAndApply = (sy, sm, fs, ts) => {
    const fromD = fs ? parseDate(fs) : null
    const toD   = ts ? parseDate(ts) : null
    const hasFrom  = fromD && !isNaN(fromD)
    const hasTo    = toD   && !isNaN(toD)
    if (sy.size === 0 && sm.size === 0 && !hasFrom && !hasTo) { onFilterRemove(col); return }

    const parts = []
    if (sy.size > 0) parts.push([...sy].join(', '))
    if (sm.size > 0) parts.push([...sm].map(m => MONTH_NAMES[m]).join(', '))
    if (hasFrom || hasTo) parts.push(`${fs || '…'} → ${ts || '…'}`)

    onFilterAdd(col, r => {
      const d = parseDate(r[col])
      if (isNaN(d.getTime())) return false
      if (sy.size > 0  && !sy.has(d.getFullYear())) return false
      if (sm.size > 0  && !sm.has(d.getMonth()))    return false
      if (hasFrom && d < fromD) return false
      if (hasTo   && d > toD)   return false
      return true
    }, parts.join(' · '))
  }

  const toggleYear = y => {
    const next = new Set(selYears); next.has(y) ? next.delete(y) : next.add(y)
    setSelYears(next); buildAndApply(next, selMonths, fromStr, toStr)
  }
  const toggleMonth = m => {
    const next = new Set(selMonths); next.has(m) ? next.delete(m) : next.add(m)
    setSelMonths(next); buildAndApply(selYears, next, fromStr, toStr)
  }
  const applyRange = () => buildAndApply(selYears, selMonths, fromStr, toStr)
  const clearAll = () => {
    setSelYears(new Set()); setSelMonths(new Set()); setFromStr(''); setToStr('')
    onFilterRemove(col)
  }

  const hasAny = selYears.size > 0 || selMonths.size > 0 || fromStr || toStr

  return (
    <div className={s.fWidget}>

      {/* Years */}
      {years.length > 1 && (
        <>
          <div className={s.dateLabel}>Year</div>
          <div className={s.chipGrid}>
            {years.map(y => (
              <button
                key={y}
                className={s.dateChip + (selYears.has(y) ? ' ' + s.dateChipOn : '')}
                onClick={() => toggleYear(y)}
              >{y}</button>
            ))}
          </div>
        </>
      )}

      {/* Months */}
      {months.length > 1 && (
        <>
          <div className={s.dateLabel}>Month</div>
          <div className={s.chipGrid}>
            {months.map(m => (
              <button
                key={m}
                className={s.dateChip + (selMonths.has(m) ? ' ' + s.dateChipOn : '')}
                onClick={() => toggleMonth(m)}
              >{MONTH_NAMES[m]}</button>
            ))}
          </div>
        </>
      )}

      {/* Date range */}
      <div className={s.dateLabel}>Date range</div>
      <div className={s.rangeRow}>
        <input className={s.rangeIn} value={fromStr} onChange={e => setFromStr(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyRange()} placeholder="From (YYYY-MM-DD)" />
        <span className={s.rangeDash}>–</span>
        <input className={s.rangeIn} value={toStr} onChange={e => setToStr(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyRange()} placeholder="To (YYYY-MM-DD)" />
      </div>
      <div className={s.fActions}>
        {(fromStr || toStr) && <button className={s.applyBtn} onClick={applyRange}>Apply range</button>}
        {hasAny && <button className={s.clearFBtn} onClick={clearAll}>Clear all</button>}
      </div>

    </div>
  )
}

// ─── Single column filter card ────────────────────────────────────────────────
function ColFilterCard ({ col, ds, pal, onFilterAdd, onFilterRemove }) {
  const [open, setOpen] = useState(false)
  const colType   = useMemo(() => detectColType(ds, col), [ds, col])
  const isActive  = col in (ds.filters || {})
  const vals      = ds.rows.map(r => r[col]).filter(v => v !== '' && v != null)
  const uniqCount = new Set(vals).size
  const { label: typeLabel, color: typeColor, bg: typeBg } = COL_TYPES[colType] || COL_TYPES.text

  const renderWidget = () => {
    if (colType === 'numeric') return <NumericFilter col={col} ds={ds} pal={pal} onFilterAdd={onFilterAdd} onFilterRemove={onFilterRemove} />
    if (colType === 'date')    return <DateFilter    col={col} ds={ds}            onFilterAdd={onFilterAdd} onFilterRemove={onFilterRemove} />
    if (colType === 'boolean') return <BoolFilter    col={col} ds={ds}            onFilterAdd={onFilterAdd} onFilterRemove={onFilterRemove} />
    if (uniqCount <= 50)       return <CatFilter     col={col} ds={ds} pal={pal}  onFilterAdd={onFilterAdd} onFilterRemove={onFilterRemove} />
    return                            <TextFilter    col={col} ds={ds}            onFilterAdd={onFilterAdd} onFilterRemove={onFilterRemove} />
  }

  return (
    <div className={s.fcCard + (isActive ? ' ' + s.fcCardActive : '')}>
      <div className={s.fcHd} onClick={() => setOpen(v => !v)}>
        <span className={s.typeBadge} style={{ color: typeColor, background: typeBg }}>{typeLabel}</span>
        <span className={s.fcName}>{col}</span>
        <span className={s.fcMeta}>{uniqCount.toLocaleString()} unique</span>
        {isActive && <span className={s.fcDot} />}
        <svg
          className={s.fcChev + (open ? ' ' + s.fcChevOpen : '')}
          width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </div>
      {open && renderWidget()}
    </div>
  )
}

// ─── Filters tab ─────────────────────────────────────────────────────────────
function FiltersTab ({ ds, onFilterAdd, onFilterRemove, onFilterClear }) {
  const { state } = useApp()
  const pal = PALETTES[state.palette]
  const activeKeys = Object.keys(ds.filters || {})

  return (
    <>
      {/* Active chips */}
      <div className={s.sec}>
        <div className={s.lbl}>
          Active
          {activeKeys.length > 0 && (
            <span className={s.lblAct} onClick={onFilterClear}>Clear all</span>
          )}
        </div>
        {activeKeys.length === 0
          ? <div className={s.empty}>No filters applied</div>
          : activeKeys.map(k => (
            <div key={k} className={s.fchip}>
              <span style={{ fontSize: 14 }}>⚡</span>
              <div className={s.fchipBody}>
                <div className={s.fchipName}>{k}</div>
                <div className={s.fchipVal}>{ds.filterLabels?.[k] || 'active'}</div>
              </div>
              <span className={s.fchipX} onClick={() => onFilterRemove(k)}>✕</span>
            </div>
          ))
        }
      </div>

      <div className={s.sep} />

      {/* Per-column filter cards */}
      <div className={s.sec} style={{ paddingBottom: 14 }}>
        <div className={s.lbl}>Columns</div>
        {ds.cols.map(col => (
          <ColFilterCard
            key={col}
            col={col}
            ds={ds}
            pal={pal}
            onFilterAdd={onFilterAdd}
            onFilterRemove={onFilterRemove}
          />
        ))}
      </div>
    </>
  )
}

// ─── Stats sub-components ─────────────────────────────────────────────────────
function NumericStats ({ vals }) {
  const nums = vals.map(parseNumeric).filter(n => !isNaN(n))
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const n      = sorted.length
  const sum    = nums.reduce((a, b) => a + b, 0)
  const mean   = sum / n
  const q1     = sorted[Math.floor(n * 0.25)]
  const median = sorted[Math.floor(n * 0.5)]
  const q3     = sorted[Math.floor(n * 0.75)]
  const std    = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n)
  const stats  = [
    ['Min', Math.min(...nums)], ['Max', Math.max(...nums)],
    ['Mean', mean],             ['Median', median],
    ['Q1', q1],                 ['Q3', q3],
    ['Sum', sum],               ['Std', std],
  ]
  return (
    <div className={s.stGrid}>
      {stats.map(([l, v]) => (
        <div key={l} className={s.stCell}>
          <div className={s.stLbl}>{l}</div>
          <div className={s.stVal}>{fmtN(v)}</div>
        </div>
      ))}
    </div>
  )
}

function CatStats ({ vals, total }) {
  const cnt = {}
  vals.forEach(v => { cnt[v] = (cnt[v] || 0) + 1 })
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const max = top[0]?.[1] || 1
  return (
    <div className={s.catStatList}>
      {top.map(([v, c]) => (
        <div key={v} className={s.catStatRow}>
          <span className={s.catStatName}>{v}</span>
          <div className={s.catStatBarWrap}>
            <div className={s.catStatFill} style={{ width: `${(c / max) * 100}%` }} />
          </div>
          <span className={s.catStatCnt}>{c} · {((c / total) * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

function BoolStats ({ vals, total }) {
  const cnt = {}
  vals.forEach(v => { const k = String(v); cnt[k] = (cnt[k] || 0) + 1 })
  const entries = Object.entries(cnt).sort((a, b) => b[1] - a[1])
  return (
    <div className={s.boolStatList}>
      {entries.map(([v, c]) => (
        <div key={v} className={s.boolStatRow}>
          <span className={s.boolStatLbl}>{v}</span>
          <div className={s.boolStatBarWrap}>
            <div className={s.boolStatFill} style={{ width: `${(c / total) * 100}%` }} />
          </div>
          <span className={s.boolStatCnt}>{c} · {((c / total) * 100).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

function DateStats ({ vals }) {
  const dates = vals.map(v => parseDate(v)).filter(d => !isNaN(d.getTime()))
  if (dates.length < 2) return null
  const times    = dates.map(d => d.getTime())
  const minD     = new Date(Math.min(...times))
  const maxD     = new Date(Math.max(...times))
  const spanDays = Math.round((Math.max(...times) - Math.min(...times)) / 86400000)
  const fmt      = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const yearCnt  = {}
  dates.forEach(d => { const y = d.getFullYear(); yearCnt[y] = (yearCnt[y] || 0) + 1 })
  const years        = Object.entries(yearCnt).sort((a, b) => +a[0] - +b[0])
  const maxYearCount = Math.max(...years.map(([, c]) => c))
  return (
    <>
      <div className={s.stGrid}>
        <div className={s.stCell}>
          <div className={s.stLbl}>Earliest</div>
          <div className={s.stVal}>{fmt(minD)}</div>
        </div>
        <div className={s.stCell}>
          <div className={s.stLbl}>Latest</div>
          <div className={s.stVal}>{fmt(maxD)}</div>
        </div>
      </div>
      <div className={s.stSpan}>
        <span className={s.stSpanLbl}>Span</span>
        <span className={s.stSpanVal}>{spanDays.toLocaleString()} days</span>
      </div>
      {years.length > 1 && (
        <div className={s.dateYearDist}>
          {years.map(([y, c]) => (
            <div key={y} className={s.dateYearBar}>
              <div className={s.dateYearFill} style={{ height: `${(c / maxYearCount) * 100}%` }} />
              <span className={s.dateYearLbl}>{String(y).slice(2)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function StatCard ({ col, ds }) {
  const allVals    = ds.rows.map(r => r[col])
  const nonNull    = allVals.filter(v => v !== undefined && v !== null && v !== '')
  const missingCnt = allVals.length - nonNull.length
  const colType    = detectColType(ds, col)
  const meta       = COL_TYPES[colType] || COL_TYPES.text
  return (
    <div className={s.statCard}>
      <div className={s.statHd}>
        <span className={s.typeBadge} style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
        <span className={s.statName}>{col}</span>
        <span className={s.statMeta}>{nonNull.length.toLocaleString()}</span>
        {missingCnt > 0 && <span className={s.statMissing}>{missingCnt} missing</span>}
      </div>
      {nonNull.length > 0 && (
        <div className={s.statBody}>
          {colType === 'numeric' && <NumericStats vals={nonNull} />}
          {colType === 'boolean' && <BoolStats vals={nonNull} total={nonNull.length} />}
          {colType === 'date'    && <DateStats vals={nonNull} />}
          {colType === 'text'    && <CatStats vals={nonNull} total={allVals.length} />}
        </div>
      )}
    </div>
  )
}

// ─── Stats tab ────────────────────────────────────────────────────────────────
function StatsTab ({ ds }) {
  const missingCells = ds.rows.reduce((sum, row) =>
    sum + ds.cols.filter(c => row[c] === undefined || row[c] === null || row[c] === '').length
  , 0)
  return (
    <div className={s.statWrap}>
      <div className={s.statSummary}>
        <div className={s.statSumGrid}>
          <div className={s.statSumCell}>
            <div className={s.statSumVal}>{ds.rows.length.toLocaleString()}</div>
            <div className={s.statSumLbl}>Rows</div>
          </div>
          <div className={s.statSumCell}>
            <div className={s.statSumVal}>{ds.cols.length}</div>
            <div className={s.statSumLbl}>Columns</div>
          </div>
          <div className={s.statSumCell}>
            <div className={s.statSumVal}>{missingCells > 0 ? missingCells.toLocaleString() : '—'}</div>
            <div className={s.statSumLbl}>Missing</div>
          </div>
        </div>
      </div>
      <div className={s.sep} />
      <div className={s.sec} style={{ paddingBottom: 14 }}>
        <div className={s.lbl}>Column statistics</div>
        {ds.cols.map(col => <StatCard key={col} col={col} ds={ds} />)}
      </div>
    </div>
  )
}

// ─── Aggregation dropdown ─────────────────────────────────────────────────────
const AGG_OPTIONS = [
  { value: 'sum',    label: 'Sum' },
  { value: 'mean',   label: 'Mean' },
  { value: 'median', label: 'Median' },
  { value: 'min',    label: 'Min' },
  { value: 'max',    label: 'Max' },
  { value: 'std',    label: 'Std' },
  { value: 'var',    label: 'Var' },
  { value: 'count',  label: 'Count' },
]

function AggIcon ({ size = 13, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M13 2H3l4.5 6L3 14h10" />
    </svg>
  )
}

function AggDropdown ({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = AGG_OPTIONS.find(o => o.value === value) || AGG_OPTIONS[0]

  return (
    <div className={s.aggWrap} ref={ref}>
      <button className={s.aggTrigger} onClick={() => setOpen(v => !v)}>
        <AggIcon />
        <span style={{ flex: 1, textAlign: 'left' }}>{current.label}</span>
        <svg
          width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ flexShrink: 0, color: 'var(--tx3)', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className={s.aggMenu}>
          {AGG_OPTIONS.map(opt => (
            <div
              key={opt.value}
              className={s.aggItem + (opt.value === value ? ' ' + s.aggItemActive : '')}
              onClick={() => { onChange(opt.value); setOpen(false) }}
            >
              <AggIcon color={opt.value === value ? 'var(--tx1)' : 'var(--tx3)'} />
              <span style={{ flex: 1 }}>{opt.label}</span>
              {opt.value === value && (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--ac2)', flexShrink: 0 }}>
                  <path d="M3 8l4 4 6-7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Graph options tab ────────────────────────────────────────────────────────
function GraphTab ({ ds, onApplySuggestion }) {
  const { state, dispatch } = useApp()
  const pal = PALETTES[state.palette]
  const ct      = state.chartType
  const isBar    = ct === 'bar' || ct === 'bar-stacked'
  const isBubble = ct === 'bubble'
  const isRadial = ['doughnut', 'radar', 'polar'].includes(ct)

  const set   = (k, v) => dispatch({ type: 'SET_TOGGLE', key: k, value: v })
  const setAx = (w, v) => dispatch({ type: 'SET_AXIS', which: w, value: v })

  return (
    <>
      <AISuggestions ds={ds} onApply={({ ct, x, y }) => {
        dispatch({ type: 'SET_CHART_TYPE', ct })
        dispatch({ type: 'SET_AXIS', which: 'X', value: x })
        dispatch({ type: 'SET_AXIS', which: 'Y', value: y })
        onApplySuggestion()
      }} />

      <div className={s.sep} style={{ marginTop: 6 }} />

      <div className={s.sec}>
        <div className={s.lbl}>Chart type</div>
        <div className={s.ctGrid}>
          {CHART_TYPES.map(({ id, label, icon }) => (
            <button
              key={id}
              className={s.ctBtn + (ct === id ? ' ' + s.ctActive : '')}
              onClick={() => dispatch({ type: 'SET_CHART_TYPE', ct: id })}
            >
              <span className={s.ctIco}>{icon}</span>
              <span className={s.ctLbl}>{label}</span>
            </button>
          ))}
        </div>

        {isBar && (
          <>
            <div className={s.lbl}>Orientation</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 10 }}>
              {['vertical', 'horizontal'].map(dir => (
                <button
                  key={dir}
                  className={s.ctBtn + (state.barOrientation === dir ? ' ' + s.ctActive : '')}
                  onClick={() => dispatch({ type: 'SET_TOGGLE', key: 'barOrientation', value: dir })}
                >
                  <span className={s.ctIco}>{dir === 'vertical' ? '📊' : '📶'}</span>
                  <span className={s.ctLbl}>{dir === 'vertical' ? 'Vertical' : 'Horizontal'}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className={s.lbl}>X axis</div>
        <select className={s.sel} value={state.axisX} onChange={e => setAx('X', e.target.value)}>
          {ds.cols.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className={s.lbl}>Y axis</div>
        <select className={s.sel} value={state.axisY} onChange={e => setAx('Y', e.target.value)}>
          {ds.cols.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className={s.lbl}>Aggregation</div>
        <AggDropdown
          value={state.aggFn}
          onChange={v => dispatch({ type: 'SET_AGG', fn: v })}
        />

        {!isRadial && (
          <>
            <div className={s.lbl}>
              Y2 axis <span style={{ color: 'var(--tx3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>optional</span>
            </div>
            <select className={s.sel} value={state.axisY2} onChange={e => setAx('Y2', e.target.value)}>
              <option value="">— none —</option>
              {ds.cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}

        {isBubble && (
          <>
            <div className={s.lbl}>Bubble size</div>
            <select className={s.sel} value={state.axisSz} onChange={e => setAx('Sz', e.target.value)}>
              <option value="">— none —</option>
              {ds.cols.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        )}

        <div className={s.lbl} style={{ marginTop: 8 }}>Colour palette</div>
        <div className={s.swatches}>
          {PALETTES.map((p, i) => (
            <div
              key={i}
              className={s.swatch + (state.palette === i ? ' ' + s.swActive : '')}
              style={{ background: `linear-gradient(135deg,${p[0]},${p[2]})` }}
              title={`Palette ${i + 1}`}
              onClick={() => dispatch({ type: 'SET_PALETTE', idx: i })}
            />
          ))}
        </div>

        <div className={s.togRow}>
          <span className={s.togLbl}>Data labels</span>
          <Toggle checked={state.showLabels}   onChange={v => set('showLabels', v)} />
        </div>
        <div className={s.togRow}>
          <span className={s.togLbl}>Grid lines</span>
          <Toggle checked={state.showGrid}     onChange={v => set('showGrid', v)} />
        </div>
        <div className={s.togRow}>
          <span className={s.togLbl}>Smooth curves</span>
          <Toggle checked={state.smoothCurves} onChange={v => set('smoothCurves', v)} />
        </div>
      </div>
      <div style={{ height: 14 }} />
    </>
  )
}

// ─── Saved tab ───────────────────────────────────────────────────────────────
function SavedTab ({ ds, onLoad, onDelete }) {
  if (!ds.savedGraphs?.length) {
    return <div className={s.sec} style={{ paddingTop: 12 }}><div className={s.empty}>No graphs saved yet.</div></div>
  }
  return (
    <div>
      {ds.savedGraphs.map(sg => (
        <div key={sg.id} className={s.sgItem}>
          <div className={s.sgName}>{sg.title}</div>
          <div className={s.sgMeta}>{sg.ct} · {sg.xCol} → {sg.yCol} · {sg.at}</div>
          <div className={s.sgActions}>
            <button className={s.sgBtn}          onClick={() => onLoad(sg)}>Load</button>
            <button className={s.sgBtn + ' ' + s.sgDel} onClick={() => onDelete(sg.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Toggle ──────────────────────────────────────────────────────────────────
function Toggle ({ checked, onChange }) {
  return (
    <label className={s.tog}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className={s.togT} />
      <span className={s.togK} />
    </label>
  )
}

// ─── Panel shell ─────────────────────────────────────────────────────────────
export default function Panel ({ ds, onFilterAdd, onFilterRemove, onFilterClear, onLoadGraph, onDeleteGraph }) {
  const { state, dispatch } = useApp()
  const TABS = ['Filters', 'Stats', 'Graph', 'Saved']

  const applySuggestion = useCallback(() => {
    dispatch({ type: 'SET_VIEW', view: 'graph' })
  }, [dispatch])

  return (
    <div className={s.panel + (!state.panelOpen ? ' ' + s.closed : '')}>
      <div className={s.tabs}>
        {TABS.map(t => (
          <button
            key={t}
            className={s.tab + (state.panelTab === t.toLowerCase() ? ' ' + s.tabActive : '')}
            onClick={() => dispatch({ type: 'SET_PANEL_TAB', tab: t.toLowerCase() })}
          >
            {t}
          </button>
        ))}
      </div>
      <div className={s.body}>
        {state.panelTab === 'filters' && (
          <FiltersTab ds={ds} onFilterAdd={onFilterAdd} onFilterRemove={onFilterRemove} onFilterClear={onFilterClear} />
        )}
        {state.panelTab === 'stats' && <StatsTab ds={ds} />}
        {state.panelTab === 'graph' && <GraphTab ds={ds} onApplySuggestion={applySuggestion} />}
        {state.panelTab === 'saved' && <SavedTab ds={ds} onLoad={onLoadGraph} onDelete={onDeleteGraph} />}
      </div>
    </div>
  )
}
