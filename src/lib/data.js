import { TAB_COLORS, PILL_STYLES, CATEGORY_PALETTE } from './constants'

// ─── uid ─────────────────────────────────────────────────────────────────────
export function uid () {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// ─── Number formatting ───────────────────────────────────────────────────────
export function fmtN (n) {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(0) + 'k'
  return Number.isInteger(n) ? n.toLocaleString() : parseFloat(n).toFixed(2)
}

// Deterministic color for any category value — no hardcoding needed
function hashStr (s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
export function getCategoryStyle (value) {
  return CATEGORY_PALETTE[hashStr(String(value)) % CATEGORY_PALETTE.length]
}

export function fmtCell (v, colType) {
  if (v === undefined || v === null || v === '') return '—'
  if (colType === 'category') {
    const { bg, color } = getCategoryStyle(String(v))
    return { type: 'pill', bg, color, label: String(v) }
  }
  const pill = PILL_STYLES[String(v)]
  if (pill) return { type: 'pill', bg: pill[0], color: pill[1], label: String(v) }
  if (colType === 'date') return { type: 'date', label: fmtDate(v) }
  const n = parseNumeric(v)
  if (!isNaN(n) && String(v).trim() !== '') return { type: 'num', label: fmtN(n) }
  return { type: 'text', label: String(v) }
}

// ─── Numeric normalisation (strips $€£¥₹, commas, trailing %) ────────────────
export function parseNumeric (v) {
  const s = String(v).trim().replace(/^[$€£¥₹]/, '').replace(/,/g, '').replace(/%$/, '')
  return Number(s)
}

// ─── Column type detection ───────────────────────────────────────────────────
export function isNumericCol (ds, col) {
  const sample = ds.rows.slice(0, 20).filter(r => r[col] !== '' && r[col] != null)
  return sample.length > 0 && sample.every(r => !isNaN(parseNumeric(r[col])))
}

const BOOL_VALS = new Set([
  'true','false','yes','no',
  'TRUE','FALSE','YES','NO',
  'True','False','Yes','No',
])
export function isBooleanCol (ds, col) {
  const sample = ds.rows.slice(0, 20).filter(r => r[col] !== '' && r[col] != null)
  return sample.length >= 1 && sample.every(r => BOOL_VALS.has(String(r[col]).trim()))
}

const DATE_RE = [
  /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/,                                                          // 2023-01-15 / ISO datetime
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/,                                                              // 2023-01-15 10:30:00 (space separator)
  /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,                                                                 // 1/15/2023
  /^\d{1,2}-\d{1,2}-\d{4}$/,                                                                     // 01-15-2023
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}$/i,                    // Jan 15, 2023
  /^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i,                       // 15 Jan 2023
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}$/i,
]

export function isDateCol (ds, col) {
  const sample = ds.rows.slice(0, 20).map(r => r[col]).filter(v => v !== '' && v != null)
  return sample.length >= 2 && sample.every(v => DATE_RE.some(re => re.test(String(v).trim())))
}

// Low-cardinality text → category (auto-pill coloring)
export function isCategoryCol (ds, col) {
  const vals = ds.rows.slice(0, 100).map(r => r[col]).filter(v => v !== '' && v != null)
  if (vals.length < 2) return false
  const unique = new Set(vals)
  return unique.size <= 15 && unique.size / vals.length <= 0.5
}

// 'numeric' | 'date' | 'boolean' | 'category' | 'text'
export function detectColType (ds, col) {
  if (ds.pinnedTypes?.[col]) return ds.pinnedTypes[col]
  if (isDateCol(ds, col))     return 'date'
  if (isBooleanCol(ds, col))  return 'boolean'
  if (isNumericCol(ds, col))  return 'numeric'
  if (isCategoryCol(ds, col)) return 'category'
  return 'text'
}

// Parse a date string safely (avoids UTC midnight timezone shift for plain dates)
export function parseDate (v) {
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00')
  return new Date(s)
}

export function fmtDate (v) {
  const d = parseDate(v)
  if (isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Make dataset object ─────────────────────────────────────────────────────
export function makeDS (name, rows, existingTabCount = 0) {
  const cols = rows.length ? Object.keys(rows[0]) : []
  return {
    id:           uid(),
    name,
    rows,
    cols,
    filters:      {},
    filterLabels: {},
    savedGraphs:  [],
    color:        TAB_COLORS[existingTabCount % TAB_COLORS.length],
  }
}

// ─── Sample generators ───────────────────────────────────────────────────────
export function genHousing (n = 600) {
  const prox = ['INLAND', 'NEAR OCEAN', 'ISLAND', '<1H OCEAN', 'NEAR BAY']
  return Array.from({ length: n }, (_, i) => ({
    'Ocean proximity': prox[i % prox.length],
    Longitude:         +(-122 + Math.random() * 5).toFixed(2),
    Latitude:          +(34   + Math.random() * 8).toFixed(2),
    Population:        Math.floor(200  + Math.random() * 2800),
    'Avg income':      Math.floor(28000 + Math.random() * 160000),
    'House value':     Math.floor(80000 + Math.random() * 900000),
    'Housing age':     Math.floor(8    + Math.random() * 50),
    Mortgage:          Math.random() > 0.45 ? 'YES' : 'NO',
  }))
}

export function genWorld (n = 240) {
  const c  = ['Nigeria','China','India','USA','Brazil','Germany','France','UK','Japan','Russia','Mexico','Indonesia','Pakistan','Ethiopia','Egypt','Vietnam','Philippines','Bangladesh','Congo','Tanzania','South Africa','Kenya','Algeria','Ukraine','Argentina','Colombia','Spain','Canada','Australia']
  const co = ['Africa','Asia','Asia','Americas','Americas','Europe','Europe','Europe','Asia','Europe','Americas','Asia','Asia','Africa','Africa','Asia','Asia','Asia','Africa','Africa','Africa','Africa','Africa','Europe','Americas','Americas','Europe','Americas','Oceania']
  return Array.from({ length: n }, (_, i) => ({
    Country:           c[i % c.length],
    Continent:         co[i % co.length],
    Year:              2000 + Math.floor(i / c.length * 3),
    Population:        Math.floor(5e6 + Math.random() * 1.4e9),
    'GDP per capita':  Math.floor(500 + Math.random() * 85000),
    'Life expectancy': +(45 + Math.random() * 42).toFixed(1),
    CO2:               +(0.1 + Math.random() * 18).toFixed(2),
  }))
}

export function genSales (n = 360) {
  const reps     = ['Stark','Banner','Rogers','Parker','Strange','Romanoff','Barton']
  const regions  = ['North','South','East','West']
  const products = ['Alpha','Beta','Gamma','Delta','Epsilon']
  return Array.from({ length: n }, (_, i) => ({
    Month:    (i % 12) + 1,
    Quarter:  `Q${Math.floor((i % 12) / 3) + 1}`,
    Rep:      reps[i % reps.length],
    Region:   regions[i % regions.length],
    Product:  products[i % products.length],
    Units:    Math.floor(10 + Math.random() * 600),
    Revenue:  Math.floor(12000 + Math.random() * 380000),
    Cost:     Math.floor(5000  + Math.random() * 150000),
    Profit:   Math.floor(1000  + Math.random() * 120000),
    Rating:   +(2.5 + Math.random() * 2.5).toFixed(1),
  }))
}

export function genStocks () {
  const tickers = ['AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','NFLX']
  const rows    = []
  tickers.forEach(tk => {
    let p = 100 + Math.random() * 200
    for (let d = 0; d < 50; d++) {
      p *= 1 + (Math.random() - 0.48) * 0.04
      rows.push({
        Ticker:       tk,
        Day:          d + 1,
        Open:         +p.toFixed(2),
        Close:        +(p * (1 + (Math.random() - 0.5) * 0.02)).toFixed(2),
        Volume:       Math.floor(1e6 + Math.random() * 5e7),
        'Mkt Cap $B': +(p * (1e8 + Math.random() * 9e8) / 1e9).toFixed(1),
      })
    }
  })
  return rows
}
