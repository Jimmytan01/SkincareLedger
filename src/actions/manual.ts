'use server'

import { createClient } from '@/utils/supabase/server'
import { processStockOutFefo, getProductBalance, ReasonCode, Channel } from './stock'

export interface ManualEntryPayload {
  productId: string
  qty: number
  reasonCode: ReasonCode
  channel: Channel
  referenceNote?: string
}

export type ValidationResult = 
  | { success: true; currentBalance: number; projectedBalance: number }
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

  // 2. Fetch current balance to project
  const balanceRes = await getProductBalance(payload.productId)
  if (!balanceRes.success) return { success: false, error: 'Gagal mengambil saldo produk' }

  const currentBalance = balanceRes.qty || 0
  const projectedBalance = currentBalance - payload.qty

  if (projectedBalance < 0) {
    return { success: false, error: `Stok tidak mencukupi. Tersedia: ${currentBalance}, Dibutuhkan: ${payload.qty}` }
  }

  return { 
    success: true, 
    currentBalance, 
    projectedBalance 
  }
}

export async function commitManualEntry(payload: ManualEntryPayload, idempotencyKey?: string): Promise<CommitResult> {
  // Run validation again for security
  const val = await validateManualEntry(payload)
  if (!val.success) return val

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id

  const sourceRefId = idempotencyKey || `MANUAL-${Date.now()}` // Use as sourceRefId for tracking

  // Call the atomic FEFO RPC
  const fefoRes = await processStockOutFefo({
    productId: payload.productId,
    qtyNeeded: payload.qty,
    reasonCode: payload.reasonCode,
    channel: payload.channel,
    sourceType: 'MANUAL',
    sourceRefId: sourceRefId,
    createdBy: userId,
    referenceNote: payload.referenceNote
  })

  if (!fefoRes.success) {
    return { success: false, error: fefoRes.error || 'Gagal mengalokasikan stok via FEFO' }
  }

  return { success: true, message: 'Entri manual berhasil dicatat', sourceRefId }
}

export async function commitCorrection(ledgerId: string, correctionNote: string, idempotencyKey: string): Promise<CommitResult> {
  if (!correctionNote || correctionNote.trim() === '') {
    return { success: false, error: 'Alasan koreksi wajib diisi' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.rpc('process_manual_correction', {
    p_original_ledger_id: ledgerId,
    p_correction_note: correctionNote,
    p_idempotency_key: idempotencyKey,
    p_created_by: user?.id
  })

  if (error) {
    return { success: false, error: `Gagal mencatat entri koreksi: ${error.message}` }
  }

  return { success: true, message: 'Koreksi berhasil, stok telah dikembalikan ke batch asal.' }
}
