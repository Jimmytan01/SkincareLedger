'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { processReturnInspection, ProcessReturnPayload } from '@/actions/returns'
import { Undo2, AlertCircle, Activity, CheckCircle, PackageSearch, X, Plus } from 'lucide-react'

export default function ReturnsInboxPage() {
  const [returns, setReturns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [inspectingRet, setInspectingRet] = useState<any>(null)
  const [splits, setSplits] = useState<{ condition: any, qty: number, expiryDate: string, isUnknownExpiry: boolean }[]>([])
  const [inspectError, setInspectError] = useState('')
  const [inspectLoading, setInspectLoading] = useState(false)

  const supabase = createClient()

  const fetchReturns = async () => {
    setLoading(true)
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
      setReturns(sorted)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchReturns()
  }, [])

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
          <Undo2 className="text-jade-500" /> Inbox Retur Gudang
        </h1>
        <p className="text-slate-500 mt-2">Lakukan inspeksi fisik terhadap barang retur dari pelanggan sebelum dimasukkan ke stok.</p>
      </header>

      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
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
              ) : returns.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">Tidak ada retur pending.</td>
                </tr>
              ) : (
                returns.map(ret => {
                  const createdAt = new Date(ret.created_at)
                  const deadline = new Date(createdAt.getTime() + (40 * 24 * 60 * 60 * 1000))
                  const daysLeft = Math.ceil((deadline.getTime() - new Date().getTime()) / (1000 * 3600 * 24))
                  const isUrgent = daysLeft <= 5

                  return (
                    <tr key={ret.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-slate-500">{createdAt.toLocaleDateString('id-ID')}</td>
                      <td className="px-5 py-3">
                        {daysLeft > 0 ? (
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                            isUrgent ? 'bg-brick-50 text-brick-700' : 'bg-jade-50 text-jade-700'
                          }`}>
                            {isUrgent && <AlertCircle size={14} />} Sisa {daysLeft} hari
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 text-xs font-semibold">
                            Hangus
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-mono text-slate-900 font-medium">{ret.orders?.marketplace_order_id}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{ret.orders?.channel}</div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900 max-w-[200px] truncate" title={ret.order_items?.products?.name}>
                          {ret.order_items?.products?.name}
                        </div>
                        {ret.order_items?.bundle_sku && (
                          <div className="text-xs text-dusty-500 font-mono mt-0.5">Asal Bundle: {ret.order_items?.bundle_sku}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right font-mono font-bold text-slate-700 text-base">{ret.qty_requested}</td>
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
      </div>

      {inspectingRet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-auto animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  Inspeksi Fisik
                </h2>
                <p className="text-sm text-slate-500 mt-1 max-w-[400px] truncate" title={inspectingRet.order_items?.products?.name}>
                  {inspectingRet.order_items?.products?.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Qty</p>
                <p className="text-3xl font-mono font-bold text-slate-900">{inspectingRet.qty_requested}</p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {inspectError && (
                <div className="p-3 bg-brick-50 text-brick-600 border border-brick-200 rounded-lg text-sm flex gap-2">
                  <AlertCircle size={18} className="shrink-0" />
                  {inspectError}
                </div>
              )}

              <div className="space-y-4">
                {splits.map((split, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4 relative bg-white shadow-sm">
                    {splits.length > 1 && (
                      <button 
                        onClick={() => setSplits(splits.filter((_, i) => i !== idx))}
                        className="absolute top-4 right-4 text-slate-400 hover:text-brick-500 transition-colors p-1"
                        title="Hapus baris ini"
                      >
                        <X size={18} />
                      </button>
                    )}
                    
                    <div className="flex gap-4 pr-8">
                      <label className="flex-1 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                        Kondisi Produk
                        <select 
                          value={split.condition} 
                          onChange={e => {
                            const newSplits = [...splits]; newSplits[idx].condition = e.target.value as any; setSplits(newSplits);
                          }}
                          className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
                        >
                          <option value="LAYAK_JUAL">LAYAK JUAL (Masuk Stok Baru)</option>
                          <option value="DAMAGED">RUSAK (Catat Klaim, Buang)</option>
                          <option value="LOST">HILANG (Catat Klaim)</option>
                        </select>
                      </label>

                      <label className="w-24 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                        Qty
                        <input 
                          type="number" min="1" max={inspectingRet.qty_requested} 
                          value={split.qty} 
                          onChange={e => {
                            const newSplits = [...splits]; newSplits[idx].qty = Number(e.target.value); setSplits(newSplits);
                          }}
                          className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono text-center focus:ring-2 focus:ring-jade-500 focus:outline-none"
                        />
                      </label>
                    </div>

                    {split.condition === 'LAYAK_JUAL' && (
                      <div className="mt-4 p-4 bg-honey-50/50 border border-honey-100 rounded-lg space-y-3">
                        <p className="text-xs font-semibold text-honey-800 uppercase tracking-wider flex items-center gap-1.5">
                          <AlertCircle size={14} /> Batch Expiry Date (Wajib dibaca dari kemasan)
                        </p>
                        <div className="flex items-center gap-4">
                          <input 
                            type="date" 
                            disabled={split.isUnknownExpiry}
                            value={split.expiryDate}
                            onChange={e => {
                              const newSplits = [...splits]; newSplits[idx].expiryDate = e.target.value; setSplits(newSplits);
                            }}
                            className="border border-slate-300 rounded-lg px-3 py-2 bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-jade-500 focus:outline-none text-sm"
                          />
                          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={split.isUnknownExpiry}
                              onChange={e => {
                                const newSplits = [...splits]; newSplits[idx].isUnknownExpiry = e.target.checked; setSplits(newSplits);
                              }}
                              className="w-4 h-4 text-jade-600 rounded border-slate-300 focus:ring-jade-500"
                            />
                            Tanggal kedaluwarsa tidak diketahui
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

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  onClick={() => setInspectingRet(null)} 
                  className="px-6 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold transition-colors"
                >
                  Batal
                </button>
                <div className="flex-1" />
                <button 
                  onClick={handleInspectSubmit} 
                  disabled={inspectLoading} 
                  className="px-8 py-2.5 bg-jade-600 hover:bg-jade-700 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-soft"
                >
                  {inspectLoading ? <Activity className="animate-spin" size={18} /> : <CheckCircle size={18} />}
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
