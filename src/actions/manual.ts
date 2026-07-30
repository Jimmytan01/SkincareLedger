'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { processStockOutFefo, getProductBalance, ReasonCode, Channel } from './stock'

export interface ManualEntryPayload {
  productId: string
  qty: number
  reasonCode: ReasonCode
  channel: Channel
  referenceNote?: string
}

export type ValidationResult = 
  | { 
      success: true; 
      currentBalance: number; 
      projectedBalance: number;
      reservedQty: number;
      availableQty: number;
      isEatingReservation: boolean;
    }
  | { success: false; error: string };

export type CommitResult = 
  | { success: true; message: string; sourceRefId?: string }
  | { success: false; error: string };

export async function validateManualEntry(payload: ManualEntryPayload): Promise<ValidationResult> {
  // 1. Basic checks
  if (payload.qty <= 0) return { success: false, error: 'Kuantitas harus lebih dari 0' }
  
  if (['BONUS', 'PROMO', 'SAMPLE'].includes(payload.reasonCode)) {
    if (!payload.referenceNote || payload.referenceNote.trim() === '') {
      return { success: false, error: `Catatan Referensi WAJIB diisi untuk alasan ${payload.reasonCode}` }
    }
  }

  // 2. Fetch current physical balance to project
  const balanceRes = await getProductBalance(payload.productId)
  if (!balanceRes.success) return { success: false, error: 'Gagal mengambil saldo produk' }

  const currentBalance = balanceRes.qty || 0
  const projectedBalance = currentBalance - payload.qty

  if (projectedBalance < 0) {
    return { success: false, error: `Stok fisik tidak mencukupi. Tersedia fisik: ${currentBalance}, Dibutuhkan: ${payload.qty}` }
  }

  // 3. Fetch reserved stock for this product from CREATED orders
  const adminClient = createAdminClient()
  const { data: reservedItems } = await adminClient
    .from('order_items')
    .select('qty, orders!inner(status)')
    .eq('product_id', payload.productId)
    .eq('orders.status', 'CREATED')

  const reservedQty = (reservedItems || []).reduce((sum, item) => sum + (item.qty || 0), 0)
  const availableQty = Math.max(0, currentBalance - reservedQty)
  const isEatingReservation = payload.qty > availableQty

  return { 
    success: true, 
    currentBalance, 
    projectedBalance,
    reservedQty,
    availableQty,
    isEatingReservation
  }
}

export async function commitManualEntry(payload: ManualEntryPayload, idempotencyKey?: string): Promise<CommitResult> {
  // Run validation again for security
  const val = await validateManualEntry(payload)
  if (!val.success) return val

  if (val.isEatingReservation) {
    return { 
      success: false, 
      error: `Transaksi ditolak: Qty Keluar (${payload.qty} unit) melebihi Stok Aman Dijual (${val.availableQty} unit). Sisa ${val.reservedQty} unit sedang direservasi untuk order pending.` 
    }
  }

  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    userId = authData?.user?.id || null
  } catch {
    userId = null
  }

  const sourceRefId = idempotencyKey || `MANUAL-${Date.now()}` // Use as sourceRefId for tracking

  // Call the atomic FEFO RPC
  const fefoRes = await processStockOutFefo({
    productId: payload.productId,
    qtyNeeded: payload.qty,
    reasonCode: payload.reasonCode,
    channel: payload.channel,
    sourceType: 'MANUAL',
    sourceRefId: sourceRefId,
    createdBy: userId || undefined,
    referenceNote: payload.referenceNote
  })

  if (!fefoRes.success) {
    return { success: false, error: fefoRes.error || 'Gagal mengalokasikan stok via FEFO' }
  }

  return { success: true, message: 'Entri manual berhasil dicatat', sourceRefId }
}

export async function commitCorrection(ledgerId: string, referenceNote?: string, idempotencyKey?: string): Promise<CommitResult> {
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    userId = authData?.user?.id || null
  } catch {
    userId = null
  }
  const adminClient = createAdminClient()

  const idemp = idempotencyKey || `CORR-${ledgerId}-${Date.now()}`

  const { data, error } = await adminClient.rpc('process_manual_correction', {
    p_original_ledger_id: ledgerId,
    p_correction_note: referenceNote || null,
    p_idempotency_key: idemp,
    p_created_by: userId || null
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, message: 'Koreksi entri berhasil dicatat', sourceRefId: data?.correction_id || idemp }
}

export interface MaklonStockInPayload {
  productId: string
  qty: number
  batchMode: 'NEW' | 'EXISTING'
  batchCode?: string
  expiryDate?: string
  existingBatchId?: string
  referenceNote?: string
}

export async function validateMaklonStockIn(payload: MaklonStockInPayload) {
  if (!payload.productId) return { success: false, error: 'Produk wajib dipilih' }
  if (payload.qty <= 0) return { success: false, error: 'Jumlah barang masuk harus lebih dari 0' }

  if (payload.batchMode === 'NEW') {
    if (!payload.batchCode || payload.batchCode.trim() === '') {
      return { success: false, error: 'Kode Batch baru wajib diisi' }
    }
    if (!payload.expiryDate || payload.expiryDate.trim() === '') {
      return { success: false, error: 'Tanggal Kedaluwarsa wajib diisi' }
    }
  } else {
    if (!payload.existingBatchId) {
      return { success: false, error: 'Batch lama wajib dipilih' }
    }
  }

  // Fetch current physical stock balance to project new stock
  const balanceRes = await getProductBalance(payload.productId)
  if (!balanceRes.success) {
    return { success: false, error: 'Gagal mengambil saldo stok saat ini' }
  }

  const currentBalance = balanceRes.qty || 0
  const projectedBalance = currentBalance + payload.qty

  return { 
    success: true,
    currentBalance,
    projectedBalance
  }
}

export async function commitMaklonStockIn(payload: MaklonStockInPayload, idempotencyKey?: string): Promise<CommitResult> {
  const val = await validateMaklonStockIn(payload)
  if (!val.success) return { success: false, error: val.error || 'Validasi gagal' }

  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  let targetBatchId = payload.existingBatchId

  if (payload.batchMode === 'NEW') {
    // Check if batch code exists
    const { data: existingBatch } = await adminClient
      .from('batches')
      .select('id')
      .eq('product_id', payload.productId)
      .eq('batch_code', payload.batchCode?.trim())
      .maybeSingle()

    if (existingBatch) {
      targetBatchId = existingBatch.id
    } else {
      const { data: newBatch, error: newBatchErr } = await adminClient
        .from('batches')
        .insert({
          product_id: payload.productId,
          batch_code: payload.batchCode?.trim(),
          expiry_date: payload.expiryDate
        })
        .select('id')
        .single()

      if (newBatchErr || !newBatch) {
        return { success: false, error: `Gagal membuat batch baru: ${newBatchErr?.message}` }
      }
      targetBatchId = newBatch.id
    }
  }

  const idemp = idempotencyKey || `MAKLON-IN-${Date.now()}`

  // Atomic insert into stock_ledger using service role
  const { error: ledgerErr } = await adminClient
    .from('stock_ledger')
    .insert({
      product_id: payload.productId,
      batch_id: targetBatchId,
      qty_delta: payload.qty,
      reason_code: 'STOCK_IN',
      channel: 'INTERNAL',
      source_type: 'MAKLON_INBOUND',
      source_ref_id: idemp,
      created_by: userId || null,
      idempotency_key: idemp,
      reference_note: payload.referenceNote || 'Penerimaan Barang Masuk Maklon'
    })

  if (ledgerErr) {
    return { success: false, error: `Gagal memposting ledger barang masuk: ${ledgerErr.message}` }
  }

  return { success: true, message: 'Barang masuk maklon berhasil dicatat', sourceRefId: idemp }
}

export async function getProductBatches(productId: string) {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('batches')
    .select('id, batch_code, expiry_date')
    .eq('product_id', productId)
    .order('expiry_date', { ascending: true })

  return data || []
}
