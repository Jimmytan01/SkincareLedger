'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/client'
import { resolveAnomaly } from '@/actions/anomalies'
import ChannelBadge from '@/components/ChannelBadge'
import { formatQty } from '@/utils/format'
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
  Tag
} from 'lucide-react'

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN')
  const [counts, setCounts] = useState({ open: 0, resolved: 0 })

  const [productsMap, setProductsMap] = useState<Map<string, any>>(new Map())
  const [ordersMap, setOrdersMap] = useState<Map<string, any>>(new Map())
  const [batchesMap, setBatchesMap] = useState<Map<string, string>>(new Map())

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolvingLoading, setResolvingLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

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

  const getAnomalyMeta = (type: string) => {
    const map: Record<string, { label: string; bg: string; text: string; border: string }> = {
      NEGATIVE_BALANCE_ATTEMPT: {
        label: 'Percobaan Transaksi Ditolak (Stok Kurang)',
        bg: 'bg-brick-50',
        text: 'text-brick-700',
        border: 'border-brick-200'
      },
      NEGATIVE_BALANCE_DETECTED: {
        label: 'Saldo Batch Negatif Terdeteksi',
        bg: 'bg-brick-50',
        text: 'text-brick-700',
        border: 'border-brick-200'
      },
      STALE_ORDER: {
        label: 'Pesanan Menggantung (>3 Hari)',
        bg: 'bg-honey-50',
        text: 'text-honey-800',
        border: 'border-honey-200'
      },
      MISSING_LEDGER: {
        label: 'Order Diproses Tanpa Pencatatan Ledger',
        bg: 'bg-brick-50',
        text: 'text-brick-700',
        border: 'border-brick-200'
      }
    }

    return map[type] || {
      label: type.replace(/_/g, ' '),
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200'
    }
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
            {counts.resolved}
          </span>
        </button>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
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
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <Activity className="animate-spin mx-auto mb-2 text-jade-500" size={24} />
                    Memuat worklist anomali...
                  </td>
                </tr>
              ) : anomalies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    <Inbox className="mx-auto mb-2 text-slate-300" size={32} />
                    Tidak ada anomali berstatus <strong className="text-slate-600">{filter === 'OPEN' ? 'Terbuka' : 'Selesai'}</strong>.
                  </td>
                </tr>
              ) : (
                anomalies.map(a => {
                  const meta = getAnomalyMeta(a.type)
                  const product = a.related_ids?.product_id ? productsMap.get(a.related_ids.product_id) : null
                  const order = a.related_ids?.order_id ? ordersMap.get(a.related_ids.order_id) : null
                  const qtyNeeded = a.related_ids?.qty_needed ?? a.related_ids?.qty
                  const rawBatchId = a.related_ids?.batch_id
                  const batchCode = rawBatchId ? (batchesMap.get(rawBatchId) || rawBatchId) : null

                  // Build Ledger Filter URL
                  const ledgerParams = new URLSearchParams()
                  if (product?.id) ledgerParams.set('product_id', product.id)
                  if (rawBatchId) ledgerParams.set('batch_id', rawBatchId)
                  if (a.related_ids?.order_id) ledgerParams.set('ref_id', a.related_ids.order_id)
                  const ledgerUrl = `/ledger?${ledgerParams.toString()}`

                  return (
                    <tr 
                      key={a.id} 
                      className={`hover:bg-slate-50 transition-colors ${filter === 'OPEN' ? 'bg-brick-50/20' : ''}`}
                    >
                      {/* Waktu Deteksi */}
                      <td className="px-5 py-3.5 align-top">
                        <div className="font-mono text-xs text-slate-700 font-semibold flex items-center gap-1.5">
                          <Clock size={14} className="text-slate-400" />
                          {new Date(a.detected_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </td>

                      {/* Tipe Anomali (Teks bahasa Indonesia bersih tanpa subtext enum) */}
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

                      {/* Aksi (If OPEN) */}
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

      {/* Modal Penyelesaian Anomali */}
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
    </div>
  )
}
