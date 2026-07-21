'use client'

import { useState } from 'react'
import { MarketplaceEvent } from '@/types/marketplace'
import { processMarketplaceEvent } from '@/actions/marketplace'
import { Send, Terminal, CheckCircle2, ServerCrash, Activity } from 'lucide-react'

export default function SimulatedEventSource() {
  const [log, setLog] = useState<{type: 'info' | 'success' | 'error', text: string} | null>(null)
  const [loading, setLoading] = useState(false)

  // Use lazy initializer to prevent hydration/pure render issues with Date.now()
  const [eventData, setEventData] = useState(() => ({
    event_id: `EV-${Date.now()}`,
    channel: 'SHOPEE',
    order_id: `ORD-${Date.now()}`,
    event_type: 'ORDER_CREATED',
    status: '',
    sku: 'SKU-001',
    qty: 1
  }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setLog({type: 'info', text: `Mengirim event ${eventData.event_id}...`})

    const payload: MarketplaceEvent = {
      event_id: eventData.event_id,
      channel: eventData.channel as any,
      order_id: eventData.order_id,
      event_type: eventData.event_type as any,
      status: eventData.status,
      timestamp: new Date().toISOString(),
      items: [{ sku: eventData.sku, qty: Number(eventData.qty) }]
    }

    const res = await processMarketplaceEvent(payload)
    if (res.success) {
      setLog({type: 'success', text: `Sukses: ${res.message}`})
      setEventData(prev => ({ ...prev, event_id: `EV-${Date.now()}` }))
    } else {
      setLog({type: 'error', text: `Gagal: ${res.error}\n${res.details ? JSON.stringify(res.details) : ''}`})
    }
    setLoading(false)
  }

  const generateNewIds = () => {
    setEventData(prev => ({
      ...prev,
      event_id: `EV-${Date.now()}`,
      order_id: `ORD-${Date.now()}`
    }))
  }

  return (
    <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-dusty-100 text-dusty-600 rounded-lg shrink-0">
            <Terminal size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Injeksi Manual</h3>
            <p className="text-xs text-slate-500 mt-0.5">Kirim satu event simulasi webhook secara langsung</p>
          </div>
        </div>
        <button 
          type="button" 
          onClick={generateNewIds}
          className="text-xs text-jade-600 font-semibold hover:underline"
        >
          Generate ID Baru
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="p-5 flex-1 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Event ID
            <input 
              type="text" 
              value={eventData.event_id} 
              onChange={e => setEventData({...eventData, event_id: e.target.value})} 
              required 
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Order ID
            <input 
              type="text" 
              value={eventData.order_id} 
              onChange={e => setEventData({...eventData, order_id: e.target.value})} 
              required 
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Channel
            <select 
              value={eventData.channel} 
              onChange={e => setEventData({...eventData, channel: e.target.value})}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            >
              <option value="SHOPEE">SHOPEE</option>
              <option value="TIKTOK">TIKTOK</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Tipe Event
            <select 
              value={eventData.event_type} 
              onChange={e => setEventData({...eventData, event_type: e.target.value})}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            >
              <option value="ORDER_CREATED">ORDER_CREATED</option>
              <option value="STATUS_UPDATED">STATUS_UPDATED</option>
              <option value="CANCELLED">CANCELLED</option>
              <option value="RETURN_REQUESTED">RETURN_REQUESTED</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Status Order
            <select 
              value={eventData.status} 
              onChange={e => setEventData({...eventData, status: e.target.value})}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
            >
              <option value="">- Kosong -</option>
              <option value="SHIPPED">SHIPPED</option>
              <option value="IN_TRANSIT">IN_TRANSIT</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <label className="col-span-3 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            SKU Produk
            <input 
              type="text" 
              value={eventData.sku} 
              onChange={e => setEventData({...eventData, sku: e.target.value})} 
              required 
              placeholder="Contoh: BUNDLE-GLOW-01"
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono text-sm focus:ring-2 focus:ring-jade-500 focus:outline-none"
            />
          </label>
          <label className="col-span-1 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Qty
            <input 
              type="number" 
              min="1" 
              value={eventData.qty} 
              onChange={e => setEventData({...eventData, qty: Number(e.target.value)})} 
              required 
              className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-center font-mono focus:ring-2 focus:ring-jade-500 focus:outline-none"
            />
          </label>
        </div>

        <button 
          type="submit" 
          disabled={loading} 
          className="mt-auto px-4 py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors shadow-soft flex items-center justify-center gap-2"
        >
          {loading ? <Activity className="animate-spin" size={18} /> : <Send size={18} />} Kirim Payload
        </button>

        {log && (
          <div className={`mt-2 p-3 rounded-lg font-mono text-xs flex gap-2 ${
            log.type === 'success' ? 'bg-jade-50 text-jade-700 border border-jade-200' : 
            log.type === 'error' ? 'bg-brick-50 text-brick-700 border border-brick-200' : 
            'bg-slate-100 text-slate-700 border border-slate-200'
          }`}>
            <span className="shrink-0 mt-0.5">
              {log.type === 'success' ? <CheckCircle2 size={14} /> : 
               log.type === 'error' ? <ServerCrash size={14} /> : 
               <Terminal size={14} />}
            </span>
            <span className="break-all whitespace-pre-wrap">{log.text}</span>
          </div>
        )}
      </form>
    </div>
  )
}
