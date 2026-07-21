'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export type ReasonCode = 'SALE' | 'BONUS' | 'PROMO' | 'SAMPLE' | 'DAMAGED' | 'EXPIRED' | 'RETURN_IN' | 'OPNAME_CORRECTION' | 'MANUAL_CORRECTION' | 'CANCEL_REVERSAL' | 'OPENING_BALANCE'
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
}

export async function processStockOutFefo(params: ProcessStockOutFefoParams) {
  const supabase = await createClient()
  
  const { data, error } = await supabase.rpc('process_stock_out_fefo', {
    p_product_id: params.productId,
    p_qty_needed: params.qtyNeeded,
    p_reason_code: params.reasonCode,
    p_channel: params.channel,
    p_source_type: params.sourceType,
    p_source_ref_id: params.sourceRefId,
    p_created_by: params.createdBy || null,
    p_reference_note: params.referenceNote || null
  })

  if (error) {
    console.error('Error processing stock out fefo:', error)
    if (error.message.includes('qty_non_negative') || error.message.includes('Stok tidak mencukupi')) {
      const adminClient = createAdminClient()
      await adminClient.from('anomalies').insert({
        type: 'NEGATIVE_BALANCE_ATTEMPT',
        description: `Upaya transaksi (${params.reasonCode}) ditolak karena stok tidak cukup.`,
        related_ids: { product_id: params.productId, qty_needed: params.qtyNeeded },
        status: 'OPEN'
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
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('stock_balance_cache')
    .select('qty')
    .eq('product_id', productId)

  if (error) {
    return { success: false, error: error.message }
  }

  const totalQty = data.reduce((sum, row) => sum + row.qty, 0)
  return { success: true, qty: totalQty }
}
