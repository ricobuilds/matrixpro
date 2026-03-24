import React, { createContext, useContext, useReducer, useCallback } from 'react'
import { makeDS, genHousing, genWorld, genSales, genStocks } from '../lib/data'

// ─── Initial state ────────────────────────────────────────────────────────────
const init = {
  tabs:       [],        // dataset objects
  activeId:   null,      // active tab id
  view:       'table',   // 'table' | 'graph'
  panelOpen:  false,
  panelTab:   'graph',   // 'filters' | 'stats' | 'graph' | 'saved'
  chartType:  'bar',
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
      const ds = action.ds
      return {
        ...state,
        tabs:     [...state.tabs, ds],
        activeId: ds.id,
      }
    }

    case 'CLOSE_TAB': {
      const tabs = state.tabs.filter(t => t.id !== action.id)
      const activeId = state.activeId === action.id
        ? (tabs.length ? tabs[tabs.length - 1].id : null)
        : state.activeId
      return { ...state, tabs, activeId }
    }

    case 'SET_ACTIVE':
      return { ...state, activeId: action.id }

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

    case 'RESTORE_TABS':
      return {
        ...state,
        tabs:     action.tabs,
        activeId: action.tabs.length ? action.tabs[action.tabs.length - 1].id : null,
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
