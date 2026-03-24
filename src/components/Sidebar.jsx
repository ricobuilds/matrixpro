import React, { useState } from 'react'
import { useApp } from '../store/AppContext'
import s from './Sidebar.module.css'

const SAMPLES = [
  { key: 'housing', label: 'CA Housing',       color: '#6366f1' },
  { key: 'world',   label: 'World Population', color: '#10b981' },
  { key: 'sales',   label: "Sales '23",        color: '#f59e0b' },
  { key: 'stocks',  label: 'Tech Stocks',      color: '#06b6d4' },
]

export default function Sidebar () {
  const { state, dispatch, addSample } = useApp()
  const [q, setQ] = useState('')

  const filtered = state.tabs.filter(t =>
    t.name.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <aside className={s.sidebar}>
      {/* Traffic-light zone — exact height of titlebar (38px) */}
      <div className={s.traffic}>
        <div className={s.wordmark}>
          <span className={s.wordmarkMatrix}>Matrix</span>
          <span className={s.proBadge}>PRO</span>
        </div>
      </div>

      {/* Search */}
      <div className={s.search}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="6.5" cy="6.5" r="4.5"/><path d="M11 11l3.5 3.5"/>
        </svg>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search datasets…"
        />
        {q && (
          <span className={s.clearQ} onClick={() => setQ('')} title="Clear">✕</span>
        )}
      </div>

      <div className={s.scroll}>
        {/* My Datasets */}
        <div className={s.group}>
          <div className={s.groupLabel}>My Datasets</div>
          {filtered.length === 0 && !q && (
            <div className={s.empty}>No datasets open yet</div>
          )}
          {filtered.length === 0 && q && (
            <div className={s.empty}>No matches for "{q}"</div>
          )}
          {filtered.map(t => (
            <div
              key={t.id}
              className={[s.item, t.id === state.activeId && s.active].filter(Boolean).join(' ')}
              onClick={() => dispatch({ type: 'SET_ACTIVE', id: t.id })}
            >
              <span className={s.dot} style={{ background: t.color }} />
              <span className={s.name}>{t.name}</span>
              <span
                className={s.rm}
                onClick={e => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', id: t.id }) }}
                title="Close"
              >✕</span>
            </div>
          ))}
        </div>

        {/* Sample Datasets */}
        <div className={s.group}>
          <div className={s.groupLabel}>Sample Datasets</div>
          {SAMPLES.map(({ key, label, color }) => (
            <div key={key} className={s.item} onClick={() => addSample(key)}>
              <span className={s.dot} style={{ background: color }} />
              <span className={s.name}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
