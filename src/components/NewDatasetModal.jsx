import React, { useState, useRef, useEffect } from 'react'
import { COL_TYPES, COL_TYPE_ORDER } from '../lib/constants'
import s from './NewDatasetModal.module.css'

const SAMPLES = [
  { key: 'housing', icon: '🏠', title: 'CA Housing',       meta: '600 rows · 8 cols'  },
  { key: 'world',   icon: '🌍', title: 'World Population', meta: '240 rows · 7 cols'  },
  { key: 'sales',   icon: '📊', title: "Sales '23",        meta: '360 rows · 10 cols' },
  { key: 'stocks',  icon: '📈', title: 'Tech Stocks',      meta: '400 rows · 6 cols'  },
]

// ─── Step 1: choose method ────────────────────────────────────────────────────
function ChooseStep ({ onSample, onUpload, onScratch }) {
  return (
    <>
      <div className={s.hd}>
        <h2 className={s.title}>New dataset</h2>
        <p className={s.sub}>Choose how you'd like to get started</p>
      </div>

      <p className={s.sectionLbl}>Sample datasets</p>
      <div className={s.sampleGrid}>
        {SAMPLES.map(({ key, icon, title, meta }) => (
          <div key={key} className={s.card} onClick={() => onSample(key)}>
            <span className={s.cardIco}>{icon}</span>
            <div>
              <div className={s.cardTitle}>{title}</div>
              <div className={s.cardMeta}>{meta}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={s.divider} />

      <div className={s.actionRow}>
        <div className={s.actionCard} onClick={onUpload}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 12V5a1 1 0 011-1h3l2-2h5a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1z"/>
            <path d="M2 7h12"/>
          </svg>
          <div>
            <div className={s.actionTitle}>Upload from file</div>
            <div className={s.actionSub}>Load a local dataset</div>
          </div>
        </div>
        <div className={s.actionCard} onClick={onScratch}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="2" y="2" width="12" height="12" rx="2"/>
            <path d="M8 5v6M5 8h6"/>
          </svg>
          <div>
            <div className={s.actionTitle}>Start from scratch</div>
            <div className={s.actionSub}>Build a blank dataset</div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Type cycling badge ───────────────────────────────────────────────────────
function TypeBadge ({ type, onChange }) {
  const cycle = () => onChange(COL_TYPE_ORDER[(COL_TYPE_ORDER.indexOf(type) + 1) % COL_TYPE_ORDER.length])
  const meta  = COL_TYPES[type] || COL_TYPES.text
  return (
    <button
      type="button"
      className={s.typeBadge}
      style={{ color: meta.color, background: meta.bg }}
      onClick={cycle}
      title={`Type: ${meta.title} — click to change`}
    >
      {meta.label}
    </button>
  )
}

// ─── Step 2: scratch builder ──────────────────────────────────────────────────
function ScratchStep ({ onBack, onCreate }) {
  const [name, setName] = useState('Untitled dataset')
  const [cols, setCols] = useState([
    { name: 'Name',     type: 'text'    },
    { name: 'Value',    type: 'numeric' },
    { name: 'Category', type: 'text'    },
  ])
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.select() }, [])

  const addCol        = ()         => setCols(p => [...p, { name: `Column ${p.length + 1}`, type: 'text' }])
  const removeCol     = i          => setCols(p => p.filter((_, idx) => idx !== i))
  const updateColName = (i, v)     => setCols(p => p.map((c, idx) => idx === i ? { ...c, name: v }    : c))
  const updateColType = (i, type)  => setCols(p => p.map((c, idx) => idx === i ? { ...c, type }       : c))

  const validCols = cols.filter(c => c.name.trim())
  const canCreate = name.trim() && validCols.length > 0

  const submit = () => { if (canCreate) onCreate(name.trim(), validCols) }

  return (
    <>
      <div className={s.hd}>
        <button className={s.backBtn} onClick={onBack}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 4l-6 4 6 4"/>
          </svg>
          Back
        </button>
        <h2 className={s.title}>Start from scratch</h2>
        <p className={s.sub}>Name your dataset and define its columns</p>
      </div>

      <div className={s.field}>
        <label className={s.fieldLbl}>Dataset name</label>
        <input
          ref={nameRef}
          className={s.fieldIn}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="My dataset"
        />
      </div>

      <div className={s.field}>
        <div className={s.fieldRow}>
          <span className={s.fieldLbl}>Columns</span>
          <button className={s.addColBtn} onClick={addCol}>+ Add column</button>
        </div>
        <div className={s.colList}>
          {cols.map((col, i) => (
            <div key={i} className={s.colItem}>
              <TypeBadge type={col.type} onChange={type => updateColType(i, type)} />
              <input
                className={s.colIn}
                value={col.name}
                onChange={e => updateColName(i, e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submit()}
                placeholder={`Column ${i + 1}`}
              />
              {cols.length > 1 && (
                <button className={s.colRm} onClick={() => removeCol(i)}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <button className={s.createBtn} onClick={submit} disabled={!canCreate}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M8 3v10M3 8h10"/>
        </svg>
        Create dataset
      </button>
    </>
  )
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
export default function NewDatasetModal ({ initialStep = 'choose', onClose, onSample, onUpload, onCreate }) {
  const [step, setStep] = useState(initialStep)

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className={s.overlay} onMouseDown={onClose}>
      <div className={s.modal} onMouseDown={e => e.stopPropagation()}>

        <button className={s.closeBtn} onClick={onClose}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
          </svg>
        </button>

        {step === 'choose' ? (
          <ChooseStep
            onSample={key => { onSample(key); onClose() }}
            onUpload={() => { onUpload(); onClose() }}
            onScratch={() => setStep('scratch')}
          />
        ) : (
          <ScratchStep
            onBack={() => setStep('choose')}
            onCreate={(name, cols) => { onCreate(name, cols); onClose() }}
          />
        )}

      </div>
    </div>
  )
}
