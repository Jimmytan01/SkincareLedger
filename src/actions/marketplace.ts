'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { MarketplaceEventSchema, MarketplaceEvent } from '@/types/marketplace'
import { processStockOutFefo, ReasonCode, Channel } from './stock'

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
    // If order not found, nothing to cancel (maybe creation failed or missed)
    return { success: true, message: 'Order not found, nothing to cancel' }
  }

  if (order.status === 'CANCELLED') return { success: true, message: 'Order already cancelled' }

  // If order was CREATED, just update status. No ledger impact (reservation dropped)
  if (order.status === 'CREATED') {
    await supabase.rpc('update_order_status', {
      p_order_id: order.id,
      p_status: 'CANCELLED'
    })
    return { success: true, message: 'Order cancelled, reservations released' }
  }

  // If order was SHIPPED_IN_TRANSIT, we need to reverse the ledger
  if (order.status === 'SHIPPED_IN_TRANSIT') {
    // Use atomic RPC for marketplace cancel
    const { error: cancelErr } = await supabase.rpc('process_marketplace_cancel', {
      p_order_id: event.order_id,
      p_channel: event.channel
    })

    if (cancelErr) throw new Error(`Failed to process marketplace cancel reversal: ${cancelErr.message}`)

    return { success: true, message: 'Order cancelled and stock returned via atomic ledger reversal' }
  }

  return { success: true, message: 'Unhandled cancellation scenario' }
}

async function handleReturnRequested(supabase: any, event: MarketplaceEvent) {
  // Get order
  const { data: order } = await supabase.from('orders').select('id, status').eq('marketplace_order_id', event.order_id).single()
  if (!order) return { success: true, message: 'Order not found, skipping return' }

  // Must be shipped/in transit to be returned realistically, but let's just process it based on items
  // Fetch all order_items for this order
  const { data: orderItems } = await supabase.from('order_items').select('*').eq('order_id', order.id)
  if (!orderItems || orderItems.length === 0) return { success: true, message: 'No items in order to return' }

  // Map incoming returned SKUs to order_items. 
  // An event.item might refer to a bundle_sku or a product sku.
  const returnInserts = []

  for (const retItem of event.items) {
    // Find matching order_items. We prioritize matching by bundle_sku if it's a bundle, or product sku.
    // However, since we don't have product sku directly in order_items (we have product_id), we need to resolve it.
    // Let's resolve the incoming retItem.sku to a product_id first to check if it's a single product match.
    const { data: prod } = await supabase.from('products').select('id').eq('sku', retItem.sku).single()
    
    // An incoming SKU might match multiple order_items (components of a bundle).
    // We look for order_items where bundle_sku === retItem.sku, OR product_id === prod?.id (if not part of a bundle).
    let matchedItems = orderItems.filter((oi: any) => 
      oi.bundle_sku === retItem.sku || (!oi.bundle_sku && oi.product_id === prod?.id)
    )

    if (matchedItems.length === 0) {
      console.warn(`Could not match returned SKU ${retItem.sku} to order ${order.id}`)
      continue
    }

    // Insert a return record for each matched order_item component
    for (const oi of matchedItems) {
      // If it was a bundle, the incoming qty is for the bundle.
      // E.g. returning 1 bundle. The component qty returned should be: (oi.qty / oi.bundle_order_qty) * retItem.qty.
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

