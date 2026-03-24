import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider ({ children }) {
  const [toasts, setToasts] = useState([])
  const timer = useRef(null)

  const toast = useCallback((msg, icon = '✓') => {
    const id = Date.now()
    setToasts([{ id, msg, icon }])
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToasts([]), 2600)
  }, [])

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {toasts.map(t => (
        <div key={t.id} style={{
          position: 'fixed', bottom: 22, right: 22, zIndex: 400,
          background: 'var(--bg4)', border: '1px solid var(--bd3)',
          borderRadius: 10, padding: '10px 14px',
          fontSize: 12.5, color: 'var(--tx1)',
          boxShadow: '0 8px 32px rgba(0,0,0,.5)',
          display: 'flex', alignItems: 'center', gap: 9,
          animation: 'slideUp .18s ease', maxWidth: 300,
        }}>
          <span style={{ color: 'var(--ac2)', fontSize: 15 }}>{t.icon}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)
