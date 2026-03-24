'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const MENU_EVENTS = [
  'menu:open', 'menu:exportCSV', 'menu:exportPNG', 'menu:saveGraph',
  'menu:viewTable', 'menu:viewGraph', 'menu:togglePanel',
]

contextBridge.exposeInMainWorld('MP', {
  openFile: ()     => ipcRenderer.invoke('dialog:openFile'),
  saveCSV:  (o)    => ipcRenderer.invoke('dialog:saveCSV', o),
  savePNG:  (o)    => ipcRenderer.invoke('dialog:savePNG', o),

  db: {
    upsertDataset: (ds)             => ipcRenderer.invoke('db:upsertDataset', ds),
    loadDatasets:  ()               => ipcRenderer.invoke('db:loadDatasets'),
    deleteDataset: (id)             => ipcRenderer.invoke('db:deleteDataset', id),
    saveGraph:     (dsId, t, cfg)   => ipcRenderer.invoke('db:saveGraph', { datasetId: dsId, title: t, config: cfg }),
    loadGraphs:    (dsId)           => ipcRenderer.invoke('db:loadGraphs', dsId),
    deleteGraph:   (id)             => ipcRenderer.invoke('db:deleteGraph', id),
  },

  on: (ch, fn) => {
    if (MENU_EVENTS.includes(ch)) ipcRenderer.on(ch, fn)
  },
  off: (ch, fn) => ipcRenderer.removeListener(ch, fn),
})
