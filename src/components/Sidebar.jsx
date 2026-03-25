import React, { useState } from 'react'
import { useApp } from '../store/AppContext'
import s from './Sidebar.module.css'

export default function Sidebar () {
  const { state, dispatch } = useApp()
  const [q, setQ] = useState('')

  const collapsed = state.sidebarCollapsed
  const filtered  = state.tabs.filter(t =>
    t.name.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <aside className={[s.sidebar, collapsed && s.sidebarCollapsed].filter(Boolean).join(' ')}>

      {/* Expand button — only visible when collapsed, lives below the traffic-light zone */}
      {collapsed && (
        <button
          className={s.expandBtn}
          onClick={() => dispatch({ type: 'SET_TOGGLE', key: 'sidebarCollapsed', value: false })}
          title="Expand sidebar"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 3l5 5-5 5"/>
          </svg>
        </button>
      )}

      {!collapsed && (
        <>
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
            <div className={s.group}>
              <div className={s.groupLabel}>My Datasets</div>
              {filtered.length === 0 && !q && (
                <div className={s.empty}>No datasets yet</div>
              )}
              {filtered.length === 0 && q && (
                <div className={s.empty}>No matches for "{q}"</div>
              )}
              {filtered.map(t => {
                const isActive = t.id === state.activeId
                const isClosed = !t.open
                return (
                  <div
                    key={t.id}
                    className={[s.item, isActive && s.active, isClosed && s.closed].filter(Boolean).join(' ')}
                    onClick={() => dispatch({ type: 'SET_ACTIVE', id: t.id })}
                    title={isClosed ? `Click to reopen ${t.name}` : t.name}
                  >
                    <span className={s.dot} style={{ background: t.color, opacity: isClosed ? 0.4 : 1 }} />
                    <span className={s.name}>{t.name}</span>
                    {isClosed ? (
                      <span className={s.reopenIco} title="Closed — click to reopen">
                        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
                        </svg>
                      </span>
                    ) : (
                      <span
                        className={s.rm}
                        onClick={e => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', id: t.id }) }}
                        title="Close"
                      >✕</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
