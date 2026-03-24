import React, { useMemo } from 'react'
import { useApp } from '../store/AppContext'
import { fmtCell, fmtN, isNumericCol } from '../lib/data'
import { PALETTES } from '../lib/constants'
import s from './DataTable.module.css'

function applyFilters (rows, filters) {
  return Object.values(filters).reduce((acc, fn) => acc.filter(fn), rows)
}

function applySort (rows, col, dir) {
  if (!col) return rows
  return [...rows].sort((a, b) => {
    const av = a[col], bv = b[col]
    const an = parseFloat(av), bn = parseFloat(bv)
    return !isNaN(an) && !isNaN(bn) ? (an - bn) * dir : String(av).localeCompare(String(bv)) * dir
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
  if (cell.type === 'num') {
    return <span className={s.num}>{cell.label}</span>
  }
  return <span>{cell.label}</span>
}

export default function DataTable ({ ds, compact = false }) {
  const { state, dispatch } = useApp()
  const pal = PALETTES[state.palette]

  const rows = useMemo(() => {
    const filtered = applyFilters(ds.rows, ds.filters)
    return applySort(filtered, state.sortCol, state.sortDir)
  }, [ds.rows, ds.filters, state.sortCol, state.sortDir])

  // Pre-compute numeric max per column for bar backgrounds
  const numMax = useMemo(() => {
    const out = {}
    ds.cols.forEach((col, ci) => {
      if (isNumericCol(ds, col)) {
        const vals = ds.rows.map(r => Math.abs(parseFloat(r[col]) || 0))
        out[col] = { max: Math.max(...vals) || 1, color: pal[ci % pal.length] }
      }
    })
    return out
  }, [ds, pal])

  const sortBy = col => dispatch({ type: 'SET_SORT', col })
  const LIMIT = compact ? 300 : 500

  return (
    <div className={s.wrap}>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th><div className={s.thi + ' ' + s.idx}>#</div></th>
              {ds.cols.map(col => {
                const iN = !!numMax[col]
                const vals = ds.rows.map(r => r[col]).filter(v => v !== undefined && v !== '')
                let meta = ''
                if (iN) {
                  const ns = vals.map(Number)
                  meta = `Min ${fmtN(Math.min(...ns))} Max ${fmtN(Math.max(...ns))}`
                } else {
                  meta = `${new Set(vals).size} unique`
                }
                const isActive = state.sortCol === col
                const arr = isActive ? (state.sortDir === 1 ? ' ↑' : ' ↓') : ''
                return (
                  <th key={col}>
                    <div className={s.thi + ' ' + (iN ? s.num_col : s.cat_col)}>
                      <div className={s.thName}>
                        <span className={s.thLabel}>{col}</span>
                        <span
                          className={s.sortBtn + (isActive ? ' ' + s.sortOn : '')}
                          onClick={() => sortBy(col)}
                          title="Sort"
                        >⇅</span>
                        {arr && <span className={s.sortDir}>{arr}</span>}
                      </div>
                      <div className={s.thMeta}>
                        {iN
                          ? <>Min <b>{fmtN(Math.min(...vals.map(Number)))}</b> Max <b>{fmtN(Math.max(...vals.map(Number)))}</b></>
                          : <><b>{new Set(vals).size}</b> unique</>
                        }
                      </div>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, LIMIT).map((row, i) => (
              <tr key={i}>
                <td className={s.tdIdx}>{i + 1}</td>
                {ds.cols.map(col => {
                  const cell = fmtCell(row[col])
                  const nm = numMax[col]
                  const pct = nm ? Math.abs(parseFloat(row[col]) || 0) / nm.max * 100 : 0
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
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.footer}>
        <b>{rows.length.toLocaleString()}</b> rows
        {rows.length < ds.rows.length && (
          <span className={s.filtered}> (filtered from {ds.rows.length.toLocaleString()})</span>
        )}
        {rows.length > LIMIT && (
          <span className={s.filtered}> · showing first {LIMIT.toLocaleString()}</span>
        )}
      </div>
    </div>
  )
}
