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

export interface MultiManualEntryItem {
  productId: string
  qty: number
}

export interface MultiManualEntryPayload {
  items: MultiManualEntryItem[]
  reasonCode: ReasonCode
  channel: Channel
  referenceNote?: string
}

export interface MultiValidationProductItem {
  productId: string
  productName: string
  productSku: string
  qty: number
  currentBalance: number
  reservedQty: number
  availableQty: number
  projectedBalance: number
  isEatingReservation: boolean
  isPhysicalInsufficient: boolean
}

export type MultiValidationResult =
  | {
      success: true
      hasError: boolean
      isBlocked: boolean
      errorMessage?: string
      items: MultiValidationProductItem[]
    }
  | { success: false; error: string }

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

export async function validateMultiManualEntry(payload: MultiManualEntryPayload): Promise<MultiValidationResult> {
  if (!payload.items || payload.items.length === 0) {
    return { success: false, error: 'Minimal 1 produk wajib ditambahkan' }
  }

  if (['BONUS', 'PROMO', 'SAMPLE'].includes(payload.reasonCode)) {
    if (!payload.referenceNote || payload.referenceNote.trim() === '') {
      return { success: false, error: `Catatan Referensi WAJIB diisi untuk alasan ${payload.reasonCode}` }
    }
  }

  // Check duplicate product IDs
  const productIds = payload.items.map(i => i.productId)
  if (new Set(productIds).size !== productIds.length) {
    return { success: false, error: 'Produk yang sama dipilih lebih dari sekali. Harap gabungkan kuantitasnya dalam 1 baris.' }
  }

  const adminClient = createAdminClient()

  // Fetch product info for all items
  const { data: prodData } = await adminClient
    .from('products')
    .select('id, name, sku')
    .in('id', productIds)

  const prodMap = new Map((prodData || []).map(p => [p.id, p]))

  const validationItems: MultiValidationProductItem[] = []
  let hasError = false
  let isBlocked = false

  for (const item of payload.items) {
    if (item.qty <= 0) {
      return { success: false, error: 'Kuantitas setiap produk harus lebih dari 0' }
    }

    const pInfo = prodMap.get(item.productId)
    const pName = pInfo?.name || item.productId
    const pSku = pInfo?.sku || ''

    const balanceRes = await getProductBalance(item.productId)
    const currentBalance = balanceRes.success ? (balanceRes.qty || 0) : 0
    const projectedBalance = currentBalance - item.qty

    // Reserved stock from CREATED orders
    const { data: reservedItems } = await adminClient
      .from('order_items')
      .select('qty, orders!inner(status)')
      .eq('product_id', item.productId)
      .eq('orders.status', 'CREATED')

    const reservedQty = (reservedItems || []).reduce((sum, r) => sum + (r.qty || 0), 0)
    const availableQty = Math.max(0, currentBalance - reservedQty)

    const isPhysicalInsufficient = projectedBalance < 0
    const isEatingReservation = item.qty > availableQty

    if (isPhysicalInsufficient || isEatingReservation) {
      hasError = true
      isBlocked = true
    }

    validationItems.push({
      productId: item.productId,
      productName: pName,
      productSku: pSku,
      qty: item.qty,
      currentBalance,
      reservedQty,
      availableQty,
      projectedBalance,
      isEatingReservation,
      isPhysicalInsufficient
    })
  }

  let errorMessage: string | undefined
  if (isBlocked) {
    const blockedNames = validationItems
      .filter(i => i.isEatingReservation || i.isPhysicalInsufficient)
      .map(i => `${i.productName} (${i.productSku})`)
      .join(', ')
    errorMessage = `Transaksi ditolak (All-or-Nothing): Qty keluar untuk produk [${blockedNames}] melebihi Stok Aman Dijual / Stok Fisik.`
  }

  return {
    success: true,
    hasError,
    isBlocked,
    errorMessage,
    items: validationItems
  }
}

export async function commitMultiManualEntry(payload: MultiManualEntryPayload, idempotencyKey?: string): Promise<CommitResult> {
  const val = await validateMultiManualEntry(payload)
  if (!val.success) return val

  if (val.isBlocked) {
    return {
      success: false,
      error: val.errorMessage || 'Transaksi ditolak: Salah satu atau lebih produk melanggar batas Stok Aman Dijual.'
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

  const batchRefId = idempotencyKey || `MANUAL-${Date.now()}`

  for (const item of payload.items) {
    const fefoRes = await processStockOutFefo({
      productId: item.productId,
      qtyNeeded: item.qty,
      reasonCode: payload.reasonCode,
      channel: payload.channel,
      sourceType: 'MANUAL',
      sourceRefId: batchRefId,
      createdBy: userId || undefined,
      referenceNote: payload.referenceNote
    })

    if (!fefoRes.success) {
      return { success: false, error: fefoRes.error || `Gagal mengalokasikan stok via FEFO untuk produk ${item.productId}` }
    }
  }

  return { success: true, message: `Entri manual ${payload.items.length} produk berhasil dicatat ke Ledger`, sourceRefId: batchRefId }
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
