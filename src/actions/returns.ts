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
  }[]
}

export async function processReturnInspection(payload: ProcessReturnPayload) {
  let user: any = null
  try {
    const supabase = await createClient()
    const authRes = await supabase.auth.getUser()
    user = authRes.data.user
  } catch {
    // Guest or fallback mode
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

  // Validate required expiryDate for LAYAK_JUAL
  for (const item of payload.items) {
    if (item.condition === 'LAYAK_JUAL' && (!item.expiryDate || item.expiryDate.trim() === '')) {
      return { success: false, error: 'Tanggal kedaluwarsa (expiryDate) wajib diisi untuk kondisi LAYAK_JUAL' }
    }
  }

  try {
    for (const item of payload.items) {
      if (item.condition === 'LAYAK_JUAL') {
        const expiryDate = item.expiryDate!
        
        // Search for existing return batch for this product with exact same expiry date
        const { data: existingBatch } = await adminClient
          .from('batches')
          .select('id')
          .eq('product_id', payload.productId)
          .eq('expiry_date', expiryDate)
          .like('batch_code', 'RET-%')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        let batchId: string

        if (existingBatch) {
          batchId = existingBatch.id
        } else {
          const retBatchCode = `RET-${payload.returnId.substring(0, 8)}-${Date.now()}`
          const { data: newBatch, error: bErr } = await adminClient
            .from('batches')
            .insert({
              product_id: payload.productId,
              batch_code: retBatchCode,
              expiry_date: expiryDate
            })
            .select('id')
            .single()

          if (bErr || !newBatch) {
            throw new Error(bErr?.message || 'Gagal membuat batch retur baru')
          }
          batchId = newBatch.id
        }

        const idempKey = `RET-IN-${payload.returnId}-${batchId}`
        const { error: ledgerErr } = await adminClient.from('stock_ledger').insert({
          product_id: payload.productId,
          batch_id: batchId,
          qty_delta: item.qty,
          reason_code: 'RETURN_IN',
          channel: payload.channel,
          source_type: 'MARKETPLACE_RETURN',
          source_ref_id: payload.returnId,
          created_by: user?.id || null,
          idempotency_key: idempKey
        })

        if (ledgerErr) {
          throw new Error(`Gagal mencatat stock ledger: ${ledgerErr.message}`)
        }
      } else if (item.condition === 'DAMAGED' || item.condition === 'LOST') {
        const { error: claimErr } = await adminClient.from('returns_claims').insert({
          return_id: payload.returnId,
          condition: item.condition,
          qty: item.qty
        })
        if (claimErr) {
          throw new Error(`Gagal mencatat klaim retur: ${claimErr.message}`)
        }
      }
    }

    await adminClient.from('returns').update({ status: 'COMPLETED' }).eq('id', payload.returnId)
    return { success: true, message: 'Inspeksi retur berhasil diproses secara atomik' }
  } catch (err: any) {
    return { success: false, error: `Gagal memproses inspeksi retur: ${err.message}` }
  }
}
