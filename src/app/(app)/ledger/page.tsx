'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { commitCorrection } from '@/actions/manual'
import { Search, Filter, ChevronLeft, ChevronRight, Activity, ArrowRightLeft, FileSpreadsheet, AlertCircle, BookOpen, XCircle, CheckCircle2, ExternalLink, Download } from 'lucide-react'
import ChannelBadge from '@/components/ChannelBadge'
import { formatQty } from '@/utils/format'

const PAGE_SIZE = 20

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

function LedgerContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlProductId = searchParams.get('product_id')
  const urlBatchId = searchParams.get('batch_id')
  const urlRefId = searchParams.get('ref_id')

  const [ledger, setLedger] = useState<any[]>([])
  const [correctedMap, setCorrectedMap] = useState<Record<string, string>>({})
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // Master Lists for Filter Dropdowns
  const [allProducts, setAllProducts] = useState<any[]>([])
  const [productBatches, setProductBatches] = useState<any[]>([])

  // Filters
  const [filterProduct, setFilterProduct] = useState(urlProductId || '')
  const [filterBatch, setFilterBatch] = useState(urlBatchId || '')
  const [filterReason, setFilterReason] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // Modal Correction State
  const [correctingRow, setCorrectingRow] = useState<any | null>(null)
  const [correctionIdempKey, setCorrectionIdempKey] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctionError, setCorrectionError] = useState('')
  const [correctionLoading, setCorrectionLoading] = useState(false)

  // Drilldown Modal
  const [drilldownRef, setDrilldownRef] = useState<string | null>(null)
  const [drilldownData, setDrilldownData] = useState<any[]>([])
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  const supabase = createClient()

  // Fetch Master Products on mount
  useEffect(() => {
    async function loadProducts() {
      const { data } = await supabase.from('products').select('id, name, sku').order('name')
      if (data) setAllProducts(data)
    }
    loadProducts()
  }, [])

  // Fetch Dependent Batches when filterProduct changes
  useEffect(() => {
    async function loadBatches() {
      if (!filterProduct) {
        setProductBatches([])
        return
      }
      const { data } = await supabase
        .from('batches')
        .select('id, batch_code')
        .eq('product_id', filterProduct)
        .order('batch_code')
      if (data) setProductBatches(data)
    }
    loadBatches()
  }, [filterProduct])

  // Synchronize URL search params if present
  useEffect(() => {
    if (urlProductId) setFilterProduct(urlProductId)
    if (urlBatchId) setFilterBatch(urlBatchId)
  }, [urlProductId, urlBatchId])

  const fetchLedger = useCallback(async () => {
    setLoading(true)

    // Handle free text search across products, batches, and source_ref_id
    let matchingProdIds: string[] = []
    let matchingBatchIds: string[] = []

    if (filterSearch && filterSearch.trim() !== '') {
      const term = filterSearch.trim()
      const [{ data: prods }, { data: btchs }] = await Promise.all([
        supabase.from('products').select('id').or(`name.ilike.%${term}%,sku.ilike.%${term}%`),
        supabase.from('batches').select('id').ilike('batch_code', `%${term}%`)
      ])
      if (prods) matchingProdIds = prods.map(p => p.id)
      if (btchs) matchingBatchIds = btchs.map(b => b.id)
    }

    let query = supabase
      .from('stock_ledger')
      .select('*, products(name, sku), batches(batch_code)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (filterReason) query = query.eq('reason_code', filterReason)
    if (filterChannel) query = query.eq('channel', filterChannel)
    if (filterProduct) query = query.eq('product_id', filterProduct)
    if (filterBatch) query = query.eq('batch_id', filterBatch)
    if (urlRefId) query = query.eq('source_ref_id', urlRefId)

    if (filterDateFrom) {
      query = query.gte('created_at', `${filterDateFrom}T00:00:00.000Z`)
    }
    if (filterDateTo) {
      query = query.lte('created_at', `${filterDateTo}T23:59:59.999Z`)
    }

    if (filterSearch && filterSearch.trim() !== '') {
      const term = filterSearch.trim()
      const conditions = [`source_ref_id.ilike.%${term}%`]
      if (matchingProdIds.length > 0) conditions.push(`product_id.in.(${matchingProdIds.join(',')})`)
      if (matchingBatchIds.length > 0) conditions.push(`batch_id.in.(${matchingBatchIds.join(',')})`)
      query = query.or(conditions.join(','))
    }

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    const { data, count } = await query

    if (data && data.length > 0) {
      setLedger(data)
      const rowIds = data.map((r: any) => r.id)
      const { data: corrections } = await supabase
        .from('stock_ledger')
        .select('id, source_ref_id')
        .eq('reason_code', 'MANUAL_CORRECTION')
        .in('source_ref_id', rowIds)

      const map: Record<string, string> = {}
      if (corrections) {
        corrections.forEach((c: any) => {
          if (c.source_ref_id) {
            map[c.source_ref_id] = c.id
          }
        })
      }
      setCorrectedMap(map)
    } else {
      setLedger([])
      setCorrectedMap({})
    }

    if (count !== null) setTotalCount(count)
    setLoading(false)
  }, [page, filterReason, filterChannel, filterProduct, filterBatch, filterDateFrom, filterDateTo, filterSearch, urlRefId, supabase])

  const [exporting, setExporting] = useState(false)

  const handleExportCSV = async () => {
    try {
      setExporting(true)

      let matchingProdIds: string[] = []
      let matchingBatchIds: string[] = []

      if (filterSearch && filterSearch.trim() !== '') {
        const term = filterSearch.trim()
        const [{ data: prods }, { data: btchs }] = await Promise.all([
          supabase.from('products').select('id').or(`name.ilike.%${term}%,sku.ilike.%${term}%`),
          supabase.from('batches').select('id').ilike('batch_code', `%${term}%`)
        ])
        if (prods) matchingProdIds = prods.map(p => p.id)
        if (btchs) matchingBatchIds = btchs.map(b => b.id)
      }

      let query = supabase
        .from('stock_ledger')
        .select('*, products(name, sku), batches(batch_code)')
        .order('created_at', { ascending: false })

      if (filterReason) query = query.eq('reason_code', filterReason)
      if (filterChannel) query = query.eq('channel', filterChannel)
      if (filterProduct) query = query.eq('product_id', filterProduct)
      if (filterBatch) query = query.eq('batch_id', filterBatch)
      if (urlRefId) query = query.eq('source_ref_id', urlRefId)

      if (filterDateFrom) {
        query = query.gte('created_at', `${filterDateFrom}T00:00:00.000Z`)
      }
      if (filterDateTo) {
        query = query.lte('created_at', `${filterDateTo}T23:59:59.999Z`)
      }

      if (filterSearch && filterSearch.trim() !== '') {
        const term = filterSearch.trim()
        const conditions = [`source_ref_id.ilike.%${term}%`]
        if (matchingProdIds.length > 0) conditions.push(`product_id.in.(${matchingProdIds.join(',')})`)
        if (matchingBatchIds.length > 0) conditions.push(`batch_id.in.(${matchingBatchIds.join(',')})`)
        query = query.or(conditions.join(','))
      }

      const { data, error } = await query

      if (error) {
        alert(`Gagal mengeksport data ledger: ${error.message}`)
        return
      }

      if (!data || data.length === 0) {
        alert('Tidak ada data ledger yang cocok dengan filter untuk dieksport.')
        return
      }

      const headers = ['Waktu (WIB)', 'Produk', 'SKU', 'Batch', 'Delta', 'Alasan', 'Kanal', 'Referensi', 'ID Movement']
      const rows = data.map((item: any) => {
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('id-ID') : ''
        const prodName = item.products?.name || ''
        const prodSku = item.products?.sku || ''
        const batchCode = item.batches?.batch_code || ''
        const delta = item.qty_delta // raw integer!
        const reason = item.reason_code || ''
        const channel = item.channel || ''
        const ref = item.source_ref_id || ''
        const id = item.id || ''

        return [dateStr, prodName, prodSku, batchCode, delta, reason, channel, ref, id]
          .map(val => `"${String(val).replace(/"/g, '""')}"`)
          .join(',')
      })

      const csvString = [headers.join(','), ...rows].join('\r\n')
      const dateToday = new Date().toISOString().split('T')[0]
      let filterTag = ''
      if (filterProduct) {
        const prodName = allProducts.find(p => p.id === filterProduct)?.name || 'produk'
        filterTag = `${prodName.replace(/[^a-zA-Z0-9]/g, '_')}-`
      }
      const filename = `ledger-export-${filterTag}${dateToday}.csv`

      downloadCSV(filename, csvString)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    fetchLedger()
  }, [fetchLedger])

  const openDrilldown = async (refOrId: string) => {
    if (!refOrId) return
    setDrilldownRef(refOrId)
    setDrilldownData([]) // Reset previous modal data immediately to avoid stale leaks
    setDrilldownLoading(true)

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refOrId)

    let query = supabase
      .from('stock_ledger')
      .select('*, products(name, sku), batches(batch_code)')
      .order('created_at', { ascending: false })

    if (isUuid) {
      query = query.or(`source_ref_id.eq.${refOrId},id.eq.${refOrId}`)
    } else {
      query = query.eq('source_ref_id', refOrId)
    }

    const { data } = await query

    if (data) setDrilldownData(data)
    setDrilldownLoading(false)
  }

  const handleCorrectionSubmit = async () => {
    if (!correctionNote) {
      setCorrectionError('Alasan koreksi wajib diisi')
      return
    }

    setCorrectionError('')
    setCorrectionLoading(true)
    const res = await commitCorrection(correctingRow.id, correctionNote, correctionIdempKey)
    setCorrectionLoading(false)

    if (res.success) {
      setCorrectingRow(null)
      setCorrectionNote('')
      setCorrectionIdempKey('')
      fetchLedger() // Refresh table
    } else {
      setCorrectionError(res.error || 'Gagal melakukan koreksi')
    }
  }

  const resetAllFilters = () => {
    setFilterProduct('')
    setFilterBatch('')
    setFilterReason('')
    setFilterChannel('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterSearch('')
    setPage(1)
    if (urlProductId || urlBatchId || urlRefId) {
      router.push('/ledger')
    }
  }

  const hasActiveFilters = Boolean(
    filterProduct || filterBatch || filterReason || filterChannel || filterDateFrom || filterDateTo || filterSearch || urlRefId
  )

  const translateReason = (reason: string) => {
    const map: Record<string, string> = {
      SALE: 'Penjualan',
      STOCK_IN: 'Barang Masuk (Maklon)',
      BONUS: 'Bonus',
      PROMO: 'Promo',
      SAMPLE: 'Sampel',
      DAMAGED: 'Rusak',
      EXPIRED: 'Kedaluwarsa',
      RETURN_IN: 'Retur Masuk',
      OPNAME_CORRECTION: 'Koreksi Opname',
      MANUAL_CORRECTION: 'Koreksi Manual',
      CANCEL_REVERSAL: 'Pembatalan (Reversal)',
      OPENING_BALANCE: 'Saldo Awal'
    }
    return map[reason] || reason
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <BookOpen className="text-jade-500" /> Buku Besar (Ledger)
        </h1>
        <p className="text-slate-500 mt-2">Pusat kebenaran (Single Source of Truth) mutasi stok gudang Anda.</p>
      </header>

      {(urlProductId || urlBatchId || urlRefId) && (
        <div className="p-4 bg-jade-50 border border-jade-200 text-jade-900 rounded-xl text-xs flex items-center justify-between shadow-soft">
          <div className="flex items-center gap-2 font-medium">
            <Filter size={16} className="text-jade-600 shrink-0" />
            <span>
              Filter Aktif dari Anomali: {urlProductId ? 'Berdasarkan Produk' : ''} {urlBatchId ? 'Berdasarkan Batch' : ''} {urlRefId ? `Order Ref: ${urlRefId}` : ''}
            </span>
          </div>
          <button 
            type="button"
            onClick={() => router.push('/ledger')}
            className="inline-flex items-center gap-1 text-jade-700 hover:text-jade-900 font-bold bg-white px-2.5 py-1 rounded-lg border border-jade-200 transition-colors cursor-pointer"
          >
            <XCircle size={14} /> Hapus Filter
          </button>
        </div>
      )}

      {/* Filters Container */}
      <div className="bg-white p-4 rounded-xl shadow-soft border border-slate-200 space-y-3">
        {/* Responsive Grid for Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 items-end">
          {/* 1. Free Search Input */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>Cari (Produk/Batch/Ref)</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Kata kunci..."
                value={filterSearch}
                onChange={(e) => { setFilterSearch(e.target.value); setPage(1); }}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
              />
            </div>
          </label>

          {/* 2. Product Filter */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>Produk</span>
            <select
              value={filterProduct}
              onChange={(e) => {
                setFilterProduct(e.target.value);
                setFilterBatch('');
                setPage(1);
              }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            >
              <option value="">Semua Produk</option>
              {allProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </label>

          {/* 3. Dependent Batch Filter */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span className="flex items-center justify-between">
              <span>Batch</span>
              {!filterProduct && <span className="text-[10px] font-normal text-amber-600">Pilih produk dulu</span>}
            </span>
            <select
              disabled={!filterProduct}
              value={filterBatch}
              onChange={(e) => { setFilterBatch(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <option value="">{filterProduct ? 'Semua Batch' : 'Pilih produk dahulu'}</option>
              {productBatches.map(b => (
                <option key={b.id} value={b.id}>{b.batch_code}</option>
              ))}
            </select>
          </label>

          {/* 4. Reason Filter */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>Alasan Mutasi</span>
            <select
              value={filterReason}
              onChange={(e) => { setFilterReason(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            >
              <option value="">Semua Alasan</option>
              <option value="SALE">Penjualan</option>
              <option value="STOCK_IN">Barang Masuk (Maklon)</option>
              <option value="OPENING_BALANCE">Saldo Awal</option>
              <option value="RETURN_IN">Retur Masuk</option>
              <option value="OPNAME_CORRECTION">Koreksi Opname</option>
              <option value="MANUAL_CORRECTION">Koreksi Manual</option>
              <option value="CANCEL_REVERSAL">Pembatalan</option>
              <option value="BONUS">Bonus</option>
              <option value="PROMO">Promo</option>
              <option value="SAMPLE">Sampel</option>
              <option value="DAMAGED">Rusak</option>
              <option value="EXPIRED">Kedaluwarsa</option>
            </select>
          </label>

          {/* 5. Channel Filter */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>Kanal</span>
            <select
              value={filterChannel}
              onChange={(e) => { setFilterChannel(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            >
              <option value="">Semua Kanal</option>
              <option value="SHOPEE">Shopee</option>
              <option value="TIKTOK">TikTok</option>
              <option value="OFFLINE">Offline</option>
              <option value="INTERNAL">Internal</option>
            </select>
          </label>

          {/* 6. Date From */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>Dari Tanggal</span>
            <input
              type="date"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            />
          </label>

          {/* 7. Date To */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
            <span>Sampai Tanggal</span>
            <input
              type="date"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            />
          </label>
        </div>

        {/* Active Filter Chips & Summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {filterSearch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium">
                <span>Cari: "{filterSearch}"</span>
                <button onClick={() => setFilterSearch('')} className="hover:text-brick-600"><XCircle size={12} /></button>
              </span>
            )}
            {filterProduct && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-jade-50 text-jade-800 border border-jade-200 rounded-md text-xs font-medium">
                <span>Produk: {allProducts.find(p => p.id === filterProduct)?.name || filterProduct}</span>
                <button onClick={() => { setFilterProduct(''); setFilterBatch(''); }} className="hover:text-brick-600"><XCircle size={12} /></button>
              </span>
            )}
            {filterBatch && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-jade-50 text-jade-800 border border-jade-200 rounded-md text-xs font-medium">
                <span>Batch: {productBatches.find(b => b.id === filterBatch)?.batch_code || filterBatch}</span>
                <button onClick={() => setFilterBatch('')} className="hover:text-brick-600"><XCircle size={12} /></button>
              </span>
            )}
            {filterReason && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-xs font-medium">
                <span>Alasan: {translateReason(filterReason)}</span>
                <button onClick={() => setFilterReason('')} className="hover:text-brick-600"><XCircle size={12} /></button>
              </span>
            )}
            {filterChannel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-md text-xs font-medium">
                <span>Kanal: {filterChannel}</span>
                <button onClick={() => setFilterChannel('')} className="hover:text-brick-600"><XCircle size={12} /></button>
              </span>
            )}
            {filterDateFrom && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium">
                <span>Dari: {filterDateFrom}</span>
                <button onClick={() => setFilterDateFrom('')} className="hover:text-brick-600"><XCircle size={12} /></button>
              </span>
            )}
            {filterDateTo && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-xs font-medium">
                <span>Sampai: {filterDateTo}</span>
                <button onClick={() => setFilterDateTo('')} className="hover:text-brick-600"><XCircle size={12} /></button>
              </span>
            )}

            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-brick-50 hover:bg-brick-100 text-brick-700 border border-brick-200 rounded-md text-xs font-semibold transition-colors"
              >
                <XCircle size={12} /> Reset Semua Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="text-xs text-slate-500 font-mono bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
              Total Baris: {totalCount}
            </div>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-md text-xs font-semibold transition-colors shadow-2xs"
            >
              {exporting ? <Activity size={13} className="animate-spin" /> : <Download size={13} />}
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3.5 py-3 font-semibold text-slate-700 whitespace-nowrap">Waktu (WIB)</th>
                <th className="px-3.5 py-3 font-semibold text-slate-700 max-w-[200px]">Produk</th>
                <th className="px-3.5 py-3 font-semibold text-slate-700 whitespace-nowrap">Batch</th>
                <th className="px-3.5 py-3 font-semibold text-slate-700 text-right whitespace-nowrap">Delta</th>
                <th className="px-3.5 py-3 font-semibold text-slate-700 whitespace-nowrap">Alasan</th>
                <th className="px-3.5 py-3 font-semibold text-slate-700 whitespace-nowrap">Kanal</th>
                <th className="px-3.5 py-3 font-semibold text-slate-700 whitespace-nowrap">Referensi</th>
                <th className="px-3.5 py-3 font-semibold text-slate-700 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <Activity className="animate-spin mx-auto mb-2" size={24} />
                    Memuat buku besar...
                  </td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <AlertCircle size={32} className="mx-auto text-dusty-400" />
                      <p className="font-semibold text-slate-800 text-base">Tidak ada mutasi stok yang cocok</p>
                      <p className="text-xs text-slate-500">
                        Kombinasi filter yang Anda terapkan tidak menemukan hasil apapun. Coba sesuaikan kata kunci atau hapus beberapa filter.
                      </p>
                      {hasActiveFilters && (
                        <div className="pt-2">
                          <button
                            onClick={resetAllFilters}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-jade-600 hover:bg-jade-700 text-white rounded-lg text-xs font-semibold shadow-soft transition-colors"
                          >
                            <XCircle size={14} /> Reset Semua Filter
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                ledger.map(row => (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50 transition-colors ${row.reason_code === 'MANUAL_CORRECTION' ? 'bg-amber-50/40' :
                        row.reason_code === 'OPNAME_CORRECTION' ? 'bg-jade-50/30' : ''
                      }`}
                  >
                    <td className="px-3.5 py-2.5 font-mono text-xs whitespace-nowrap">{new Date(row.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-3.5 py-2.5 max-w-[200px]">
                      <div className="font-medium text-slate-900 truncate" title={row.products?.name}>{row.products?.name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{row.products?.sku}</div>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-xs whitespace-nowrap">{row.batches?.batch_code}</td>
                    <td className={`px-3.5 py-2.5 text-right font-mono font-bold text-base whitespace-nowrap ${row.qty_delta < 0 ? 'text-brick-600' : 'text-jade-600'}`}>
                      {row.qty_delta > 0 ? `+${formatQty(row.qty_delta)}` : formatQty(row.qty_delta)}
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${row.qty_delta < 0 ? 'bg-brick-50 text-brick-700' : 'bg-jade-50 text-jade-700'
                        }`}>
                        {translateReason(row.reason_code)}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-xs whitespace-nowrap">
                      <ChannelBadge channel={row.channel} />
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      {row.source_ref_id ? (
                        <button
                          onClick={() => openDrilldown(row.source_ref_id)}
                          className="inline-flex items-center gap-1 text-xs text-dusty-700 hover:text-jade-700 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded font-mono border border-slate-200 transition-colors"
                          title={`ID Referensi Penuh: ${row.source_ref_id} (Klik untuk melihat rincian)`}
                        >
                          <span>{row.source_ref_id.slice(0, 8)}...</span>
                          <ExternalLink size={11} className="text-slate-400 shrink-0" />
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">-</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      {row.qty_delta < 0 && row.reason_code !== 'CANCEL_REVERSAL' && row.reason_code !== 'MANUAL_CORRECTION' && (
                        correctedMap[row.id] ? (
                          <button
                            onClick={() => openDrilldown(row.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition-colors shadow-2xs"
                            title="Entri ini sudah dikoreksi. Klik untuk melihat rincian koreksinya."
                          >
                            <CheckCircle2 size={13} className="text-jade-600 shrink-0" />
                            <span>Sudah Dikoreksi</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setCorrectingRow(row)
                              setCorrectionIdempKey(`CORRECTION-${row.id}-${Date.now()}`)
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition-colors shadow-2xs"
                          >
                            Koreksi
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Halaman <span className="font-mono font-medium text-slate-900">{page}</span> dari <span className="font-mono font-medium text-slate-900">{totalPages || 1}</span>
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="p-2 border border-slate-300 bg-white text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="p-2 border border-slate-300 bg-white text-slate-600 rounded-lg hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Drilldown Modal */}
      {drilldownRef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-dusty-500" /> Rincian Grup Transaksi
                </h2>
                <p className="text-xs font-mono text-slate-500 mt-1">Ref ID: {drilldownRef}</p>
              </div>
              <button
                onClick={() => {
                  setDrilldownRef(null)
                  setDrilldownData([])
                }}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-200 transition-colors"
              >
                Tutup
              </button>
            </div>

            <div className="p-0 overflow-y-auto flex-1">
              {drilldownLoading ? (
                <div className="p-12 text-center text-slate-400">Memuat rincian grup...</div>
              ) : (
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-slate-700">Waktu</th>
                      <th className="px-5 py-3 font-semibold text-slate-700">Produk</th>
                      <th className="px-5 py-3 font-semibold text-slate-700">Batch</th>
                      <th className="px-5 py-3 font-semibold text-slate-700 text-right">Delta</th>
                      <th className="px-5 py-3 font-semibold text-slate-700">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {drilldownData.map(row => (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          row.reason_code === 'MANUAL_CORRECTION' ? 'bg-amber-50/40' :
                          row.reason_code === 'OPNAME_CORRECTION' ? 'bg-jade-50/30' : ''
                        }`}
                      >
                        <td className="px-5 py-3 font-mono text-xs">{new Date(row.created_at).toLocaleTimeString('id-ID')}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">{row.products?.name}</td>
                        <td className="px-5 py-3 font-mono text-xs">{row.batches?.batch_code}</td>
                        <td className={`px-5 py-3 text-right font-mono font-bold ${row.qty_delta < 0 ? 'text-brick-600' : 'text-jade-600'}`}>
                          {row.qty_delta > 0 ? `+${formatQty(row.qty_delta)}` : formatQty(row.qty_delta)}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={row.reference_note}>
                          {row.reference_note || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Correction Modal */}
      {correctingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-2">
                <AlertCircle className="text-honey-500" /> Koreksi Pengeluaran
              </h2>
              <p className="text-sm text-slate-600 mb-6">
                Anda akan mengembalikan stok <strong>{formatQty(Math.abs(correctingRow.qty_delta))} unit</strong> ke batch <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded border border-slate-200">{correctingRow.batches?.batch_code}</span>.
                Sistem akan mencatatnya sebagai mutasi baru dengan alasan "Koreksi Manual".
              </p>

              {correctionError && (
                <div className="mb-4 p-3 bg-brick-50 text-brick-600 border border-brick-200 rounded-lg text-sm">
                  {correctionError}
                </div>
              )}

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
                Alasan Koreksi (Wajib)
                <textarea
                  value={correctionNote}
                  onChange={e => setCorrectionNote(e.target.value)}
                  required
                  rows={3}
                  className="border border-slate-300 rounded-lg p-3 bg-white focus:ring-2 focus:ring-jade-500 focus:outline-none resize-none font-normal"
                  placeholder="Contoh: Kesalahan input qty saat pameran..."
                />
              </label>

              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setCorrectingRow(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleCorrectionSubmit}
                  disabled={correctionLoading}
                  className="flex-1 px-4 py-2.5 bg-honey-500 hover:bg-honey-600 text-white rounded-xl font-semibold transition-colors flex justify-center items-center gap-2"
                >
                  {correctionLoading ? <Activity className="animate-spin" size={18} /> : <ArrowRightLeft size={18} />}
                  Proses Koreksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LedgerPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-400">Memuat Buku Besar...</div>}>
      <LedgerContent />
    </Suspense>
  )
}
