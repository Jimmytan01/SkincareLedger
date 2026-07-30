'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { startOpnameSession } from '@/actions/opname'
import { ClipboardCheck, Play, ArrowRight, Eye, Activity, CheckCircle2 } from 'lucide-react'

export default function OpnameListPage() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const fetchSessions = async () => {
      const { data } = await supabase
        .from('opname_sessions')
        .select('*')
        .order('started_at', { ascending: false })
      if (data) setSessions(data)
      setLoading(false)
    }
    fetchSessions()
  }, [])

  const handleStart = async () => {
    setStarting(true)
    const res = await startOpnameSession()
    if (res.success) {
      router.push(`/opname/${res.sessionId}`)
    } else {
      alert(res.error)
      setStarting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="text-jade-500" /> Stok Opname
          </h1>
          <p className="text-slate-500 mt-2">Hitung fisik stok gudang dan sinkronisasikan selisih secara otomatis.</p>
        </div>
        <button 
          onClick={handleStart} 
          disabled={starting}
          className="px-6 py-2.5 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-soft"
        >
          {starting ? (
            <><Activity className="animate-spin" size={18} /> Memulai Sesi...</>
          ) : (
            <><Play size={18} fill="currentColor" /> Mulai Sesi Baru</>
          )}
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-700">Riwayat Sesi Opname</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">ID Sesi</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Waktu Mulai (WIB)</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Waktu Selesai</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Memuat riwayat sesi...</td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400">Belum ada sesi opname. Mulai sesi pertama Anda!</td>
                </tr>
              ) : (
                sessions.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-xs text-dusty-600">{s.id.split('-')[0]}</td>
                    <td className="px-6 py-4 font-mono text-xs">{new Date(s.started_at).toLocaleString('id-ID')}</td>
                    <td className="px-6 py-4">
                      {s.status === 'COMPLETED' ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-jade-50 text-jade-700 text-xs font-semibold">
                          <CheckCircle2 size={14} /> Selesai
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
                          <Activity size={14} className="animate-spin text-slate-500" /> Sedang Berlangsung
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-500">
                      {s.completed_at ? new Date(s.completed_at).toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {s.status === 'IN_PROGRESS' ? (
                        <button 
                          onClick={() => router.push(`/opname/${s.id}`)}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
                        >
                          Lanjutkan <ArrowRight size={16} />
                        </button>
                      ) : (
                        <button 
                          onClick={() => router.push(`/opname/${s.id}/review`)}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <Eye size={16} /> Lihat Hasil
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
