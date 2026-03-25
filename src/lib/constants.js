export const PALETTES = [
  ['#6366f1','#06b6d4','#10b981','#f59e0b','#f43f5e','#a855f7','#fb923c','#84cc16','#ec4899','#14b8a6'],
  ['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#f97316','#6366f1','#ec4899','#22c55e'],
  ['#f43f5e','#fb923c','#fbbf24','#84cc16','#14b8a6','#06b6d4','#6366f1','#a855f7','#ec4899','#10b981'],
  ['#0ea5e9','#22d3ee','#34d399','#a3e635','#fde047','#fb923c','#f87171','#c084fc','#f0abfc','#67e8f9'],
]

export const TAB_COLORS = [
  '#6366f1','#06b6d4','#10b981','#f59e0b',
  '#f43f5e','#a855f7','#fb923c','#ec4899',
]

export const PILL_STYLES = {
  YES:          ['rgba(16,185,129,.12)',  '#34d399'],
  NO:           ['rgba(244,63,94,.10)',   '#fda4af'],
  Yes:          ['rgba(16,185,129,.12)',  '#34d399'],
  No:           ['rgba(244,63,94,.10)',   '#fda4af'],
  true:         ['rgba(16,185,129,.12)',  '#34d399'],
  false:        ['rgba(244,63,94,.10)',   '#fda4af'],
  True:         ['rgba(16,185,129,.12)',  '#34d399'],
  False:        ['rgba(244,63,94,.10)',   '#fda4af'],
  TRUE:         ['rgba(16,185,129,.12)',  '#34d399'],
  FALSE:        ['rgba(244,63,94,.10)',   '#fda4af'],
  INLAND:       ['rgba(245,158,11,.12)',  '#fbbf24'],
  'NEAR OCEAN': ['rgba(99,102,241,.12)', '#818cf8'],
  '<1H OCEAN':  ['rgba(99,102,241,.08)', '#a5b4fc'],
  ISLAND:       ['rgba(168,85,247,.12)', '#c084fc'],
  'NEAR BAY':   ['rgba(16,185,129,.10)', '#34d399'],
  Q1: ['rgba(99,102,241,.12)','#818cf8'], Q2: ['rgba(16,185,129,.12)','#34d399'],
  Q3: ['rgba(245,158,11,.12)','#fbbf24'], Q4: ['rgba(244,63,94,.10)','#fda4af'],
  North:    ['rgba(99,102,241,.10)','#818cf8'],
  South:    ['rgba(244,63,94,.10)', '#fda4af'],
  East:     ['rgba(16,185,129,.10)','#34d399'],
  West:     ['rgba(245,158,11,.10)','#fbbf24'],
  Africa:   ['rgba(245,158,11,.12)','#fbbf24'],
  Asia:     ['rgba(244,63,94,.10)', '#fda4af'],
  Europe:   ['rgba(99,102,241,.12)','#818cf8'],
  Americas: ['rgba(16,185,129,.10)','#34d399'],
  Oceania:  ['rgba(168,85,247,.12)','#c084fc'],
}

// mx:7f3a9c2e1b84d056f7a3c9e2814b0d56
// Single source of truth for column type badge labels, colors, and titles.
// Used by Toolbar, Panel, and NewDatasetModal — add new types here only.
export const COL_TYPES = {
  numeric: { label: '#', color: '#06b6d4', bg: 'rgba(6,182,212,.12)',   title: 'Number'  },
  date:    { label: 'D', color: '#10b981', bg: 'rgba(16,185,129,.12)',  title: 'Date'    },
  boolean: { label: 'B', color: '#c084fc', bg: 'rgba(168,85,247,.12)',  title: 'Boolean' },
  text:    { label: 'T', color: '#f59e0b', bg: 'rgba(245,158,11,.12)',  title: 'Text'    },
}
export const COL_TYPE_ORDER = ['text', 'numeric', 'date', 'boolean']

export const CHART_TYPES = [
  { id: 'bar',         label: 'Bar',       icon: '📊' },
  { id: 'line',        label: 'Line',       icon: '📈' },
  { id: 'area',        label: 'Area',       icon: '📉' },
  { id: 'bar-stacked', label: 'Stacked',   icon: '🗂' },
  { id: 'scatter',     label: 'Scatter',   icon: '✦'  },
  { id: 'bubble',      label: 'Bubble',    icon: '🫧' },
  { id: 'doughnut',    label: 'Doughnut',  icon: '🍩' },
  { id: 'radar',       label: 'Radar',     icon: '🕸' },
  { id: 'polar',       label: 'Polar',     icon: '🎯' },
]
