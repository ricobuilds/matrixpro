import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { useApp } from '../store/AppContext'
import { fmtCell, fmtN, detectColType, buildCatColorMap, parseDate, fmtDate, parseNumeric } from '../lib/data'
import { PALETTES, COL_TYPES, COL_TYPE_ORDER } from '../lib/constants'
import s from './DataTable.module.css'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

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

  const catColorMaps = useMemo(() => {
    const out = {}
    ds.cols.forEach(col => {
      if (colTypes[col] === 'category') {
        const unique = new Set(ds.rows.map(r => String(r[col] ?? '')).filter(Boolean))
        out[col] = buildCatColorMap(unique)
      }
    })
    return out
  }, [ds, colTypes])

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

  // ── Column rename ─────────────────────────────────────────────────────────────
  const [renamingCol, setRenamingCol] = useState(null)
  const [renameVal,   setRenameVal]   = useState('')
  const renameInputRef = useRef(null)

  useEffect(() => { if (renamingCol) renameInputRef.current?.select() }, [renamingCol])

  const startRenameCol = useCallback((col, e) => {
    e.stopPropagation()
    setRenameVal(col)
    setRenamingCol(col)
  }, [])

  const commitRenameCol = useCallback((oldCol) => {
    const n = renameVal.trim()
    setRenamingCol(null)
    if (!n || n === oldCol || ds.cols.includes(n)) return
    const cols = ds.cols.map(c => c === oldCol ? n : c)
    const rows = ds.rows.map(r => { const { [oldCol]: v, ...rest } = r; return { ...rest, [n]: v } })
    const pt   = { ...(ds.pinnedTypes || {}) }
    if (oldCol in pt) { pt[n] = pt[oldCol]; delete pt[oldCol] }
    const hc   = (ds.hiddenCols  || []).map(c => c === oldCol ? n : c)
    const cw   = { ...(ds.colWidths   || {}) }
    if (oldCol in cw) { cw[n] = cw[oldCol]; delete cw[oldCol] }
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { cols, rows, pinnedTypes: pt, hiddenCols: hc, colWidths: cw } })
  }, [renameVal, ds, dispatch])

  // ── Cycle column type ────────────────────────────────────────────────────────
  const cycleType = useCallback(col => {
    const current = colTypes[col] || 'text'
    const next    = COL_TYPE_ORDER[(COL_TYPE_ORDER.indexOf(current) + 1) % COL_TYPE_ORDER.length]
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { pinnedTypes: { ...(ds.pinnedTypes || {}), [col]: next } } })
  }, [colTypes, ds.id, ds.pinnedTypes, dispatch])

  // ── Search & Replace ─────────────────────────────────────────────────────────
  const [searchOpen,   setSearchOpen]   = useState(false)
  const [searchQuery,  setSearchQuery]  = useState('')
  const [replaceOpen,  setReplaceOpen]  = useState(false)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [matchIdx,     setMatchIdx]     = useState(0)
  const searchInputRef  = useRef(null)
  const replaceInputRef = useRef(null)

  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        if (searchOpen && !replaceOpen) { searchInputRef.current?.select() }
        else { setSearchOpen(true); setReplaceOpen(false); setTimeout(() => searchInputRef.current?.focus(), 0) }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
        e.preventDefault()
        setSearchOpen(true); setReplaceOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 0)
      }
      if (e.key === 'Escape' && searchOpen) closeSearch()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen, replaceOpen])

  useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])

  const closeSearch = useCallback(() => {
    setSearchOpen(false); setSearchQuery(''); setReplaceOpen(false); setReplaceQuery(''); setMatchIdx(0)
  }, [])

  const searchedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      visibleCols.some(col => String(row[col] ?? '').toLowerCase().includes(q))
    )
  }, [rows, searchQuery, visibleCols])

  // All matching cells: { dsRowIdx, col, visualIdx }
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const out = []
    searchedRows.forEach((row, visualIdx) => {
      const dsRowIdx = ds.rows.indexOf(row)
      visibleCols.forEach(col => {
        if (String(row[col] ?? '').toLowerCase().includes(q))
          out.push({ dsRowIdx, col, visualIdx })
      })
    })
    return out
  }, [searchedRows, searchQuery, visibleCols, ds.rows])

  // O(1) lookup for cell highlight
  const matchSet = useMemo(() => {
    const s = new Set()
    matches.forEach(({ dsRowIdx, col }) => s.add(`${dsRowIdx}:${col}`))
    return s
  }, [matches])

  // Reset to first match whenever query changes
  useEffect(() => { setMatchIdx(0) }, [searchQuery])

  // Clamp matchIdx if matches shrink (e.g. after a replace)
  useEffect(() => {
    if (matches.length && matchIdx >= matches.length) setMatchIdx(matches.length - 1)
  }, [matches.length])

  // Auto-scroll to active match
  useEffect(() => {
    if (!matches.length || !scrollRef.current) return
    const match = matches[matchIdx]
    if (!match) return
    const top = match.visualIdx * ROW_H
    const el  = scrollRef.current
    if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 3), behavior: 'smooth' })
    }
  }, [matchIdx, matches])

  const navigateMatch = useCallback((delta) => {
    if (!matches.length) return
    setMatchIdx(i => (i + delta + matches.length) % matches.length)
  }, [matches.length])

  const replaceCurrent = useCallback(() => {
    const match = matches[matchIdx]
    if (!match || !searchQuery.trim()) return
    const { dsRowIdx, col } = match
    const regex = new RegExp(escapeRegex(searchQuery.trim()), 'gi')
    dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
    const newRows = ds.rows.map((r, i) =>
      i === dsRowIdx ? { ...r, [col]: String(r[col] ?? '').replace(regex, replaceQuery) } : r
    )
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
  }, [matches, matchIdx, searchQuery, replaceQuery, ds.rows, ds.id, dispatch])

  const replaceAll = useCallback(() => {
    if (!matches.length || !searchQuery.trim()) return
    const regex = new RegExp(escapeRegex(searchQuery.trim()), 'gi')
    const toReplace = {}
    matches.forEach(({ dsRowIdx, col }) => {
      if (!toReplace[dsRowIdx]) toReplace[dsRowIdx] = new Set()
      toReplace[dsRowIdx].add(col)
    })
    dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
    const newRows = ds.rows.map((r, i) => {
      if (!toReplace[i]) return r
      const updated = { ...r }
      toReplace[i].forEach(col => { updated[col] = String(r[col] ?? '').replace(regex, replaceQuery) })
      return updated
    })
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
    const n = matches.length
    setSearchQuery('')
    setMatchIdx(0)
    // keep panel open so user sees the result; toast via parent would be ideal but table owns this
  }, [matches, searchQuery, replaceQuery, ds.rows, ds.id, dispatch])

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
  const [editingCell,    setEditingCell]    = useState(null)
  const [selectedRows,   setSelectedRows]   = useState(new Set())
  const [lastClickedRow, setLastClickedRow] = useState(null)
  const [copiedFeedback, setCopiedFeedback] = useState(false)

  useEffect(() => {
    setEditingCell(null)
    setSelectedRows(new Set())
    setLastClickedRow(null)
  }, [ds.id])

  const commitEdit = useCallback((dsRowIdx, col, value) => {
    if (dsRowIdx < 0 || dsRowIdx >= ds.rows.length) return
    dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
    const newRows = ds.rows.map((r, i) => i === dsRowIdx ? { ...r, [col]: value } : r)
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
  }, [ds.rows, ds.id, dispatch])

  const addRow = useCallback((startCol) => {
    dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
    const empty       = Object.fromEntries(ds.cols.map(c => [c, '']))
    const newRows     = [...ds.rows, empty]
    const newDsRowIdx = newRows.length - 1
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
      setEditingCell({ dsRowIdx: newDsRowIdx, col: startCol || visibleCols[0] || ds.cols[0] })
    }, 30)
  }, [ds.rows, ds.cols, ds.id, dispatch, visibleCols])

  const deleteRow = useCallback((dsRowIdx) => {
    dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
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
      dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
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

  // ── Row selection ─────────────────────────────────────────────────────────────
  const handleRowSelect = useCallback((dsRowIdx, e) => {
    e.stopPropagation()
    if (e.shiftKey && lastClickedRow != null) {
      // Shift+click: range select in current visible order
      const idxA = searchedRows.findIndex(r => ds.rows.indexOf(r) === lastClickedRow)
      const idxB = searchedRows.findIndex(r => ds.rows.indexOf(r) === dsRowIdx)
      const lo   = Math.min(idxA, idxB)
      const hi   = Math.max(idxA, idxB)
      setSelectedRows(prev => {
        const next = new Set(prev)
        for (let k = lo; k <= hi; k++) next.add(ds.rows.indexOf(searchedRows[k]))
        return next
      })
    } else if (e.metaKey || e.ctrlKey) {
      // ⌘+click: toggle single row
      setSelectedRows(prev => {
        const next = new Set(prev)
        next.has(dsRowIdx) ? next.delete(dsRowIdx) : next.add(dsRowIdx)
        return next
      })
      setLastClickedRow(dsRowIdx)
    } else {
      // Plain click: select only this row (or deselect if it was the only one)
      setSelectedRows(prev => {
        if (prev.size === 1 && prev.has(dsRowIdx)) return new Set()
        return new Set([dsRowIdx])
      })
      setLastClickedRow(dsRowIdx)
    }
  }, [ds.rows, searchedRows, lastClickedRow])

  const toggleSelectAll = useCallback(() => {
    const visibleIdxs = searchedRows.map(r => ds.rows.indexOf(r))
    const allSel = visibleIdxs.every(i => selectedRows.has(i))
    if (allSel) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(visibleIdxs))
    }
  }, [ds.rows, searchedRows, selectedRows])

  const bulkDelete = useCallback(() => {
    if (selectedRows.size === 0) return
    dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
    const newRows = ds.rows.filter((_, i) => !selectedRows.has(i))
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
    setSelectedRows(new Set())
    setLastClickedRow(null)
  }, [ds.rows, ds.id, dispatch, selectedRows])

  const bulkDuplicate = useCallback(() => {
    if (selectedRows.size === 0) return
    dispatch({ type: 'PUSH_ROW_HISTORY', dsId: ds.id, rows: ds.rows })
    const sorted = [...selectedRows].sort((a, b) => a - b)
    const insertAfter = sorted[sorted.length - 1]
    const copies = sorted.map(i => ({ ...ds.rows[i] }))
    const newRows = [
      ...ds.rows.slice(0, insertAfter + 1),
      ...copies,
      ...ds.rows.slice(insertAfter + 1)
    ]
    const newIdxs = new Set(copies.map((_, k) => insertAfter + 1 + k))
    dispatch({ type: 'UPDATE_DS', id: ds.id, patch: { rows: newRows } })
    setSelectedRows(newIdxs)
    setLastClickedRow(null)
  }, [ds.rows, ds.id, dispatch, selectedRows])

  const copySelectionCSV = useCallback(() => {
    if (selectedRows.size === 0) return
    const sorted = [...selectedRows].sort((a, b) => a - b)
    const header = visibleCols.join('\t')
    const body   = sorted.map(i => visibleCols.map(c => ds.rows[i]?.[c] ?? '').join('\t')).join('\n')
    navigator.clipboard.writeText(header + '\n' + body).then(() => {
      setCopiedFeedback(true)
      setTimeout(() => setCopiedFeedback(false), 1600)
    })
  }, [ds.rows, visibleCols, selectedRows])

  // ⌘↵ to add row; ⌘Z to undo; Escape to exit edit
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addRow() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey && !editingCell) {
        e.preventDefault()
        dispatch({ type: 'UNDO_ROWS', dsId: ds.id })
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a' && !editingCell && !searchOpen) {
        e.preventDefault()
        toggleSelectAll()
      }
      if (e.key === 'Escape' && !searchOpen) {
        if (editingCell) setEditingCell(null)
        else if (selectedRows.size > 0) { setSelectedRows(new Set()); setLastClickedRow(null) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addRow, editingCell, searchOpen, ds.id, dispatch, toggleSelectAll, selectedRows])

  // ── Render ───────────────────────────────────────────────────────────────────
  const sortBy      = col => dispatch({ type: 'SET_SORT', col })
  const activeQuery = searchQuery.trim()

  // Selection derived state
  const visibleIdxs  = searchedRows.map(r => ds.rows.indexOf(r))
  const selCount     = selectedRows.size
  const allVisible   = visibleIdxs.length > 0 && visibleIdxs.every(i => selectedRows.has(i))
  const someVisible  = !allVisible && visibleIdxs.some(i => selectedRows.has(i))

  return (
    <div className={s.wrap}>

      {/* ── Search / Replace bar ── */}
      {searchOpen && (
        <div className={s.searchBar}>

          {/* ── Find row ── */}
          <div className={s.searchRow}>
            <svg className={s.searchIco} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l3.5 3.5"/>
            </svg>
            <input
              ref={searchInputRef}
              className={s.searchInput}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter')  { e.preventDefault(); navigateMatch(e.shiftKey ? -1 : 1) }
                if (e.key === 'Escape') closeSearch()
              }}
              placeholder="Find in table…"
            />
            {activeQuery && (
              <>
                <button className={s.matchNavBtn} onClick={() => navigateMatch(-1)} title="Previous (Shift+Enter)">
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 7l3-4 3 4"/></svg>
                </button>
                <button className={s.matchNavBtn} onClick={() => navigateMatch(1)} title="Next (Enter)">
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 3l3 4 3-4"/></svg>
                </button>
                <span className={`${s.searchCount}${matches.length === 0 ? ' ' + s.searchNoMatch : ''}`}>
                  {matches.length === 0 ? 'No matches' : `${matchIdx + 1} / ${matches.length}`}
                </span>
              </>
            )}
            <button
              className={[s.replaceToggle, replaceOpen && s.replaceToggleOn].filter(Boolean).join(' ')}
              onClick={() => setReplaceOpen(v => !v)}
              title="Toggle replace (⌘H)"
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 6h9a3 3 0 010 6H4M4 9l-3 3 3 3"/>
              </svg>
            </button>
            <button className={s.searchClose} onClick={closeSearch} title="Close (Esc)">
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
              </svg>
            </button>
          </div>

          {/* ── Replace row ── */}
          {replaceOpen && (
            <div className={s.replaceRow}>
              <svg className={s.searchIco} width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 4h9a3 3 0 010 6H4M4 7l-3 3 3 3"/>
              </svg>
              <input
                ref={replaceInputRef}
                className={s.searchInput}
                value={replaceQuery}
                onChange={e => setReplaceQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); replaceCurrent() }
                  if (e.key === 'Escape') closeSearch()
                }}
                placeholder="Replace with…"
              />
              <button
                className={s.replaceBtn}
                onClick={replaceCurrent}
                disabled={!matches.length || !activeQuery}
                title="Replace current match (Enter)"
              >Replace</button>
              <button
                className={[s.replaceBtn, s.replaceBtnAll].join(' ')}
                onClick={replaceAll}
                disabled={!matches.length || !activeQuery}
                title={`Replace all ${matches.length} matches`}
              >All {matches.length > 0 && `(${matches.length})`}</button>
            </div>
          )}

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
              <th>
                <div className={s.thi + ' ' + s.idx}>
                  <button
                    className={s.selAllBtn + (allVisible ? ' ' + s.selAllOn : someVisible ? ' ' + s.selAllMixed : '')}
                    onClick={toggleSelectAll}
                    title={allVisible ? 'Deselect all' : 'Select all visible rows'}
                  >
                    {/* # label — hidden when state is active or on hover (CSS) */}
                    <span className={s.selAllHash}>#</span>
                    {/* Icon layer — circle at rest, dash/check when active */}
                    <span className={s.selAllIcon}>
                      {allVisible ? (
                        /* Filled checkbox — all selected */
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.4"/>
                          <path d="M3.5 7l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      ) : someVisible ? (
                        /* Partial — dash */
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" opacity=".12" stroke="currentColor" strokeWidth="1.4"/>
                          <path d="M4 7h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        /* Empty checkbox — default hover state */
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <rect x="1" y="1" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                        </svg>
                      )}
                    </span>
                  </button>
                </div>
              </th>
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
                const tb = COL_TYPES[ct] || COL_TYPES.text
                return (
                  <th key={col}>
                    <div className={s.thi}>
                      <div className={s.thName}>
                        <span
                          className={s.colTypeBadge}
                          style={{ color: tb.color, background: tb.bg }}
                          onClick={e => { e.stopPropagation(); cycleType(col) }}
                          title={`Type: ${tb.title} — click to change`}
                        >{tb.label}</span>
                        {renamingCol === col ? (
                          <input
                            ref={renameInputRef}
                            className={s.colRenameInput}
                            value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  { e.stopPropagation(); commitRenameCol(col) }
                              if (e.key === 'Escape') { e.stopPropagation(); setRenamingCol(null) }
                            }}
                            onBlur={() => commitRenameCol(col)}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className={s.thLabel}
                            onDoubleClick={e => startRenameCol(col, e)}
                            title="Double-click to rename"
                          >{col}</span>
                        )}
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
              const isSel      = selectedRows.has(dsRowIdx)
              const rowCls     = [
                i % 2 === 1 ? s.alt : '',
                s.dataRow,
                isSel      ? s.selectedRow  : '',
                selCount > 0 ? s.selModeRow : '',
              ].filter(Boolean).join(' ')
              return (
                <tr key={i} className={rowCls}>
                  <td className={[s.tdIdx, s.tdIdxCell].join(' ')}>
                    <span className={s.rowNum}>{i + 1}</span>
                    {selCount > 0 ? (
                      /* Selection mode: checkbox overlay */
                      <button
                        className={s.tdSel + (isSel ? ' ' + s.tdSelOn : '')}
                        onClick={e => handleRowSelect(dsRowIdx, e)}
                        title={isSel ? 'Deselect row' : 'Select row'}
                      >
                        {isSel ? (
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1.5 5.5l2.5 2.5 4.5-5"/>
                          </svg>
                        ) : (
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <circle cx="5" cy="5" r="3.5"/>
                          </svg>
                        )}
                      </button>
                    ) : (
                      /* Normal mode: hover shows circle → click to enter selection */
                      <button
                        className={s.tdSelHover}
                        onClick={e => handleRowSelect(dsRowIdx, e)}
                        title="Click to select · ⌘ toggle · ⇧ range"
                      >
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <circle cx="5" cy="5" r="3.5"/>
                        </svg>
                      </button>
                    )}
                  </td>
                  {visibleCols.map(col => {
                    const cell         = fmtCell(row[col], colTypes[col], catColorMaps[col])
                    const nm           = numMax[col]
                    const pct          = nm ? Math.abs(parseNumeric(row[col]) || 0) / nm.max * 100 : 0
                    const isEditCell   = isEditRow && editingCell?.col === col
                    const activeMatch  = matches[matchIdx]
                    const isActiveMth  = activeMatch?.dsRowIdx === dsRowIdx && activeMatch?.col === col
                    const isAnyMth     = !isActiveMth && matchSet.has(`${dsRowIdx}:${col}`)
                    return (
                      <td
                        key={col}
                        className={[s.td, isEditCell ? s.tdEditing : '', isActiveMth ? s.matchActive : isAnyMth ? s.matchHighlight : ''].filter(Boolean).join(' ')}
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

      {/* ── Bulk action bar ── */}
      {selCount > 0 && (
        <div className={s.actionBar}>
          <span className={s.actionCount}>{selCount} row{selCount !== 1 ? 's' : ''} selected</span>
          <span className={s.actionSep}/>
          <button className={s.actionBtn} onClick={bulkDuplicate} title="Duplicate selected rows">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="5" width="8" height="9" rx="1.5"/>
              <path d="M3 11V3a1 1 0 011-1h7"/>
            </svg>
            Duplicate
          </button>
          <button className={s.actionBtnSuccess} onClick={copySelectionCSV} title="Copy as TSV to clipboard">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V7L9 2z"/>
              <path d="M9 2v5h4"/>
            </svg>
            {copiedFeedback ? 'Copied!' : 'Copy CSV'}
          </button>
          <button className={s.actionBtnDanger} onClick={bulkDelete} title="Delete selected rows">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h10M6 5V3h4v2M6 8v5M10 8v5"/>
              <rect x="4" y="5" width="8" height="8" rx="1"/>
            </svg>
            Delete
          </button>
          <span className={s.actionSep}/>
          <button className={s.actionDismiss} onClick={() => { setSelectedRows(new Set()); setLastClickedRow(null) }} title="Clear selection (Esc)">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/>
            </svg>
          </button>
        </div>
      )}

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
          <span className={s.searchHint}>⌘F find · ⌘H replace · ⌘↵ add row</span>
        )}
      </div>

    </div>
  )
}
