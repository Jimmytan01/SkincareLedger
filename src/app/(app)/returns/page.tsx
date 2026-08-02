'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { processReturnInspection, ProcessReturnPayload } from '@/actions/returns'
import { Undo2, AlertCircle, Activity, CheckCircle2, PackageSearch, X, Plus, Info, History, ExternalLink, Search, Filter } from 'lucide-react'
import ChannelBadge from '@/components/ChannelBadge'
import { formatQty } from '@/utils/format'

export default function ReturnsInboxPage() {
  const [tab, setTab] = useState<'PENDING' | 'COMPLETED'>('PENDING')
  const [counts, setCounts] = useState({ pending: 0, completed: 0 })

  const [pendingReturns, setPendingReturns] = useState<any[]>([])
  const [completedReturns, setCompletedReturns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filters for Riwayat Inspeksi tab
  const [filterChannel, setFilterChannel] = useState('')
  const [filterCondition, setFilterCondition] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  const [inspectingRet, setInspectingRet] = useState<any>(null)
  const [splits, setSplits] = useState<{ condition: any, qty: number, expiryDate: string, isUnknownExpiry: boolean }[]>([])
  const [inspectError, setInspectError] = useState('')
  const [inspectLoading, setInspectLoading] = useState(false)

  const supabase = createClient()

  const fetchReturns = useCallback(async () => {
    setLoading(true)
    
    // Fetch exact counts
    const { count: pendingCount } = await supabase.from('returns').select('id', { count: 'exact', head: true }).eq('status', 'PENDING_INSPECTION')
    const { count: completedCount } = await supabase.from('returns').select('id', { count: 'exact', head: true }).eq('status', 'COMPLETED')
    setCounts({ pending: pendingCount || 0, completed: completedCount || 0 })

    if (tab === 'PENDING') {
      const { data } = await supabase
        .from('returns')
        .select('*, order_items(qty, product_id, bundle_sku, bundle_recipe_version, products(name, sku)), orders(marketplace_order_id, channel)')
        .eq('status', 'PENDING_INSPECTION')
      
      if (data) {
        // Sort by urgency (created_at + 40 days)
        const sorted = data.sort((a, b) => {
          const deadlineA = new Date(a.created_at).getTime() + (40 * 24 * 60 * 60 * 1000)
          const deadlineB = new Date(b.created_at).getTime() + (40 * 24 * 60 * 60 * 1000)
          return deadlineA - deadlineB
        })
        setPendingReturns(sorted)
      } else {
        setPendingReturns([])
      }
    } else {
      const { data: compData } = await supabase
        .from('returns')
        .select('*, order_items(qty, product_id, bundle_sku, bundle_recipe_version, products(id, name, sku)), orders(marketplace_order_id, channel), returns_claims(*)')
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false })

      if (compData && compData.length > 0) {
        const returnIds = compData.map(r => r.id)
        const { data: ledgerEntries } = await supabase
          .from('stock_ledger')
          .select('*, batches(batch_code)')
          .in('source_ref_id', returnIds)

        const ledgerMap = new Map()
        ledgerEntries?.forEach(l => {
          if (!ledgerMap.has(l.source_ref_id)) {
            ledgerMap.set(l.source_ref_id, [])
          }
          ledgerMap.get(l.source_ref_id).push(l)
        })

        const mapped = compData.map(r => ({
          ...r,
          ledger_entries: ledgerMap.get(r.id) || []
        }))
        setCompletedReturns(mapped)
      } else {
        setCompletedReturns([])
      }
    }
    setLoading(false)
  }, [tab])

  useEffect(() => {
    fetchReturns()
  }, [fetchReturns])

  const filteredCompletedReturns = useMemo(() => {
    return completedReturns.filter(ret => {
      // 1. Kanal Filter
      if (filterChannel && ret.orders?.channel !== filterChannel) {
        return false
      }

      // 2. Kondisi Hasil Filter
      if (filterCondition) {
        const hasLayak = (ret.ledger_entries || []).length > 0
        const claims = ret.returns_claims || []
        const hasDamaged = claims.some((c: any) => c.condition === 'DAMAGED')
        const hasLost = claims.some((c: any) => c.condition === 'LOST')

        if (filterCondition === 'LAYAK_JUAL' && !hasLayak) return false
        if (filterCondition === 'DAMAGED' && !hasDamaged) return false
        if (filterCondition === 'LOST' && !hasLost) return false
      }

      // 3. Rentang Tanggal Inspeksi Filter (Asia/Jakarta WIB)
      const ledger = ret.ledger_entries || []
      const claims = ret.returns_claims || []
      let inspectDateISO = ret.created_at
      if (ledger.length > 0 && ledger[0].created_at) {
        inspectDateISO = ledger[0].created_at
      } else if (claims.length > 0 && claims[0].created_at) {
        inspectDateISO = claims[0].created_at
      }

      const inspectDateWIB = new Date(inspectDateISO).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

      if (filterDateFrom && inspectDateWIB < filterDateFrom) {
        return false
      }
      if (filterDateTo && inspectDateWIB > filterDateTo) {
        return false
      }

      // 4. Cari Search (Order ID / Produk / SKU / Bundle SKU)
      if (filterSearch && filterSearch.trim() !== '') {
        const term = filterSearch.trim().toLowerCase()
        const orderId = (ret.orders?.marketplace_order_id || '').toLowerCase()
        const prodName = (ret.order_items?.products?.name || '').toLowerCase()
        const prodSku = (ret.order_items?.products?.sku || '').toLowerCase()
        const bundleSku = (ret.order_items?.bundle_sku || '').toLowerCase()

        if (!orderId.includes(term) && !prodName.includes(term) && !prodSku.includes(term) && !bundleSku.includes(term)) {
          return false
        }
      }

      return true
    })
  }, [completedReturns, filterChannel, filterCondition, filterDateFrom, filterDateTo, filterSearch])

  const hasActiveFilters = Boolean(filterChannel || filterCondition || filterDateFrom || filterDateTo || filterSearch)

  const resetAllFilters = () => {
    setFilterChannel('')
    setFilterCondition('')
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterSearch('')
  }

  const openInspection = (ret: any) => {
    setInspectingRet(ret)
    setSplits([{ condition: 'LAYAK_JUAL', qty: ret.qty_requested, expiryDate: '', isUnknownExpiry: false }])
    setInspectError('')
  }

  const handleInspectSubmit = async () => {
    setInspectError('')
    
    // Validate total qty
    const totalSplitQty = splits.reduce((sum, s) => sum + s.qty, 0)
    if (totalSplitQty !== inspectingRet.qty_requested) {
      setInspectError(`Total qty inspeksi (${totalSplitQty}) harus sama dengan qty retur (${inspectingRet.qty_requested})`)
      return
    }

    // Validate expiry dates
    for (const s of splits) {
      if (s.condition === 'LAYAK_JUAL' && !s.isUnknownExpiry && !s.expiryDate) {
        setInspectError('Expiry date wajib diisi untuk Layak Jual (atau centang Tidak Diketahui)')
        return
      }
    }

    setInspectLoading(true)
    
    const payload: ProcessReturnPayload = {
      returnId: inspectingRet.id,
      orderItemId: inspectingRet.order_item_id,
      productId: inspectingRet.order_items.product_id,
      channel: inspectingRet.orders.channel,
      orderId: inspectingRet.order_id,
      items: splits.map(s => ({
        condition: s.condition,
        qty: s.qty,
        expiryDate: s.isUnknownExpiry ? null : s.expiryDate,
        isUnknownExpiry: s.isUnknownExpiry
      }))
    }

    const res = await processReturnInspection(payload)
    setInspectLoading(false)

    if (res.success) {
      setInspectingRet(null)
      fetchReturns() // Refresh list
    } else {
      setInspectError(res.error || 'Gagal memproses inspeksi')
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Undo2 className="text-jade-500" /> Inbox Retur
        </h1>
        <p className="text-slate-500 mt-2">Lakukan inspeksi fisik terhadap barang retur dari pelanggan sebelum dimasukkan ke stok.</p>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button 
          onClick={() => setTab('PENDING')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            tab === 'PENDING'
              ? 'border-jade-600 text-jade-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <PackageSearch size={16} /> Menunggu Inspeksi
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
            tab === 'PENDING' ? 'bg-jade-100 text-jade-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {counts.pending}
          </span>
        </button>

        <button 
          onClick={() => setTab('COMPLETED')}
          className={`pb-3 px-4 font-semibold text-sm transition-colors border-b-2 flex items-center gap-2 ${
            tab === 'COMPLETED'
              ? 'border-jade-600 text-jade-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <History size={16} /> Riwayat Inspeksi
          <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
            tab === 'COMPLETED' ? 'bg-jade-100 text-jade-700' : 'bg-slate-100 text-slate-600'
          }`}>
            {hasActiveFilters ? filteredCompletedReturns.length : counts.completed}
          </span>
        </button>
      </div>

      {/* Filter Bar for Riwayat Inspeksi */}
      {tab === 'COMPLETED' && (
        <div className="bg-white rounded-xl shadow-soft border border-slate-200 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
            {/* 1. Search */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Cari (Order ID/Produk)</span>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Order ID / Produk..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
                />
              </div>
            </label>

            {/* 2. Kanal Dropdown */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Kanal</span>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
              >
                <option value="">Semua Kanal</option>
                <option value="SHOPEE">Shopee</option>
                <option value="TIKTOK">TikTok</option>
                <option value="OFFLINE">Offline</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </label>

            {/* 3. Kondisi Hasil Dropdown */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Kondisi Hasil</span>
              <select
                value={filterCondition}
                onChange={(e) => setFilterCondition(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
              >
                <option value="">Semua Kondisi</option>
                <option value="LAYAK_JUAL">Layak Jual</option>
                <option value="DAMAGED">Rusak</option>
                <option value="LOST">Hilang</option>
              </select>
            </label>

            {/* 4. Dari Tanggal Inspeksi */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Dari Tanggal Inspeksi</span>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
              />
            </label>

            {/* 5. Sampai Tanggal Inspeksi */}
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">
              <span>Sampai Tanggal Inspeksi</span>
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
                {filterChannel && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-md text-xs font-medium">
                    <span>Kanal: {filterChannel}</span>
                    <button onClick={() => setFilterChannel('')} className="hover:text-brick-600"><X size={12} /></button>
                  </span>
                )}
                {filterCondition && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-jade-50 text-jade-800 border border-jade-200 rounded-md text-xs font-medium">
                    <span>Kondisi: {filterCondition === 'LAYAK_JUAL' ? 'Layak Jual' : filterCondition === 'DAMAGED' ? 'Rusak' : 'Hilang'}</span>
                    <button onClick={() => setFilterCondition('')} className="hover:text-brick-600"><X size={12} /></button>
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
                Hasil Filter: {filteredCompletedReturns.length} Baris
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
        {tab === 'PENDING' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Tgl Pengajuan</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Deadline Klaim (TikTok)</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Order ID</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Produk</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700 text-right">Qty</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                      <Activity className="animate-spin mx-auto mb-2" size={24} />
                      Memuat inbox...
                    </td>
                  </tr>
                ) : pendingReturns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400">Tidak ada retur pending.</td>
                  </tr>
                ) : (
                  pendingReturns.map(ret => {
                    const createdAt = new Date(ret.created_at)
                    const deadline = new Date(createdAt.getTime() + (40 * 24 * 60 * 60 * 1000))
                    const daysLeft = Math.ceil((deadline.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
                    const isUrgent = daysLeft <= 5

                    return (
                      <tr key={ret.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-slate-500">{createdAt.toLocaleDateString('id-ID')}</td>
                        <td className="px-5 py-3">
                          {ret.orders?.channel === 'TIKTOK' ? (
                            daysLeft > 0 ? (
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                                isUrgent ? 'bg-brick-50 text-brick-700' : 'bg-jade-50 text-jade-700'
                              }`}>
                                {isUrgent && <AlertCircle size={14} />} Sisa {daysLeft} hari
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 text-xs font-semibold">
                                Hangus
                              </div>
                            )
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-mono text-slate-900 font-medium">{ret.orders?.marketplace_order_id}</div>
                          <div className="mt-1"><ChannelBadge channel={ret.orders?.channel} /></div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 max-w-[200px] truncate" title={ret.order_items?.products?.name}>
                            {ret.order_items?.products?.name}
                          </div>
                          {ret.order_items?.bundle_sku && (
                            <div className="text-xs text-dusty-500 font-mono mt-0.5">Asal Bundle: {ret.order_items?.bundle_sku}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-bold text-slate-700 text-base">{formatQty(ret.qty_requested)}</td>
                        <td className="px-5 py-3">
                          <button 
                            onClick={() => openInspection(ret)}
                            className="px-3 py-1.5 bg-dusty-50 hover:bg-dusty-100 text-dusty-700 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
                          >
                            <PackageSearch size={16} /> Inspeksi
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Tgl Pengajuan</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Tgl Inspeksi</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Order ID</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Produk</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700 text-right">Qty Retur</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Hasil Inspeksi</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-700">Aksi / Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                      <Activity className="animate-spin mx-auto mb-2" size={24} />
                      Memuat riwayat inspeksi...
                    </td>
                  </tr>
                ) : completedReturns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-400">Belum ada riwayat retur yang diinspeksi.</td>
                  </tr>
                ) : filteredCompletedReturns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500 space-y-2">
                      <p className="font-semibold text-slate-700">Tidak ada riwayat retur yang cocok dengan kombinasi filter.</p>
                      <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian, pilihan kanal, kondisi, atau rentang tanggal.</p>
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
                  filteredCompletedReturns.map(ret => {
                    const createdAt = new Date(ret.created_at)
                    const claims = ret.returns_claims || []
                    const ledger = ret.ledger_entries || []
                    
                    let inspectDateStr = '-'
                    if (ledger.length > 0 && ledger[0].created_at) {
                      inspectDateStr = new Date(ledger[0].created_at).toLocaleDateString('id-ID')
                    } else if (claims.length > 0 && claims[0].created_at) {
                      inspectDateStr = new Date(claims[0].created_at).toLocaleDateString('id-ID')
                    }

                    const hasLayak = ledger.length > 0
                    const damagedClaim = claims.find((c: any) => c.condition === 'DAMAGED')
                    const lostClaim = claims.find((c: any) => c.condition === 'LOST')

                    return (
                      <tr key={ret.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 font-mono text-xs text-slate-500">{createdAt.toLocaleDateString('id-ID')}</td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-700 font-medium">{inspectDateStr}</td>
                        <td className="px-5 py-3">
                          <div className="font-mono text-slate-900 font-medium">{ret.orders?.marketplace_order_id}</div>
                          <div className="mt-1"><ChannelBadge channel={ret.orders?.channel} /></div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900 max-w-[200px] truncate" title={ret.order_items?.products?.name}>
                            {ret.order_items?.products?.name}
                          </div>
                          {ret.order_items?.bundle_sku && (
                            <div className="text-xs text-dusty-500 font-mono mt-0.5">Asal Bundle: {ret.order_items?.bundle_sku}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-bold text-slate-700 text-base">{formatQty(ret.qty_requested)}</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-1">
                            {hasLayak && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-jade-50 text-jade-700 border border-jade-200 text-xs font-semibold w-fit">
                                <CheckCircle2 size={13} /> LAYAK JUAL ({ledger.reduce((sum: number, l: any) => sum + (l.qty_delta || 0), 0)} Unit)
                              </div>
                            )}
                            {damagedClaim && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brick-50 text-brick-700 border border-brick-200 text-xs font-semibold w-fit">
                                <AlertCircle size={13} /> RUSAK ({damagedClaim.qty} Unit)
                              </div>
                            )}
                            {lostClaim && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold w-fit">
                                <Info size={13} /> HILANG ({lostClaim.qty} Unit)
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {hasLayak ? (
                            <Link
                              href={`/ledger?ref_id=${ret.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-jade-50 hover:bg-jade-100 text-jade-700 rounded-lg text-xs font-semibold transition-colors"
                            >
                              <ExternalLink size={14} /> Lihat di Ledger
                            </Link>
                          ) : (
                            <div className="text-xs text-slate-500 font-mono italic">
                              Klaim Terdaftar (Tanpa Ledger)
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inspectingRet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-auto max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0 gap-3">
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                  Inspeksi Fisik
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1 truncate max-w-[200px] sm:max-w-[380px]" title={inspectingRet.order_items?.products?.name}>
                  {inspectingRet.order_items?.products?.name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Qty</p>
                <p className="text-2xl sm:text-3xl font-mono font-bold text-slate-900">{formatQty(inspectingRet.qty_requested)}</p>
              </div>
            </div>

            <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1">
              {inspectError && (
                <div className="p-3 bg-brick-50 text-brick-600 border border-brick-200 rounded-lg text-sm flex gap-2">
                  <AlertCircle size={18} className="shrink-0" />
                  {inspectError}
                </div>
              )}

              <div className="space-y-4">
                {splits.map((split, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-3.5 sm:p-4 relative bg-white shadow-sm">
                    {splits.length > 1 && (
                      <button 
                        onClick={() => setSplits(splits.filter((_, i) => i !== idx))}
                        className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 text-slate-400 hover:text-brick-500 transition-colors p-1"
                        title="Hapus baris ini"
                      >
                        <X size={18} />
                      </button>
                    )}
                    
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:pr-8">
                      <label className="flex-1 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                        Kondisi Produk
                        <select 
                          value={split.condition} 
                          onChange={e => {
                            const newSplits = [...splits]; newSplits[idx].condition = e.target.value as any; setSplits(newSplits);
                          }}
                          className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none w-full text-sm"
                        >
                          <option value="LAYAK_JUAL">LAYAK JUAL (Masuk Stok Baru)</option>
                          <option value="DAMAGED">RUSAK (Catat Klaim, Buang)</option>
                          <option value="LOST">HILANG (Catat Klaim)</option>
                        </select>
                      </label>

                      <label className="w-full sm:w-28 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                        Qty
                        <input 
                          type="number" min="1" max={inspectingRet.qty_requested} 
                          value={split.qty} 
                          onChange={e => {
                            const newSplits = [...splits]; newSplits[idx].qty = Number(e.target.value); setSplits(newSplits);
                          }}
                          className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono sm:text-center focus:ring-2 focus:ring-jade-500 focus:outline-none w-full text-sm"
                        />
                      </label>
                    </div>

                    {/* Penjelasan Ringkas Kontekstual per Kondisi */}
                    {split.condition === 'LAYAK_JUAL' && (
                      <p className="text-xs text-jade-800 bg-jade-50/80 px-3 py-2 rounded-lg border border-jade-200 mt-3 font-medium flex items-center gap-1.5 leading-relaxed">
                        <Info size={15} className="shrink-0 text-jade-600" />
                        Barang akan masuk stok lagi sebagai batch baru.
                      </p>
                    )}
                    {split.condition === 'DAMAGED' && (
                      <p className="text-xs text-brick-800 bg-brick-50/80 px-3 py-2 rounded-lg border border-brick-200 mt-3 font-medium flex items-center gap-1.5 leading-relaxed">
                        <Info size={15} className="shrink-0 text-brick-600" />
                        Barang tidak masuk stok lagi (sudah terpotong saat dikirim). Dicatat sebagai kerugian.
                      </p>
                    )}
                    {split.condition === 'LOST' && (
                      <p className="text-xs text-slate-800 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200 mt-3 font-medium flex items-center gap-1.5 leading-relaxed">
                        <Info size={15} className="shrink-0 text-slate-500" />
                        Barang tidak masuk stok lagi (sudah terpotong saat dikirim). Dicatat terpisah dari Rusak karena proses klaimnya beda.
                      </p>
                    )}

                    {split.condition === 'LAYAK_JUAL' && (
                      <div className="mt-4 p-3.5 sm:p-4 bg-honey-50/50 border border-honey-100 rounded-lg space-y-3">
                        <p className="text-xs font-semibold text-honey-800 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertCircle size={14} className="shrink-0" /> Batch Expiry Date (Wajib dibaca dari kemasan)
                        </p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                          <input 
                            type="date" 
                            disabled={split.isUnknownExpiry}
                            value={split.expiryDate}
                            onChange={e => {
                              const newSplits = [...splits]; newSplits[idx].expiryDate = e.target.value; setSplits(newSplits);
                            }}
                            className="border border-slate-300 rounded-lg px-3 py-2 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-jade-500 focus:outline-none text-sm w-full sm:w-auto"
                          />
                          <label className="flex items-start sm:items-center gap-2 text-sm text-slate-700 cursor-pointer select-none leading-snug">
                            <input 
                              type="checkbox" 
                              checked={split.isUnknownExpiry}
                              onChange={e => {
                                const newSplits = [...splits]; newSplits[idx].isUnknownExpiry = e.target.checked; setSplits(newSplits);
                              }}
                              className="w-4 h-4 text-jade-600 rounded border-slate-300 focus:ring-jade-500 mt-0.5 sm:mt-0 shrink-0"
                            />
                            <span>Tanggal kedaluwarsa tidak diketahui</span>
                          </label>
                        </div>
                        {split.isUnknownExpiry && (
                          <p className="text-xs text-brick-600 bg-brick-50 p-2 rounded border border-brick-100 mt-2">
                            *Peringatan: Batch tanpa expiry date akan diprioritaskan PALING ATAS di alokasi FEFO berikutnya.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {splits.reduce((sum, s) => sum + s.qty, 0) < inspectingRet.qty_requested && (
                <button 
                  onClick={() => setSplits([...splits, { condition: 'DAMAGED', qty: 1, expiryDate: '', isUnknownExpiry: false }])}
                  className="w-full p-3 border-2 border-dashed border-slate-300 text-slate-500 hover:text-slate-700 hover:border-slate-400 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 bg-slate-50/50"
                >
                  <Plus size={16} /> Tambah Pecahan Kondisi Lainnya
                </button>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setInspectingRet(null)} 
                  className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition-colors text-sm"
                >
                  Batal
                </button>
                <div className="hidden sm:block flex-1" />
                <button 
                  onClick={handleInspectSubmit} 
                  disabled={inspectLoading} 
                  className="w-full sm:w-auto px-8 py-2.5 bg-jade-600 hover:bg-jade-700 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-soft text-sm"
                >
                  {inspectLoading ? <Activity className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                  Konfirmasi Inspeksi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
