import React from 'react'
import s from './Welcome.module.css'

const SAMPLES = [
  { key: 'housing', icon: '🏠', title: 'CA Housing',       desc: 'Real estate data across California' },
  { key: 'world',   icon: '🌍', title: 'World Population', desc: 'GDP & life expectancy by country' },
  { key: 'sales',   icon: '📊', title: "Sales '23",        desc: 'Monthly sales by rep, region & product' },
]

export default function Welcome ({ onSample, onUpload }) {
  return (
    <div className={s.wrap}>
      <div className={s.mark}>⬡</div>
      <h1 className={s.h}>Open a dataset</h1>
      <p className={s.sub}>
        Drop a CSV or TSV file anywhere, upload from the sidebar,<br />
        or start with a sample dataset below.
      </p>

      <div className={s.grid}>
        {SAMPLES.map(({ key, icon, title, desc }) => (
          <div key={key} className={s.card} onClick={() => onSample(key)}>
            <div className={s.ico}>{icon}</div>
            <div className={s.ct}>{title}</div>
            <div className={s.cd}>{desc}</div>
          </div>
        ))}
        <div className={s.card} onClick={onUpload}>
          <div className={s.ico}>📂</div>
          <div className={s.ct}>Upload your own</div>
          <div className={s.cd}>CSV or TSV — up to 100k rows</div>
        </div>
      </div>

      <div className={s.hint}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5.5v.01"/>
        </svg>
        Pro tip: press
        <kbd>⌘O</kbd> to open a file ·
        <kbd>⌘1</kbd> Table view ·
        <kbd>⌘2</kbd> Graph view ·
        <kbd>⌘\</kbd> Toggle panel
      </div>
    </div>
  )
}
