import React, { useEffect, useRef, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import { useApp } from '../store/AppContext'
import { PALETTES } from '../lib/constants'
import { isNumericCol } from '../lib/data'
import DataTable from './DataTable'
import s from './ChartView.module.css'

Chart.register(...registerables)

// ─── Aggregation helper ───────────────────────────────────────────────────────
function applyAgg (vals, fn) {
  if (!vals || vals.length === 0) return 0
  switch (fn) {
    case 'mean':   return vals.reduce((a, b) => a + b, 0) / vals.length
    case 'median': {
      const sorted = [...vals].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }
    case 'min':    return Math.min(...vals)
    case 'max':    return Math.max(...vals)
    case 'std': {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      return Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    }
    case 'var': {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
    }
    case 'count':  return vals.length
    default:       return vals.reduce((a, b) => a + b, 0) // sum
  }
}

// ─── Build chart datasets ─────────────────────────────────────────────────────
function buildChartData ({ ds, xCol, yCol, y2Col, szCol, ct, pal, filters, sortCol, sortDir, aggFn = 'sum' }) {
  if (!xCol || !yCol) return null

  const allRows = Object.values(filters).reduce((acc, fn) => acc.filter(fn), ds.rows)
  const rows = allRows.slice(0, 500)
  const isXnum = rows.slice(0, 20).every(r => !isNaN(parseFloat(r[xCol])))
  const isLine = ct === 'line', isArea = ct === 'area'
  const isBar = ct === 'bar', isStacked = ct === 'bar-stacked'
  const isScatter = ct === 'scatter', isBubble = ct === 'bubble'
  const isDoughnut = ct === 'doughnut', isRadar = ct === 'radar', isPolar = ct === 'polar'

  let labels = [], datasets = []

  if (isScatter || isBubble) {
    const maxSz = szCol ? (Math.max(...rows.map(r => parseFloat(r[szCol]) || 0)) || 1) : 1
    labels = []
    datasets = [{
      label: yCol,
      data: rows.map(r => ({
        x: parseFloat(r[xCol]) || 0,
        y: parseFloat(r[yCol]) || 0,
        r: isBubble && szCol
          ? Math.max(3, Math.min(26, (parseFloat(r[szCol]) || 0) / maxSz * 22))
          : 5,
      })),
      backgroundColor: pal[0] + 'aa',
      borderColor: pal[0],
      borderWidth: 1,
    }]
  } else if (isDoughnut || isPolar) {
    const agg = {}
    rows.forEach(r => {
      const k = String(r[xCol]).slice(0, 25)
      if (!agg[k]) agg[k] = []
      agg[k].push(parseFloat(r[yCol]) || 0)
    })
    const keys = Object.keys(agg).slice(0, 12)
    labels = keys
    datasets = [{
      label: yCol,
      data: keys.map(k => +applyAgg(agg[k], aggFn).toFixed(2)),
      backgroundColor: keys.map((_, i) => pal[i % pal.length] + 'cc'),
      borderColor: keys.map((_, i) => pal[i % pal.length]),
      borderWidth: 1.5,
      hoverOffset: 6,
    }]
  } else if (isRadar) {
    const agg = {}
    rows.forEach(r => {
      const k = String(r[xCol])
      agg[k] = (agg[k] || []).concat(parseFloat(r[yCol]) || 0)
    })
    const keys = Object.keys(agg).slice(0, 10)
    labels = keys
    datasets = [{
      label: yCol,
      data: keys.map(k => +applyAgg(agg[k], aggFn).toFixed(2)),
      backgroundColor: pal[0] + '33',
      borderColor: pal[0],
      borderWidth: 2,
      pointBackgroundColor: pal[0],
      pointRadius: 4,
    }]
  } else if (isStacked && !isXnum) {
    const grpCol = ds.cols.find(c => c !== xCol && c !== yCol && !isNumericCol(ds, c))
    if (grpCol) {
      const groups = [...new Set(rows.map(r => r[grpCol]))].slice(0, 8)
      const labSet = [...new Set(rows.map(r => String(r[xCol])))].slice(0, 24)
      labels = labSet
      datasets = groups.map((g, gi) => {
        const agg = {}
        labSet.forEach(l => (agg[l] = []))
        rows.filter(r => r[grpCol] === g).forEach(r => {
          const k = String(r[xCol])
          if (agg[k] !== undefined) agg[k].push(parseFloat(r[yCol]) || 0)
        })
        return {
          label: g,
          data: labSet.map(l => +applyAgg(agg[l], aggFn).toFixed(2)),
          backgroundColor: pal[gi % pal.length] + 'cc',
          borderWidth: 0,
        }
      })
    } else {
      // fallback plain bar
      const agg = {}
      rows.forEach(r => {
        const k = String(r[xCol])
        if (!agg[k]) agg[k] = []
        agg[k].push(parseFloat(r[yCol]) || 0)
      })
      labels = Object.keys(agg).slice(0, 24)
      datasets = [{
        label: yCol,
        data: labels.map(k => +applyAgg(agg[k], aggFn).toFixed(2)),
        backgroundColor: labels.map((_, i) => pal[i % pal.length] + 'cc'),
        borderWidth: 0,
      }]
    }
  } else if (!isXnum) {
    const agg = {}, agg2 = {}
    rows.forEach(r => {
      const k = String(r[xCol])
      if (!agg[k]) agg[k] = []
      agg[k].push(parseFloat(r[yCol]) || 0)
      if (y2Col) {
        if (!agg2[k]) agg2[k] = []
        agg2[k].push(parseFloat(r[y2Col]) || 0)
      }
    })
    labels = Object.keys(agg).slice(0, 28)
    const data = labels.map(k => +applyAgg(agg[k], aggFn).toFixed(2))
    datasets = [{
      label: yCol, data,
      backgroundColor: (isLine || isArea) ? pal[0] + '20' : labels.map((_, i) => pal[i % pal.length] + 'cc'),
      borderColor: pal[0],
      borderWidth: (isLine || isArea) ? 2.5 : 0,
      tension: 0.4,
      fill: isArea ? 'origin' : false,
      pointRadius: (isLine || isArea) ? 3 : 0,
      pointHoverRadius: 5,
    }]
    if (y2Col) {
      datasets.push({
        label: y2Col,
        data: labels.map(k => +applyAgg(agg2[k] || [], aggFn).toFixed(2)),
        backgroundColor: pal[1] + 'cc',
        borderColor: pal[1],
        borderWidth: (isLine || isArea) ? 2 : 0,
        tension: 0.4,
        fill: isArea ? 'origin' : false,
        pointRadius: (isLine || isArea) ? 3 : 0,
        type: (isBar || isStacked) ? 'line' : 'bar',
        yAxisID: 'y2',
      })
    }
  } else {
    labels = rows.map(r => r[xCol])
    const data = rows.map(r => parseFloat(r[yCol]) || 0)
    datasets = [{
      label: yCol, data,
      backgroundColor: (isLine || isArea) ? pal[0] + '20' : pal[0] + 'cc',
      borderColor: pal[0],
      borderWidth: (isLine || isArea) ? 2.5 : 0,
      tension: 0.4,
      fill: isArea ? 'origin' : false,
      pointRadius: (isLine || isArea) ? 3 : 0,
      pointHoverRadius: 5,
    }]
  }

  return { labels, datasets }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChartView ({ ds, graphName, onGraphNameChange, onExportPNG }) {
  const { state, dispatch } = useApp()
  const canvasRef  = useRef(null)
  const chartRef   = useRef(null)
  const paneRef    = useRef(null)
  const resizerRef = useRef(null)

  const pal = PALETTES[state.palette]
  const ct  = state.chartType

  // Build + render chart
  useEffect(() => {
    if (!canvasRef.current) return
    const xCol = state.axisX, yCol = state.axisY
    if (!xCol || !yCol) return

    const data = buildChartData({
      ds, xCol, yCol,
      y2Col: state.axisY2, szCol: state.axisSz,
      ct, pal, filters: ds.filters,
      sortCol: state.sortCol, sortDir: state.sortDir,
      aggFn: state.aggFn,
    })
    if (!data) return

    const isStacked = ct === 'bar-stacked'
    const isArea    = ct === 'area'
    const isRadial  = ct === 'doughnut' || ct === 'polar'
    const isRadar   = ct === 'radar'
    const showGrid  = state.showGrid
    const gridC     = showGrid ? 'rgba(255,255,255,.05)' : 'transparent'
    const tickC     = '#4a4a5c'
    const legendC   = '#9090a8'

    const cjsType =
      (ct === 'bar' || isStacked) ? 'bar' :
      ct === 'scatter'            ? 'scatter' :
      ct === 'bubble'             ? 'bubble' :
      ct === 'doughnut'           ? 'doughnut' :
      ct === 'radar'              ? 'radar' :
      ct === 'polar'              ? 'polarArea' : 'line'

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: cjsType,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 220 },
        plugins: {
          legend: {
            // display: data.datasets.length > 1 || isStacked || isRadial || isRadar,
            display: true,
            position: 'bottom',
            labels: {
              color: legendC,
              font: { family: "'Inter',system-ui,sans-serif", size: 11 },
              boxWidth: 10, padding: 14,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(18,18,22,.97)',
            borderColor: 'rgba(255,255,255,.08)', borderWidth: 1,
            titleColor: '#eeeef2', bodyColor: '#86869a',
            titleFont: { family: "'Inter',sans-serif", size: 12, weight: '600' },
            bodyFont:  { family: "'JetBrains Mono',monospace", size: 11 },
            padding: 10, cornerRadius: 8,
          },
        },
        scales: isRadial ? {} : isRadar ? {
          r: {
            ticks: { color: tickC, backdropColor: 'transparent', font: { family: "'JetBrains Mono'", size: 10 } },
            grid: { color: gridC },
            pointLabels: { color: '#86869a', font: { size: 11 } },
          },
        } : {
          x: {
            stacked: isStacked,
            ticks: { color: tickC, maxTicksLimit: 14, font: { family: "'JetBrains Mono'", size: 10 } },
            grid:  { color: gridC },
          },
          y: {
            stacked: isStacked,
            ticks: { color: tickC, font: { family: "'JetBrains Mono'", size: 10 } },
            grid:  { color: gridC },
            min: isArea ? 0 : undefined,
          },
          ...(state.axisY2 ? {
            y2: {
              position: 'right',
              ticks: { color: pal[1], font: { family: "'JetBrains Mono'", size: 10 } },
              grid: { display: false },
            },
          } : {}),
        },
      },
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [
    ds.rows, ds.filters, state.axisX, state.axisY, state.axisY2, state.axisSz,
    state.chartType, state.palette, state.showGrid, state.showLabels, state.smoothCurves, state.aggFn,
  ])

  // Expose canvas for PNG export
  const exportPNG = useCallback(() => {
    if (!canvasRef.current) return
    onExportPNG(canvasRef.current.toDataURL('image/png'))
  }, [onExportPNG])

  // Resize handle
  useEffect(() => {
    const resizer = resizerRef.current
    const pane    = paneRef.current
    if (!resizer || !pane) return
    let sy = 0, sh = 0, dragging = false

    const onDown = e => {
      dragging = true; sy = e.clientY; sh = pane.offsetHeight
      resizer.classList.add(s.dragging)
      document.body.style.userSelect = 'none'
    }
    const onMove = e => {
      if (!dragging) return
      const h = Math.max(160, Math.min(sh + (e.clientY - sy), window.innerHeight - 200))
      pane.style.flex = `0 0 ${h}px`
    }
    const onUp = () => {
      dragging = false
      resizer.classList.remove(s.dragging)
      document.body.style.userSelect = ''
    }

    resizer.addEventListener('mousedown', onDown)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      resizer.removeEventListener('mousedown', onDown)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div className={s.split}>
      {/* Chart pane */}
      <div className={s.pane} ref={paneRef}>
        <div className={s.gbar}>
          <input
            className={s.gname}
            value={graphName}
            onChange={e => onGraphNameChange(e.target.value)}
            title="Click to rename graph"
          />
          <div className={s.sp} />
          <button className={s.gbtn} onClick={exportPNG} title="Export as PNG">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12l4 2 4-2M8 14V5"/><path d="M5 8l3 3 3-3"/>
            </svg>
            Export PNG
          </button>
        </div>
        <div className={s.cwrap}>
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Drag handle */}
      <div className={s.resizer} ref={resizerRef} />

      {/* Table pane */}
      <div className={s.tablePart}>
        <DataTable ds={ds} compact />
      </div>
    </div>
  )
}
