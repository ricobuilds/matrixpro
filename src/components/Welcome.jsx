import React from 'react'
import s from './Welcome.module.css'

const SAMPLES = [
  { key: 'housing', icon: '🏠', title: 'CA Housing',       desc: 'Real estate data across California' },
  { key: 'world',   icon: '🌍', title: 'World Population', desc: 'GDP & life expectancy by country' },
  { key: 'sales',   icon: '📊', title: "Sales '23",        desc: 'Monthly sales by rep, region & product' },
  { key: 'stocks',  icon: '📈', title: 'Tech Stocks',      desc: 'Price & volume for major tech companies' },
]

const SHORTCUTS = [
  { keys: '⌘O',  label: 'Open file'     },
  { keys: '⌘1',  label: 'Table view'    },
  { keys: '⌘2',  label: 'Graph view'    },
  { keys: '⌘3',  label: 'SQL editor'    },
  { keys: '⌘\\', label: 'Filters'       },
  { keys: '⌘S',  label: 'Save graph'    },
  { keys: '⌘E',  label: 'Export CSV'    },
]

export default function Welcome ({ onSample, onUpload }) {
  return (
    <div className={s.wrap}>
      <div className={s.mark}>⬡</div>
      <h1 className={s.h}>Open a dataset</h1>
      <p className={s.sub}>
        Drop a CSV or TSV anywhere, or start with one of the samples below.
      </p>

      <div className={s.grid}>
        {SAMPLES.map(({ key, icon, title, desc }) => (
          <div key={key} className={s.card} onClick={() => onSample(key)}>
            <div className={s.ico}>{icon}</div>
            <div className={s.cardBody}>
              <div className={s.ct}>{title}</div>
              <div className={s.cd}>{desc}</div>
            </div>
          </div>
        ))}
        <div className={[s.card, s.uploadCard].join(' ')} onClick={onUpload}>
          <div className={s.ico}>📂</div>
          <div className={s.cardBody}>
            <div className={s.ct}>Upload your own</div>
            <div className={s.cd}>CSV or TSV · drag & drop or ⌘O</div>
          </div>
        </div>
      </div>

      <div className={s.shortcuts}>
        <span className={s.shortcutsLabel}>Shortcuts</span>
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
