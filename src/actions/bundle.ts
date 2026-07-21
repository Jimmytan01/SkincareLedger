'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createBundleRecipe(bundleSku: string, components: { productId: string, qty: number }[]) {
  const supabase = await createClient()

  // Determine next version
  const { data: latest } = await supabase
    .from('bundle_recipes')
    .select('version')
    .eq('bundle_sku', bundleSku)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const newVersion = (latest?.version || 0) + 1

  const rows = components.map(c => ({
    bundle_sku: bundleSku,
    version: newVersion,
    component_product_id: c.productId,
    qty: c.qty
  }))

  const { error } = await supabase.from('bundle_recipes').insert(rows)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/bundles')
  return { success: true, version: newVersion }
}
