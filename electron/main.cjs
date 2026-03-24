'use strict'

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path  = require('path')
const fs    = require('fs')
const isDev = !app.isPackaged

// ─── sql.js ──────────────────────────────────────────────────────────────────
let db     = null
let SQL    = null
let dbPath = null

async function openDB () {
  try {
    const initSqlJs = require('sql.js')
    // In production the wasm lives in extraResources; in dev, node_modules
    const wasmPath = isDev
      ? path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
      : path.join(process.resourcesPath, 'sql-wasm.wasm')

    SQL    = await initSqlJs({ locateFile: () => wasmPath })
    dbPath = path.join(app.getPath('userData'), 'matrix-pro.db')

    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath))
    } else {
      db = new SQL.Database()
    }

    db.run(`
      CREATE TABLE IF NOT EXISTS datasets (
        id    TEXT PRIMARY KEY,
        name  TEXT NOT NULL,
        color TEXT NOT NULL,
        cols  TEXT NOT NULL,
        data  TEXT NOT NULL,
        ts    INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS graphs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id TEXT NOT NULL,
        title      TEXT NOT NULL,
        config     TEXT NOT NULL,
        ts         INTEGER NOT NULL
      );
    `)
    flush()
  } catch (e) {
    console.warn('[DB] sql.js unavailable:', e.message)
    db = null
  }
}

function flush () {
  if (!db || !dbPath) return
  try { fs.writeFileSync(dbPath, Buffer.from(db.export())) }
  catch (e) { console.error('[DB flush]', e.message) }
}

// ─── IPC handlers ────────────────────────────────────────────────────────────
ipcMain.handle('db:upsertDataset', (_, { id, name, color, cols, rows }) => {
  if (!db) return false
  db.run(
    'INSERT OR REPLACE INTO datasets (id,name,color,cols,data,ts) VALUES (?,?,?,?,?,?)',
    [id, name, color, JSON.stringify(cols), JSON.stringify(rows), Date.now()]
  )
  flush()
  return true
})

ipcMain.handle('db:loadDatasets', () => {
  if (!db) return []
  const stmt = db.prepare('SELECT id,name,color,cols,data FROM datasets ORDER BY ts ASC')
  const out  = []
  while (stmt.step()) {
    const r = stmt.getAsObject()
    out.push({ id: r.id, name: r.name, color: r.color, cols: JSON.parse(r.cols), rows: JSON.parse(r.data) })
  }
  stmt.free()
  return out
})

ipcMain.handle('db:deleteDataset', (_, id) => {
  if (!db) return false
  db.run('DELETE FROM datasets WHERE id=?', [id])
  db.run('DELETE FROM graphs   WHERE dataset_id=?', [id])
  flush()
  return true
})

ipcMain.handle('db:saveGraph', (_, { datasetId, title, config }) => {
  if (!db) return null
  db.run(
    'INSERT INTO graphs (dataset_id,title,config,ts) VALUES (?,?,?,?)',
    [datasetId, title, JSON.stringify(config), Date.now()]
  )
  flush()
  const res = db.exec('SELECT last_insert_rowid() AS id')
  return res[0]?.values[0][0] ?? null
})

ipcMain.handle('db:loadGraphs', (_, datasetId) => {
  if (!db) return []
  const stmt = db.prepare('SELECT * FROM graphs WHERE dataset_id=? ORDER BY ts DESC')
  stmt.bind([datasetId])
  const out = []
  while (stmt.step()) {
    const r = stmt.getAsObject()
    out.push({ id: r.id, title: r.title, config: JSON.parse(r.config), ts: r.ts })
  }
  stmt.free()
  return out
})

ipcMain.handle('db:deleteGraph', (_, id) => {
  if (!db) return false
  db.run('DELETE FROM graphs WHERE id=?', [id])
  flush()
  return true
})

ipcMain.handle('dialog:openFile', async () => {
  const res = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters:    [{ name: 'Data Files', extensions: ['csv', 'tsv', 'txt'] }],
  })
  if (res.canceled || !res.filePaths.length) return null
  const fp = res.filePaths[0]
  return { name: path.basename(fp), content: fs.readFileSync(fp, 'utf-8') }
})

ipcMain.handle('dialog:saveCSV', async (_, { defaultName, content }) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters:     [{ name: 'CSV', extensions: ['csv'] }],
  })
  if (res.canceled) return false
  fs.writeFileSync(res.filePath, content, 'utf-8')
  return true
})

ipcMain.handle('dialog:savePNG', async (_, { defaultName, dataURL }) => {
  const res = await dialog.showSaveDialog(win, {
    defaultPath: defaultName,
    filters:     [{ name: 'PNG Image', extensions: ['png'] }],
  })
  if (res.canceled) return false
  const buf = Buffer.from(dataURL.replace(/^data:image\/png;base64,/, ''), 'base64')
  fs.writeFileSync(res.filePath, buf)
  return true
})

// ─── Window ───────────────────────────────────────────────────────────────────
let win

function createWindow () {
  win = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth:  960,
    minHeight: 600,
    titleBarStyle:        'hiddenInset',
    trafficLightPosition: { x: 16, y: 12 },
    backgroundColor:      '#09090b',
    show: false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration:  false,
      // allow loading local wasm in dev
      webSecurity: !isDev,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  win.once('ready-to-show', () => win.show())
  buildMenu()
}

function send (ch) { win?.webContents.send(ch) }

function buildMenu () {
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Open Dataset…',       accelerator: 'CmdOrCtrl+O',       click: () => send('menu:open') },
      { type: 'separator' },
      { label: 'Export CSV…',         accelerator: 'CmdOrCtrl+E',       click: () => send('menu:exportCSV') },
      { label: 'Export Chart PNG…',   accelerator: 'CmdOrCtrl+Shift+E', click: () => send('menu:exportPNG') },
      { label: 'Save Graph…',         accelerator: 'CmdOrCtrl+S',       click: () => send('menu:saveGraph') },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ]},
    { label: 'View', submenu: [
      { label: 'Table View',    accelerator: 'CmdOrCtrl+1',   click: () => send('menu:viewTable') },
      { label: 'Graph View',   accelerator: 'CmdOrCtrl+2',   click: () => send('menu:viewGraph') },
      { label: 'Toggle Panel', accelerator: 'CmdOrCtrl+\\',  click: () => send('menu:togglePanel') },
      { type: 'separator' },
      { role: 'reload' }, { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ]},
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]))
}

app.whenReady().then(async () => {
  await openDB()
  createWindow()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate',           () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
