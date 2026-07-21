'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { MarketplaceEvent } from '@/types/marketplace'
import { processMarketplaceEvent } from '@/actions/marketplace'
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Activity, ServerCrash } from 'lucide-react'

export default function FileImportEventSource() {
  const [logs, setLogs] = useState<{type: 'info' | 'success' | 'error', text: string}[]>([])
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
        <div className="p-2 bg-jade-100 text-jade-600 rounded-lg shrink-0">
          <FileText size={20} />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">Import CSV (Batch Events)</h3>
          <p className="text-xs text-slate-500 mt-0.5">Simulasi webhook masal dari laporan Excel/CSV</p>
        </div>
      </div>
      
      <div className="p-5 flex-1 flex flex-col gap-4">
        <div className="text-xs bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-600">
          <p className="font-semibold mb-1">Format Kolom Header (Wajib):</p>
          <code className="font-mono text-dusty-600 break-words">event_id, channel, order_id, event_type, status, sku, qty, timestamp</code>
        </div>
        
        <label className={`
          flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-colors
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
    </div>
  )
}
