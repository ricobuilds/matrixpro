import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import { PALETTES, CHART_TYPES } from '../lib/constants'
import { isNumericCol, fmtN } from '../lib/data'
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

// ─── Filters tab ─────────────────────────────────────────────────────────────
function FiltersTab ({ ds, onFilterAdd, onFilterRemove, onFilterClear }) {
  const { state } = useApp()
  const pal = PALETTES[state.palette]
  const activeKeys = Object.keys(ds.filters)

  return (
    <>
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

      <div className={s.sec} style={{ paddingBottom: 12 }}>
        <div className={s.lbl}>Column overview</div>
        {ds.cols.map(col => {
          const vals = ds.rows.map(r => r[col]).filter(v => v !== undefined && v !== '')
          const iN   = isNumericCol(ds, col)
          const nums = iN ? vals.map(Number) : []
          const mn   = iN ? Math.min(...nums) : 0
          const mx   = iN ? Math.max(...nums) : 0

          let bars = []
          if (iN && nums.length) {
            const B = 14, bw = (mx - mn) / B || 1
            const cnts = Array(B).fill(0)
            nums.forEach(v => { const i = Math.min(Math.floor((v - mn) / bw), B - 1); cnts[i]++ })
            const mc = Math.max(...cnts) || 1
            bars = cnts.map((c, i) => ({ h: Math.max(2, c / mc * 28), color: pal[i % pal.length], title: `${fmtN(mn + i * bw)}–${fmtN(mn + (i+1) * bw)}: ${c}`, val: null }))
          } else {
            const uniq = [...new Set(vals)], cnt = {}
            vals.forEach(v => { cnt[v] = (cnt[v] || 0) + 1 })
            const mc = Math.max(...Object.values(cnt)) || 1
            bars = [...uniq].slice(0, 14).map((u, i) => ({ h: Math.max(2, cnt[u] / mc * 28), color: pal[i % pal.length], title: `${u}: ${cnt[u]}`, val: u }))
          }

          return (
            <div key={col} className={s.cst}>
              <div className={s.cstTop}>
                <span className={s.cstName}>{col}</span>
                <span className={s.cstCnt}>{vals.length.toLocaleString()}</span>
              </div>
              <div className={s.cstH}>
                {bars.map((b, i) => (
                  <div
                    key={i}
                    className={s.cstB}
                    style={{ height: b.h, background: b.color, opacity: .72 }}
                    title={b.title}
                    onClick={() => b.val !== null && onFilterAdd(col, b.val)}
                  />
                ))}
              </div>
              <div className={s.cstR}>
                {iN
                  ? `${fmtN(mn)} — ${fmtN(mx)}`
                  : [...new Set(vals)].slice(0, 4).join(' · ') + (new Set(vals).size > 4 ? '…' : '')}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ─── Stats tab ────────────────────────────────────────────────────────────────
function StatsTab ({ ds }) {
  return (
    <div className={s.sec} style={{ paddingTop: 12, paddingBottom: 12 }}>
      <div className={s.lbl}>Column statistics</div>
      {ds.cols.map(col => {
        const vals = ds.rows.map(r => r[col]).filter(v => v !== undefined && v !== '')
        const iN   = isNumericCol(ds, col)
        return (
          <div key={col} className={s.cst} style={{ marginBottom: 5 }}>
            <div className={s.cstTop}>
              <span className={s.cstName}>{col}</span>
              <span className={s.cstCnt}>{iN ? vals.length.toLocaleString() : `${new Set(vals).size} unique`}</span>
            </div>
            {iN ? (() => {
              const nums = vals.map(Number)
              const sum  = nums.reduce((a, b) => a + b, 0)
              const mean = sum / nums.length
              const sorted = [...nums].sort((a, b) => a - b)
              const med  = sorted[Math.floor(sorted.length / 2)]
              const std  = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length)
              const stats = [['Min', Math.min(...nums)], ['Max', Math.max(...nums)], ['Mean', mean], ['Median', med], ['Sum', sum], ['Std', std]]
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
            })() : (() => {
              const cnt = {}
              vals.forEach(v => { cnt[v] = (cnt[v] || 0) + 1 })
              const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 5)
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 6 }}>
                  {top.map(([v, c]) => (
                    <span key={v} style={{ background: 'var(--bg5)', padding: '2px 7px', borderRadius: 4, fontSize: 10, color: 'var(--tx2)' }}>
                      {v} <b style={{ color: 'var(--tx3)', fontWeight: 500 }}>{c}</b>
                    </span>
                  ))}
                </div>
              )
            })()}
          </div>
        )
      })}
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
  const ct  = state.chartType
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
