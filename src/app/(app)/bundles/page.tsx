import { createAdminClient } from '@/utils/supabase/admin'
import { PackageOpen, PlusCircle, Layers, Info } from 'lucide-react'
import BundleForm from './BundleForm'
import BundleTable, { BundleGroup } from './BundleTable'
import { getInactiveBundleSkus } from '@/actions/bundle'

export default async function BundlesPage() {
  const supabase = createAdminClient()
  
  // Fetch bundle recipes, products, and inactive status list in parallel
  const [recipesRes, productsRes, inactiveSkus] = await Promise.all([
    supabase
      .from('bundle_recipes')
      .select('*, products(name, sku)')
      .order('bundle_sku', { ascending: true }),
    supabase
      .from('products')
      .select('id, name, sku')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    getInactiveBundleSkus()
  ])

  const recipes = recipesRes.data
  const products = productsRes.data

  // Group recipes by bundle SKU and extract the latest version per bundle
  const bundledMap = new Map<string, any[]>()
  if (recipes) {
    recipes.forEach(r => {
      if (!bundledMap.has(r.bundle_sku)) bundledMap.set(r.bundle_sku, [])
      bundledMap.get(r.bundle_sku)!.push(r)
    })
  }

  const activeBundles: BundleGroup[] = Array.from(bundledMap.entries()).map(([bundleSku, items]) => {
    const maxVersion = Math.max(...items.map(i => i.version))
    const activeComponents = items.filter(i => i.version === maxVersion)
    const isInactive = inactiveSkus.includes(bundleSku)

    return {
      bundleSku,
      version: maxVersion,
      isActive: !isInactive,
      components: activeComponents
    }
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <PackageOpen className="text-jade-500" /> Manajemen Resep Bundle
        </h1>
        <p className="text-slate-500 mt-2">Atur komponen satuan pembentuk bundle. Pesanan bundle yang masuk otomatis dipecah ke produk satuan sesuai resep ini.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Formulir Buat Resep Baru (Builder Multi-Komponen) */}
        <section className="lg:col-span-4 bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden h-fit">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <PlusCircle className="text-dusty-500" size={18} />
            <h2 className="font-semibold text-slate-800">Buat / Update Resep</h2>
          </div>

          <BundleForm products={products || []} />
        </section>

        {/* Daftar Resep Aktif */}
        <section className="lg:col-span-8 bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-[520px] relative">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Layers className="text-dusty-500" size={18} />
              <h2 className="font-semibold text-slate-800">Daftar Bundle SKU Terdaftar (Versi Aktif)</h2>
            </div>
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-500 flex items-center gap-2 shrink-0">
            <Info size={14} className="text-slate-400 shrink-0" />
            <span>Order lama tetap menggunakan snapshot versi resep saat order dibuat, tidak berubah walau resep diedit belakangan.</span>
          </div>

          <div className="flex-1 overflow-y-auto relative touch-pan-y">
            <BundleTable bundles={activeBundles} />
          </div>

          {/* Visual cue scrollability: fade gradient at bottom */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
        </section>

      </div>
    </div>
  )
}
