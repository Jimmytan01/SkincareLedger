'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { MarketplaceEventSchema, MarketplaceEvent } from '@/types/marketplace'
import { processStockOutFefo, ReasonCode, Channel } from './stock'
import { formatQty } from '@/utils/format'

export async function processMarketplaceEvent(event: MarketplaceEvent) {
  // 1. Server-side validation via Zod
  const validation = MarketplaceEventSchema.safeParse(event)
  if (!validation.success) {
    return { success: false, error: 'Invalid event payload', details: validation.error.flatten() }
  }

  const adminClient = createAdminClient()

  // 2. Idempotency Check
  const { error: idempError } = await adminClient
    .from('processed_events')
    .insert({ event_id: event.event_id, event_type: event.event_type, processed_at: new Date().toISOString() })
  
  if (idempError) {
    // 23505 is PostgreSQL unique_violation code
    if (idempError.code === '23505') {
      return { success: true, isIdempotent: true, message: `Event '${event.event_id}' sudah pernah diproses sebelumnya (dilewati secara idempotent)` }
    }
    return { success: false, error: `Database error checking idempotency: ${idempError.message}` }
  }

  try {
    switch (event.event_type) {
      case 'ORDER_CREATED':
        return await handleOrderCreated(adminClient, event)
      case 'STATUS_UPDATED':
        return await handleStatusUpdated(adminClient, event)
      case 'CANCELLED':
        return await handleCancelled(adminClient, event)
      case 'RETURN_REQUESTED':
        return await handleReturnRequested(adminClient, event)
      case 'DELIVERED':
        return await handleDelivered(adminClient, event)
      default:
        return { success: true, message: `Event type ${event.event_type} handled silently` }
    }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error processing event' }
  }
}

async function handleOrderCreated(supabase: any, event: MarketplaceEvent) {
  // Check if order already exists
  const { data: existing } = await supabase.from('orders').select('id').eq('marketplace_order_id', event.order_id).single()
  if (existing) {
    return { success: true, isIdempotent: true, message: `Order '${event.order_id}' sudah terdaftar sebelumnya (dilewati secara idempotent)` }
  }

  // Insert Order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      marketplace_order_id: event.order_id,
      channel: event.channel,
      status: 'CREATED',
      created_at: event.timestamp || new Date().toISOString()
    })
    .select('id')
    .single()

  if (orderError) throw new Error(`Gagal membuat order: ${orderError.message}`)

  // Batch fetch bundle recipes and products for all SKUs in event.items in parallel
  const itemSkus = Array.from(new Set(event.items.map(i => i.sku)))

  const [recipesRes, productsRes] = await Promise.all([
    supabase
      .from('bundle_recipes')
      .select('bundle_sku, version, component_product_id, qty')
      .in('bundle_sku', itemSkus)
      .order('version', { ascending: false }),
    supabase
      .from('products')
      .select('id, sku')
      .in('sku', itemSkus)
  ])

  if (recipesRes.error) throw new Error(`Gagal mengambil resep bundle: ${recipesRes.error.message}`)
  if (productsRes.error) throw new Error(`Gagal mengambil data produk: ${productsRes.error.message}`)

  // Group recipes by bundle_sku in memory
  const recipesMap = new Map<string, any[]>()
  recipesRes.data?.forEach((r: any) => {
    if (!recipesMap.has(r.bundle_sku)) recipesMap.set(r.bundle_sku, [])
    recipesMap.get(r.bundle_sku)!.push(r)
  })

  // Map single products by sku in memory
  const productsMap = new Map<string, any>()
  productsRes.data?.forEach((p: any) => {
    productsMap.set(p.sku, p)
  })

  const orderItemsToInsert: any[] = []

  for (const item of event.items) {
    const recipes = recipesMap.get(item.sku)
    if (recipes && recipes.length > 0) {
      // Top version is the latest active version at creation time (recipes query is ordered by version DESC)
      const currentVersion = recipes[0].version
      const activeComponents = recipes.filter((r: any) => r.version === currentVersion)

      for (const comp of activeComponents) {
        orderItemsToInsert.push({
          order_id: order.id,
          product_id: comp.component_product_id,
          qty: comp.qty * item.qty,
          bundle_sku: item.sku,
          bundle_recipe_version: currentVersion,
          bundle_order_qty: item.qty
        })
      }
    } else {
      const product = productsMap.get(item.sku)
      if (!product) {
        throw new Error(`SKU '${item.sku}' tidak ditemukan di master produk / bundle`)
      }

      orderItemsToInsert.push({
        order_id: order.id,
        product_id: product.id,
        qty: item.qty,
        bundle_sku: null,
        bundle_recipe_version: null,
        bundle_order_qty: null
      })
    }
  }

  if (orderItemsToInsert.length > 0) {
    const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert)
    if (itemsError) throw new Error(`Gagal menyimpan item order: ${itemsError.message}`)
  }

  return { success: true, message: 'Pesanan baru dibuat dan stok berhasil di-reservasi' }
}

async function handleStatusUpdated(supabase: any, event: MarketplaceEvent) {
  // Only trigger on SHIPPED or IN_TRANSIT
  if (event.status !== 'SHIPPED' && event.status !== 'IN_TRANSIT') {
    return { success: true, isIdempotent: true, message: 'Status tidak memerlukan pemotongan stok' }
  }

  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) throw new Error(`Order '${event.order_id}' tidak ditemukan untuk pengiriman`)
  if (order.status === 'SHIPPED_IN_TRANSIT') return { success: true, isIdempotent: true, message: `Order '${event.order_id}' sudah ditandai dikirim sebelumnya (dilewati secara idempotent)` }
  if (order.status === 'CANCELLED') throw new Error(`Order '${event.order_id}' sudah dibatalkan, tidak dapat dikirim`)

  // Get order items
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)

  if (itemsError || !orderItems || orderItems.length === 0) throw new Error(`Gagal mengambil item order untuk '${event.order_id}'`)

  // Process FEFO and write ledger for each item using atomic RPC
  for (const item of orderItems) {
    const fefoRes = await processStockOutFefo({
      productId: item.product_id,
      qtyNeeded: item.qty,
      reasonCode: 'SALE',
      channel: event.channel as Channel,
      sourceType: 'MARKETPLACE_ORDER',
      sourceRefId: event.order_id,
      createdAt: event.timestamp
    })
    
    if (!fefoRes.success) throw new Error(`Alokasi FEFO gagal: ${fefoRes.error}`)
  }

  // Update order status via RPC to bypass RLS on UPDATE
  await supabase.rpc('update_order_status', {
    p_order_id: order.id,
    p_status: 'SHIPPED_IN_TRANSIT'
  })

  return { success: true, message: 'Pesanan dikirim dan stok terpotong via FEFO' }
}

async function handleCancelled(supabase: any, event: MarketplaceEvent) {
  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) {
    throw new Error(`Order '${event.order_id}' tidak ditemukan untuk pembatalan`)
  }

  if (order.status === 'CANCELLED') return { success: true, isIdempotent: true, message: `Order '${event.order_id}' sudah dibatalkan sebelumnya (dilewati secara idempotent)` }

  // Update order status to CANCELLED
  await supabase.rpc('update_order_status', {
    p_order_id: order.id,
    p_status: 'CANCELLED'
  })

  // If order was SHIPPED_IN_TRANSIT, reverse ledger
  if (order.status === 'SHIPPED_IN_TRANSIT') {
    const { error: cancelErr } = await supabase.rpc('process_marketplace_cancel', {
      p_order_id: event.order_id,
      p_channel: event.channel
    })

    if (cancelErr) throw new Error(`Gagal memproses pembalikan ledger pembatalan: ${cancelErr.message}`)

    if (event.timestamp) {
      await supabase
        .from('stock_ledger')
        .update({ created_at: event.timestamp })
        .eq('source_type', 'MARKETPLACE_ORDER')
        .eq('source_ref_id', event.order_id)
        .eq('reason_code', 'CANCEL_REVERSAL')
    }
  }

  // NOTE: Pembatalan TIDAK PERNAH memasukkan entri ke tabel returns / Inbox Retur!
  return { success: true, message: 'Pesanan dibatalkan & reservasi stok dilepas' }
}

async function handleReturnRequested(supabase: any, event: MarketplaceEvent) {
  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) throw new Error(`Order '${event.order_id}' tidak ditemukan untuk pengajuan retur`)

  // Fetch all order_items for this order
  const { data: orderItems } = await supabase.from('order_items').select('*').eq('order_id', order.id)
  if (!orderItems || orderItems.length === 0) throw new Error(`Tidak ada item terdaftar pada order '${event.order_id}'`)

  // Batch fetch products for all return SKUs and existing returns for order.id
  const retSkus = Array.from(new Set(event.items.map(i => i.sku)))
  const [prodsRes, existingRetRes] = await Promise.all([
    supabase.from('products').select('id, sku').in('sku', retSkus),
    supabase.from('returns').select('order_item_id').eq('order_id', order.id).eq('status', 'PENDING_INSPECTION')
  ])

  const prodMap = new Map((prodsRes.data || []).map((p: any) => [p.sku, p.id]))
  const pendingOrderItemSet = new Set((existingRetRes.data || []).map((r: any) => r.order_item_id))

  const returnInserts = []

  for (const retItem of event.items) {
    const prodId = prodMap.get(retItem.sku)
    
    let matchedItems = orderItems.filter((oi: any) => 
      oi.bundle_sku === retItem.sku || (!oi.bundle_sku && oi.product_id === prodId)
    )

    if (matchedItems.length === 0) {
      throw new Error(`SKU '${retItem.sku}' tidak ditemukan pada item order '${event.order_id}'`)
    }

    for (const oi of matchedItems) {
      if (pendingOrderItemSet.has(oi.id)) {
        // Idempotent: Return inspection for this item already pending
        continue
      }

      let componentQtyToReturn = retItem.qty
      if (oi.bundle_sku && oi.bundle_order_qty) {
        const qtyPerBundle = oi.qty / oi.bundle_order_qty
        componentQtyToReturn = qtyPerBundle * retItem.qty
      }

      returnInserts.push({
        order_id: order.id,
        order_item_id: oi.id,
        qty_requested: componentQtyToReturn,
        status: 'PENDING_INSPECTION',
        created_at: event.timestamp || new Date().toISOString()
      })
    }
  }

  if (returnInserts.length > 0) {
    const { error } = await supabase.from('returns').insert(returnInserts)
    if (error) throw new Error(`Gagal membuat entri retur: ${error.message}`)
  }

  return { success: true, message: 'Pengajuan retur diterima dan masuk ke Inbox Retur' }
}

async function handleDelivered(supabase: any, event: MarketplaceEvent) {
  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) throw new Error(`Order '${event.order_id}' tidak ditemukan untuk penandaan selesai`)

  if (order.status === 'DELIVERED') {
    return { success: true, isIdempotent: true, message: `Order '${event.order_id}' sudah ditandai selesai (DELIVERED) sebelumnya (dilewati secara idempotent)` }
  }

  if (order.status === 'CREATED') {
    throw new Error(`Order '${event.order_id}' masih berstatus CREATED (belum dikirim), tidak dapat ditandai DELIVERED`)
  }

  if (order.status === 'CANCELLED') {
    throw new Error(`Order '${event.order_id}' sudah dibatalkan, tidak dapat ditandai DELIVERED`)
  }

  // Update order status via RPC
  const { error: rpcErr } = await supabase.rpc('update_order_status', {
    p_order_id: order.id,
    p_status: 'DELIVERED'
  })

  if (rpcErr) {
    const { error: updateErr } = await supabase.from('orders').update({ status: 'DELIVERED' }).eq('id', order.id)
    if (updateErr) {
      console.warn('Note on DELIVERED status DB update:', updateErr.message)
    }
  }

  // CRITICAL REQUIREMENT: DELIVERED MUST NOT TOUCH stock_ledger OR stock_balance_cache AT ALL!
  return { success: true, message: 'Pesanan ditandai selesai (DELIVERED) dan siklus order ditutup' }
}

import { getInactiveBundleSkus } from './bundle'

export async function getProductsAndBundlesForSimulation() {
  const adminClient = createAdminClient()
  const [productsRes, bundleRecipesRes, inactiveSkus] = await Promise.all([
    adminClient.from('products').select('id, name, sku').order('name'),
    adminClient.from('bundle_recipes').select('bundle_sku').order('bundle_sku'),
    getInactiveBundleSkus()
  ])
  
  const products = productsRes.data
  const bundleRecipes = bundleRecipesRes.data

  const options: { sku: string; label: string; isBundle?: boolean }[] = []

  if (products) {
    for (const p of products) {
      options.push({ sku: p.sku, label: `${p.name} (SKU: ${p.sku})` })
    }
  }

  if (bundleRecipes) {
    const bundleSkus = Array.from(new Set(bundleRecipes.map((b: any) => b.bundle_sku)))
    for (const bSku of bundleSkus) {
      // Exclude inactive bundle SKUs
      if (inactiveSkus.includes(bSku)) continue

      if (!options.some(o => o.sku === bSku)) {
        options.push({ sku: bSku, label: `Paket Bundle: ${bSku}`, isBundle: true })
      }
    }
  }

  return options
}

export async function getSimulationOrders() {
  const adminClient = createAdminClient()

  // Fetch orders and all return/cancellation entries in parallel
  const [ordersRes, returnsRes] = await Promise.all([
    adminClient
      .from('orders')
      .select(`
        id,
        marketplace_order_id,
        channel,
        status,
        created_at,
        order_items (
          id,
          qty,
          bundle_sku,
          bundle_order_qty,
          product:products (id, sku, name)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('returns')
      .select('order_id, order_item_id, qty_requested, status')
  ])

  const orders = ordersRes.data || []
  const allReturns = returnsRes.data || []

  return orders.map((o: any) => {
    const rawItems = o.order_items || []
    const isWholeOrderCancelled = o.status === 'CANCELLED'

    // Map order items and calculate remaining quota (sisaKuota)
    const mappedItems: { id: string; sku: string; name: string; originalQty: number; sisaKuota: number; label: string }[] = []
    
    rawItems.forEach((oi: any) => {
      const isBundle = Boolean(oi.bundle_sku)
      const sku = oi.bundle_sku || oi.product?.sku || ''
      const name = isBundle ? `Paket Bundle ${oi.bundle_sku}` : (oi.product?.name || sku)
      const originalQty = oi.bundle_order_qty || oi.qty || 1

      // Deduplicate by SKU for bundle explosion items
      if (!mappedItems.some(item => item.sku === sku)) {
        let sisaKuota = 0

        if (!isWholeOrderCancelled) {
          // Sum all returned / cancelled quantities for this order item
          const itemReturnRows = allReturns.filter((r: any) => r.order_item_id === oi.id)
          const totalQtyRequested = itemReturnRows.reduce((sum: number, r: any) => sum + (Number(r.qty_requested) || 0), 0)

          let itemProcessedQty = totalQtyRequested
          if (isBundle && oi.bundle_order_qty) {
            const qtyPerBundle = oi.qty / oi.bundle_order_qty
            itemProcessedQty = totalQtyRequested / (qtyPerBundle || 1)
          }

          sisaKuota = Math.max(0, originalQty - Math.round(itemProcessedQty))
        }

        mappedItems.push({
          id: oi.id,
          sku,
          name,
          originalQty,
          sisaKuota,
          label: `${name} (SKU: ${sku}) — Sisa: ${formatQty(sisaKuota)} dari ${formatQty(originalQty)}`
        })
      }
    })

    const firstItem = mappedItems[0]

    return {
      id: o.id,
      marketplace_order_id: o.marketplace_order_id,
      channel: o.channel,
      status: o.status,
      created_at: o.created_at,
      items: mappedItems,
      sku: firstItem?.sku || '',
      qty: firstItem?.sisaKuota || 0,
      label: `${o.marketplace_order_id} (${o.channel} | Status: ${o.status})`
    }
  })
}


