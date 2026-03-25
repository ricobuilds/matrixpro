import React, { useEffect, useRef, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import { useApp } from '../store/AppContext'
import { PALETTES } from '../lib/constants'
import { isNumericCol, isDateCol, parseDate } from '../lib/data'
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

// ─── Y2 dataset helper ────────────────────────────────────────────────────────
// Bar primary  → Y2 renders as a line overlay
// Line/Area    → Y2 renders as a bar underlay
function makeY2Dataset (label, data, primaryIsBar, pal, tension) {
  if (primaryIsBar) {
    return {
      label,
      type: 'line',
      yAxisID: 'y2',
      order: 0,            // draw on top of bars
      data,
      borderColor: pal[1],
      backgroundColor: pal[1] + '20',
      borderWidth: 2,
      tension,
      pointRadius: 3,
      pointHoverRadius: 5,
      fill: false,
    }
  }
  return {
    label,
    type: 'bar',
    yAxisID: 'y2',
    order: 1,
    data,
    backgroundColor: pal[1] + 'cc',
    borderColor: pal[1],
    borderWidth: 0,
  }
}

// ─── Build chart datasets ─────────────────────────────────────────────────────
function buildChartData ({ ds, xCol, yCol, y2Col, szCol, ct, pal, filters, aggFn = 'sum', smoothCurves = true }) {
  if (!xCol || !yCol) return null

  const allRows = Object.values(filters).reduce((acc, fn) => acc.filter(fn), ds.rows)
  const rows    = allRows.slice(0, 500)
  const isXnum  = rows.slice(0, 20).every(r => !isNaN(parseFloat(r[xCol])))
  const isXdate = !isXnum && isDateCol(ds, xCol)
  const isLine  = ct === 'line', isArea = ct === 'area'
  const isBar   = ct === 'bar',  isStacked = ct === 'bar-stacked'
  const isBarType = isBar || isStacked
  const isScatter  = ct === 'scatter', isBubble = ct === 'bubble'
  const isDoughnut = ct === 'doughnut', isRadar  = ct === 'radar', isPolar = ct === 'polar'
  const tension = smoothCurves ? 0.4 : 0

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
      borderColor:     keys.map((_, i) => pal[i % pal.length]),
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
    // Use explicit Y2 as group dimension if it's categorical, otherwise auto-detect
    const grpCol = (y2Col && !isNumericCol(ds, y2Col))
      ? y2Col
      : ds.cols.find(c => c !== xCol && c !== yCol && !isNumericCol(ds, c))
    if (grpCol) {
      const groups = [...new Set(rows.map(r => String(r[grpCol])))].slice(0, 8)
      const labSet = [...new Set(rows.map(r => String(r[xCol])))].slice(0, 24)
      labels = labSet
      datasets = groups.map((g, gi) => {
        const agg = {}
        labSet.forEach(l => (agg[l] = []))
        rows.filter(r => String(r[grpCol]) === g).forEach(r => {
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
      // fallback: plain stacked bar with numeric Y2 as line overlay
      const agg = {}, agg2 = {}
      rows.forEach(r => {
        const k = String(r[xCol])
        if (!agg[k])  agg[k]  = []
        agg[k].push(parseFloat(r[yCol]) || 0)
        if (y2Col) {
          if (!agg2[k]) agg2[k] = []
          agg2[k].push(parseFloat(r[y2Col]) || 0)
        }
      })
      labels = Object.keys(agg).slice(0, 24)
      const y2IsNumeric = y2Col && isNumericCol(ds, y2Col)
      datasets = [{
        label: yCol,
        data: labels.map(k => +applyAgg(agg[k], aggFn).toFixed(2)),
        backgroundColor: labels.map((_, i) => pal[i % pal.length] + 'cc'),
        borderWidth: 0,
        yAxisID: y2IsNumeric ? 'y' : undefined,
      }]
      if (y2IsNumeric) {
        datasets.push(makeY2Dataset(y2Col, labels.map(k => +applyAgg(agg2[k] || [], aggFn).toFixed(2)), true, pal, tension))
      }
    }
  } else if (!isXnum) {
    // bar, line, area — categorical X
    const y2IsCat = y2Col && !isNumericCol(ds, y2Col)

    if (isBar && y2IsCat) {
      // Categorical Y2 on bar → grouped multi-series bars (one series per Y2 value)
      const groups = [...new Set(rows.map(r => String(r[y2Col])))].slice(0, 8)
      const rawLabSet = [...new Set(rows.map(r => String(r[xCol])))].slice(0, 24)
      const labSet = isXdate ? rawLabSet.sort((a, b) => parseDate(a) - parseDate(b)) : rawLabSet
      labels = labSet
      datasets = groups.map((g, gi) => {
        const agg = {}
        labSet.forEach(l => (agg[l] = []))
        rows.filter(r => String(r[y2Col]) === g).forEach(r => {
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
      // bar (numeric Y2 overlay), line, area
      const agg = {}, agg2 = {}
      rows.forEach(r => {
        const k = String(r[xCol])
        if (!agg[k])  agg[k]  = []
        agg[k].push(parseFloat(r[yCol]) || 0)
        if (y2Col && !y2IsCat) {
          if (!agg2[k]) agg2[k] = []
          agg2[k].push(parseFloat(r[y2Col]) || 0)
        }
      })
      const rawLabels = Object.keys(agg).slice(0, 28)
      labels = isXdate ? rawLabels.sort((a, b) => parseDate(a) - parseDate(b)) : rawLabels
      const data = labels.map(k => +applyAgg(agg[k] || [], aggFn).toFixed(2))
      const hasNumY2 = y2Col && !y2IsCat

      datasets = [{
        label: yCol, data,
        yAxisID: hasNumY2 ? 'y' : undefined,
        backgroundColor: isBarType
          ? labels.map((_, i) => pal[i % pal.length] + 'cc')
          : pal[0] + '20',
        borderColor: pal[0],
        borderWidth: isBarType ? 0 : 2.5,
        tension,
        fill: isArea ? 'origin' : false,
        pointRadius: isBarType ? 0 : 3,
        pointHoverRadius: 5,
      }]

      if (hasNumY2) {
        datasets.push(makeY2Dataset(y2Col, labels.map(k => +applyAgg(agg2[k] || [], aggFn).toFixed(2)), isBarType, pal, tension))
      }
    }
  } else {
    // numeric X axis
    labels = rows.map(r => r[xCol])
    const data  = rows.map(r => parseFloat(r[yCol])  || 0)
    const data2 = y2Col ? rows.map(r => parseFloat(r[y2Col]) || 0) : null

    datasets = [{
      label: yCol, data,
      yAxisID: y2Col ? 'y' : undefined,
      backgroundColor: isBarType ? pal[0] + 'cc' : pal[0] + '20',
      borderColor: pal[0],
      borderWidth: isBarType ? 0 : 2.5,
      tension,
      fill: isArea ? 'origin' : false,
      pointRadius: isBarType ? 0 : 3,
      pointHoverRadius: 5,
    }]

    if (y2Col && data2) {
      datasets.push(makeY2Dataset(y2Col, data2, isBarType, pal, tension))
    }
  }

  return { labels, datasets }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChartView ({ ds, graphName, onGraphNameChange, onExportPNG }) {
  const { state } = useApp()
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
      aggFn: state.aggFn,
      smoothCurves: state.smoothCurves,
    })
    if (!data) return

    const isStacked = ct === 'bar-stacked'
    const isArea    = ct === 'area'
    const isBarType = ct === 'bar' || isStacked
    const isRadial  = ct === 'doughnut' || ct === 'polar'
    const isRadar   = ct === 'radar'
    const isHBar       = isBarType && state.barOrientation === 'horizontal'
    const hasY2       = !!state.axisY2
    // Categorical Y2 on bar = grouped series, no second axis scale needed
    const y2IsNumeric = hasY2 && isNumericCol(ds, state.axisY2)
    const showGrid  = state.showGrid
    const gridC     = showGrid ? 'rgba(255,255,255,.05)' : 'transparent'
    const tickC     = '#4a4a5c'
    const legendC   = '#9090a8'

    const cjsType =
      isBarType           ? 'bar'       :
      ct === 'scatter'    ? 'scatter'   :
      ct === 'bubble'     ? 'bubble'    :
      ct === 'doughnut'   ? 'doughnut'  :
      ct === 'radar'      ? 'radar'     :
      ct === 'polar'      ? 'polarArea' : 'line'

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: cjsType,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHBar ? 'y' : 'x',
        animation: { duration: 220 },
        plugins: {
          legend: {
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
          ...(y2IsNumeric ? {
            y2: {
              position: 'right',
              display: true,
              beginAtZero: isArea,
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
    state.chartType, state.barOrientation, state.palette, state.showGrid,
    state.smoothCurves, state.aggFn,
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
