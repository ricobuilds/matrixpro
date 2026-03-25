import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import { fmtCell, fmtN, detectColType, parseDate, fmtDate, parseNumeric } from '../lib/data'
import { PALETTES } from '../lib/constants'
import s from './DataTable.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const ROW_H   = 32   // must match CSS td height
const OVERSCAN = 20  // extra rows rendered above and below the viewport

// ─── Helpers ──────────────────────────────────────────────────────────────────
function applyFilters (rows, filters) {
  return Object.values(filters).reduce((acc, fn) => acc.filter(fn), rows)
}

function applySort (rows, col, dir, colType) {
  if (!col) return rows
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col]
    if (colType === 'date') {
      const at = parseDate(av).getTime(), bt = parseDate(bv).getTime()
      if (!isNaN(at) && !isNaN(bt)) return (at - bt) * dir
    }
    const an = parseNumeric(av), bn = parseNumeric(bv)
    return !isNaN(an) && !isNaN(bn)
      ? (an - bn) * dir
      : String(av).localeCompare(String(bv)) * dir
  })
}

function CellValue ({ cell }) {
  if (cell.type === 'pill') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 7px', borderRadius: 5,
        fontSize: 10.5, fontWeight: 500,
        background: cell.bg, color: cell.color,
      }}>
        {cell.label}
      </span>
    )
  }
  if (cell.type === 'num')  return <span className={s.num}>{cell.label}</span>
  if (cell.type === 'date') return <span className={s.date}>{cell.label}</span>
  return <span>{cell.label}</span>
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DataTable ({ ds, compact = false }) {
  const { state, dispatch } = useApp()
  const pal = PALETTES[state.palette]

  const scrollRef  = useRef(null)
  const [scrollTop,  setScrollTop]  = useState(0)
  const [viewHeight, setViewHeight] = useState(600)

  // Measure the scroll container so we know how many rows fit
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback(e => setScrollTop(e.currentTarget.scrollTop), [])

  // Reset scroll to top whenever data or sort changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setScrollTop(0)
  }, [ds.id, ds.rows, ds.filters, state.sortCol, state.sortDir])

  // Visible columns (respects hiddenCols set in Toolbar)
  const visibleCols = useMemo(() => {
    const hidden = new Set(ds.hiddenCols || [])
    return ds.cols.filter(c => !hidden.has(c))
  }, [ds.cols, ds.hiddenCols])

  // Column types — memoised so header meta & cell rendering stay stable
  const colTypes = useMemo(() => {
    const out = {}
    ds.cols.forEach(col => { out[col] = detectColType(ds, col) })
    return out
  }, [ds])

  // Sorted + filtered row list
  const rows = useMemo(() => {
    const filtered = applyFilters(ds.rows, ds.filters)
    return applySort(filtered, state.sortCol, state.sortDir, colTypes[state.sortCol])
  }, [ds.rows, ds.filters, state.sortCol, state.sortDir, colTypes])

  // Numeric max per column (for inline bar backgrounds)
  const numMax = useMemo(() => {
    const out = {}
    ds.cols.forEach((col, ci) => {
      if (colTypes[col] === 'numeric') {
        const vals = ds.rows.map(r => Math.abs(parseNumeric(r[col]) || 0))
        out[col] = { max: Math.max(...vals) || 1, color: pal[ci % pal.length] }
      }
    })
    return out
  }, [ds, pal, colTypes])

  // ── Virtual window ───────────────────────────────────────────────────────────
  const startIdx    = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const endIdx      = Math.min(rows.length, Math.ceil((scrollTop + viewHeight) / ROW_H) + OVERSCAN)
  const visibleRows = rows.slice(startIdx, endIdx)
  const topPad      = startIdx * ROW_H
  const bottomPad   = Math.max(0, (rows.length - endIdx) * ROW_H)

  const sortBy = col => dispatch({ type: 'SET_SORT', col })

  return (
    <div className={s.wrap}>
      <div className={s.scroll} ref={scrollRef} onScroll={onScroll}>
        <table className={s.table}>

          {/* ── Column widths ── */}
          <colgroup>
            <col style={{ width: 48 }} />
            {visibleCols.map(col => (
              <col key={col} style={{
                width: colTypes[col] === 'numeric' ? 120
                     : colTypes[col] === 'date'    ? 160
                     : 160,
              }} />
            ))}
          </colgroup>

          {/* ── Header ── */}
          <thead>
            <tr>
              <th><div className={s.thi + ' ' + s.idx}>#</div></th>
              {visibleCols.map(col => {
                const ct = colTypes[col]
                const vals = ds.rows.map(r => r[col]).filter(v => v !== undefined && v !== '')
                const isActive = state.sortCol === col
                const arr = isActive ? (state.sortDir === 1 ? ' ↑' : ' ↓') : ''
                let metaEl = null
                if (ct === 'numeric') {
                  const ns = vals.map(parseNumeric)
                  metaEl = <>Min <b>{fmtN(Math.min(...ns))}</b> Max <b>{fmtN(Math.max(...ns))}</b></>
                } else if (ct === 'date') {
                  const sorted = [...vals].sort((a, b) => parseDate(a) - parseDate(b))
                  metaEl = sorted.length >= 2
                    ? <><b>{fmtDate(sorted[0])}</b>{' → '}<b>{fmtDate(sorted[sorted.length - 1])}</b></>
                    : <><b>{new Set(vals).size}</b> dates</>
                } else {
                  metaEl = <><b>{new Set(vals).size}</b> unique</>
                }
                return (
                  <th key={col}>
                    <div className={s.thi + ' ' + (ct === 'numeric' ? s.num_col : ct === 'date' ? s.date_col : s.cat_col)}>
                      <div className={s.thName}>
                        <span className={s.thLabel}>{col}</span>
                        <span
                          className={s.sortBtn + (isActive ? ' ' + s.sortOn : '')}
                          onClick={() => sortBy(col)}
                          title="Sort"
                        >⇅</span>
                        {arr && <span className={s.sortDir}>{arr}</span>}
                      </div>
                      <div className={s.thMeta}>{metaEl}</div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>

          {/* ── Body (virtualised) ── */}
          <tbody>
            {topPad > 0 && (
              <tr aria-hidden="true">
                <td colSpan={visibleCols.length + 1} className={s.spacer} style={{ height: topPad }} />
              </tr>
            )}

            {visibleRows.map((row, vi) => {
              const i = startIdx + vi
              return (
                <tr key={i} className={i % 2 === 1 ? s.alt : ''}>
                  <td className={s.tdIdx}>{i + 1}</td>
                  {visibleCols.map(col => {
                    const cell = fmtCell(row[col], colTypes[col])
                    const nm   = numMax[col]
                    const pct  = nm ? Math.abs(parseNumeric(row[col]) || 0) / nm.max * 100 : 0
                    return (
                      <td key={col} className={s.td}>
                        {nm && (
                          <div
                            className={s.cellBar}
                            style={{ width: `${pct}%`, background: nm.color }}
                          />
                        )}
                        <CellValue cell={cell} />
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {bottomPad > 0 && (
              <tr aria-hidden="true">
                <td colSpan={visibleCols.length + 1} className={s.spacer} style={{ height: bottomPad }} />
              </tr>
            )}
          </tbody>

        </table>
      </div>

      {/* ── Footer ── */}
      <div className={s.footer}>
        <b>{rows.length.toLocaleString()}</b> rows
        {rows.length < ds.rows.length && (
          <span className={s.filtered}> (filtered from {ds.rows.length.toLocaleString()})</span>
        )}
        <span className={s.filtered}>· {(endIdx - startIdx).toLocaleString()} rendered</span>
      </div>
    </div>
  )
}
