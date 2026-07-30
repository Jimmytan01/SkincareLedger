'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createBundleRecipe(bundleSku: string, components: { productId: string, qty: number }[]) {
  const adminClient = createAdminClient()

  const cleanSku = bundleSku.trim().toUpperCase()

  // Determine next version
  const { data: latest } = await adminClient
    .from('bundle_recipes')
    .select('version')
    .eq('bundle_sku', cleanSku)
    .order('version', { ascending: false })
    .limit(1)

  const latestVersion = (latest && latest.length > 0) ? latest[0].version : 0
  const newVersion = latestVersion + 1

  const rows = components.map(c => ({
    bundle_sku: cleanSku,
    version: newVersion,
    component_product_id: c.productId,
    qty: c.qty
  }))

  const { error } = await adminClient.from('bundle_recipes').insert(rows)

  if (error) {
    console.error('Error creating bundle recipe:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/bundles')
  revalidatePath('/simulation')
  return { success: true, version: newVersion }
}

export async function getInactiveBundleSkus(): Promise<string[]> {
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('processed_events')
    .select('event_id')
    .eq('event_type', 'BUNDLE_INACTIVE')

  if (error || !data) return []

  const PREFIX = 'INACTIVE_BUNDLE:'
  return data
    .map(row => row.event_id)
    .filter(id => id.startsWith(PREFIX))
    .map(id => id.replace(PREFIX, ''))
}

export async function toggleBundleStatus(bundleSku: string, targetActive: boolean) {
  const adminClient = createAdminClient()
  const cleanSku = bundleSku.trim().toUpperCase()
  const eventId = `INACTIVE_BUNDLE:${cleanSku}`

  try {
    if (targetActive) {
      // Activating bundle: delete inactive marker
      const { error } = await adminClient
        .from('processed_events')
        .delete()
        .eq('event_id', eventId)

      if (error) throw new Error(error.message)
    } else {
      // Deactivating bundle: insert inactive marker
      const { error } = await adminClient
        .from('processed_events')
        .insert({
          event_id: eventId,
          event_type: 'BUNDLE_INACTIVE',
          processed_at: new Date().toISOString()
        })

      if (error && error.code !== '23505') {
        throw new Error(error.message)
      }
    }

    revalidatePath('/bundles')
    revalidatePath('/simulation')
    return { success: true, isActive: targetActive }
  } catch (err: any) {
    console.error(`Error toggling bundle status for ${cleanSku}:`, err)
    return { success: false, error: err.message || 'Gagal mengubah status bundle' }
  }
}
