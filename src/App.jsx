import React, { useState, useCallback, useEffect, useRef, Component } from 'react'
import { AppProvider, useApp } from './store/AppContext'
import { ToastProvider, useToast } from './components/Toast'
import Sidebar    from './components/Sidebar'
import Titlebar   from './components/Titlebar'
import Toolbar    from './components/Toolbar'
import DataTable  from './components/DataTable'
import ChartView  from './components/ChartView'
import { lazy, Suspense } from 'react'
const SqlEditor = lazy(() => import('./components/SqlEditor'))
import Panel      from './components/Panel'
import Welcome    from './components/Welcome'
import Modal      from './components/Modal'
import NewDatasetModal from './components/NewDatasetModal'
import s          from './App.module.css'
import { makeDS }   from './lib/data'
import { isNumericCol } from './lib/data'
import Papa from 'papaparse'

const isElectron = !!window.MP

class SqlBoundary extends Component {
  state = { err: null }
  static getDerivedStateFromError (e) { return { err: e } }
  render () {
    if (this.state.err) return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, color: 'var(--tx3)', fontSize: 13, padding: 32 }}>
        <span style={{ fontSize: 22 }}>⚠</span>
        <span>SQL engine failed to load</span>
        <span style={{ fontSize: 11, color: 'var(--tx3)', fontFamily: 'var(--m)' }}>{this.state.err.message}</span>
        <button onClick={() => this.setState({ err: null })} style={{ marginTop: 8, padding: '5px 14px', background: 'var(--bg4)', border: '1px solid var(--bd2)', borderRadius: 'var(--r)', color: 'var(--tx2)', cursor: 'pointer', fontSize: 12 }}>Retry</button>
      </div>
    )
    return this.props.children
  }
}

// ─── Drop overlay ─────────────────────────────────────────────────────────────
function DropOverlay ({ visible }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(99,102,241,.05)', backdropFilter: 'blur(4px)',
      border: '2px dashed rgba(99,102,241,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 10, pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 48 }}>⬇</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ac2)' }}>Drop to open</div>
      <div style={{ fontSize: 13, color: 'var(--tx2)' }}>CSV or TSV file</div>
    </div>
  )
}

// ─── Inner app (has access to context) ────────────────────────────────────────
function Inner () {
  const { state, dispatch, getDS, addSample, addTab, updateDS } = useApp()
  const toast = useToast()

  const [newModal,    setNewModal]    = useState(false)
  const [saveModal,   setSaveModal]   = useState(false)
  const [renameModal, setRenameModal] = useState(false)
  const [groupModal,  setGroupModal]  = useState(false)
  const [saveName,    setSaveName]    = useState('')
  const [renameName,  setRenameName]  = useState('')
  const [groupBy,     setGroupBy]     = useState('')
  const [groupFn,     setGroupFn]     = useState('sum')
  const [graphName,   setGraphName]   = useState('Untitled graph')
  const [dropping,    setDropping]    = useState(false)
  const dropCount    = useRef(0)
  const fileInputRef = useRef(null)
  const didInit      = useRef(false)
  const rowSaveTimer = useRef(null)
  const persistedIds  = useRef(new Set())   // IDs upserted to DB
  const openStates    = useRef(new Map())   // id → last-persisted open state
  const persistedWsIds = useRef(new Set())  // workspace IDs upserted to DB

  const ds = getDS()

  // ── Persistence: restore on mount ──────────────────────────────────────────
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (!isElectron) return   // web: no persistence, start with Welcome screen
    ;(async () => {
      try {
        const [saved, savedWs] = await Promise.all([
          window.MP.db.loadDatasets(),
          window.MP.db.loadWorkspaces(),
        ])
        if (!saved.length && !savedWs.length) return  // empty DB → Welcome screen
        saved.forEach(r => {
          persistedIds.current.add(r.id)
          openStates.current.set(r.id, r.open !== false)
        })
        dispatch({
          type: 'RESTORE_TABS',
          tabs: saved.map(r => ({ ...r, filters: {}, filterLabels: {}, savedGraphs: [] })),
        })
        if (savedWs.length) dispatch({ type: 'RESTORE_WORKSPACES', workspaces: savedWs })
      } catch {}  // on error → Welcome screen
    })()
  }, [])

  // ── Persist new tabs to SQLite ───────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return
    state.tabs.forEach(t => {
      if (!persistedIds.current.has(t.id)) {
        persistedIds.current.add(t.id)
        openStates.current.set(t.id, true)
        window.MP.db.upsertDataset({ id: t.id, name: t.name, color: t.color, cols: t.cols, rows: t.rows, workspaceId: t.workspaceId ?? null }).catch(() => {})
      }
    })
  }, [state.tabs])

  // ── Persist workspace assignments when tabs move between workspaces ──────────
  const wsAssignKey = state.tabs.map(t => `${t.id}:${t.workspaceId ?? ''}`).join(',')
  useEffect(() => {
    if (!isElectron) return
    state.tabs.forEach(t => {
      if (persistedIds.current.has(t.id)) {
        window.MP.db.upsertDataset({ id: t.id, name: t.name, color: t.color, cols: t.cols, rows: t.rows, workspaceId: t.workspaceId ?? null }).catch(() => {})
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsAssignKey])

  // ── Persist workspace create / rename / delete ───────────────────────────────
  useEffect(() => {
    if (!isElectron) return
    const currentIds = new Set(state.workspaces.map(w => w.id))
    // delete workspaces that were removed
    persistedWsIds.current.forEach(id => {
      if (!currentIds.has(id)) {
        window.MP.db.deleteWorkspace(id).catch(() => {})
        persistedWsIds.current.delete(id)
      }
    })
    // upsert new or updated workspaces
    state.workspaces.forEach((ws, i) => {
      persistedWsIds.current.add(ws.id)
      window.MP.db.upsertWorkspace({ id: ws.id, name: ws.name, sort: i }).catch(() => {})
    })
  }, [state.workspaces])

  // ── Debounced row save when cells are edited ────────────────────────────────
  useEffect(() => {
    if (!isElectron || !ds) return
    clearTimeout(rowSaveTimer.current)
    rowSaveTimer.current = setTimeout(() => {
      window.MP.db.upsertDataset({ id: ds.id, name: ds.name, color: ds.color, cols: ds.cols, rows: ds.rows }).catch(() => {})
    }, 800)
  }, [ds?.rows])

  // ── Persist open/close state changes to SQLite ──────────────────────────────
  useEffect(() => {
    if (!isElectron) return
    state.tabs.forEach(t => {
      const openVal = t.open !== false
      if (openStates.current.has(t.id) && openStates.current.get(t.id) !== openVal) {
        openStates.current.set(t.id, openVal)
        window.MP.db.setDatasetOpen({ id: t.id, open: openVal }).catch(() => {})
      }
    })
  }, [state.tabs])

  // ── Set up axes when active dataset or view changes ─────────────────────────
  useEffect(() => {
    if (!ds) return
    const nums = ds.cols.filter(c => isNumericCol(ds, c))
    const cats = ds.cols.filter(c => !nums.includes(c))
    if (!state.axisX || !ds.cols.includes(state.axisX))
      dispatch({ type: 'SET_AXIS', which: 'X', value: cats[0] || ds.cols[0] || '' })
    if (!state.axisY || !ds.cols.includes(state.axisY))
      dispatch({ type: 'SET_AXIS', which: 'Y', value: nums[0] || ds.cols[1] || ds.cols[0] || '' })
  }, [state.activeId])

  // ── Load saved graphs from DB when switching tabs ───────────────────────────
  useEffect(() => {
    if (!ds || !isElectron) return
    ;(async () => {
      try {
        const rows = await window.MP.db.loadGraphs(ds.id)
        const mapped = rows.map(r => ({ id: r.id, title: r.title, ...r.config, at: new Date(r.ts).toLocaleTimeString() }))
        const existing = new Set((ds.savedGraphs || []).map(g => String(g.id)))
        const toAdd = mapped.filter(g => !existing.has(String(g.id)))
        if (toAdd.length) updateDS(ds.id, { savedGraphs: [...(ds.savedGraphs || []), ...toAdd] })
      } catch {}
    })()
  }, [state.activeId])

  // ── Electron menu events ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return
    window.MP.on('menu:open',        () => triggerUpload())
    window.MP.on('menu:exportCSV',   () => doExportCSV())
    window.MP.on('menu:exportPNG',   () => { /* handled via ChartView callback */ })
    window.MP.on('menu:saveGraph',   () => { if (state.view === 'graph') setSaveModal(true) })
    window.MP.on('menu:viewTable',   () => dispatch({ type: 'SET_VIEW', view: 'table' }))
    window.MP.on('menu:viewGraph',   () => dispatch({ type: 'SET_VIEW', view: 'graph' }))
    window.MP.on('menu:togglePanel', () => dispatch({ type: 'TOGGLE_PANEL' }))
  }, [state.view])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') { setNewModal(false); setSaveModal(false); setRenameModal(false); setGroupModal(false) }
      if ((e.metaKey || e.ctrlKey) && e.key === '1') { e.preventDefault(); dispatch({ type: 'SET_VIEW', view: 'table' }) }
      if ((e.metaKey || e.ctrlKey) && e.key === '2') { e.preventDefault(); dispatch({ type: 'SET_VIEW', view: 'graph' }) }
      if ((e.metaKey || e.ctrlKey) && e.key === '3') { e.preventDefault(); dispatch({ type: 'SET_VIEW', view: 'sql' }) }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); dispatch({ type: 'TOGGLE_PANEL' }) }
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && state.view === 'graph') { e.preventDefault(); openSaveModal() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') { e.preventDefault(); doExportCSV() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); triggerUpload() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state.view, ds])

  // ── Drag & drop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const enter = () => { dropCount.current++; setDropping(true) }
    const leave = () => { dropCount.current--; if (dropCount.current <= 0) { dropCount.current = 0; setDropping(false) } }
    const over  = e => e.preventDefault()
    const drop  = e => {
      e.preventDefault(); dropCount.current = 0; setDropping(false)
      const f = e.dataTransfer.files[0]; if (!f) return
      const reader = new FileReader()
      reader.onload = ev => parseAndAdd(ev.target.result, f.name)
      reader.readAsText(f)
    }
    document.addEventListener('dragenter',  enter)
    document.addEventListener('dragleave',  leave)
    document.addEventListener('dragover',   over)
    document.addEventListener('drop',       drop)
    return () => {
      document.removeEventListener('dragenter',  enter)
      document.removeEventListener('dragleave',  leave)
      document.removeEventListener('dragover',   over)
      document.removeEventListener('drop',       drop)
    }
  }, [])

  // ── File parse ──────────────────────────────────────────────────────────────
  const parseAndAdd = useCallback((text, filename) => {
    const ext = filename.split('.').pop().toLowerCase()
    const res = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ext === 'tsv' ? '\t' : ',', dynamicTyping: false })
    if (!res.data.length) { toast('Empty or unreadable file', '⚠'); return }
    const newDs = makeDS(filename.replace(/\.[^.]+$/, ''), res.data, state.tabs.length)
    newDs.cols = (res.meta.fields || []).filter(c => c && c.trim())
    addTab(newDs)
    if (isElectron) window.MP.db.upsertDataset({ id: newDs.id, name: newDs.name, color: newDs.color, cols: newDs.cols, rows: newDs.rows }).catch(() => {})
    toast(`Loaded ${newDs.rows.length.toLocaleString()} rows`, '📂')
  }, [state.tabs.length, addTab, toast])

  const triggerUpload = useCallback(async () => {
    if (isElectron) {
      const r = await window.MP.openFile()
      if (r) parseAndAdd(r.content, r.name)
    } else {
      fileInputRef.current?.click()
    }
  }, [parseAndAdd])

  const handleFileInput = useCallback(e => {
    const f = e.target.files[0]; if (!f) return; e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => parseAndAdd(ev.target.result, f.name)
    reader.readAsText(f)
  }, [parseAndAdd])

  // ── Export CSV ──────────────────────────────────────────────────────────────
  const doExportCSV = useCallback(async () => {
    if (!ds) return
    const filters = ds.filters || {}
    const rows = Object.values(filters).reduce((acc, fn) => acc.filter(fn), ds.rows)
    const csv = ds.cols.join(',') + '\n' + rows.map(r => ds.cols.map(c => `"${r[c] ?? ''}"`).join(',')).join('\n')
    const name = (ds.name || 'export').replace(/\s+/g, '_') + '.csv'
    if (isElectron) {
      const ok = await window.MP.saveCSV({ defaultName: name, content: csv })
      if (ok) toast(`Exported ${rows.length.toLocaleString()} rows`, '⬇')
    } else {
      const a = document.createElement('a'); a.download = name; a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.click()
      toast(`Exported ${rows.length.toLocaleString()} rows`, '⬇')
    }
  }, [ds, toast])

  // ── Export JSON ─────────────────────────────────────────────────────────────
  const doExportJSON = useCallback(async () => {
    if (!ds) return
    const filters = ds.filters || {}
    const rows = Object.values(filters).reduce((acc, fn) => acc.filter(fn), ds.rows)
    const json = JSON.stringify(rows, null, 2)
    const name = (ds.name || 'export').replace(/\s+/g, '_') + '.json'
    if (isElectron) {
      const ok = await window.MP.saveCSV({ defaultName: name, content: json })
      if (ok) toast(`Exported ${rows.length.toLocaleString()} rows`, '⬇')
    } else {
      const a = document.createElement('a'); a.download = name; a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(json); a.click()
      toast(`Exported ${rows.length.toLocaleString()} rows`, '⬇')
    }
  }, [ds, toast])

  // ── Export PNG ──────────────────────────────────────────────────────────────
  const doExportPNG = useCallback(async (dataURL) => {
    const name = (graphName || 'graph').replace(/\s+/g, '_') + '.png'
    if (isElectron) {
      await window.MP.savePNG({ defaultName: name, dataURL })
      toast('PNG exported', '⬇')
    } else {
      const a = document.createElement('a'); a.download = name; a.href = dataURL; a.click()
      toast('PNG exported', '⬇')
    }
  }, [graphName, toast])

  // ── Save graph ──────────────────────────────────────────────────────────────
  const openSaveModal = useCallback(() => {
    setSaveName('')          // always start fresh — no stale text
    setSaveModal(true)
  }, [])

  const confirmSave = useCallback(async () => {
    if (!ds) return
    const title = saveName.trim() || 'Untitled graph'
    const config = { ct: state.chartType, xCol: state.axisX, yCol: state.axisY, y2Col: state.axisY2, pal: state.palette }
    let dbId = null
    if (isElectron) {
      try { dbId = await window.MP.db.saveGraph(ds.id, title, config) } catch {}
    }
    const sg = { id: dbId || Date.now(), title, ...config, at: new Date().toLocaleTimeString() }
    updateDS(ds.id, { savedGraphs: [...(ds.savedGraphs || []), sg] })
    setGraphName(title)
    setSaveModal(false)
    toast(`"${title}" saved`, '✓')
  }, [ds, saveName, state, updateDS, toast])

  // ── Load saved graph ────────────────────────────────────────────────────────
  const loadGraph = useCallback(sg => {
    dispatch({ type: 'SET_CHART_TYPE', ct: sg.ct })
    dispatch({ type: 'SET_PALETTE', idx: sg.pal || 0 })
    dispatch({ type: 'SET_AXIS', which: 'X', value: sg.xCol })
    dispatch({ type: 'SET_AXIS', which: 'Y', value: sg.yCol })
    dispatch({ type: 'SET_AXIS', which: 'Y2', value: sg.y2Col || '' })
    setGraphName(sg.title)
    dispatch({ type: 'SET_VIEW', view: 'graph' })
    toast(`Loaded "${sg.title}"`, '📊')
  }, [dispatch, toast])

  const deleteGraph = useCallback(async id => {
    if (!ds) return
    if (isElectron) { try { await window.MP.db.deleteGraph(id) } catch {} }
    updateDS(ds.id, { savedGraphs: (ds.savedGraphs || []).filter(g => String(g.id) !== String(id)) })
    toast('Graph deleted')
  }, [ds, updateDS, toast])

  // ── Rename dataset ──────────────────────────────────────────────────────────
  const openRename = useCallback(() => {
    if (!ds) return; setRenameName(ds.name); setRenameModal(true)
  }, [ds])

  const confirmRename = useCallback(() => {
    if (!ds || !renameName.trim()) return
    updateDS(ds.id, { name: renameName.trim() })
    if (isElectron) window.MP.db.upsertDataset({ id: ds.id, name: renameName.trim(), color: ds.color, cols: ds.cols, rows: ds.rows, workspaceId: ds.workspaceId ?? null }).catch(() => {})
    setRenameModal(false)
    toast(`Renamed to "${renameName.trim()}"`, '✎')
  }, [ds, renameName, updateDS, toast])

  // ── Delete dataset ──────────────────────────────────────────────────────────
  const deleteDataset = useCallback(() => {
    if (!ds || !confirm(`Delete "${ds.name}"? This cannot be undone.`)) return
    if (isElectron) window.MP.db.deleteDataset(ds.id).catch(() => {})
    dispatch({ type: 'DELETE_TAB', id: ds.id })
    toast('Dataset deleted')
  }, [ds, dispatch, toast])

  // ── Group ──────────────────────────────────────────────────────────────────
  const openGroupModal = useCallback(() => {
    if (!ds) return
    const cats = ds.cols.filter(c => !isNumericCol(ds, c))
    if (!cats.length) { toast('No categorical columns to group by', '⚠'); return }
    setGroupBy(cats[0]); setGroupFn('sum'); setGroupModal(true)
  }, [ds, toast])

  const confirmGroup = useCallback(() => {
    if (!ds) return
    const numCols = ds.cols.filter(c => isNumericCol(ds, c))
    const groups  = [...new Set(ds.rows.map(r => r[groupBy]))]
    const newRows = groups.map(g => {
      const gr = ds.rows.filter(r => r[groupBy] === g)
      const obj = { [groupBy]: g, Count: gr.length }
      numCols.slice(0, 6).forEach(nc => {
        const ns = gr.map(r => parseFloat(r[nc]) || 0)
        const agg = {
          sum:   ns.reduce((a, b) => a + b, 0),
          avg:   ns.reduce((a, b) => a + b, 0) / ns.length,
          min:   Math.min(...ns),
          max:   Math.max(...ns),
          count: ns.length,
        }[groupFn]
        obj[`${groupFn}_${nc}`] = +agg.toFixed(2)
      })
      return obj
    })
    const newDs = makeDS(`${ds.name} (by ${groupBy})`, newRows, state.tabs.length)
    addTab(newDs)
    if (isElectron) window.MP.db.upsertDataset({ id: newDs.id, name: newDs.name, color: newDs.color, cols: newDs.cols, rows: newDs.rows }).catch(() => {})
    setGroupModal(false)
    toast(`Grouped by "${groupBy}" — ${groupFn}`, '⬡')
  }, [ds, groupBy, groupFn, state.tabs.length, addTab, toast])

  // ── Filter helpers ──────────────────────────────────────────────────────────
  const addFilter = useCallback((col, filterFn, label) => {
    if (!ds) return
    const newFilters = { ...ds.filters, [col]: filterFn }
    const newLabels  = { ...(ds.filterLabels || {}), [col]: label }
    updateDS(ds.id, { filters: newFilters, filterLabels: newLabels })
    toast(`Filter: ${col} ${label}`, '⚡')
  }, [ds, updateDS, toast])

  const removeFilter = useCallback((col) => {
    if (!ds) return
    const { [col]: _, ...rest }  = ds.filters
    const { [col]: __, ...rest2 } = ds.filterLabels || {}
    updateDS(ds.id, { filters: rest, filterLabels: rest2 })
    toast(`Removed filter on "${col}"`)
  }, [ds, updateDS, toast])

  const clearAllFilters = useCallback(() => {
    if (!ds) return
    updateDS(ds.id, { filters: {}, filterLabels: {} })
    toast('All filters cleared')
  }, [ds, updateDS, toast])

  // ── Create blank dataset from scratch ───────────────────────────────────────
  // cols is [{ name: string, type: string }]
  const createScratch = useCallback((name, cols) => {
    const newDs = makeDS(name, [], state.tabs.length)
    newDs.cols        = cols.map(c => c.name)
    newDs.rows        = []
    newDs.pinnedTypes = Object.fromEntries(cols.map(c => [c.name, c.type]))
    addTab(newDs)
    if (isElectron) window.MP.db.upsertDataset({ id: newDs.id, name: newDs.name, color: newDs.color, cols: newDs.cols, rows: newDs.rows, workspaceId: null }).catch(() => {})
    toast(`Created "${name}"`, '✓')
  }, [state.tabs.length, addTab, toast])

  return (
    <div className={s.app}>
      <DropOverlay visible={dropping} />

      <Sidebar onUpload={triggerUpload} />

      <div className={s.main}>
        <Titlebar onNew={() => setNewModal(true)} />

        {ds ? (
          <>
            <Toolbar
              ds={ds}
              onRename={openRename}
              onDelete={deleteDataset}
              onSaveGraph={openSaveModal}
              onExportCSV={doExportCSV}
              onExportJSON={doExportJSON}
              onGroup={openGroupModal}
              onClearFilters={clearAllFilters}
            />

            <div className={s.content}>
              <div className={s.center}>
                {state.view === 'table' && <DataTable ds={ds} />}
                {state.view === 'graph' && (
                  <ChartView
                    ds={ds}
                    graphName={graphName}
                    onGraphNameChange={setGraphName}
                    onExportPNG={doExportPNG}
                  />
                )}
                {state.view === 'sql' && (
                  <SqlBoundary>
                    <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', fontSize: 13 }}>Loading SQL engine…</div>}>
                      <SqlEditor />
                    </Suspense>
                  </SqlBoundary>
                )}
              </div>
              {state.view !== 'sql' && (
                <Panel
                  ds={ds}
                  onFilterAdd={addFilter}
                  onFilterRemove={removeFilter}
                  onFilterClear={clearAllFilters}
                  onLoadGraph={loadGraph}
                  onDeleteGraph={deleteGraph}
                />
              )}
            </div>
          </>
        ) : (
          <Welcome onSample={addSample} onUpload={triggerUpload} onScratch={() => setNewModal(true)} />
        )}
      </div>

      {/* Hidden file input (web fallback) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt"
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      {/* New dataset modal */}
      {newModal && (
        <NewDatasetModal
          onClose={() => setNewModal(false)}
          onSample={key => { addSample(key); setNewModal(false) }}
          onUpload={() => { setNewModal(false); triggerUpload() }}
          onCreate={(name, cols) => { createScratch(name, cols); setNewModal(false) }}
        />
      )}

      {/* Save graph modal */}
      {saveModal && (
        <Modal
          title="Save graph"
          subtitle="Give this graph a name to keep it with your dataset."
          onClose={() => setSaveModal(false)}
          onConfirm={confirmSave}
          confirmLabel="Save graph"
        >
          <input
            className={s.input}
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmSave()}
            placeholder="e.g. Revenue by Region — Q3"
            autoFocus
          />
        </Modal>
      )}

      {/* Rename modal */}
      {renameModal && (
        <Modal
          title="Rename dataset"
          onClose={() => setRenameModal(false)}
          onConfirm={confirmRename}
          confirmLabel="Rename"
        >
          <input
            className={s.input}
            value={renameName}
            onChange={e => setRenameName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && confirmRename()}
            placeholder="Dataset name"
            autoFocus
          />
        </Modal>
      )}

      {/* Group modal */}
      {groupModal && ds && (
        <Modal
          title="Group dataset"
          subtitle="Aggregate rows by a category. A new dataset tab will be created."
          onClose={() => setGroupModal(false)}
          onConfirm={confirmGroup}
          confirmLabel="Create grouped dataset"
        >
          <label className={s.mLabel}>Group by (category column)</label>
          <select className={s.mSelect} value={groupBy} onChange={e => setGroupBy(e.target.value)}>
            {ds.cols.filter(c => !isNumericCol(ds, c)).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className={s.mLabel}>Aggregation function</label>
          <select className={s.mSelect} value={groupFn} onChange={e => setGroupFn(e.target.value)}>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
            <option value="min">Min</option>
            <option value="max">Max</option>
            <option value="count">Count only</option>
          </select>
        </Modal>
      )}
    </div>
  )
}

export default function App () {
  return (
    <AppProvider>
      <ToastProvider>
        <Inner />
      </ToastProvider>
    </AppProvider>
  )
}
