'use client'

import { useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { formatQty } from '@/utils/format'
import { Package, PackageOpen, CheckCircle2, AlertCircle, AlertTriangle, Clock, ChevronRight, ChevronDown, BookOpen, Search, ExternalLink, Info, Download, Activity } from 'lucide-react'

function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    async function loadProductsData() {
      setLoading(true)

      // Fetch master products
      const { data: prods } = await supabase
        .from('products')
        .select('*')
        .order('name')

      // Fetch stock balance cache with batch expiry info
      const { data: cacheData } = await supabase
        .from('stock_balance_cache')
        .select('product_id, batch_id, qty, batches(batch_code, expiry_date)')

      // Fetch reserved quantities from order_items for CREATED orders
      const { data: reservedItems } = await supabase
        .from('order_items')
        .select('product_id, qty, orders!inner(status)')
        .eq('orders.status', 'CREATED')

      const reservedMap = new Map<string, number>()
      reservedItems?.forEach(item => {
        reservedMap.set(item.product_id, (reservedMap.get(item.product_id) || 0) + item.qty)
      })

      const now = new Date()

      const list = (prods || []).map(prod => {
        const prodBatchesRaw = cacheData?.filter(c => c.product_id === prod.id) || []
        
        let hasExpired = false
        let hasCritical = false
        let hasWarning = false
        let totalQty = 0

        const formattedBatches = prodBatchesRaw.map(b => {
          totalQty += (b.qty || 0)
          const batchInfo: any = Array.isArray(b.batches) ? b.batches[0] : b.batches
          const expDate = batchInfo?.expiry_date ? new Date(batchInfo.expiry_date) : null
          let daysRemaining: number | null = null
          let isExpired = false
          let isCritical = false
          let isWarning = false

          if (expDate) {
            daysRemaining = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24))
            if (b.qty > 0) {
              if (daysRemaining <= 0) {
                isExpired = true
                hasExpired = true
              } else if (daysRemaining <= 30) {
                isCritical = true
                hasCritical = true
              } else if (daysRemaining <= 60) {
                isWarning = true
                hasWarning = true
              }
            }
          }

          return {
            batch_id: b.batch_id,
            batch_code: batchInfo?.batch_code || 'TIDAK DIKETAHUI',
            expiry_date: batchInfo?.expiry_date || null,
            formattedExpiry: expDate ? expDate.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Tidak Diketahui',
            daysRemaining,
            isExpired,
            isCritical,
            isWarning,
            qty: b.qty || 0
          }
        })

        // Sort FEFO: earliest expiry first
        formattedBatches.sort((a, b) => {
          const timeA = a.expiry_date ? new Date(a.expiry_date).getTime() : 9999999999999
          const timeB = b.expiry_date ? new Date(b.expiry_date).getTime() : 9999999999999
          return timeA - timeB
        })

        const reservedQty = reservedMap.get(prod.id) || 0
        const availableQty = Math.max(0, totalQty - reservedQty)

        return {
          ...prod,
          totalQty,
          reservedQty,
          availableQty,
          hasExpired,
          hasCritical,
          hasWarning,
          batches: formattedBatches
        }
      })

      setProducts(list)
      setLoading(false)
    }

    loadProductsData()
  }, [])

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleExpand = (productId: string) => {
    setExpandedProductId(prev => prev === productId ? null : productId)
  }

  const handleExportCSV = () => {
    setExporting(true)
    try {
      if (!filteredProducts || filteredProducts.length === 0) {
        alert('Tidak ada produk yang cocok untuk dieksport.')
        return
      }

      const headers = [
        'SKU',
        'Nama Produk',
        'Status Verifikasi Opname',
        'Total Stok',
        'Reservasi',
        'Stok Aman Dijual',
        'Jumlah Batch',
        'Status Kedaluwarsa'
      ]

      const rows = filteredProducts.map(p => {
        const statusOpname = p.opening_balance_verified ? 'Terverifikasi' : 'Belum Terverifikasi'
        const totalStok = p.totalQty // raw integer
        const reservasi = p.reservedQty // raw integer
        const stokAman = p.availableQty // raw integer
        const jumlahBatch = p.batches?.length || 0
        const statusExpiry = p.hasExpired
          ? 'EXPIRED'
          : p.hasCritical
          ? 'CRITICAL (<=30 Hari)'
          : p.hasWarning
          ? 'WARNING (<=60 Hari)'
          : 'AMAN'

        return [p.sku, p.name, statusOpname, totalStok, reservasi, stokAman, jumlahBatch, statusExpiry]
          .map(val => `"${String(val).replace(/"/g, '""')}"`)
          .join(',')
      })

      const csvString = [headers.join(','), ...rows].join('\r\n')
      const dateToday = new Date().toISOString().split('T')[0]
      const filename = `master-produk-export-${dateToday}.csv`

      downloadCSV(filename, csvString)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Package className="text-jade-600" /> Master Produk
          </h1>
          <p className="text-slate-500 mt-1">Daftar semua produk SKU aktif, status opname, rincian batch (FEFO), dan indikator kedaluwarsa.</p>
        </div>
      </header>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl shadow-soft border border-slate-200 overflow-hidden">
        
        {/* Table Header Filter & Search */}
        <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-bold text-slate-800">Total {filteredProducts.length} Produk</span>
            <span className="text-slate-400">({products.length} terdaftar)</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Cari nama atau SKU produk..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-jade-500 transition-all shadow-2xs"
              />
            </div>
            <button 
              onClick={handleExportCSV}
              disabled={exporting || filteredProducts.length === 0}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition-colors shadow-2xs shrink-0"
            >
              {exporting ? <Activity size={16} className="animate-spin" /> : <Download size={16} />}
              Export CSV
            </button>
          </div>
        </div>

        {/* Microcopy info bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-500 flex items-center gap-2">
          <Info size={14} className="text-slate-400 shrink-0" />
          <span><strong>Stok Aman Dijual</strong> = Total Stok Fisik dikurangi Reservasi dari pesanan terdaftar yang belum dikirim (sebelum SHIPPED/IN_TRANSIT).</span>
        </div>

        {/* Product Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-10 px-3 py-3.5 text-center"></th>
                <th className="px-4 py-3.5 font-semibold text-slate-700">Produk & SKU</th>
                <th className="px-4 py-3.5 font-semibold text-slate-700">Status Verifikasi & Alert</th>
                <th className="px-4 py-3.5 font-semibold text-slate-700 text-right whitespace-nowrap">Total Stok (Unit)</th>
                <th className="px-4 py-3.5 font-semibold text-slate-700 text-right whitespace-nowrap">Reservasi</th>
                <th className="px-4 py-3.5 font-semibold text-slate-700 text-right whitespace-nowrap">Stok Aman Dijual</th>
                <th className="px-4 py-3.5 font-semibold text-slate-700 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Memuat daftar produk & batch...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Tidak ada produk yang cocok.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const isExpanded = expandedProductId === p.id
                  return (
                    <Fragment key={p.id}>
                      <tr 
                        onClick={() => toggleExpand(p.id)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-jade-50/20' : ''
                        }`}
                      >
                        {/* Expand Chevron Icon */}
                        <td className="px-3 py-4 text-center">
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpand(p.id)
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                            aria-label={isExpanded ? "Tutup detail batch" : "Buka detail batch"}
                          >
                            {isExpanded ? <ChevronDown size={18} className="text-jade-600" /> : <ChevronRight size={18} />}
                          </button>
                        </td>

                        {/* Product Name & SKU */}
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900 flex items-center gap-2">
                            <span>{p.name}</span>
                            <span className="text-[11px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {p.batches.length} Batch
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">{p.sku}</div>
                        </td>

                        {/* Status Verifikasi & Expiry Alert Badge */}
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {p.is_verified ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-jade-50 text-jade-700 text-xs font-semibold border border-jade-200">
                                <CheckCircle2 size={13} /> Terverifikasi (Opname)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                                <AlertCircle size={13} /> Belum Terverifikasi
                              </span>
                            )}

                            {/* Fitur 2: Indikator Expiry 3-Tier on Parent Row */}
                            {p.hasExpired && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brick-50 text-brick-700 text-xs font-bold border border-brick-200 animate-pulse">
                                <AlertTriangle size={13} /> Ada Batch Kedaluwarsa!
                              </span>
                            )}
                            {!p.hasExpired && p.hasCritical && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-brick-50 text-brick-700 text-xs font-bold border border-brick-200">
                                <Clock size={13} /> Kritis (≤30 Hr)
                              </span>
                            )}
                            {!p.hasExpired && !p.hasCritical && p.hasWarning && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200">
                                <Clock size={13} /> Perhatian (31-60 Hr)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Total Stok Fisik */}
                        <td className="px-4 py-4 text-right font-mono font-bold text-slate-800 text-base whitespace-nowrap">
                          {formatQty(p.totalQty)}
                        </td>

                        {/* Reservasi */}
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          {p.reservedQty > 0 ? (
                            <span 
                              className="inline-flex items-center gap-1 font-mono font-bold text-sky-800 bg-sky-50 px-2.5 py-1 rounded-md border border-sky-200/90 text-sm"
                              title={`${formatQty(p.reservedQty)} unit direservasi untuk order yang belum dikirim`}
                            >
                              {formatQty(p.reservedQty)}
                            </span>
                          ) : (
                            <span className="font-mono text-slate-400 font-medium text-base">0</span>
                          )}
                        </td>

                        {/* Stok Aman Dijual */}
                        <td className="px-4 py-4 text-right font-mono font-bold text-base whitespace-nowrap">
                          {p.reservedQty > 0 ? (
                            <div className="inline-flex items-center justify-end gap-1.5" title={`${formatQty(p.reservedQty)} unit sedang direservasi order yang belum dikirim`}>
                              <span className="text-sky-800 font-bold">{formatQty(p.availableQty)}</span>
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200/80">
                                <Info size={11} /> -{formatQty(p.reservedQty)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-900">{formatQty(p.availableQty)}</span>
                          )}
                        </td>

                        {/* Fitur 3: Aksi -> Lihat di Ledger */}
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <Link
                            href={`/ledger?product_id=${p.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-jade-700 hover:border-jade-300 hover:bg-jade-50 text-xs font-semibold transition-colors shadow-xs"
                            title={`Lihat mutasi stok ${p.name} di Buku Besar`}
                          >
                            <BookOpen size={14} className="text-jade-600" />
                            <span>Lihat di Ledger</span>
                            <ExternalLink size={12} className="text-slate-400" />
                          </Link>
                        </td>
                      </tr>

                      {/* Fitur 1: Expandable Sub-table Breakdown per Batch */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={7} className="px-4 sm:px-6 py-4">
                            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-soft space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                <div className="flex items-center gap-2">
                                  <PackageOpen size={16} className="text-jade-600" />
                                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                    Breakdown Batch (FEFO — Expired Terdekat di Atas)
                                  </h4>
                                </div>
                                <div className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                                  Total breakdown batch: <span className="text-jade-700">{formatQty(p.batches.reduce((sum: number, b: any) => sum + b.qty, 0))}</span> / {formatQty(p.totalQty)} Unit
                                </div>
                              </div>

                              {p.batches.length === 0 ? (
                                <p className="text-xs text-slate-400 italic py-2 text-center">Belum ada batch tercatat untuk produk ini.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100/70 text-slate-600 border-b border-slate-200">
                                      <tr>
                                        <th className="px-3 py-2 font-semibold">Kode Batch</th>
                                        <th className="px-3 py-2 font-semibold">Tanggal Kadaluarsa</th>
                                        <th className="px-3 py-2 font-semibold">Sisa Masa</th>
                                        <th className="px-3 py-2 font-semibold">Status Expiry</th>
                                        <th className="px-3 py-2 font-semibold text-right">Sisa Qty (Unit)</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {p.batches.map((b: any) => (
                                        <tr key={b.batch_id} className={`hover:bg-slate-50 ${b.isExpired ? 'bg-brick-50/40' : b.isNearExpiry ? 'bg-amber-50/40' : ''}`}>
                                          <td className="px-3 py-2.5 font-mono font-bold text-slate-800">{b.batch_code}</td>
                                          <td className="px-3 py-2.5 text-slate-600">{b.formattedExpiry}</td>
                                          <td className="px-3 py-2.5 font-mono text-slate-500">
                                            {b.daysRemaining !== null ? (
                                              b.daysRemaining <= 0 ? (
                                                <span className="text-brick-600 font-bold">Telah Lewat {Math.abs(b.daysRemaining)} hari</span>
                                              ) : (
                                                <span>{b.daysRemaining} hari lagi</span>
                                              )
                                            ) : (
                                              <span className="text-slate-400">-</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2.5">
                                            {b.isExpired ? (
                                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-brick-100 text-brick-800 border border-brick-200">
                                                Kedaluwarsa
                                              </span>
                                            ) : b.isCritical ? (
                                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-brick-100 text-brick-800 border border-brick-200">
                                                Kritis (≤30 Hr)
                                              </span>
                                            ) : b.isWarning ? (
                                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                                Perhatian (31-60 Hr)
                                              </span>
                                            ) : (
                                              <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                                Aman
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">{formatQty(b.qty)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
