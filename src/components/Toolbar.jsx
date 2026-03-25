import React, { useState, useRef, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import s from './Toolbar.module.css'

// ─── Column visibility dropdown ───────────────────────────────────────────────
function ColMenu ({ ds, onClose }) {
  const { dispatch } = useApp()
  const hidden = new Set(ds.hiddenCols || [])

  const toggle = col => {
    const next = hidden.has(col)
      ? [...hidden].filter(c => c !== col)
      : [...hidden, col]
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { hiddenCols: next } })
  }

  const showAll = () =>
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { hiddenCols: [] } })

  return (
    <div className={s.colMenu}>
      <div className={s.colMenuHd}>
        <span className={s.colMenuTitle}>Columns</span>
        {hidden.size > 0 && (
          <button className={s.colMenuReset} onClick={showAll}>Show all</button>
        )}
      </div>
      <div className={s.colMenuList}>
        {ds.cols.map(col => {
          const visible = !hidden.has(col)
          return (
            <label key={col} className={s.colRow}>
              <span className={s.colCheck + (visible ? ' ' + s.colCheckOn : '')} onClick={() => toggle(col)}>
                {visible && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2 6l3 3 5-5"/>
                  </svg>
                )}
              </span>
              <span className={s.colName + (!visible ? ' ' + s.colNameHidden : '')}>{col}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main toolbar ─────────────────────────────────────────────────────────────
export default function Toolbar ({ ds, onRename, onDelete, onSaveGraph, onExportCSV, onGroup }) {
  const { state, dispatch } = useApp()
  const isGraph   = state.view === 'graph'
  const isSql     = state.view === 'sql'
  const isTable   = state.view === 'table'

  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colBtnRef = useRef(null)

  const hiddenCount = (ds.hiddenCols || []).length

  // Close on outside click
  useEffect(() => {
    if (!colMenuOpen) return
    const handler = e => {
      if (colBtnRef.current && !colBtnRef.current.contains(e.target)) setColMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colMenuOpen])

  return (
    <div className={s.bar}>
      <div className={s.meta}>
        <span className={s.name}>{ds.name}</span>
        <span className={s.pill}>{ds.rows.length.toLocaleString()} rows</span>
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

      <div className={s.viewSw}>
        <button
          className={[s.vbtn, isTable && s.active].filter(Boolean).join(' ')}
          onClick={() => dispatch({ type: 'SET_VIEW', view: 'table' })}
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
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1,13 5,7 9,10 13,3 15,5" />
          </svg>
          Graph
        </button>
        <button
          className={[s.vbtn, isSql && s.active].filter(Boolean).join(' ')}
          onClick={() => dispatch({ type: 'SET_VIEW', view: 'sql' })}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 4h12M2 8h8M2 12h5" /><path d="M12 9l2 2-2 2" />
          </svg>
          SQL
        </button>
      </div>

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

      {!isSql && (
        <button className={s.btn} onClick={onGroup} title="Group & aggregate">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="1" y="1" width="6" height="6" rx="1.5" /><rect x="9" y="1" width="6" height="6" rx="1.5" />
            <rect x="1" y="9" width="6" height="6" rx="1.5" /><rect x="9" y="9" width="6" height="6" rx="1.5" />
          </svg>
          Group
        </button>
      )}

      {/* Column visibility — table view only */}
      {isTable && (
        <div className={s.colWrap} ref={colBtnRef}>
          <button
            className={[s.btn, colMenuOpen && s.btnOn].filter(Boolean).join(' ')}
            onClick={() => setColMenuOpen(v => !v)}
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

      {!isSql && (
        <button
          className={[s.btn, state.panelOpen && s.btnOn].filter(Boolean).join(' ')}
          onClick={() => dispatch({ type: 'TOGGLE_PANEL' })}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 3h12l-4.5 5.5v5.5l-3-2v-3.5L2 3z" />
          </svg>
          Filters
          {Object.keys(ds.filters || {}).length > 0 && (
            <span className={s.badge}>{Object.keys(ds.filters).length}</span>
          )}
        </button>
      )}

      {isGraph && (
        <button className={[s.btn, s.primary].join(' ')} onClick={onSaveGraph}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 2h8l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" />
            <path d="M5 14V9h6v5M5 2v4h5" />
          </svg>
          Save graph
        </button>
      )}

      <div className={s.div} />

      <button className={s.btn} onClick={onExportCSV}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12l4 2 4-2M8 14V6M3 9l-1 4h12l-1-4" />
        </svg>
        Export CSV
      </button>
    </div>
  )
}
