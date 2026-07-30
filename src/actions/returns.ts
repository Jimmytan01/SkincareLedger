'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { Channel } from './stock'

export interface ProcessReturnPayload {
  returnId: string
  orderItemId: string
  productId: string
  channel: Channel
  orderId: string
  items: {
    condition: 'LAYAK_JUAL' | 'DAMAGED' | 'LOST'
    qty: number
    expiryDate?: string | null
    isUnknownExpiry?: boolean
  }[]
}

export async function processReturnInspection(payload: ProcessReturnPayload) {
  let supabase: any
  let user: any = null
  try {
    supabase = await createClient()
    const authRes = await supabase.auth.getUser()
    user = authRes.data.user
  } catch {
    supabase = createAdminClient()
  }

  const adminClient = createAdminClient()

  // Verify return is still pending
  const { data: ret } = await adminClient.from('returns').select('status, qty_requested').eq('id', payload.returnId).single()
  if (!ret || ret.status !== 'PENDING_INSPECTION') {
    return { success: false, error: 'Retur tidak ditemukan atau sudah diproses' }
  }

  const totalQty = payload.items.reduce((sum, item) => sum + item.qty, 0)
  if (totalQty !== ret.qty_requested) {
    return { success: false, error: `Total qty inspeksi (${totalQty}) tidak sama dengan qty retur (${ret.qty_requested})` }
  }

  // Use the atomic RPC
  const { error: rpcError } = await supabase.rpc('process_return_inspection', {
    p_return_id: payload.returnId,
    p_product_id: payload.productId,
    p_channel: payload.channel,
    p_items: payload.items as any,
    p_created_by: user?.id
  })

  if (!rpcError) {
    return { success: true, message: 'Inspeksi retur berhasil diproses secara atomik' }
  }

  // Fallback handling for DAMAGED / LOST conditions if DB RPC enum cast fails
  const nonLayakItems = payload.items.filter(i => i.condition === 'DAMAGED' || i.condition === 'LOST')
  const layakItems = payload.items.filter(i => i.condition === 'LAYAK_JUAL')

  if (nonLayakItems.length > 0) {
    // 1. Process LAYAK_JUAL items via RPC if any
    if (layakItems.length > 0) {
      const { error: layakRpcError } = await supabase.rpc('process_return_inspection', {
        p_return_id: payload.returnId,
        p_product_id: payload.productId,
        p_channel: payload.channel,
        p_items: layakItems as any,
        p_created_by: user?.id
      })
      if (layakRpcError) {
        return { success: false, error: `Gagal memproses barang layak jual: ${layakRpcError.message}` }
      }
    }

    // 2. Insert DAMAGED / LOST claims into returns_claims (NO stock movement written)
    for (const item of nonLayakItems) {
      const { error: claimErr } = await adminClient.from('returns_claims').insert({
        return_id: payload.returnId,
        condition: item.condition,
        qty: item.qty
      })
      if (claimErr) {
        return { success: false, error: `Gagal mencatat klaim retur: ${claimErr.message}` }
      }
    }

    // 3. Mark return status as COMPLETED
    const { error: updateErr } = await adminClient
      .from('returns')
      .update({ status: 'COMPLETED' })
      .eq('id', payload.returnId)

    if (updateErr) {
      return { success: false, error: `Gagal memperbarui status retur: ${updateErr.message}` }
    }

    return { success: true, message: 'Inspeksi retur (Rusak/Hilang) berhasil dicatat ke klaim/kerugian' }
  }

  return { success: false, error: `Gagal memproses inspeksi retur: ${rpcError.message}` }
}
