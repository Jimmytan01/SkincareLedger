'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { resolveAnomaly, resolveAnomaliesBulk } from '@/actions/anomalies'
import ChannelBadge from '@/components/ChannelBadge'
import { formatQty } from '@/utils/format'
import { getAnomalyMeta } from '@/utils/anomalyMeta'
import { 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  ExternalLink, 
  Clock, 
  X, 
  Package, 
  ShoppingCart, 
  Layers,
  Inbox,
  Tag,
  CheckSquare,
  ListChecks,
  Search
} from 'lucide-react'

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN')
  const [counts, setCounts] = useState({ open: 0, resolved: 0 })

  // Filters for Selesai tab
  const [filterType, setFilterType] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  const [productsMap, setProductsMap] = useState<Map<string, any>>(new Map())
  const [ordersMap, setOrdersMap] = useState<Map<string, any>>(new Map())
  const [batchesMap, setBatchesMap] = useState<Map<string, string>>(new Map())

  // Single-item resolve state
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolvingLoading, setResolvingLoading] = useState(false)
  const [error, setError] = useState('')

  // Bulk resolve state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [bulkResolutionNote, setBulkResolutionNote] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const supabase = createClient()

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [filter])

  const fetchAnomalies = useCallback(async () => {
    setLoading(true)
    
    // Fetch counts
    const { count: openCount } = await supabase.from('anomalies').select('id', { count: 'exact', head: true }).eq('status', 'OPEN')
    const { count: resCount } = await supabase.from('anomalies').select('id', { count: 'exact', head: true }).eq('status', 'RESOLVED')
    setCounts({ open: openCount || 0, resolved: resCount || 0 })

    let query = supabase
      .from('anomalies')
      .select('*')
      .eq('status', filter)

    // Sort: OPEN = Paling lama terbuka (urgent) di atas; RESOLVED = Paling baru diselesaikan di atas
    if (filter === 'OPEN') {
      query = query.order('detected_at', { ascending: true })
    } else {
      query = query.order('resolved_at', { ascending: false, nullsFirst: false })
    }

    const { data } = await query

    if (data && data.length > 0) {
      const productIds = Array.from(new Set(data.map(a => a.related_ids?.product_id).filter(Boolean))) as string[]
      const orderIds = Array.from(new Set(data.map(a => a.related_ids?.order_id).filter(Boolean))) as string[]
      const batchIds = Array.from(new Set(data.map(a => a.related_ids?.batch_id).filter(Boolean))) as string[]

      const prodMap = new Map()
      if (productIds.length > 0) {
        const { data: prods } = await supabase.from('products').select('id, name, sku').in('id', productIds)
        prods?.forEach(p => prodMap.set(p.id, p))
      }

      const ordMap = new Map()
      if (orderIds.length > 0) {
        const { data: ords } = await supabase.from('orders').select('id, marketplace_order_id').in('id', orderIds)
        ords?.forEach(o => ordMap.set(o.id, o))
      }

      const btMap = new Map()
      if (batchIds.length > 0) {
        const { data: bts } = await supabase.from('batches').select('id, batch_code').in('id', batchIds)
        bts?.forEach(b => btMap.set(b.id, b.batch_code))
      }

      setProductsMap(prodMap)
      setOrdersMap(ordMap)
      setBatchesMap(btMap)
      setAnomalies(data)
    } else {
      setAnomalies([])
    }
    
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchAnomalies()
  }, [fetchAnomalies])

  const handleResolveSubmit = async () => {
    if (!resolvingId) return
    if (!resolutionNote.trim()) {
      setError('Catatan penyelesaian wajib diisi')
      return
    }
    setError('')
    setResolvingLoading(true)
    const res = await resolveAnomaly(resolvingId, resolutionNote)
    setResolvingLoading(false)

    if (res.success) {
      setResolvingId(null)
      setResolutionNote('')
      fetchAnomalies()
    } else {
      setError(res.error || 'Terjadi kesalahan saat menyelesaikan anomali')
    }
  }

  // Bulk Handlers
  const isAllSelected = anomalies.length > 0 && selectedIds.size === anomalies.length

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(anomalies.map(a => a.id)))
    }
  }

  const handleToggleSelectOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const handleBulkResolveSubmit = async () => {
    if (selectedIds.size === 0) return
    if (!bulkResolutionNote.trim()) {
      setBulkError('Catatan penyelesaian wajib diisi untuk seluruh anomali terpilih')
      return
    }
    setBulkError('')
    setBulkLoading(true)

    const idsArray = Array.from(selectedIds)
    const res = await resolveAnomaliesBulk(idsArray, bulkResolutionNote)
    setBulkLoading(false)

    if (res.success) {
      setIsBulkModalOpen(false)
      setBulkResolutionNote('')
      setSelectedIds(new Set())
      fetchAnomalies()
    } else {
      setBulkError(res.error || 'Gagal menyelesaikan anomali terpilih')
    }
  }



  // Memoized Filtered Anomalies for Selesai tab
  const filteredAnomalies = useMemo(() => {
    if (filter === 'OPEN') return anomalies

    return anomalies.filter(a => {
      // 1. Tipe Anomali Filter
      if (filterType && a.type !== filterType) {
        return false
      }

      // 2. Rentang Tanggal Filter (Waktu Deteksi: detected_at in WIB)
      if (filterDateFrom || filterDateTo) {
        const detectedWIB = new Date(a.detected_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
        if (filterDateFrom && detectedWIB < filterDateFrom) return false
        if (filterDateTo && detectedWIB > filterDateTo) return false
      }

      // 3. Cari (Order ID / Produk / SKU / Catatan Penyelesaian / Deskripsi)
      if (filterSearch && filterSearch.trim() !== '') {
        const term = filterSearch.trim().toLowerCase()
        const product = a.related_ids?.product_id ? productsMap.get(a.related_ids.product_id) : null
        const order = a.related_ids?.order_id ? ordersMap.get(a.related_ids.order_id) : null

        const orderId = (order?.marketplace_order_id || '').toLowerCase()
        const prodName = (product?.name || '').toLowerCase()
        const prodSku = (product?.sku || '').toLowerCase()
        const resNote = (a.resolution_note || '').toLowerCase()
        const description = (a.description || '').toLowerCase()

        const matches = orderId.includes(term) ||
                        prodName.includes(term) ||
                        prodSku.includes(term) ||
                        resNote.includes(term) ||
                        description.includes(term)

        if (!matches) return false
      }

      return true
    })
  }, [anomalies, filter, filterType, filterDateFrom, filterDateTo, filterSearch, productsMap, ordersMap])

  const hasActiveFilters = Boolean(filter === 'RESOLVED' && (filterType || filterDateFrom || filterDateTo || filterSearch))

  const resetAllFilters = () => {
    setFilterType('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterSearch('')
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <AlertTriangle className="text-brick-500" /> Worklist Anomali
        </h1>
        <p className="text-slate-500 mt-2">
          Daftar ketidaksesuaian stok dan pesanan yang memerlukan tindak lanjut dari operator gudang.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button 
          onClick={() => setFilter('OPEN')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            filter === 'OPEN'
              ? 'border-brick-600 text-brick-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertTriangle size={16} /> Anomali Terbuka
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
            filter === 'OPEN' ? 'bg-brick-100 text-brick-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {counts.open}
          </span>
        </button>

        <button 
          onClick={() => setFilter('RESOLVED')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            filter === 'RESOLVED'
              ? 'border-jade-600 text-jade-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <CheckCircle2 size={16} /> Selesai
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
            filter === 'RESOLVED' ? 'bg-jade-100 text-jade-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {hasActiveFilters ? filteredAnomalies.length : counts.resolved}
          </span>
        </button>
      </div>

      {/* Filter Bar for Selesai Tab */}
      {filter === 'RESOLVED' && (
        <div className="bg-white rounded-xl shadow-soft border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            {/* 1. Search (Order ID / Produk / Catatan Penyelesaian) */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Cari (Order/Produk/Catatan)</span>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Order ID, Produk, Catatan..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
                />
              </div>
            </label>

            {/* 2. Tipe Anomali Dropdown */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Tipe Anomali</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
              >
                <option value="">Semua Tipe Anomali</option>
                <option value="NEGATIVE_BALANCE_ATTEMPT">{getAnomalyMeta('NEGATIVE_BALANCE_ATTEMPT').label}</option>
                <option value="STALE_ORDER">{getAnomalyMeta('STALE_ORDER').label}</option>
                <option value="MISSING_LEDGER">{getAnomalyMeta('MISSING_LEDGER').label}</option>
                <option value="NEGATIVE_BALANCE_DETECTED">{getAnomalyMeta('NEGATIVE_BALANCE_DETECTED').label}</option>
              </select>
            </label>

            {/* 3. Dari Tanggal Deteksi */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Dari Tanggal Deteksi</span>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
              />
            </label>

            {/* 4. Sampai Tanggal Deteksi */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Sampai Tanggal Deteksi</span>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
              />
            </label>
          </div>

          {/* Active Filter Chips & Reset Button */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-1.5">
                {filterSearch && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium">
                    <span>Cari: "{filterSearch}"</span>
                    <button onClick={() => setFilterSearch('')} className="hover:text-brick-600"><X size={12} /></button>
                  </span>
                )}
                {filterType && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-xs font-medium">
                    <span>Tipe: {getAnomalyMeta(filterType).label}</span>
                    <button onClick={() => setFilterType('')} className="hover:text-brick-600"><X size={12} /></button>
                  </span>
                )}
                {filterDateFrom && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium">
                    <span>Dari: {filterDateFrom}</span>
                    <button onClick={() => setFilterDateFrom('')} className="hover:text-brick-600"><X size={12} /></button>
                  </span>
                )}
                {filterDateTo && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium">
                    <span>Sampai: {filterDateTo}</span>
                    <button onClick={() => setFilterDateTo('')} className="hover:text-brick-600"><X size={12} /></button>
                  </span>
                )}

                <button
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-brick-50 hover:bg-brick-100 text-brick-700 border border-brick-200 rounded-md text-xs font-semibold transition-colors"
                >
                  <X size={12} /> Reset Semua Filter
                </button>
              </div>

              <div className="text-xs text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                Hasil Filter: {filteredAnomalies.length} Baris
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {filter === 'OPEN' && (
                  <th className="px-4 py-3.5 font-semibold text-slate-700 w-10 text-center">
                    <input 
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-jade-600 focus:ring-jade-500 cursor-pointer accent-jade-600"
                      title="Pilih Semua Anomali"
                    />
                  </th>
                )}
                <th className="px-5 py-3.5 font-semibold text-slate-700">Waktu Deteksi</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Tipe Anomali</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Deskripsi Kasus</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Ringkasan Terkait</th>
                {filter === 'RESOLVED' && <th className="px-5 py-3.5 font-semibold text-slate-700">Catatan Penyelesaian</th>}
                {filter === 'OPEN' && <th className="px-5 py-3.5 font-semibold text-slate-700 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={filter === 'OPEN' ? 7 : 6} className="px-5 py-12 text-center text-slate-400">
                    <Activity className="animate-spin mx-auto mb-2 text-jade-500" size={24} />
                    Memuat worklist anomali...
                  </td>
                </tr>
              ) : anomalies.length === 0 ? (
                <tr>
                  <td colSpan={filter === 'OPEN' ? 7 : 6} className="px-5 py-12 text-center text-slate-400">
                    <Inbox className="mx-auto mb-2 text-slate-300" size={32} />
                    Tidak ada anomali berstatus <strong className="text-slate-600">{filter === 'OPEN' ? 'Terbuka' : 'Selesai'}</strong>.
                  </td>
                </tr>
              ) : filteredAnomalies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500 space-y-2">
                    <p className="font-semibold text-slate-700">Tidak ada anomali selesai yang cocok dengan kombinasi filter.</p>
                    <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian, pilihan tipe anomali, atau rentang tanggal.</p>
                    {hasActiveFilters && (
                      <button
                        onClick={resetAllFilters}
                        className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-brick-50 hover:bg-brick-100 text-brick-700 border border-brick-200 rounded-lg text-xs font-semibold transition-colors"
                      >
                        <X size={14} /> Reset Semua Filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredAnomalies.map(a => {
                  const meta = getAnomalyMeta(a.type)
                  const product = a.related_ids?.product_id ? productsMap.get(a.related_ids.product_id) : null
                  const order = a.related_ids?.order_id ? ordersMap.get(a.related_ids.order_id) : null
                  const qtyNeeded = a.related_ids?.qty_needed ?? a.related_ids?.qty
                  const rawBatchId = a.related_ids?.batch_id
                  const batchCode = rawBatchId ? (batchesMap.get(rawBatchId) || rawBatchId) : null
                  const isSelected = selectedIds.has(a.id)

                  // Build Ledger Filter URL
                  const ledgerParams = new URLSearchParams()
                  if (product?.id) ledgerParams.set('product_id', product.id)
                  if (rawBatchId) ledgerParams.set('batch_id', rawBatchId)
                  if (a.related_ids?.order_id) ledgerParams.set('ref_id', a.related_ids.order_id)
                  const ledgerUrl = `/ledger?${ledgerParams.toString()}`

                  return (
                    <tr 
                      key={a.id} 
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-jade-50/50' : filter === 'OPEN' ? 'bg-brick-50/20' : ''
                      }`}
                    >
                      {/* Checkbox Multi-Select (Only on OPEN) */}
                      {filter === 'OPEN' && (
                        <td className="px-4 py-3.5 align-top text-center">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectOne(a.id)}
                            className="w-4 h-4 rounded border-slate-300 text-jade-600 focus:ring-jade-500 cursor-pointer accent-jade-600 mt-0.5"
                          />
                        </td>
                      )}

                      {/* Waktu Deteksi */}
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-mono text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                          <Clock size={14} className="text-slate-400" />
                          {new Date(a.detected_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </td>

                      {/* Tipe Anomali */}
                      <td className="px-5 py-3.5 align-top">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${meta.bg} ${meta.text} ${meta.border}`}>
                          {meta.label}
                        </div>
                      </td>

                      {/* Deskripsi */}
                      <td className="px-5 py-3.5 align-top max-w-sm whitespace-normal">
                        <p className="text-slate-800 text-xs font-medium leading-relaxed">{a.description}</p>
                      </td>

                      {/* Ringkasan Terkait */}
                      <td className="px-5 py-3.5 align-top">
                        <div className="space-y-1 text-xs">
                          {product && (
                            <div className="flex items-center gap-1.5 font-medium text-slate-900">
                              <Package size={14} className="text-dusty-500 shrink-0" />
                              <span>{product.name}</span>
                              <span className="font-mono text-[11px] text-slate-400">({product.sku})</span>
                            </div>
                          )}

                          {qtyNeeded !== undefined && (
                            <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                              <Layers size={14} className="text-dusty-500 shrink-0" />
                              <span>Qty Terlibat: <strong className="text-slate-800">{formatQty(qtyNeeded)} unit</strong></span>
                            </div>
                          )}

                          {order && (
                            <div className="flex items-center gap-1.5 text-slate-700 flex-wrap">
                              <ShoppingCart size={14} className="text-dusty-500 shrink-0" />
                              <span>Order ID: <strong className="font-mono">{order.marketplace_order_id}</strong></span>
                              {order.channel && <ChannelBadge channel={order.channel} />}
                            </div>
                          )}

                          {batchCode && (
                            <div className="flex items-center gap-1.5 text-slate-600 font-mono">
                              <Tag size={14} className="text-dusty-500 shrink-0" />
                              <span>Batch: <strong className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{batchCode}</strong></span>
                            </div>
                          )}

                          {/* Link ke Ledger Explorer dengan auto-filter */}
                          {(product || rawBatchId || a.related_ids?.order_id) && (
                            <div className="pt-1">
                              <Link 
                                href={ledgerUrl}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-jade-600 hover:text-jade-700 hover:underline transition-colors"
                              >
                                <ExternalLink size={12} /> Lihat di Ledger
                              </Link>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Catatan Penyelesaian (If RESOLVED) */}
                      {filter === 'RESOLVED' && (
                        <td className="px-5 py-3.5 align-top max-w-xs whitespace-normal">
                          <p className="text-xs text-slate-700 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            "{a.resolution_note}"
                          </p>
                          {a.resolved_at && (
                            <span className="text-[10px] text-slate-400 font-mono block mt-1">
                              Diselesaikan: {new Date(a.resolved_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          )}
                        </td>
                      )}

                      {/* Aksi Single-Item (If OPEN) */}
                      {filter === 'OPEN' && (
                        <td className="px-5 py-3.5 align-top text-right">
                          <button 
                            onClick={() => {
                              setResolvingId(a.id)
                              setResolutionNote('')
                              setError('')
                            }} 
                            className="px-3 py-1.5 bg-jade-600 hover:bg-jade-700 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 size={14} /> Tandai Selesai
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Action Bar for Bulk Selection (Light Palette Card Aesthetic) */}
      {filter === 'OPEN' && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 text-slate-800 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-200 border border-slate-200 max-w-lg w-[calc(100%-2rem)] justify-between backdrop-blur-md">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-800">
            <span className="bg-jade-100 text-jade-800 border border-jade-200 font-bold px-2.5 py-0.5 rounded-full font-mono text-[11px]">
              {selectedIds.size}
            </span>
            <span className="text-slate-800">Anomali Terpilih</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Batal Pilih
            </button>
            <button
              onClick={() => {
                setBulkError('')
                setBulkResolutionNote('')
                setIsBulkModalOpen(true)
              }}
              className="px-4 py-2 bg-jade-600 hover:bg-jade-700 active:bg-jade-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <CheckCircle2 size={15} /> Tandai Selesai ({selectedIds.size})
            </button>
          </div>
        </div>
      )}

      {/* Single-Item Modal Penyelesaian Anomali */}
      {resolvingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="text-jade-500" size={20} /> Tandai Anomali Selesai
              </h2>
              <button 
                onClick={() => setResolvingId(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Anomali tidak akan dihapus dari sistem, melainkan ditandai sebagai <strong>Selesai (Resolved)</strong> beserta alasan tindak lanjut untuk keperluan audit logis.
              </p>

              {error && (
                <div className="p-3 bg-brick-50 border border-brick-200 text-brick-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="shrink-0" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Catatan Penyelesaian (Wajib)
                <textarea 
                  value={resolutionNote} 
                  onChange={e => setResolutionNote(e.target.value)} 
                  required
                  rows={4}
                  className="border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs font-normal resize-none"
                  placeholder="Contoh: Sudah dikonfirmasi ke Shopee, pesanan dibatalkan secara resmi dan stok telah dipulihkan..."
                />
              </label>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setResolvingId(null)} 
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleResolveSubmit} 
                  disabled={resolvingLoading} 
                  className="flex-1 px-4 py-2.5 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-soft"
                >
                  {resolvingLoading ? <Activity className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Simpan & Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Modal Penyelesaian Multiple Anomali */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <ListChecks className="text-jade-500" size={20} /> Tandai {selectedIds.size} Anomali Selesai
              </h2>
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">Daftar Anomali Terpilih ({selectedIds.size}):</p>
                <div className="max-h-44 overflow-y-auto space-y-2 pr-1 border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs">
                  {Array.from(selectedIds).map(id => {
                    const a = anomalies.find(item => item.id === id)
                    if (!a) return null
                    const meta = getAnomalyMeta(a.type)
                    const product = a.related_ids?.product_id ? productsMap.get(a.related_ids.product_id) : null
                    const order = a.related_ids?.order_id ? ordersMap.get(a.related_ids.order_id) : null
                    const rawBatchId = a.related_ids?.batch_id
                    const batchCode = rawBatchId ? (batchesMap.get(rawBatchId) || rawBatchId) : null

                    return (
                      <div key={id} className="p-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${meta.bg} ${meta.text} ${meta.border}`}>
                            {meta.label}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {new Date(a.detected_at).toLocaleDateString('id-ID')}
                          </span>
                        </div>
                        <p className="text-slate-800 font-medium leading-snug line-clamp-2">{a.description}</p>
                        {(product || order || batchCode) && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 font-mono pt-0.5 border-t border-slate-100">
                            {product && <span>📦 {product.name} ({product.sku})</span>}
                            {order && <span>🛒 Order: {order.marketplace_order_id}</span>}
                            {batchCode && <span>🏷️ Batch: {batchCode}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {bulkError && (
                <div className="p-3 bg-brick-50 border border-brick-200 text-brick-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="shrink-0" size={16} />
                  <span>{bulkError}</span>
                </div>
              )}

              <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
                Catatan Penyelesaian (Berlaku untuk Semua {selectedIds.size} Anomali) *
                <textarea 
                  value={bulkResolutionNote} 
                  onChange={e => setBulkResolutionNote(e.target.value)} 
                  required
                  rows={3}
                  className="border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs font-normal resize-none"
                  placeholder="Contoh: Seluruh pesanan telah diverifikasi secara fisik dan dibatalkan secara resmi..."
                />
              </label>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsBulkModalOpen(false)} 
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleBulkResolveSubmit} 
                  disabled={bulkLoading} 
                  className="flex-1 px-4 py-2.5 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 shadow-soft"
                >
                  {bulkLoading ? <Activity className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Simpan & Selesaikan Semua
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
