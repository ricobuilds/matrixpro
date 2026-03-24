import React from 'react'
import { useApp } from '../store/AppContext'
import s from './Titlebar.module.css'

export default function Titlebar ({ onUpload }) {
  const { state, dispatch } = useApp()

  return (
    <div className={s.bar}>
      {/* Dataset tabs */}
      <div className={s.tabs}>
        {state.tabs.map(t => (
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

        {/* + New / Upload button */}
        <button className={s.newBtn} onClick={onUpload} title="Open dataset (⌘O)">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M8 3v10M3 8h10"/>
          </svg>
        </button>
      </div>

      {/* Draggable fill */}
      <div className={s.drag} />
    </div>
  )
}
