'use client'

import { useState, useEffect } from 'react'
import { MarketplaceEvent } from '@/types/marketplace'
import { processMarketplaceEvent, getProductsAndBundlesForSimulation, getSimulationOrders } from '@/actions/marketplace'
import { Send, Terminal, CheckCircle2, ServerCrash, Activity, Info, RefreshCw, Lock } from 'lucide-react'

interface OrderItemOption {
  id: string
  sku: string
  name: string
  originalQty: number
  sisaKuota: number
  label: string
}

interface ExistingOrder {
  id: string
  marketplace_order_id: string
  channel: string
  status: string
  sku: string
  qty: number
  label: string
  items: OrderItemOption[]
}

export default function SimulatedEventSource() {
  const [log, setLog] = useState<{type: 'info' | 'success' | 'error', text: string} | null>(null)
  const [loading, setLoading] = useState(false)

  const [productOptions, setProductOptions] = useState<{ sku: string; label: string; isBundle?: boolean }[]>([])
  const [existingOrders, setExistingOrders] = useState<ExistingOrder[]>([])
  const [fetchingData, setFetchingData] = useState(true)

  const [eventData, setEventData] = useState(() => ({
    event_id: `EV-${Date.now()}`,
    channel: 'SHOPEE',
    order_id: `ORD-${Date.now()}`,
    event_type: 'ORDER_CREATED',
    status: '',
    sku: '',
    qty: 1
  }))

  const loadDropdownData = async () => {
    setFetchingData(true)
    try {
      const [prods, ords] = await Promise.all([
        getProductsAndBundlesForSimulation(),
        getSimulationOrders()
      ])
      setProductOptions(prods)
      setExistingOrders(ords)

      if (prods.length > 0 && !eventData.sku) {
        setEventData(prev => ({ ...prev, sku: prods[0].sku }))
      }
    } catch (err) {
      console.error('Error loading simulation dropdown data:', err)
    } finally {
      setFetchingData(false)
    }
  }

  useEffect(() => {
    loadDropdownData()
  }, [])

  // Derived state: available SKUs & Event types
  const isOrderCreated = eventData.event_type === 'ORDER_CREATED'
  const isStatusUpdated = eventData.event_type === 'STATUS_UPDATED'
  const isItemScopedEvent = eventData.event_type === 'CANCELLED' || eventData.event_type === 'RETURN_REQUESTED'

  // Filter orders available for selection based on Event Type
  const validExistingOrders = existingOrders.filter(o => {
    if (isItemScopedEvent) {
      // Exclude whole-cancelled orders or orders where all items have sisaKuota = 0
      return o.status !== 'CANCELLED' && o.items.some(item => item.sisaKuota > 0)
    }
    if (isStatusUpdated) {
      // Exclude already cancelled or already shipped orders
      return o.status === 'CREATED'
    }
    return true
  })

  // Derived state: currently selected order object
  const selectedOrder = validExistingOrders.find(o => o.marketplace_order_id === eventData.order_id) || validExistingOrders[0]

  // Filter order items: for CANCELLED/RETURN_REQUESTED, only show items with sisaKuota > 0
  const orderItemsForSelectedOrder: OrderItemOption[] = isItemScopedEvent
    ? (selectedOrder?.items || []).filter(item => item.sisaKuota > 0)
    : (selectedOrder?.items || [])

  // Max quantity allowed for the selected SKU (for CANCELLED / RETURN_REQUESTED)
  const selectedItemOption = orderItemsForSelectedOrder.find(item => item.sku === eventData.sku) || orderItemsForSelectedOrder[0]
  const maxQtyAllowed = isItemScopedEvent ? (selectedItemOption?.sisaKuota || 0) : 99999

  // Handle Event Type Change
  const handleEventTypeChange = (newType: string) => {
    const isNewOrder = newType === 'ORDER_CREATED'
    const isScoped = newType === 'CANCELLED' || newType === 'RETURN_REQUESTED'
    
    setEventData(prev => {
      let nextOrderId = prev.order_id
      let nextChannel = prev.channel
      let nextSku = prev.sku
      let nextQty = prev.qty

      const availableOrders = existingOrders.filter(o => {
        if (isScoped) return o.status !== 'CANCELLED' && o.items.some(item => item.sisaKuota > 0)
        if (newType === 'STATUS_UPDATED') return o.status === 'CREATED'
        return true
      })

      if (isNewOrder) {
        // Auto generate new Order ID for ORDER_CREATED
        nextOrderId = `ORD-${Date.now()}`
        nextSku = productOptions[0]?.sku || ''
        nextQty = 1
      } else if (availableOrders.length > 0) {
        const selected = availableOrders[0]
        nextOrderId = selected.marketplace_order_id
        nextChannel = selected.channel
        
        if (isScoped) {
          const validItems = selected.items.filter(i => i.sisaKuota > 0)
          const firstItem = validItems[0]
          nextSku = firstItem?.sku || ''
          nextQty = Math.min(1, firstItem?.sisaKuota || 1)
        }
      }

      // Auto derive status for STATUS_UPDATED
      let nextStatus = ''
      if (newType === 'STATUS_UPDATED') {
        nextStatus = nextChannel === 'TIKTOK' ? 'IN_TRANSIT' : 'SHIPPED'
      }

      return {
        ...prev,
        event_type: newType,
        order_id: nextOrderId,
        channel: nextChannel,
        sku: nextSku,
        qty: nextQty,
        status: nextStatus
      }
    })
  }

  // Handle Order Selection for Follow-up Events
  const handleSelectExistingOrder = (mktOrderId: string) => {
    const found = validExistingOrders.find(o => o.marketplace_order_id === mktOrderId)
    if (found) {
      const validItems = isItemScopedEvent ? found.items.filter(i => i.sisaKuota > 0) : found.items
      const firstItem = validItems[0]
      setEventData(prev => ({
        ...prev,
        order_id: found.marketplace_order_id,
        channel: found.channel,
        sku: firstItem?.sku || prev.sku,
        qty: Math.min(1, firstItem?.sisaKuota || 1),
        status: prev.event_type === 'STATUS_UPDATED' ? (found.channel === 'TIKTOK' ? 'IN_TRANSIT' : 'SHIPPED') : ''
      }))
    }
  }

  // Handle Item Selection for CANCELLED / RETURN_REQUESTED
  const handleSelectItem = (sku: string) => {
    const item = orderItemsForSelectedOrder.find(i => i.sku === sku)
    const maxVal = item?.sisaKuota || 1
    setEventData(prev => ({
      ...prev,
      sku,
      qty: Math.min(prev.qty, maxVal)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Check validation for follow-up event when no valid orders exist
    if (!isOrderCreated && (!eventData.order_id || validExistingOrders.length === 0)) {
      setLog({
        type: 'error',
        text: 'Gagal: Belum ada order terdaftar yang dapat diproses untuk tipe event ini.'
      })
      return
    }

    // Auto-derive status for STATUS_UPDATED
    const finalStatus = isStatusUpdated 
      ? (eventData.channel === 'TIKTOK' ? 'IN_TRANSIT' : 'SHIPPED') 
      : eventData.status

    const finalSku = isStatusUpdated ? (productOptions[0]?.sku || 'SKU-001') : eventData.sku

    if (isItemScopedEvent && Number(eventData.qty) > maxQtyAllowed) {
      setLog({
        type: 'error',
        text: `Gagal: Kuantitas (${eventData.qty}) melebihi sisa kuota item di order (${maxQtyAllowed}).`
      })
      return
    }

    setLoading(true)
    setLog({type: 'info', text: `Mengirim simulasi ${eventData.event_id}...`})

    const payload: MarketplaceEvent = {
      event_id: eventData.event_id,
      channel: eventData.channel as any,
      order_id: eventData.order_id,
      event_type: eventData.event_type as any,
      status: finalStatus,
      timestamp: new Date().toISOString(),
      items: [{ sku: finalSku, qty: isStatusUpdated ? 1 : Number(eventData.qty) }]
    }

    const res = await processMarketplaceEvent(payload)
    if (res.success) {
      setLog({type: 'success', text: `Sukses: ${res.message}`})
      
      // Reload dropdown data to reflect remaining quotas & statuses
      await loadDropdownData()

      // Always auto-generate a fresh Event ID after every submit
      const freshEventId = `EV-${Date.now()}`
      const freshOrderId = eventData.event_type === 'ORDER_CREATED' ? `ORD-${Date.now() + 1}` : eventData.order_id

      setEventData(prev => ({
        ...prev,
        event_id: freshEventId,
        order_id: freshOrderId
      }))
    } else {
      setLog({type: 'error', text: `Gagal: ${res.error}\n${res.details ? JSON.stringify(res.details) : ''}`})
    }
    setLoading(false)
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
            <p className="text-xs text-slate-500 mt-0.5">Kirim satu kejadian pesanan simulasi secara langsung</p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadDropdownData}
          disabled={fetchingData}
          title="Refresh Data Order & Produk"
          className="p-2 text-slate-500 hover:text-jade-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw size={16} className={fetchingData ? 'animate-spin' : ''} />
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="p-5 flex-1 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Event ID - Read-only Auto Generated */}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            <div className="flex justify-between items-center">
              <span>Event ID</span>
              <span className="text-[10px] text-jade-600 font-normal font-mono">Otomatis</span>
            </div>
            <input 
              type="text" 
              value={eventData.event_id} 
              readOnly
              className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-100 text-slate-500 font-mono text-xs cursor-not-allowed select-none focus:outline-none"
            />
          </label>

          {/* Order ID - Dynamic based on Event Type */}
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            <div className="flex justify-between items-center">
              <span>Order ID</span>
              <span className="text-[10px] text-slate-500 font-normal">
                {isOrderCreated ? 'Otomatis (Order Baru)' : 'Pilih Order Terdaftar'}
              </span>
            </div>

            {isOrderCreated ? (
              <input 
                type="text" 
                value={eventData.order_id} 
                readOnly
                className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-100 text-slate-500 font-mono text-xs cursor-not-allowed select-none focus:outline-none"
              />
            ) : (
              <select
                value={eventData.order_id}
                onChange={e => handleSelectExistingOrder(e.target.value)}
                required
                disabled={validExistingOrders.length === 0}
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800 font-mono text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
              >
                {validExistingOrders.length === 0 ? (
                  <option value="">- Tidak ada order terdaftar yang dapat diproses -</option>
                ) : (
                  validExistingOrders.map(o => (
                    <option key={o.id} value={o.marketplace_order_id}>
                      {o.label}
                    </option>
                  ))
                )}
              </select>
            )}
          </label>
        </div>

        {/* Warning if follow-up event selected but no valid orders exist */}
        {!isOrderCreated && validExistingOrders.length === 0 && (
          <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg flex items-start gap-2">
            <Info size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <span>
              {isItemScopedEvent 
                ? 'Tidak ada order terdaftar dengan sisa kuota retur/batal. Semua kuota order telah habis atau dibatalkan.' 
                : 'Belum ada order terdaftar yang dapat dikirim.'}
            </span>
          </div>
        )}

        <div className={`grid grid-cols-1 ${isStatusUpdated ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4 transition-all duration-200`}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Kanal (Channel)
            <select 
              value={eventData.channel} 
              onChange={e => {
                const newChannel = e.target.value
                setEventData(prev => ({
                  ...prev, 
                  channel: newChannel,
                  status: prev.event_type === 'STATUS_UPDATED' ? (newChannel === 'TIKTOK' ? 'IN_TRANSIT' : 'SHIPPED') : prev.status
                }))
              }}
              disabled={!isOrderCreated}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="SHOPEE">SHOPEE</option>
              <option value="TIKTOK">TIKTOK</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Tipe Event
            <select 
              value={eventData.event_type} 
              onChange={e => handleEventTypeChange(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 font-semibold text-slate-800 focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs"
            >
              <option value="ORDER_CREATED">Pesanan Dibuat (ORDER_CREATED)</option>
              <option value="STATUS_UPDATED">Barang Dikirim (STATUS_UPDATED)</option>
              <option value="CANCELLED">Dibatalkan (CANCELLED)</option>
              <option value="RETURN_REQUESTED">Retur Diajukan (RETURN_REQUESTED)</option>
            </select>
          </label>

          {/* Status Order - ONLY shown for STATUS_UPDATED, locked according to Channel */}
          {isStatusUpdated && (
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 animate-in fade-in duration-200">
              <div className="flex justify-between items-center">
                <span>Status Order</span>
                <span className="text-[10px] text-jade-700 font-bold flex items-center gap-0.5">
                  <Lock size={10} /> Terkunci Kanal
                </span>
              </div>
              <input 
                type="text" 
                value={eventData.channel === 'TIKTOK' ? 'IN_TRANSIT (TikTok)' : 'SHIPPED (Shopee)'} 
                readOnly
                className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-100 font-bold text-slate-700 text-xs cursor-not-allowed select-none focus:outline-none"
              />
            </label>
          )}
        </div>

        {/* SKU Produk & Qty Fields - Hidden for STATUS_UPDATED */}
        {!isStatusUpdated && (
          <div className="grid grid-cols-4 gap-4 animate-in fade-in">
            {/* SKU Produk Dropdown */}
            <label className="col-span-3 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              <div className="flex justify-between items-center">
                <span>SKU Produk</span>
                {isItemScopedEvent && (
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    Sisa Kuota Retur / Batal
                  </span>
                )}
              </div>

              {isOrderCreated ? (
                // Free selection from all products & bundles
                <select 
                  value={eventData.sku} 
                  onChange={e => setEventData({...eventData, sku: e.target.value})} 
                  required
                  disabled={fetchingData}
                  className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-medium text-slate-800 text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none truncate"
                >
                  {productOptions.length === 0 ? (
                    <option value="">Memuat produk...</option>
                  ) : (
                    productOptions.map(p => (
                      <option key={p.sku} value={p.sku}>
                        {p.label}
                      </option>
                    ))
                  )}
                </select>
              ) : (
                // Filtered selection to only items inside selected order with sisaKuota > 0
                <select 
                  value={eventData.sku} 
                  onChange={e => handleSelectItem(e.target.value)} 
                  required
                  disabled={fetchingData || !eventData.order_id || orderItemsForSelectedOrder.length === 0}
                  className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-medium text-slate-800 text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none truncate disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {!eventData.order_id || validExistingOrders.length === 0 ? (
                    <option value="">- Pilih Order ID dahulu -</option>
                  ) : orderItemsForSelectedOrder.length === 0 ? (
                    <option value="">- Kuota semua item di order ini sudah habis -</option>
                  ) : (
                    orderItemsForSelectedOrder.map(item => (
                      <option key={item.id} value={item.sku}>
                        {item.label}
                      </option>
                    ))
                  )}
                </select>
              )}
            </label>

            {/* Qty Field */}
            <label className="col-span-1 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              <div className="flex justify-between items-center">
                <span>Qty</span>
                {isItemScopedEvent && selectedItemOption && (
                  <span className="text-[10px] font-mono text-slate-500">
                    Max: {maxQtyAllowed}
                  </span>
                )}
              </div>
              <input 
                type="number" 
                min="1" 
                max={isItemScopedEvent ? maxQtyAllowed : undefined}
                value={eventData.qty} 
                onChange={e => {
                  const val = Number(e.target.value)
                  if (isItemScopedEvent && val > maxQtyAllowed) {
                    setEventData({...eventData, qty: maxQtyAllowed})
                  } else {
                    setEventData({...eventData, qty: val})
                  }
                }} 
                required 
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-center font-mono focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs"
              />
            </label>
          </div>
        )}

        <button 
          type="submit" 
          disabled={loading || (!isOrderCreated && validExistingOrders.length === 0)} 
          className="mt-auto px-4 py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors shadow-soft flex items-center justify-center gap-2"
        >
          {loading ? <Activity className="animate-spin" size={18} /> : <Send size={18} />} Kirim Simulasi Pesanan
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
