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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
  const { error } = await supabase.rpc('process_return_inspection', {
    p_return_id: payload.returnId,
    p_product_id: payload.productId,
    p_channel: payload.channel,
    p_items: JSON.stringify(payload.items),
    p_created_by: user?.id
  })

  if (error) {
    return { success: false, error: `Gagal memproses inspeksi retur: ${error.message}` }
  }

  return { success: true, message: 'Inspeksi retur berhasil diproses secara atomik' }
}
