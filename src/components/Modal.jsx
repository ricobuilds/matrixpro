import React, { useEffect, useRef } from 'react'
import s from './Modal.module.css'

export default function Modal ({ title, subtitle, onClose, onConfirm, confirmLabel = 'Confirm', children }) {
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={s.bg} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} ref={ref}>
        <h3 className={s.title}>{title}</h3>
        {subtitle && <p className={s.sub}>{subtitle}</p>}
        {children}
        <div className={s.row}>
          <button className={s.ghost} onClick={onClose}>Cancel</button>
          <button className={s.primary} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
