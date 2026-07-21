'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'

export async function resolveAnomaly(anomalyId: string, resolutionNote: string) {
  if (!resolutionNote || resolutionNote.trim() === '') {
    return { success: false, error: 'Catatan penyelesaian (resolution note) wajib diisi' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminClient = createAdminClient()

  const { error } = await adminClient
    .from('anomalies')
    .update({
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id,
      resolution_note: resolutionNote
    })
    .eq('id', anomalyId)

  if (error) {
    return { success: false, error: 'Gagal menandai anomali sebagai selesai: ' + error.message }
  }

  return { success: true }
}
