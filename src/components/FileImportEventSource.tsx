'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { MarketplaceEvent } from '@/types/marketplace'
import { processMarketplaceEvent } from '@/actions/marketplace'
import { UploadCloud, FileText, CheckCircle2, Activity, ServerCrash, Download, HelpCircle, X } from 'lucide-react'

export default function FileImportEventSource() {
  const [logs, setLogs] = useState<{type: 'info' | 'success' | 'error', text: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const handleDownloadSampleCsv = () => {
    const headers = 'event_id,channel,order_id,event_type,status,sku,qty,timestamp'
    const sampleRows = [
      '# 1. Order Shopee (Dikirim: SHIPPED)',
      'EV-SHP-101,SHOPEE,ORD-SHOPEE-001,ORDER_CREATED,,SKU-001,2,2026-07-25T10:00:00Z',
      'EV-SHP-102,SHOPEE,ORD-SHOPEE-001,STATUS_UPDATED,SHIPPED,SKU-001,2,2026-07-25T10:30:00Z',
      '# 2. Order TikTok (Dalam Perjalanan: IN_TRANSIT)',
      'EV-TT-201,TIKTOK,ORD-TIKTOK-002,ORDER_CREATED,,SKU-002,1,2026-07-25T11:00:00Z',
      'EV-TT-202,TIKTOK,ORD-TIKTOK-002,STATUS_UPDATED,IN_TRANSIT,SKU-002,1,2026-07-25T11:45:00Z',
      '# 3. Order Batal Sebelum Dikirim (CANCELLED)',
      'EV-CAN-301,SHOPEE,ORD-CANCEL-003,ORDER_CREATED,,SKU-001,1,2026-07-25T12:00:00Z',
      'EV-CAN-302,SHOPEE,ORD-CANCEL-003,CANCELLED,,SKU-001,1,2026-07-25T12:15:00Z',
      '# 4. Order Retur Diajukan (RETURN_REQUESTED)',
      'EV-RET-401,SHOPEE,ORD-RETURN-004,ORDER_CREATED,,SKU-003,1,2026-07-25T13:00:00Z',
      'EV-RET-402,SHOPEE,ORD-RETURN-004,STATUS_UPDATED,SHIPPED,SKU-003,1,2026-07-25T13:30:00Z',
      'EV-RET-403,SHOPEE,ORD-RETURN-004,RETURN_REQUESTED,,SKU-003,1,2026-07-25T14:00:00Z'
    ].join('\n')
    const csvContent = `${headers}\n${sampleRows}`

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'contoh_import_event_simulasi.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setLogs(prev => [...prev, {type: 'info', text: `Parsing file: ${file.name}`}])

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setLogs(prev => [...prev, {type: 'info', text: `Ditemukan ${results.data.length} baris CSV`}])
        
        // Group rows by order_id (some orders might have multiple items)
        const eventsMap = new Map<string, MarketplaceEvent>()

        for (const row of results.data as any[]) {
          const { event_id, channel, order_id, event_type, status, sku, qty, timestamp } = row
          
          if (!order_id) continue

          if (!eventsMap.has(order_id)) {
            eventsMap.set(order_id, {
              event_id,
              channel: channel as any,
              order_id,
              event_type: event_type as any,
              status,
              items: [],
              timestamp: timestamp || new Date().toISOString()
            })
          }

          if (sku && qty) {
            eventsMap.get(order_id)!.items.push({
              sku,
              qty: parseInt(qty, 10)
            })
          }
        }

        const events = Array.from(eventsMap.values())
        setLogs(prev => [...prev, {type: 'info', text: `Digabung menjadi ${events.length} event unik`}])

        // Process them sequentially for simplicity in testing
        for (const event of events) {
          setLogs(prev => [...prev, {type: 'info', text: `Mengirim: ${event.event_id} (${event.event_type})`}])
          const res = await processMarketplaceEvent(event)
          if (res.success) {
            setLogs(prev => [...prev, {type: 'success', text: `Sukses: ${res.message}`}])
          } else {
            setLogs(prev => [...prev, {type: 'error', text: `Gagal: ${res.error}`}])
          }
        }

        setLoading(false)
        
        // Reset file input
        e.target.value = ''
      }
    })
  }

  const columnGuide = [
    { name: 'event_id', desc: 'ID unik kejadian (bebas, misal: EV-001)' },
    { name: 'channel', desc: 'Kanal penjualan (SHOPEE atau TIKTOK)' },
    { name: 'order_id', desc: 'Nomor pesanan toko (misal: ORD-1001)' },
    { name: 'event_type', desc: 'Jenis kejadian (ORDER_CREATED, STATUS_UPDATED, CANCELLED, RETURN_REQUESTED)' },
    { name: 'status', desc: 'Status pengiriman (SHIPPED untuk Shopee, IN_TRANSIT untuk TikTok, atau kosong jika baru dibuat)' },
    { name: 'sku', desc: 'Kode SKU produk/bundle yang dipesan (misal: SKU-001)' },
    { name: 'qty', desc: 'Jumlah barang yang dipesan (angka, misal: 2)' },
    { name: 'timestamp', desc: 'Waktu kejadian ISO (opsional/otomatis, misal: 2026-07-25T10:00:00Z)' }
  ]

  return (
    <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-jade-100 text-jade-600 rounded-lg shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Import CSV (Batch Events)</h3>
            <p className="text-xs text-slate-500 mt-0.5">Simulasi webhook masal dari laporan Excel/CSV</p>
          </div>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Ringkas Single Line Header Summary */}
        <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700 flex flex-wrap items-center justify-between gap-2">
          <div className="truncate">
            <span className="font-semibold text-slate-800">Format Kolom Header (Wajib): </span>
            <code className="font-mono text-dusty-600">event_id, channel, order_id, event_type, status, sku, qty, timestamp</code>
          </div>
          <button 
            type="button"
            onClick={() => setShowModal(true)}
            className="text-jade-600 hover:text-jade-700 font-bold hover:underline inline-flex items-center gap-1 shrink-0 text-xs"
          >
            <HelpCircle size={14} /> Lihat keterangan tiap kolom
          </button>
        </div>
        
        <label className={`
          flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-colors
          ${loading ? 'bg-slate-50 border-slate-300 opacity-50 cursor-not-allowed' : 'bg-slate-50 border-jade-300 hover:bg-jade-50/50 hover:border-jade-400'}
        `}>
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            {loading ? (
              <Activity className="w-8 h-8 text-jade-500 mb-3 animate-spin" />
            ) : (
              <UploadCloud className="w-8 h-8 text-jade-500 mb-3" />
            )}
            <p className="mb-1 text-sm text-slate-600 font-semibold">
              {loading ? 'Memproses File...' : 'Klik untuk upload CSV'}
            </p>
            <p className="text-xs text-slate-500">Maksimal 10MB</p>
          </div>
          <input type="file" accept=".csv" onChange={handleFileUpload} disabled={loading} className="hidden" />
        </label>
        
        {logs.length > 0 && (
          <div className="mt-2 flex-1 max-h-48 overflow-y-auto bg-slate-900 rounded-xl p-4 font-mono text-xs flex flex-col gap-1.5 shadow-inner">
            {logs.map((log, i) => (
              <div key={i} className={`flex gap-2 ${
                log.type === 'success' ? 'text-jade-400' : 
                log.type === 'error' ? 'text-brick-400' : 
                'text-slate-300'
              }`}>
                <span className="shrink-0">
                  {log.type === 'success' ? <CheckCircle2 size={14} /> : 
                   log.type === 'error' ? <ServerCrash size={14} /> : 
                   <span className="text-slate-500">&gt;</span>}
                </span>
                <span className="break-all">{log.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Keterangan & Download Sample CSV */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <HelpCircle className="text-jade-600" size={20} />
                <h3 className="font-bold text-slate-900 text-base">Panduan Format Header CSV</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between bg-jade-50/70 border border-jade-200 p-3.5 rounded-xl gap-4">
                <div className="text-xs text-jade-800">
                  <p className="font-bold text-sm">Download File Contoh CSV (4 Skenario)</p>
                  <p className="text-[11px] text-jade-700 mt-0.5 leading-relaxed">
                    Mencakup 4 skenario pesanan nyata: Shopee shipped, TikTok in-transit, cancelled (batal), & return (retur diajukan).
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="px-4 py-2 bg-jade-600 hover:bg-jade-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Download size={14} /> Download Contoh CSV
                </button>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2">Penjelasan Kolom Header (Wajib):</h4>
                <div className="space-y-2">
                  {columnGuide.map(col => (
                    <div key={col.name} className="flex flex-col sm:flex-row sm:items-center gap-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                      <code className="font-mono font-bold text-dusty-700 bg-white px-2 py-0.5 rounded border border-slate-200 w-fit shrink-0">
                        {col.name}
                      </code>
                      <span className="text-slate-600 sm:ml-2">&rarr; {col.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
