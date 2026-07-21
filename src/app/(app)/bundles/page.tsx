import { createClient } from '@/utils/supabase/server'
import { createBundleRecipe } from '@/actions/bundle'
import { PackageOpen, Save, PlusCircle, Layers, FileDigit, Info } from 'lucide-react'

export default async function BundlesPage() {
  const supabase = await createClient()
  
  // Fetch active bundle recipes
  const { data: recipes } = await supabase.from('bundle_recipes').select('*, products(name, sku)').order('bundle_sku', { ascending: true })
  const { data: products } = await supabase.from('products').select('*')

  // Group recipes by bundle SKU to make it look nicer
  const bundledMap = new Map<string, any[]>()
  if (recipes) {
    recipes.forEach(r => {
      if (!bundledMap.has(r.bundle_sku)) bundledMap.set(r.bundle_sku, [])
      bundledMap.get(r.bundle_sku)!.push(r)
    })
  }
  const bundledGroups = Array.from(bundledMap.entries())

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <PackageOpen className="text-jade-500" /> Manajemen Resep Bundle
        </h1>
        <p className="text-slate-500 mt-2">Atur komponen satuan pembentuk bundle. Pesanan bundle yang masuk otomatis dipecah ke produk satuan sesuai resep ini.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Formulir Buat Resep Baru */}
        <section className="lg:col-span-1 bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden h-fit">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <PlusCircle className="text-dusty-500" size={18} />
            <h2 className="font-semibold text-slate-800">Buat / Update Resep</h2>
          </div>
          
          <div className="p-4 bg-honey-50/50 border-b border-honey-100 text-xs text-honey-800 flex items-start gap-2">
            <Info className="shrink-0 mt-0.5 text-honey-600" size={14} />
            <p>Mengupdate resep dengan Bundle SKU yang sudah ada akan otomatis membuat versi baru (<strong>v2, v3, dst</strong>). Order lama tetap menggunakan resep versi lama.</p>
          </div>

          <form action={async (formData) => {
            'use server'
            const bundleSku = formData.get('bundle_sku') as string
            const componentId = formData.get('component_product_id') as string
            const qty = Number(formData.get('qty'))
            await createBundleRecipe(bundleSku, [{ productId: componentId, qty }])
          }} className="p-5 flex flex-col gap-5">
            
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Bundle SKU
              <input 
                type="text" 
                name="bundle_sku" 
                required 
                placeholder="Contoh: PAKET-GLOW-01"
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-jade-500 focus:outline-none font-mono text-sm" 
              />
            </label>
            
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Produk Komponen Tunggal
              <select 
                name="component_product_id" 
                required 
                className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none text-sm"
              >
                {products?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </label>
            
            <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
              Jumlah Komponen dalam Bundle
              <input 
                type="number" 
                name="qty" 
                min="1" 
                required 
                className="border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-jade-500 focus:outline-none font-mono" 
              />
            </label>
            
            <button 
              type="submit" 
              className="mt-2 w-full px-4 py-2.5 bg-jade-600 hover:bg-jade-700 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              <Save size={18} /> Simpan Resep
            </button>
          </form>
        </section>

        {/* Daftar Resep Aktif */}
        <section className="lg:col-span-2 bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Layers className="text-dusty-500" size={18} />
            <h2 className="font-semibold text-slate-800">Daftar Bundle SKU Terdaftar</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold text-slate-700">Bundle SKU</th>
                  <th className="px-5 py-3 font-semibold text-slate-700">Versi Aktif</th>
                  <th className="px-5 py-3 font-semibold text-slate-700">Komponen Penyusun</th>
                  <th className="px-5 py-3 font-semibold text-slate-700 text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bundledGroups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-slate-400">Belum ada resep bundle yang didaftarkan.</td>
                  </tr>
                ) : (
                  bundledGroups.map(([bundleSku, items]) => {
                    // Because a bundle can have multiple components, we map through them
                    // Note: For now the form only supports 1 component per save, but database supports multiple
                    return items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        {idx === 0 ? (
                          <td className="px-5 py-3 font-mono text-sm font-semibold text-slate-900 border-r border-slate-100 align-top" rowSpan={items.length}>
                            {bundleSku}
                          </td>
                        ) : null}
                        <td className="px-5 py-3 align-top">
                          <span className="inline-flex items-center gap-1 bg-dusty-50 text-dusty-700 px-2 py-0.5 rounded font-mono text-xs border border-dusty-200">
                            <FileDigit size={12} /> v{item.version}
                          </span>
                        </td>
                        <td className="px-5 py-3 align-top">
                          <div className="font-medium text-slate-900">{item.products?.name}</div>
                          <div className="font-mono text-xs text-slate-500">{item.products?.sku}</div>
                        </td>
                        <td className="px-5 py-3 align-top text-right font-mono font-bold text-base text-slate-700">
                          {item.qty}
                        </td>
                      </tr>
                    ))
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  )
}
