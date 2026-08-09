'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export type ReasonCode = 'SALE' | 'BONUS' | 'PROMO' | 'SAMPLE' | 'DAMAGED' | 'EXPIRED' | 'RETURN_IN' | 'OPNAME_CORRECTION' | 'MANUAL_CORRECTION' | 'CANCEL_REVERSAL' | 'OPENING_BALANCE' | 'STOCK_IN'
export type Channel = 'SHOPEE' | 'TIKTOK' | 'OFFLINE' | 'INTERNAL'

export interface ProcessStockOutFefoParams {
  productId: string
  qtyNeeded: number
  reasonCode: ReasonCode
  channel: Channel
  sourceType: string
  sourceRefId: string
  createdBy?: string
  referenceNote?: string
  createdAt?: string
}

export async function processStockOutFefo(params: ProcessStockOutFefoParams) {
  let supabase: any
  try {
    supabase = await createClient()
    const authRes = await supabase.auth.getUser()
    if (!authRes.data.user) supabase = createAdminClient()
  } catch {
    supabase = createAdminClient()
  }
  
  const { data, error } = await supabase.rpc('process_stock_out_fefo', {
    p_product_id: params.productId,
    p_qty_needed: params.qtyNeeded,
    p_reason_code: params.reasonCode,
    p_channel: params.channel,
    p_source_type: params.sourceType,
    p_source_ref_id: params.sourceRefId,
    p_created_by: params.createdBy || null,
    p_reference_note: params.referenceNote || null,
    p_created_at: params.createdAt || null
  })

  if (error) {
    console.error('Error processing stock out fefo:', error)
    if (error.message.includes('qty_non_negative') || error.message.includes('Stok tidak mencukupi')) {
      const adminClient = createAdminClient()
      await adminClient.from('anomalies').insert({
        type: 'NEGATIVE_BALANCE_ATTEMPT',
        description: `Upaya transaksi (${params.reasonCode}) ditolak karena stok tidak cukup.`,
        related_ids: { product_id: params.productId, qty_needed: params.qtyNeeded },
        status: 'OPEN',
        detected_at: params.createdAt || new Date().toISOString()
      })
    }
    return { success: false, error: error.message }
  }

  return { success: true, allocations: data.allocations }
}

export interface FefoAllocationResult {
  batch_id: string
  qty: number
}

export async function getProductBalance(productId: string) {
  let supabase: any
  try {
    supabase = await createClient()
    const authRes = await supabase.auth.getUser()
    if (!authRes.data.user) supabase = createAdminClient()
  } catch {
    supabase = createAdminClient()
  }
  
  // Try querying SQL View product_stock_summary first for SQL-side aggregated balance
  const { data: viewData, error: viewErr } = await supabase
    .from('product_stock_summary')
    .select('physical_qty')
    .eq('product_id', productId)
    .maybeSingle()

  if (!viewErr && viewData) {
    return { success: true, qty: viewData.physical_qty || 0 }
  }

  // Fallback if View is pending DB migration
  const { data, error } = await supabase
    .from('stock_balance_cache')
    .select('qty')
    .eq('product_id', productId)

  if (error) {
    return { success: false, error: error.message }
  }

  const totalQty = (data || []).reduce((sum: number, row: { qty: number }) => sum + (row.qty || 0), 0)
  return { success: true, qty: totalQty }
}

export interface ProductAvailability {
  product_id: string
  sku: string
  name: string
  physical_qty: number
  reserved_qty: number
  available_qty: number
}

export async function getAvailableToSell(productId?: string) {
  const supabase = createAdminClient()

  // 1. Primary Path: Query SQL View product_stock_summary (SQL-side O(1) Pre-aggregated view)
  try {
    let query = supabase.from('product_stock_summary').select('*').order('sku')
    if (productId) {
      query = query.eq('product_id', productId)
    }
    const { data: viewData, error: viewErr } = await query

    if (!viewErr && viewData) {
      return { success: true, data: viewData as ProductAvailability[] }
    }
  } catch {
    // Fallback below if View is pending DB migration
  }

  // 2. Fallback Path: Indexed Batch Querying for products
  let prodQuery = supabase.from('products').select('id, name, sku').order('sku')
  if (productId) prodQuery = prodQuery.eq('id', productId)
  const { data: products, error: prodErr } = await prodQuery
  if (prodErr) return { success: false, error: prodErr.message }

  const productIds = (products || []).map(p => p.id)
  if (productIds.length === 0) return { success: true, data: [] }

  const [cacheRes, reservedRes] = await Promise.all([
    supabase.from('stock_balance_cache').select('product_id, qty').in('product_id', productIds),
    supabase
      .from('order_items')
      .select('product_id, qty, orders!inner(status)')
      .in('product_id', productIds)
      .eq('orders.status', 'CREATED')
  ])

  if (cacheRes.error) return { success: false, error: cacheRes.error.message }
  if (reservedRes.error) return { success: false, error: reservedRes.error.message }

  const physicalMap = new Map<string, number>()
  cacheRes.data?.forEach(c => {
    physicalMap.set(c.product_id, (physicalMap.get(c.product_id) || 0) + c.qty)
  })

  const reservedMap = new Map<string, number>()
  reservedRes.data?.forEach(item => {
    reservedMap.set(item.product_id, (reservedMap.get(item.product_id) || 0) + item.qty)
  })

  const result: ProductAvailability[] = (products || []).map(p => {
    const physical = physicalMap.get(p.id) || 0
    const reserved = reservedMap.get(p.id) || 0
    const available = Math.max(0, physical - reserved)

    return {
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      physical_qty: physical,
      reserved_qty: reserved,
      available_qty: available
    }
  })

  return { success: true, data: result }
}
