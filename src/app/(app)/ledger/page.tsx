'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/utils/supabase/client'
import { commitCorrection } from '@/actions/manual'
import { Search, Filter, ChevronLeft, ChevronRight, Activity, ArrowRightLeft, FileSpreadsheet, AlertCircle, BookOpen } from 'lucide-react'

const PAGE_SIZE = 20

export default function LedgerPage() {
  const [ledger, setLedger] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  
  // Filters
  const [filterReason, setFilterReason] = useState('')
  const [filterChannel, setFilterChannel] = useState('')

  // Correction Modal
  const [correctingRow, setCorrectingRow] = useState<any>(null)
  const [correctionIdempKey, setCorrectionIdempKey] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctionError, setCorrectionError] = useState('')
  const [correctionLoading, setCorrectionLoading] = useState(false)

  // Drilldown Modal
  const [drilldownRef, setDrilldownRef] = useState<string | null>(null)
  const [drilldownData, setDrilldownData] = useState<any[]>([])
  const [drilldownLoading, setDrilldownLoading] = useState(false)

  const supabase = createClient()

  const fetchLedger = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('stock_ledger')
      .select('*, products(name, sku), batches(batch_code)', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (filterReason) query = query.eq('reason_code', filterReason)
    if (filterChannel) query = query.eq('channel', filterChannel)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    query = query.range(from, to)

    const { data, count } = await query
    
    if (data) setLedger(data)
    if (count !== null) setTotalCount(count)
    setLoading(false)
  }, [page, filterReason, filterChannel])

  useEffect(() => {
    fetchLedger()
  }, [fetchLedger])

  const openDrilldown = async (sourceRefId: string) => {
    if (!sourceRefId) return
    setDrilldownRef(sourceRefId)
    setDrilldownLoading(true)
    const { data } = await supabase
      .from('stock_ledger')
      .select('*, products(name, sku), batches(batch_code)')
      .eq('source_ref_id', sourceRefId)
      .order('created_at', { ascending: false })
    
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

  const translateReason = (reason: string) => {
    const map: Record<string, string> = {
      SALE: 'Penjualan',
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
        <p className="text-slate-500 mt-2">Pusat kebenaran (*Single Source of Truth*) mutasi stok gudang Anda.</p>
      </header>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-soft border border-slate-200 flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Alasan Mutasi (Reason)
          <select 
            className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            value={filterReason} 
            onChange={(e) => { setFilterReason(e.target.value); setPage(1); }}
          >
            <option value="">Semua Alasan</option>
            <option value="SALE">Penjualan</option>
            <option value="RETURN_IN">Retur Masuk</option>
            <option value="OPNAME_CORRECTION">Koreksi Opname</option>
            <option value="MANUAL_CORRECTION">Koreksi Manual</option>
            <option value="CANCEL_REVERSAL">Pembatalan</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
          Kanal (Channel)
          <select 
            className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            value={filterChannel} 
            onChange={(e) => { setFilterChannel(e.target.value); setPage(1); }}
          >
            <option value="">Semua Kanal</option>
            <option value="SHOPEE">Shopee</option>
            <option value="TIKTOK">TikTok</option>
            <option value="OFFLINE">Offline</option>
            <option value="INTERNAL">Internal</option>
          </select>
        </label>
        
        <div className="flex-1" />
        <div className="text-sm text-slate-500 font-mono bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200">
          Total Baris: {totalCount}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Waktu (WIB)</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Produk</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Batch</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700 text-right">Delta</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Alasan</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Kanal</th>
                <th className="px-5 py-3.5 font-semibold text-slate-700">Referensi / Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    <Activity className="animate-spin mx-auto mb-2" size={24} />
                    Memuat buku besar...
                  </td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">Tidak ada riwayat mutasi.</td>
                </tr>
              ) : (
                ledger.map(row => (
                  <tr 
                    key={row.id} 
                    className={`hover:bg-slate-50 transition-colors ${
                      row.reason_code === 'MANUAL_CORRECTION' ? 'bg-honey-50/30' : 
                      row.reason_code === 'OPNAME_CORRECTION' ? 'bg-jade-50/30' : ''
                    }`}
                  >
                    <td className="px-5 py-3 font-mono text-xs">{new Date(row.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-900">{row.products?.name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">{row.products?.sku}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{row.batches?.batch_code}</td>
                    <td className={`px-5 py-3 text-right font-mono font-bold text-base ${row.qty_delta < 0 ? 'text-brick-600' : 'text-jade-600'}`}>
                      {row.qty_delta > 0 ? '+' : ''}{row.qty_delta}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${
                        row.qty_delta < 0 ? 'bg-brick-50 text-brick-700' : 'bg-jade-50 text-jade-700'
                      }`}>
                        {translateReason(row.reason_code)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs">{row.channel}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => openDrilldown(row.source_ref_id)}
                          className="font-mono text-xs text-dusty-600 hover:text-jade-600 hover:underline truncate max-w-[120px]"
                          title="Klik untuk melihat grup transaksi ini"
                        >
                          {row.source_ref_id ? row.source_ref_id.split('-')[0] + '...' : '-'}
                        </button>
                        
                        {row.qty_delta < 0 && row.reason_code !== 'CANCEL_REVERSAL' && row.reason_code !== 'MANUAL_CORRECTION' && (
                          <button 
                            onClick={() => {
                              setCorrectingRow(row)
                              setCorrectionIdempKey(`CORRECTION-${row.id}-${Date.now()}`)
                            }}
                            className="px-2 py-1 bg-honey-100 text-honey-700 hover:bg-honey-200 rounded text-xs font-semibold transition-colors"
                          >
                            Koreksi
                          </button>
                        )}
                      </div>
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
                onClick={() => setDrilldownRef(null)}
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
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-5 py-3 font-mono text-xs">{new Date(row.created_at).toLocaleTimeString('id-ID')}</td>
                        <td className="px-5 py-3 font-medium text-slate-900">{row.products?.name}</td>
                        <td className="px-5 py-3 font-mono text-xs">{row.batches?.batch_code}</td>
                        <td className={`px-5 py-3 text-right font-mono font-bold ${row.qty_delta < 0 ? 'text-brick-600' : 'text-jade-600'}`}>
                          {row.qty_delta > 0 ? '+' : ''}{row.qty_delta}
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
                Anda akan mengembalikan stok <strong>{Math.abs(correctingRow.qty_delta)} unit</strong> ke batch <span className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded border border-slate-200">{correctingRow.batches?.batch_code}</span>. 
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
