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
  if (params.qtyNeeded <= 0) {
    return { success: false, error: 'qtyNeeded harus > 0' }
  }

  if (['BONUS', 'PROMO', 'SAMPLE'].includes(params.reasonCode)) {
    if (!params.referenceNote || params.referenceNote.trim() === '') {
      return { success: false, error: `Catatan referensi (reference_note) wajib diisi untuk reason code ${params.reasonCode}` }
    }
  }

  const adminClient = createAdminClient()
  const todayStr = new Date().toISOString().split('T')[0]

  try {
    // 1. Fetch all batches for product
    const { data: batches, error: bErr } = await adminClient
      .from('batches')
      .select('id, expiry_date, created_at')
      .eq('product_id', params.productId)
      .order('expiry_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (bErr) {
      return { success: false, error: `Gagal mengambil batch: ${bErr.message}` }
    }

    // 2. Fetch stock_balance_cache for product
    const { data: cacheData, error: cErr } = await adminClient
      .from('stock_balance_cache')
      .select('batch_id, qty')
      .eq('product_id', params.productId)
      .gt('qty', 0)

    if (cErr) {
      return { success: false, error: `Gagal mengambil saldo cache: ${cErr.message}` }
    }

    const cacheMap = new Map((cacheData || []).map(c => [c.batch_id, c.qty]))

    let totalPhysicalQty = 0
    let totalValidQty = 0
    const eligibleBatches: { id: string; qty: number; expiryDate: string }[] = []

    for (const b of (batches || [])) {
      const q = cacheMap.get(b.id) || 0
      if (q > 0) {
        totalPhysicalQty += q
        const isValid = b.expiry_date >= todayStr
        if (isValid) {
          totalValidQty += q
        }

        if (params.reasonCode === 'EXPIRED' || isValid) {
          eligibleBatches.push({ id: b.id, qty: q, expiryDate: b.expiry_date })
        }
      }
    }

    // Check if eligible stock satisfies qtyNeeded
    const totalEligibleQty = eligibleBatches.reduce((sum, b) => sum + b.qty, 0)
    if (totalEligibleQty < params.qtyNeeded) {
      let errorMsg = `Stok tidak mencukupi. Kurang ${params.qtyNeeded - totalEligibleQty} unit`

      if (params.reasonCode !== 'EXPIRED' && totalPhysicalQty > 0 && totalValidQty === 0) {
        errorMsg = 'Stok tersedia hanya dari batch yang sudah kedaluwarsa, tidak bisa digunakan untuk transaksi ini.'
      } else if (params.reasonCode !== 'EXPIRED' && totalPhysicalQty > 0 && totalValidQty < params.qtyNeeded) {
        errorMsg = `Stok tidak mencukupi (stok valid belum kedaluwarsa: ${totalValidQty} unit). Kurang ${params.qtyNeeded - totalValidQty} unit untuk produk`
      }

      await adminClient.from('anomalies').insert({
        type: 'NEGATIVE_BALANCE_ATTEMPT',
        description: `Upaya transaksi (${params.reasonCode}) ditolak: ${errorMsg}`,
        related_ids: { product_id: params.productId, qty_needed: params.qtyNeeded },
        status: 'OPEN',
        detected_at: params.createdAt || new Date().toISOString()
      })

      return { success: false, error: errorMsg }
    }

    // Allocate FEFO stock
    let remainingQty = params.qtyNeeded
    const allocations: { batch_id: string; qty: number }[] = []
    const timestamp = params.createdAt || new Date().toISOString()

    const ledgerInserts: any[] = []

    for (const b of eligibleBatches) {
      if (remainingQty <= 0) break
      const takeQty = Math.min(remainingQty, b.qty)

      const idempKey = `${params.sourceRefId}-${b.id}-${params.reasonCode}-${new Date(timestamp).getTime()}`
      ledgerInserts.push({
        product_id: params.productId,
        batch_id: b.id,
        qty_delta: -takeQty,
        reason_code: params.reasonCode,
        channel: params.channel,
        source_type: params.sourceType,
        source_ref_id: params.sourceRefId,
        created_by: params.createdBy || null,
        reference_note: params.referenceNote || null,
        idempotency_key: idempKey,
        created_at: timestamp
      })

      allocations.push({ batch_id: b.id, qty: takeQty })
      remainingQty -= takeQty
    }

    const { error: ledgerErr } = await adminClient.from('stock_ledger').insert(ledgerInserts)
    if (ledgerErr) {
      return { success: false, error: `Gagal mencatat ledger: ${ledgerErr.message}` }
    }

    return { success: true, allocations }
  } catch (err: any) {
    return { success: false, error: err.message || 'Gagal mengalokasikan stok FEFO' }
  }
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
