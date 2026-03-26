import React, { createContext, useContext, useReducer, useCallback } from 'react'
import { makeDS, genHousing, genWorld, genSales, genStocks, uid } from '../lib/data'

// ─── Initial state ────────────────────────────────────────────────────────────
const init = {
  tabs:       [],        // dataset objects
  workspaces: [],        // { id, name }[]
  rowHistory: {},        // { [dsId]: rows[][] } — undo stack, max 50 per dataset
  activeId:   null,      // active tab id
  view:       'table',   // 'table' | 'graph' | 'sql'
  panelOpen:  false,
  panelTab:   'graph',   // 'filters' | 'stats' | 'graph' | 'saved'
  chartType:      'bar',
  barOrientation: 'vertical',
  palette:    0,
  axisX:      '',
  axisY:      '',
  axisY2:     '',
  axisSz:     '',
  showLabels: false,
  showGrid:   true,
  smoothCurves: true,
  sortCol:    null,
  sortDir:    1,
  aggFn:      'sum',
}

// ─── Reducer ─────────────────────────────────────────────────────────────────
function reducer (state, action) {
  switch (action.type) {

    case 'ADD_TAB': {
      const ds = { ...action.ds, open: true, workspaceId: action.ds.workspaceId ?? null }
      return {
        ...state,
        tabs:     [...state.tabs, ds],
        activeId: ds.id,
      }
    }

    case 'ADD_WORKSPACE': {
      const ws = { id: uid(), name: action.name.trim() }
      return { ...state, workspaces: [...state.workspaces, ws] }
    }

    case 'RENAME_WORKSPACE':
      return {
        ...state,
        workspaces: state.workspaces.map(w =>
          w.id === action.id ? { ...w, name: action.name.trim() } : w
        ),
      }

    case 'DELETE_WORKSPACE':
      return {
        ...state,
        workspaces: state.workspaces.filter(w => w.id !== action.id),
        tabs: state.tabs.map(t =>
          t.workspaceId === action.id ? { ...t, workspaceId: null } : t
        ),
      }

    case 'SET_TAB_WORKSPACE':
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === action.tabId ? { ...t, workspaceId: action.workspaceId } : t
        ),
      }

    case 'CLOSE_TAB': {
      const tabs = state.tabs.map(t => t.id === action.id ? { ...t, open: false } : t)
      const activeId = state.activeId === action.id
        ? (tabs.find(t => t.open && t.id !== action.id)?.id ?? null)
        : state.activeId
      return { ...state, tabs, activeId }
    }

    case 'DELETE_TAB': {
      const tabs = state.tabs.filter(t => t.id !== action.id)
      const activeId = state.activeId === action.id
        ? (tabs.find(t => t.open)?.id ?? null)
        : state.activeId
      return { ...state, tabs, activeId }
    }

    case 'SET_ACTIVE':
      return {
        ...state,
        activeId: action.id,
        view: 'table',
        tabs: state.tabs.map(t => t.id === action.id ? { ...t, open: true } : t),
      }

    case 'UPDATE_DS': {
      // merge partial DS fields
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === action.id ? { ...t, ...action.patch } : t),
      }
    }

    case 'SET_VIEW':
      return { ...state, view: action.view }

    case 'TOGGLE_PANEL':
      return { ...state, panelOpen: !state.panelOpen }

    case 'SET_PANEL_TAB':
      return { ...state, panelTab: action.tab }

    case 'SET_CHART_TYPE':
      return { ...state, chartType: action.ct }

    case 'SET_PALETTE':
      return { ...state, palette: action.idx }

    case 'SET_AXIS':
      return { ...state, [`axis${action.which}`]: action.value }

    case 'SET_TOGGLE':
      return { ...state, [action.key]: action.value }

    case 'SET_AGG':
      return { ...state, aggFn: action.fn }

    case 'SET_SORT':
      return {
        ...state,
        sortCol: action.col,
        sortDir: state.sortCol === action.col ? state.sortDir * -1 : 1,
      }

    case 'RESTORE_TABS': {
      const openTab = [...action.tabs].reverse().find(t => t.open !== false)
      return {
        ...state,
        tabs:     action.tabs,
        activeId: openTab?.id ?? null,
      }
    }

    case 'RESTORE_WORKSPACES':
      return { ...state, workspaces: action.workspaces }

    case 'PUSH_ROW_HISTORY': {
      const prev   = state.rowHistory[action.dsId] || []
      const capped = prev.length >= 50 ? prev.slice(1) : prev
      return {
        ...state,
        rowHistory: { ...state.rowHistory, [action.dsId]: [...capped, action.rows] },
      }
    }

    case 'UNDO_ROWS': {
      const stack = state.rowHistory[action.dsId] || []
      if (!stack.length) return state
      return {
        ...state,
        tabs:       state.tabs.map(t => t.id === action.dsId ? { ...t, rows: stack[stack.length - 1] } : t),
        rowHistory: { ...state.rowHistory, [action.dsId]: stack.slice(0, -1) },
      }
    }

    default:
      return state
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────
const Ctx = createContext(null)

export function AppProvider ({ children }) {
  const [state, dispatch] = useReducer(reducer, init)

  const getDS = useCallback(
    () => state.tabs.find(t => t.id === state.activeId) || null,
    [state.tabs, state.activeId]
  )

  const addSample = useCallback((key) => {
    const generators = {
      housing: () => makeDS('CA Housing',       genHousing(), state.tabs.length),
      world:   () => makeDS('World Population', genWorld(),   state.tabs.length),
      sales:   () => makeDS("Sales '23",        genSales(),   state.tabs.length),
      stocks:  () => makeDS('Tech Stocks',      genStocks(),  state.tabs.length),
    }
    const ds = generators[key]?.()
    if (ds) dispatch({ type: 'ADD_TAB', ds })
    return ds
  }, [state.tabs.length])

  const addTab = useCallback((ds) => {
    dispatch({ type: 'ADD_TAB', ds })
  }, [])

  const updateDS = useCallback((id, patch) => {
    dispatch({ type: 'UPDATE_DS', id, patch })
  }, [])

  return (
    <Ctx.Provider value={{ state, dispatch, getDS, addSample, addTab, updateDS }}>
      {children}
    </Ctx.Provider>
  )
}

export const useApp = () => useContext(Ctx)
