'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function createBundleRecipe(bundleSku: string, components: { productId: string, qty: number }[]) {
  const adminClient = createAdminClient()

  const cleanSku = bundleSku.trim().toUpperCase()

  // Ensure bundle SKU exists in bundles master table with is_active = true
  try {
    await adminClient
      .from('bundles')
      .upsert({ bundle_sku: cleanSku, is_active: true }, { onConflict: 'bundle_sku', ignoreDuplicates: true })
  } catch (err) {
    console.warn('Could not upsert into bundles table (table might be pending migration):', err)
  }

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

  try {
    revalidatePath('/bundles')
    revalidatePath('/simulation')
  } catch {
    // Ignore revalidatePath error when called outside Next.js request context
  }
  return { success: true, version: newVersion }
}

export async function getInactiveBundleSkus(): Promise<string[]> {
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('bundles')
    .select('bundle_sku')
    .eq('is_active', false)

  if (error || !data) return []

  return data.map(row => row.bundle_sku)
}

export async function toggleBundleStatus(bundleSku: string, targetActive: boolean) {
  const adminClient = createAdminClient()
  const cleanSku = bundleSku.trim().toUpperCase()

  try {
    const { error } = await adminClient
      .from('bundles')
      .upsert(
        { bundle_sku: cleanSku, is_active: targetActive },
        { onConflict: 'bundle_sku' }
      )

    if (error) throw new Error(error.message)

    try {
      revalidatePath('/bundles')
      revalidatePath('/simulation')
    } catch {
      // Ignore revalidatePath error when called outside Next.js request context
    }
    return { success: true, isActive: targetActive }
  } catch (err: any) {
    console.error(`Error toggling bundle status for ${cleanSku}:`, err)
    return { success: false, error: err.message || 'Gagal mengubah status bundle' }
  }
}
