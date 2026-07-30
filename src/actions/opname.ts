'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
// Unused import removed

export async function startOpnameSession() {
  const adminClient = createAdminClient()
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    userId = authData?.user?.id || null
  } catch {
    userId = null
  }

  const { data, error } = await adminClient
    .from('opname_sessions')
    .insert({ created_by: userId })
    .select('id')
    .single()

  if (error || !data) {
    return { success: false, error: 'Gagal memulai sesi opname' }
  }

  return { success: true, sessionId: data.id }
}

export interface OpnameDraftPayload {
  sessionId: string
  items: {
    productId: string
    systemQty: number
    physicalQty: number
  }[]
}

export async function saveOpnameDraft(payload: OpnameDraftPayload) {
  const adminClient = createAdminClient()

  // First clear existing items for this session to do a fresh upsert
  await adminClient.from('opname_items').delete().eq('session_id', payload.sessionId)

  if (payload.items.length === 0) return { success: true }

  const inserts = payload.items.map(i => ({
    session_id: payload.sessionId,
    product_id: i.productId,
    system_qty: i.systemQty,
    physical_qty: i.physicalQty,
    difference: i.physicalQty - i.systemQty
  }))

  const { error } = await adminClient.from('opname_items').insert(inserts)

  if (error) {
    return { success: false, error: 'Gagal menyimpan draft opname: ' + error.message }
  }

  return { success: true }
}

export async function commitOpnameSession(sessionId: string) {
  const adminClient = createAdminClient()
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    userId = authData?.user?.id || null
  } catch {
    userId = null
  }

  const { error } = await adminClient.rpc('process_opname_session', {
    p_session_id: sessionId,
    p_created_by: userId
  })

  if (error) {
    return { success: false, error: `Gagal memproses sesi opname: ${error.message}` }
  }

  return { success: true, message: 'Sesi opname berhasil diselesaikan dan ledger telah diperbarui secara atomik' }
}
