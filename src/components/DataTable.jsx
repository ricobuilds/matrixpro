import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import { fmtCell, fmtN, detectColType, parseDate, fmtDate, parseNumeric } from '../lib/data'
import { PALETTES } from '../lib/constants'
import s from './DataTable.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────
const ROW_H     = 32
const OVERSCAN  = 20
const MIN_COL_W = 50
const DEFAULT_COL_W = { numeric: 110, date: 150, boolean: 90, text: 130 }

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

// ─── Inline cell editor ───────────────────────────────────────────────────────
function CellEditor ({ initialValue, colType, onCommit, onCancel, onNavigate }) {
  const [v, setV]       = useState(String(initialValue ?? ''))
  const [invalid, setInvalid] = useState(false)
  const vRef            = useRef(v)
  vRef.current          = v
  const handled         = useRef(false)
  const inputRef        = useRef(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const validate = val => {
    if (colType === 'numeric' && val.trim() !== '' && isNaN(parseNumeric(val))) {
      setInvalid(true)
      setTimeout(() => setInvalid(false), 400)
      return false
    }
    return true
  }

  return (
    <input
      ref={inputRef}
      className={[s.cellEdit, invalid ? s.cellEditInvalid : ''].filter(Boolean).join(' ')}
      value={v}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); if (validate(vRef.current)) { handled.current = true; onNavigate('down',  vRef.current) } }
        if (e.key === 'Tab')    { e.preventDefault(); if (validate(vRef.current)) { handled.current = true; onNavigate(e.shiftKey ? 'left' : 'right', vRef.current) } }
        if (e.key === 'Escape') { e.preventDefault(); handled.current = true; onCancel() }
      }}
      onBlur={() => {
        if (handled.current) return
        if (validate(vRef.current)) { onCommit(vRef.current) }
        else { setTimeout(() => inputRef.current?.focus(), 0) }
      }}
      onClick={e => e.stopPropagation()}
    />
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DataTable ({ ds, compact = false }) {
  const { state, dispatch } = useApp()
  const pal = PALETTES[state.palette]

  // ── Scroll tracking ──────────────────────────────────────────────────────────
  const scrollRef   = useRef(null)
  const [scrollTop,  setScrollTop]  = useState(0)
  const [viewHeight, setViewHeight] = useState(600)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const onScroll = useCallback(e => setScrollTop(e.currentTarget.scrollTop), [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setScrollTop(0)
  }, [ds.id, ds.rows, ds.filters, state.sortCol, state.sortDir])

  // ── Derived data ─────────────────────────────────────────────────────────────
  const visibleCols = useMemo(() => {
    const hidden = new Set(ds.hiddenCols || [])
    return ds.cols.filter(c => !hidden.has(c))
  }, [ds.cols, ds.hiddenCols])

  const colTypes = useMemo(() => {
    const out = {}
    ds.cols.forEach(col => { out[col] = detectColType(ds, col) })
    return out
  }, [ds])

  const rows = useMemo(() => {
    const filtered = applyFilters(ds.rows, ds.filters)
    return applySort(filtered, state.sortCol, state.sortDir, colTypes[state.sortCol])
  }, [ds.rows, ds.filters, state.sortCol, state.sortDir, colTypes])

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

  // ── Search ───────────────────────────────────────────────────────────────────
  const [searchOpen,  setSearchOpen]  = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef(null)

  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        if (searchOpen) { searchInputRef.current?.select() }
        else            { setSearchOpen(true) }
      }
      if (e.key === 'Escape' && searchOpen) { setSearchOpen(false); setSearchQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen])

  useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])

  const closeSearch = useCallback(() => { setSearchOpen(false); setSearchQuery('') }, [])

  const searchedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      visibleCols.some(col => String(row[col] ?? '').toLowerCase().includes(q))
    )
  }, [rows, searchQuery, visibleCols])

  // ── Virtual window ───────────────────────────────────────────────────────────
  const startIdx    = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const endIdx      = Math.min(searchedRows.length, Math.ceil((scrollTop + viewHeight) / ROW_H) + OVERSCAN)
  const visibleRows = searchedRows.slice(startIdx, endIdx)
  const topPad      = startIdx * ROW_H
  const bottomPad   = Math.max(0, (searchedRows.length - endIdx) * ROW_H)

  // ── Column resizing ──────────────────────────────────────────────────────────
  const [colWidths,    setColWidths]   = useState(() => ds.colWidths || {})
  const [draggingCol,  setDraggingCol] = useState(null)
  const widthsRef = useRef(colWidths)
  widthsRef.current = colWidths
  const dragRef = useRef(null)

  useEffect(() => { setColWidths(ds.colWidths || {}) }, [ds.id])

  const colW = useCallback(
    col => colWidths[col] ?? (DEFAULT_COL_W[colTypes[col]] || 130),
    [colWidths, colTypes]
  )

  const startResize = useCallback((e, col) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { col, startX: e.clientX, startWidth: colW(col) }
    setDraggingCol(col)
    document.body.style.cursor     = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = ev => {
      const { col: c, startX, startWidth } = dragRef.current
      const newWidth = Math.max(MIN_COL_W, startWidth + (ev.clientX - startX))
      setColWidths(prev => ({ ...prev, [c]: newWidth }))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup',   onMouseUp)
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      setDraggingCol(null)
      dragRef.current = null
      dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { colWidths: widthsRef.current } })
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup',   onMouseUp)
  }, [colW, ds.id, dispatch])

  // ── Cell editing ──────────────────────────────────────────────────────────────
  // editingCell: { dsRowIdx: number, col: string } | null
  // dsRowIdx is the index in ds.rows (stable across sort/filter)
  const [editingCell, setEditingCell] = useState(null)

  useEffect(() => { setEditingCell(null) }, [ds.id])

  const commitEdit = useCallback((dsRowIdx, col, value) => {
    if (dsRowIdx < 0 || dsRowIdx >= ds.rows.length) return
    const newRows = ds.rows.map((r, i) => i === dsRowIdx ? { ...r, [col]: value } : r)
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
  }, [ds.rows, ds.id, dispatch])

  const addRow = useCallback((startCol) => {
    const empty      = Object.fromEntries(ds.cols.map(c => [c, '']))
    const newRows    = [...ds.rows, empty]
    const newDsRowIdx = newRows.length - 1
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      setEditingCell({ dsRowIdx: newDsRowIdx, col: startCol || visibleCols[0] || ds.cols[0] })
    }, 30)
  }, [ds.rows, ds.cols, ds.id, dispatch, visibleCols])

  const deleteRow = useCallback((dsRowIdx) => {
    const newRows = ds.rows.filter((_, i) => i !== dsRowIdx)
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
    setEditingCell(prev => prev?.dsRowIdx === dsRowIdx ? null : prev)
  }, [ds.rows, ds.id, dispatch])

  // navigate handles commit + cursor movement in one step to avoid stale-closure issues
  const navigate = useCallback((dir, dsRowIdx, col, newVal) => {
    const ci = visibleCols.indexOf(col)
    const ri = searchedRows.findIndex(r => ds.rows.indexOf(r) === dsRowIdx)

    // Special case: last row + down → commit + add new row atomically
    if (dir === 'down' && ri >= searchedRows.length - 1) {
      const updatedRows = ds.rows.map((r, i) => i === dsRowIdx ? { ...r, [col]: newVal } : r)
      const empty       = Object.fromEntries(ds.cols.map(c => [c, '']))
      const newRows     = [...updatedRows, empty]
      dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
        setEditingCell({ dsRowIdx: newRows.length - 1, col })
      }, 30)
      return
    }

    // All other cases: commit, then move cursor
    commitEdit(dsRowIdx, col, newVal)

    if (dir === 'right') {
      if (ci < visibleCols.length - 1) {
        setEditingCell({ dsRowIdx, col: visibleCols[ci + 1] })
      } else if (ri < searchedRows.length - 1) {
        setEditingCell({ dsRowIdx: ds.rows.indexOf(searchedRows[ri + 1]), col: visibleCols[0] })
      } else {
        setEditingCell(null)
      }
    } else if (dir === 'left') {
      if (ci > 0) {
        setEditingCell({ dsRowIdx, col: visibleCols[ci - 1] })
      } else if (ri > 0) {
        setEditingCell({ dsRowIdx: ds.rows.indexOf(searchedRows[ri - 1]), col: visibleCols[visibleCols.length - 1] })
      } else {
        setEditingCell(null)
      }
    } else if (dir === 'down') {
      // ri < searchedRows.length - 1 guaranteed here
      setEditingCell({ dsRowIdx: ds.rows.indexOf(searchedRows[ri + 1]), col })
    }
  }, [commitEdit, ds.rows, ds.cols, ds.id, dispatch, visibleCols, searchedRows])

  // ⌘↵ to add row; Escape to exit edit
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addRow() }
      if (e.key === 'Escape' && editingCell && !searchOpen) setEditingCell(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addRow, editingCell, searchOpen])

  // ── Render ───────────────────────────────────────────────────────────────────
  const sortBy      = col => dispatch({ type: 'SET_SORT', col })
  const activeQuery = searchQuery.trim()

  return (
    <div className={s.wrap}>

      {/* ── Search bar ── */}
      {searchOpen && (
        <div className={s.searchBar}>
          <svg className={s.searchIco} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l3.5 3.5"/>
          </svg>
          <input
            ref={searchInputRef}
            className={s.searchInput}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && closeSearch()}
            placeholder="Find in table…"
          />
          {activeQuery && (
            <span className={`${s.searchCount}${searchedRows.length === 0 ? ' ' + s.searchNoMatch : ''}`}>
              {searchedRows.length === 0 ? 'No matches' : `${searchedRows.length.toLocaleString()} rows`}
            </span>
          )}
          <button className={s.searchClose} onClick={closeSearch} title="Close (Esc)">
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
            </svg>
          </button>
        </div>
      )}

      <div className={s.scroll} ref={scrollRef} onScroll={onScroll}>
        <table className={s.table}>

          {/* ── Column widths ── */}
          <colgroup>
            <col style={{ width: 48 }} />
            {visibleCols.map(col => (
              <col key={col} style={{ width: colW(col) }} />
            ))}
          </colgroup>

          {/* ── Header ── */}
          <thead>
            <tr>
              <th><div className={s.thi + ' ' + s.idx}>#</div></th>
              {visibleCols.map(col => {
                const ct       = colTypes[col]
                const vals     = ds.rows.map(r => r[col]).filter(v => v !== undefined && v !== '')
                const isActive = state.sortCol === col
                const arr      = isActive ? (state.sortDir === 1 ? ' ↑' : ' ↓') : ''
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
                    <div className={s.thi}>
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
                    <div
                      className={`${s.resizeHandle}${draggingCol === col ? ' ' + s.resizeHandleActive : ''}`}
                      onMouseDown={e => startResize(e, col)}
                      onClick={e => e.stopPropagation()}
                    />
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
              const i          = startIdx + vi
              const dsRowIdx   = ds.rows.indexOf(row)
              const isEditRow  = editingCell?.dsRowIdx === dsRowIdx
              return (
                <tr key={i} className={[i % 2 === 1 ? s.alt : '', s.dataRow].filter(Boolean).join(' ')}>
                  <td className={[s.tdIdx, s.tdIdxCell].join(' ')}>
                    <span className={s.rowNum}>{i + 1}</span>
                    <button
                      className={s.tdDel}
                      onClick={e => { e.stopPropagation(); deleteRow(dsRowIdx) }}
                      title="Delete row"
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
                      </svg>
                    </button>
                  </td>
                  {visibleCols.map(col => {
                    const cell        = fmtCell(row[col], colTypes[col])
                    const nm          = numMax[col]
                    const pct         = nm ? Math.abs(parseNumeric(row[col]) || 0) / nm.max * 100 : 0
                    const isEditCell  = isEditRow && editingCell?.col === col
                    return (
                      <td
                        key={col}
                        className={[s.td, isEditCell ? s.tdEditing : ''].filter(Boolean).join(' ')}
                        onDoubleClick={() => !searchOpen && setEditingCell({ dsRowIdx, col })}
                      >
                        {isEditCell ? (
                          <CellEditor
                            initialValue={row[col]}
                            colType={colTypes[col]}
                            onCommit={v => { commitEdit(dsRowIdx, col, v); setEditingCell(null) }}
                            onCancel={() => setEditingCell(null)}
                            onNavigate={(dir, v) => navigate(dir, dsRowIdx, col, v)}
                          />
                        ) : (
                          <>
                            {nm && (
                              <div
                                className={s.cellBar}
                                style={{ width: `${pct}%`, background: nm.color }}
                              />
                            )}
                            <CellValue cell={cell} />
                          </>
                        )}
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

        {/* ── Empty state ── */}
        {ds.rows.length === 0 && (
          <div className={s.emptyDs}>
            <svg className={s.emptyDsIco} width="34" height="34" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round">
              <rect x="3" y="3" width="26" height="26" rx="4"/>
              <path d="M3 11h26M3 19h26M11 11v16M21 11v16"/>
            </svg>
            <div className={s.emptyDsText}>No rows yet</div>
            <div className={s.emptyDsSub}>Double-click a cell to edit · Tab/Enter to navigate</div>
            <button className={s.emptyAddBtn} onClick={() => addRow()}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M8 3v10M3 8h10"/>
              </svg>
              Add first row
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className={s.footer}>
        {activeQuery ? (
          <>
            <b>{searchedRows.length.toLocaleString()}</b>
            {searchedRows.length === 1 ? ' match' : ' matches'}
            <span className={s.filtered}> for "{activeQuery}"</span>
            {rows.length < ds.rows.length && (
              <span className={s.filtered}> · {rows.length.toLocaleString()} filtered</span>
            )}
          </>
        ) : (
          <>
            <b>{rows.length.toLocaleString()}</b> rows
            {rows.length < ds.rows.length && (
              <span className={s.filtered}> (filtered from {ds.rows.length.toLocaleString()})</span>
            )}
          </>
        )}
        <span className={s.filtered}> · {(endIdx - startIdx).toLocaleString()} rendered</span>
        <button className={s.addRowBtn} onClick={() => addRow()} title="Add row (⌘↵)">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10"/>
          </svg>
          Add row
        </button>
        {!searchOpen && (
          <span className={s.searchHint}>⌘F search · ⌘↵ add row</span>
        )}
      </div>

    </div>
  )
}
