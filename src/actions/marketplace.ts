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
      return { success: true, message: 'Idempotent request ignored (already processed)' }
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
    return { success: true, message: 'Order already exists, treating as idempotent' }
  }

  // Insert Order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      marketplace_order_id: event.order_id,
      channel: event.channel,
      status: 'CREATED'
    })
    .select('id')
    .single()

  if (orderError) throw new Error(`Failed to insert order: ${orderError.message}`)

  // For each item, resolve whether it's a bundle or single product
  // Then insert into order_items
  for (const item of event.items) {
    // 1. Check if it's a bundle recipe (get the latest active version)
    // Note: We'll assume the highest version number is the active one for a given bundle_sku
    const { data: recipes, error: recipeError } = await supabase
      .from('bundle_recipes')
      .select('version, component_product_id, qty')
      .eq('bundle_sku', item.sku)
      .order('version', { ascending: false })

    if (recipes && recipes.length > 0) {
      // It's a bundle!
      // The highest version is recipes[0].version
      const currentVersion = recipes[0].version
      const activeComponents = recipes.filter((r: any) => r.version === currentVersion)

      for (const comp of activeComponents) {
        // Insert snapshot component
        await supabase.from('order_items').insert({
          order_id: order.id,
          product_id: comp.component_product_id,
          qty: comp.qty * item.qty, // total qty needed
          bundle_sku: item.sku,
          bundle_recipe_version: currentVersion,
          bundle_order_qty: item.qty
        })
      }
    } else {
      // It's a single product
      // Find the product id from sku
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('id')
        .eq('sku', item.sku)
        .single()
      
      if (productError || !product) {
        throw new Error(`Product not found for SKU: ${item.sku}`)
      }

      await supabase.from('order_items').insert({
        order_id: order.id,
        product_id: product.id,
        qty: item.qty,
        bundle_sku: null,
        bundle_recipe_version: null,
        bundle_order_qty: null
      })
    }
  }

  return { success: true, message: 'Order created and reserved successfully' }
}

async function handleStatusUpdated(supabase: any, event: MarketplaceEvent) {
  // Only trigger on SHIPPED or IN_TRANSIT
  if (event.status !== 'SHIPPED' && event.status !== 'IN_TRANSIT') {
    return { success: true, message: 'Status not actionable for stock ledger' }
  }

  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) throw new Error('Order not found')
  if (order.status === 'SHIPPED_IN_TRANSIT') return { success: true, message: 'Order already marked as shipped' }
  if (order.status === 'CANCELLED') throw new Error('Cannot ship a cancelled order')

  // Get order items
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)

  if (itemsError || !orderItems) throw new Error('Failed to fetch order items')

  // Process FEFO and write ledger for each item using atomic RPC
  for (const item of orderItems) {
    const fefoRes = await processStockOutFefo({
      productId: item.product_id,
      qtyNeeded: item.qty,
      reasonCode: 'SALE',
      channel: event.channel as Channel,
      sourceType: 'MARKETPLACE_ORDER',
      sourceRefId: event.order_id
    })
    
    if (!fefoRes.success) throw new Error(`Stock allocation failed: ${fefoRes.error}`)
  }

  // Update order status via RPC to bypass RLS on UPDATE
  await supabase.rpc('update_order_status', {
    p_order_id: order.id,
    p_status: 'SHIPPED_IN_TRANSIT'
  })

  return { success: true, message: 'Order shipped and ledger updated via FEFO' }
}

async function handleCancelled(supabase: any, event: MarketplaceEvent) {
  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) {
    return { success: true, message: 'Order not found, nothing to cancel' }
  }

  if (order.status === 'CANCELLED') return { success: true, message: 'Order already cancelled' }

  // Get order items to record item-level cancellation
  const { data: orderItems } = await supabase.from('order_items').select('*').eq('order_id', order.id)
  
  let isPartialCancel = false

  if (orderItems && orderItems.length > 0 && event.items && event.items.length > 0) {
    const cancelInserts = []
    
    // Calculate total order quantity
    const totalOriginalOrderQty = orderItems.reduce((sum: number, oi: any) => sum + (oi.bundle_order_qty || oi.qty || 1), 0)
    
    // Calculate cumulative previously cancelled/returned quantity
    const { data: existingReturns } = await supabase
      .from('returns')
      .select('qty_requested, order_item_id')
      .eq('order_id', order.id)

    const prevProcessedQty = (existingReturns || []).reduce((sum: number, r: any) => sum + (Number(r.qty_requested) || 0), 0)
    let totalCancelledThisEvent = 0

    for (const cancelItem of event.items) {
      const { data: prod } = await supabase.from('products').select('id').eq('sku', cancelItem.sku).single()
      
      let matchedItems = orderItems.filter((oi: any) => 
        oi.bundle_sku === cancelItem.sku || (!oi.bundle_sku && oi.product_id === prod?.id)
      )

      if (matchedItems.length === 0) {
        matchedItems = orderItems
      }

      for (const oi of matchedItems) {
        let componentQtyToCancel = cancelItem.qty
        if (oi.bundle_sku && oi.bundle_order_qty) {
          const qtyPerBundle = oi.qty / oi.bundle_order_qty
          componentQtyToCancel = qtyPerBundle * cancelItem.qty
        }

        totalCancelledThisEvent += cancelItem.qty
        cancelInserts.push({
          order_id: order.id,
          order_item_id: oi.id,
          qty_requested: componentQtyToCancel,
          status: 'PENDING_INSPECTION'
        })
      }
    }

    if (cancelInserts.length > 0) {
      await supabase.from('returns').insert(cancelInserts)
    }

    if ((prevProcessedQty + totalCancelledThisEvent) < totalOriginalOrderQty) {
      isPartialCancel = true
    }
  }

  // Update order status to CANCELLED only if full order is cancelled
  if (!isPartialCancel) {
    await supabase.rpc('update_order_status', {
      p_order_id: order.id,
      p_status: 'CANCELLED'
    })
  }

  // If order was SHIPPED_IN_TRANSIT, reverse ledger
  if (order.status === 'SHIPPED_IN_TRANSIT') {
    const { error: cancelErr } = await supabase.rpc('process_marketplace_cancel', {
      p_order_id: event.order_id,
      p_channel: event.channel
    })

    if (cancelErr) throw new Error(`Failed to process marketplace cancel reversal: ${cancelErr.message}`)
  }

  return { success: true, message: isPartialCancel ? 'Partial cancellation processed' : 'Order cancelled' }
}

async function handleReturnRequested(supabase: any, event: MarketplaceEvent) {
  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) return { success: true, message: 'Order not found, skipping return' }

  // Fetch all order_items for this order
  const { data: orderItems } = await supabase.from('order_items').select('*').eq('order_id', order.id)
  if (!orderItems || orderItems.length === 0) return { success: true, message: 'No items in order to return' }

  const returnInserts = []

  for (const retItem of event.items) {
    const { data: prod } = await supabase.from('products').select('id').eq('sku', retItem.sku).single()
    
    let matchedItems = orderItems.filter((oi: any) => 
      oi.bundle_sku === retItem.sku || (!oi.bundle_sku && oi.product_id === prod?.id)
    )

    if (matchedItems.length === 0) {
      console.warn(`Could not match returned SKU ${retItem.sku} to order ${order.id}`)
      continue
    }

    for (const oi of matchedItems) {
      let componentQtyToReturn = retItem.qty
      if (oi.bundle_sku && oi.bundle_order_qty) {
        const qtyPerBundle = oi.qty / oi.bundle_order_qty
        componentQtyToReturn = qtyPerBundle * retItem.qty
      }

      returnInserts.push({
        order_id: order.id,
        order_item_id: oi.id,
        qty_requested: componentQtyToReturn,
        status: 'PENDING_INSPECTION'
      })
    }
  }

  if (returnInserts.length > 0) {
    const { error } = await supabase.from('returns').insert(returnInserts)
    if (error) throw new Error(`Failed to create returns: ${error.message}`)
  }

  return { success: true, message: 'Return requests created in inbox' }
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


