'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { commitOpnameSession } from '@/actions/opname'
import { CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, ClipboardCheck, Activity, Info, ChevronLeft } from 'lucide-react'
import { formatQty } from '@/utils/format'

export default function OpnameReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const sessionId = resolvedParams.id
  
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [committing, setCommitting] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<any>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const fetchDiffs = async () => {
      const { data: sess } = await supabase.from('opname_sessions').select('*').eq('id', sessionId).single()
      setSessionInfo(sess)

      const { data } = await supabase
        .from('opname_items')
        .select('*, products(name, sku)')
        .eq('session_id', sessionId)
        .neq('difference', 0) // Only fetch discrepancies
      
      if (data) setItems(data)
      setLoading(false)
    }
    fetchDiffs()
  }, [sessionId])

  const handleCommit = async () => {
    setCommitting(true)
    setError('')
    const res = await commitOpnameSession(sessionId)
    if (res.success) {
      setSuccess(res.message || 'Sukses')
    } else {
      setError(res.error || 'Gagal menyimpan hasil opname')
      setCommitting(false)
    }
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
      <Activity className="animate-spin mb-4" size={32} />
      <p>Menganalisis selisih opname...</p>
    </div>
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <button 
              onClick={() => router.push('/opname')}
              className="text-dusty-600 hover:text-jade-600 font-medium text-sm flex items-center gap-1 transition-colors"
            >
              <ChevronLeft size={16} /> Kembali ke Daftar Sesi
            </button>
            {sessionInfo?.status !== 'COMPLETED' && !success && (
              <>
                <span className="text-slate-300">|</span>
                <button 
                  onClick={() => router.push(`/opname/${sessionId}`)}
                  className="text-dusty-600 hover:text-jade-600 font-medium text-sm flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft size={16} /> Edit Form Input
                </button>
              </>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="text-jade-600" /> Review Selisih Opname
          </h1>
          <p className="text-slate-500 mt-2 flex items-center gap-1.5 font-mono text-sm">
            ID Sesi: <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{sessionId.split('-')[0]}</span>
          </p>
        </div>
      </header>

      {error && (
        <div className="p-4 bg-brick-50 border border-brick-200 text-brick-700 rounded-xl flex gap-3 animate-in slide-in-from-top-2">
          <AlertTriangle className="shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold">Konfirmasi Gagal</h3>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}
      
      {success && (
        <div className="p-8 bg-jade-50 border border-jade-200 text-center rounded-2xl animate-in zoom-in-95 duration-300 shadow-soft">
          <CheckCircle2 size={64} className="mx-auto text-jade-500 mb-4" />
          <h2 className="text-2xl font-bold text-jade-900 mb-2">{success}</h2>
          <p className="text-jade-700 mb-8 max-w-lg mx-auto">
            Semua selisih telah berhasil dicatat ke dalam Ledger dengan alasan Koreksi Opname. Saldo sistem sekarang sudah 100% sinkron dengan hitungan fisik lapangan Anda.
          </p>
          <button 
            onClick={() => router.push('/opname')}
            className="px-6 py-3 bg-jade-600 hover:bg-jade-700 text-white rounded-xl font-bold transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <ArrowLeft size={20} /> Kembali ke Daftar Opname
          </button>
        </div>
      )}

      {!success && (
        <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
          {items.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center">
              <div className="w-20 h-20 bg-jade-50 text-jade-500 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Luar Biasa! Tidak ada selisih stok.</h3>
              <p className="text-slate-500 max-w-md mx-auto">
                Semua produk yang dihitung 100% cocok antara sistem dan fisik lapangan. Anda dapat menyelesaikan sesi opname ini tanpa perubahan ledger.
              </p>
            </div>
          ) : (
            <>
              <div className="p-6 bg-brick-50/50 border-b border-slate-100 flex items-start gap-4">
                <div className="p-2 bg-brick-100 text-brick-600 rounded-lg shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-brick-900 text-lg">Ditemukan {items.length} produk dengan selisih!</h3>
                  <p className="text-brick-700 text-sm mt-1">
                    Sistem akan membuat entri "Koreksi Opname" secara otomatis untuk menyinkronkan data. Mohon tinjau tabel di bawah sebelum mengonfirmasi final.
                  </p>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 font-semibold text-slate-700">SKU</th>
                      <th className="px-6 py-4 font-semibold text-slate-700">Nama Produk</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 text-right">Sistem</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 text-right">Fisik</th>
                      <th className="px-6 py-4 font-semibold text-slate-700 text-right">Selisih</th>
                      <th className="px-6 py-4 font-semibold text-slate-700">Tindakan Resolusi Sistem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => {
                      const isSurplus = item.difference > 0
                      return (
                        <tr key={item.id} className={isSurplus ? 'bg-jade-50/30' : 'bg-brick-50/30'}>
                          <td className="px-6 py-4 font-mono text-xs text-slate-500">{item.products?.sku}</td>
                          <td className="px-6 py-4 font-medium text-slate-900">{item.products?.name}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-500">{formatQty(item.system_qty)}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-900 font-bold">{formatQty(item.physical_qty)}</td>
                          <td className={`px-6 py-4 text-right font-mono font-bold text-base ${isSurplus ? 'text-jade-600' : 'text-brick-600'}`}>
                            {isSurplus ? `+${formatQty(item.difference)}` : formatQty(item.difference)}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-start gap-2 text-xs">
                              <Info className={`shrink-0 mt-0.5 ${isSurplus ? 'text-jade-500' : 'text-brick-500'}`} size={14} />
                              <span className="text-slate-600">
                                {isSurplus 
                                  ? 'Batch baru akan diciptakan otomatis dengan tag "opname_surplus" (tanpa expiry).' 
                                  : 'Stok akan dipotong otomatis dari batch terlama menggunakan sistem antrean FEFO.'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {sessionInfo?.status !== 'COMPLETED' && (
            <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button 
                onClick={handleCommit} 
                disabled={committing} 
                className="px-8 py-3 bg-brick-600 hover:bg-brick-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors flex items-center gap-2 shadow-sm"
              >
                {committing ? (
                  <><Activity className="animate-spin" size={20} /> Memproses Resolusi...</>
                ) : (
                  <>Konfirmasi Final & Sesuaikan Ledger <ArrowRight size={20} /></>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
