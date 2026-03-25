import React from 'react'
import { useApp } from '../store/AppContext'
import s from './TopBar.module.css'

export default function TopBar ({ onUpload }) {
  const { state, dispatch } = useApp()
  const collapsed = state.sidebarCollapsed

  return (
    <div className={s.bar}>

      {/* ── Left zone: aligns with sidebar below ── */}
      <div className={[s.left, collapsed && s.leftCollapsed].filter(Boolean).join(' ')}>
        {!collapsed && (
          <>
            <div className={s.wordmark}>
              <span className={s.wordmarkMatrix}>Matrix</span>
              <span className={s.proBadge}>PRO</span>
            </div>
            <button
              className={s.collapseBtn}
              onClick={() => dispatch({ type: 'SET_TOGGLE', key: 'sidebarCollapsed', value: true })}
              title="Collapse sidebar"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M10 3l-5 5 5 5"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className={s.tabs}>
        {state.tabs.filter(t => t.open !== false).map(t => (
          <div
            key={t.id}
            className={[s.tab, t.id === state.activeId && s.active].filter(Boolean).join(' ')}
            onClick={() => dispatch({ type: 'SET_ACTIVE', id: t.id })}
          >
            <span className={s.dot} style={{ background: t.color }} />
            <span className={s.label}>{t.name}</span>
            <span
              className={s.close}
              onClick={e => { e.stopPropagation(); dispatch({ type: 'CLOSE_TAB', id: t.id }) }}
              title="Close"
            >✕</span>
          </div>
        ))}

        <button className={s.newBtn} onClick={onUpload} title="Open dataset (⌘O)">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3v10M3 8h10"/>
          </svg>
        </button>
      </div>

      {/* ── Draggable fill ── */}
      <div className={s.drag} />

    </div>
  )
}
