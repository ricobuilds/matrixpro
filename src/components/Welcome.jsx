import React from 'react'
import s from './Welcome.module.css'

const SAMPLES = [
  { key: 'housing', icon: '🏠', title: 'CA Housing', desc: 'California real estate', meta: '600 rows · 8 cols' },
  { key: 'world', icon: '🌍', title: 'World Population', desc: 'GDP & life expectancy', meta: '240 rows · 7 cols' },
  { key: 'sales', icon: '📊', title: "Sales '23", desc: 'Reps, regions & products', meta: '360 rows · 10 cols' },
  { key: 'stocks', icon: '📈', title: 'Tech Stocks', desc: 'Price & volume, 8 tickers', meta: '400 rows · 6 cols' },
]

const SHORTCUTS = [
  { keys: '⌘O', label: 'Open file' },
  { keys: '⌘1', label: 'Table view' },
  { keys: '⌘2', label: 'Graph view' },
  { keys: '⌘3', label: 'SQL editor' },
  { keys: '⌘F', label: 'Find in table' },
  { keys: '⌘\\', label: 'Filters' },
  { keys: '⌘S', label: 'Save graph' },
  { keys: '⌘E', label: 'Export' },
]

export default function Welcome({ onSample, onUpload, onScratch }) {
  return (
    <div className={s.wrap}>

      {/* Hero */}
      <div className={s.hero}>
        <svg className={s.heroIco} width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <rect x="3" y="3" width="38" height="38" rx="7" />
          <path d="M3 13h38M3 22h38M3 31h38" />
          <path d="M14 13v28M28 13v28" />
        </svg>
        <h1 className={s.h}>Open a dataset</h1>
        <p className={s.sub}>Drop a CSV or TSV anywhere, or start with a sample below.</p>
      </div>

      {/* Sample grid */}
      <div className={s.grid}>
        {SAMPLES.map(({ key, icon, title, desc, meta }) => (
          <div key={key} className={s.card} onClick={() => onSample(key)}>
            <div className={s.ico}>{icon}</div>
            <div className={s.cardBody}>
              <div className={s.ct}>{title}</div>
              <div className={s.cd}>{desc}</div>
              <div className={s.cmeta}>{meta}</div>
            </div>
          </div>
        ))}
        <div className={[s.card, s.uploadCard].join(' ')} onClick={onUpload}>
          <div className={s.ico}>📂</div>
          <div className={s.cardBody}>
            <div className={s.ct}>Upload file</div>
            <div className={s.cd}>Drag & drop a local dataset</div>
          </div>
        </div>
        <div className={[s.card, s.scratchCard].join(' ')} onClick={onScratch}>
          <div className={s.ico}>✦</div>
          <div className={s.cardBody}>
            <div className={s.ct}>Start from scratch</div>
            <div className={s.cd}>Build a blank dataset</div>
          </div>
        </div>
      </div>

      {/* Shortcuts */}
      <span className={s.shortcutsLabel}>⌘ Shortcut Palette ⌘</span>
      <div className={s.shortcuts}>
        {SHORTCUTS.map(({ keys, label }) => (
          <span key={keys} className={s.shortcut}>
            <kbd>{keys}</kbd>
            <span>{label}</span>
          </span>
        ))}
      </div>

    </div>
  )
}
