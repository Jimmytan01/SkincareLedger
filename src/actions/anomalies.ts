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

export async function resolveAnomaliesBulk(anomalyIds: string[], resolutionNote: string) {
  if (!anomalyIds || anomalyIds.length === 0) {
    return { success: false, error: 'Tidak ada anomali yang dipilih' }
  }

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
    .in('id', anomalyIds)

  if (error) {
    return { success: false, error: 'Gagal menandai anomali sebagai selesai: ' + error.message }
  }

  return { success: true, count: anomalyIds.length }
}

export async function getOpenAnomalies() {
  const adminClient = createAdminClient()
  const { data, count, error } = await adminClient
    .from('anomalies')
    .select('id, type, description, detected_at, status', { count: 'exact' })
    .eq('status', 'OPEN')
    .order('detected_at', { ascending: true })

  if (error) {
    console.error('Error fetching open anomalies:', error)
  }

  const resultCount = data ? data.length : (count || 0)

  return {
    data: data || [],
    count: resultCount
  }
}
