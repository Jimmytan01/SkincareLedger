'use client'

import { useState } from 'react'
import { TrendingUp, BarChart2 } from 'lucide-react'
import { formatQty } from '@/utils/format'

export interface StockTrendDay {
  date: string        // YYYY-MM-DD
  displayDate: string // e.g. "30 Jul"
  stockIn: number     // Total incoming qty
  stockOut: number    // Total outgoing qty (SALE)
}

export interface StockTrendChartProps {
  data: StockTrendDay[]
}

export default function StockTrendChart({ data }: StockTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const totalIn = data.reduce((sum, d) => sum + d.stockIn, 0)
  const totalOut = data.reduce((sum, d) => sum + d.stockOut, 0)

  const isEmpty = totalIn === 0 && totalOut === 0

  if (isEmpty) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl shrink-0">
              <TrendingUp size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Tren Pergerakan Stok (30 Hari Terakhir)</h2>
              <p className="text-xs text-slate-500 mt-0.5">Perbandingan total kuantitas Stok Masuk vs Stok Keluar (Penjualan)</p>
            </div>
          </div>
        </div>

        <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
          <BarChart2 size={36} className="text-slate-300 stroke-[1.5]" />
          <p className="text-sm font-semibold text-slate-600">Belum ada mutasi stok dalam 30 hari terakhir</p>
          <p className="text-xs text-slate-400">Grafik pergerakan harian akan otomatis terisi saat transaksi masuk atau penjualan terjadi.</p>
        </div>
      </div>
    )
  }

  // Dimensions & Scales for SVG
  const width = 800
  const height = 240
  const paddingTop = 25
  const paddingBottom = 35
  const paddingLeft = 45
  const paddingRight = 20

  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom

  const maxVal = Math.max(...data.map(d => Math.max(d.stockIn, d.stockOut)), 10)
  // Round up maxVal to a clean multiple
  const yTicksCount = 4
  const step = Math.ceil(maxVal / yTicksCount)
  const yMax = step * yTicksCount

  const pointsIn = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1)) * chartWidth
    const y = paddingTop + chartHeight - (d.stockIn / yMax) * chartHeight
    return { x, y, val: d.stockIn }
  })

  const pointsOut = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1)) * chartWidth
    const y = paddingTop + chartHeight - (d.stockOut / yMax) * chartHeight
    return { x, y, val: d.stockOut }
  })

  // Build SVG Path strings
  const pathIn = pointsIn.reduce((acc, p, i) => i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`, '')
  const pathOut = pointsOut.reduce((acc, p, i) => i === 0 ? `M ${p.x},${p.y}` : `${acc} L ${p.x},${p.y}`, '')

  // Area paths for subtle gradient fills
  const areaIn = `${pathIn} L ${pointsIn[pointsIn.length - 1].x},${paddingTop + chartHeight} L ${pointsIn[0].x},${paddingTop + chartHeight} Z`
  const areaOut = `${pathOut} L ${pointsOut[pointsOut.length - 1].x},${paddingTop + chartHeight} L ${pointsOut[0].x},${paddingTop + chartHeight} Z`

  // Hovered item details
  const activeDay = hoveredIndex !== null ? data[hoveredIndex] : null
  const activePointIn = hoveredIndex !== null ? pointsIn[hoveredIndex] : null
  const activePointOut = hoveredIndex !== null ? pointsOut[hoveredIndex] : null

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-soft space-y-4">
      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-50 text-sky-600 rounded-xl shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Tren Pergerakan Stok (30 Hari Terakhir)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Perbandingan harian kuantitas Stok Masuk vs Stok Keluar (Penjualan)</p>
          </div>
        </div>

        {/* Color Legend */}
        <div className="flex items-center gap-4 text-xs font-semibold shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-jade-500 shadow-sm" />
            <span className="text-slate-700">Stok Masuk</span>
            <span className="font-mono text-[11px] text-jade-700 bg-jade-50 px-1.5 py-0.5 rounded border border-jade-200">
              +{formatQty(totalIn)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sky-500 shadow-sm" />
            <span className="text-slate-700">Stok Keluar (Penjualan)</span>
            <span className="font-mono text-[11px] text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
              -{formatQty(totalOut)}
            </span>
          </div>
        </div>
      </div>

      {/* Chart SVG Container */}
      <div className="relative w-full overflow-hidden touch-pan-x" onMouseLeave={() => setHoveredIndex(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          <defs>
            <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid Lines & Y-Axis Labels */}
          {Array.from({ length: yTicksCount + 1 }).map((_, idx) => {
            const val = Math.round(step * (yTicksCount - idx))
            const y = paddingTop + (idx / yTicksCount) * chartHeight
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={idx === yTicksCount ? 'none' : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] font-mono fill-slate-400 font-medium"
                >
                  {val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : val}
                </text>
              </g>
            )
          })}

          {/* Gradient Area Fills */}
          <path d={areaIn} fill="url(#gradIn)" />
          <path d={areaOut} fill="url(#gradOut)" />

          {/* SVG Lines */}
          <path d={pathIn} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathOut} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover Column Trigger Bars */}
          {data.map((_, idx) => {
            const x = paddingLeft + (idx / (data.length - 1)) * chartWidth
            const barWidth = chartWidth / data.length
            return (
              <rect
                key={idx}
                x={x - barWidth / 2}
                y={paddingTop}
                width={barWidth}
                height={chartHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(idx)}
                className="cursor-pointer"
              />
            )
          })}

          {/* Active Hover Guide Line & Dots */}
          {hoveredIndex !== null && activePointIn && activePointOut && (
            <g className="transition-all duration-150 pointer-events-none">
              {/* Vertical Guide Line */}
              <line
                x1={activePointIn.x}
                y1={paddingTop}
                x2={activePointIn.x}
                y2={paddingTop + chartHeight}
                stroke="#64748b"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />

              {/* Point Circle In */}
              <circle cx={activePointIn.x} cy={activePointIn.y} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" className="shadow-md" />
              {/* Point Circle Out */}
              <circle cx={activePointOut.x} cy={activePointOut.y} r="5" fill="#0284c7" stroke="#ffffff" strokeWidth="2" className="shadow-md" />
            </g>
          )}

          {/* X-Axis Date Labels (Responsive: show 6 date ticks across 30 days so mobile doesn't overlap) */}
          {data.map((d, idx) => {
            // Show label every 5 days or first & last
            if (idx % 5 !== 0 && idx !== data.length - 1) return null
            const x = paddingLeft + (idx / (data.length - 1)) * chartWidth
            return (
              <text
                key={idx}
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="text-[10px] font-medium fill-slate-500 font-mono"
              >
                {d.displayDate}
              </text>
            )
          })}
        </svg>

        {/* Hover Floating Tooltip Card */}
        {hoveredIndex !== null && activeDay && activePointIn && (
          <div
            className="absolute top-2 z-20 pointer-events-none transition-all duration-150 bg-slate-900/90 backdrop-blur-md text-white text-xs p-3 rounded-xl shadow-xl border border-slate-700/80 space-y-1.5 min-w-[150px]"
            style={{
              left: `${Math.min(Math.max(activePointIn.x - 75, 10), width - 170)}px`
            }}
          >
            <div className="text-[11px] font-mono text-slate-300 font-semibold border-b border-slate-700 pb-1 flex justify-between items-center">
              <span>{activeDay.displayDate}</span>
              <span className="text-[10px] text-slate-400">WIB</span>
            </div>
            <div className="flex justify-between items-center text-emerald-400 font-medium">
              <span>Stok Masuk:</span>
              <span className="font-mono font-bold">+{formatQty(activeDay.stockIn)}</span>
            </div>
            <div className="flex justify-between items-center text-sky-400 font-medium">
              <span>Stok Keluar:</span>
              <span className="font-mono font-bold">-{formatQty(activeDay.stockOut)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
