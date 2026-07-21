'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { resolveAnomaly } from '@/actions/anomalies'

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED'>('OPEN')

  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [resolvingLoading, setResolvingLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  const fetchAnomalies = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('anomalies')
      .select('*')
      .eq('status', filter)
      .order('detected_at', { ascending: false })
    
    if (data) setAnomalies(data)
    setLoading(false)
  }

  useEffect(() => {
    fetchAnomalies()
  }, [filter])

  const handleResolveSubmit = async () => {
    if (!resolvingId) return
    setError('')
    setResolvingLoading(true)
    const res = await resolveAnomaly(resolvingId, resolutionNote)
    setResolvingLoading(false)

    if (res.success) {
      setResolvingId(null)
      setResolutionNote('')
      fetchAnomalies() // Refresh
    } else {
      setError(res.error || 'Terjadi kesalahan')
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Worklist Anomali (M6)</h1>
      <a href="/" style={{ color: 'blue', textDecoration: 'underline' }}>&larr; Back to Dashboard</a>

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
        <button 
          onClick={() => setFilter('OPEN')}
          style={{ padding: '0.5rem 1rem', backgroundColor: filter === 'OPEN' ? '#ef4444' : '#e5e7eb', color: filter === 'OPEN' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Open Anomalies
        </button>
        <button 
          onClick={() => setFilter('RESOLVED')}
          style={{ padding: '0.5rem 1rem', backgroundColor: filter === 'RESOLVED' ? '#10b981' : '#e5e7eb', color: filter === 'RESOLVED' ? 'white' : 'black', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Resolved
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#f3f4f6', textAlign: 'left' }}>
            <th style={{ padding: '0.75rem', borderBottom: '2px solid #d1d5db' }}>Waktu Deteksi</th>
            <th style={{ padding: '0.75rem', borderBottom: '2px solid #d1d5db' }}>Tipe Anomali</th>
            <th style={{ padding: '0.75rem', borderBottom: '2px solid #d1d5db' }}>Deskripsi</th>
            <th style={{ padding: '0.75rem', borderBottom: '2px solid #d1d5db' }}>ID Terkait</th>
            {filter === 'RESOLVED' && <th style={{ padding: '0.75rem', borderBottom: '2px solid #d1d5db' }}>Catatan Resolusi</th>}
            {filter === 'OPEN' && <th style={{ padding: '0.75rem', borderBottom: '2px solid #d1d5db' }}>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center' }}>Loading...</td></tr>
          ) : anomalies.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: '1rem', textAlign: 'center' }}>Tidak ada data anomali {filter}.</td></tr>
          ) : anomalies.map(a => (
            <tr key={a.id} style={{ backgroundColor: filter === 'OPEN' ? '#fef2f2' : 'white' }}>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{new Date(a.detected_at).toLocaleString('id-ID')}</td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', fontWeight: 'bold' }}>{a.type}</td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{a.description}</td>
              <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                <pre style={{ fontSize: '0.75rem', margin: 0 }}>{JSON.stringify(a.related_ids, null, 2)}</pre>
              </td>
              {filter === 'RESOLVED' && (
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{a.resolution_note}</td>
              )}
              {filter === 'OPEN' && (
                <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                  <button onClick={() => setResolvingId(a.id)} style={{ padding: '0.25rem 0.5rem', backgroundColor: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Tandai Selesai
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {resolvingId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '8px', maxWidth: '500px', width: '100%' }}>
            <h2>Selesaikan Anomali</h2>
            <p style={{ fontSize: '0.875rem', color: '#4b5563', marginBottom: '1rem' }}>
              Anomali ini tidak akan terhapus, melainkan ditandai selesai (Resolved) untuk keperluan audit.
            </p>
            
            {error && <div style={{ color: 'red', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              Catatan Resolusi (Wajib):
              <textarea 
                value={resolutionNote} 
                onChange={e => setResolutionNote(e.target.value)} 
                required
                style={{ width: '100%', padding: '0.5rem', height: '80px' }}
                placeholder="Misal: Sudah cross-check dengan Shopee, order memang stuck di logistik. Menunggu investigasi lebih lanjut."
              />
            </label>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button onClick={() => setResolvingId(null)} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#9ca3af', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Batal
              </button>
              <button onClick={handleResolveSubmit} disabled={resolvingLoading} style={{ flex: 1, padding: '0.5rem', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                {resolvingLoading ? 'Menyimpan...' : 'Simpan & Selesai'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
