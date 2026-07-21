import { createClient } from '@/utils/supabase/server'
import { Package, CheckCircle2, AlertCircle, Search } from 'lucide-react'

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data: prods } = await supabase.from('products').select('*')
  const { data: balances } = await supabase.from('stock_balance_cache').select('product_id, qty')
  
  const balMap = new Map()
  balances?.forEach(b => {
    balMap.set(b.product_id, (balMap.get(b.product_id) || 0) + b.qty)
  })

  const prodList = (prods || []).map(p => ({
    ...p,
    totalQty: balMap.get(p.id) || 0
  }))

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Package className="text-jade-500" /> Master Produk
        </h1>
        <p className="text-slate-500 mt-2">Daftar semua produk SKU aktif beserta status verifikasi opname.</p>
      </header>

      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-sm font-semibold text-slate-700">Total {prodList.length} Produk</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Produk</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status Verifikasi</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Total Stok (Unit)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {prodList.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400">Tidak ada produk.</td></tr>
              ) : prodList.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{p.sku}</div>
                  </td>
                  <td className="px-6 py-4">
                    {p.is_verified ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-jade-50 text-jade-700 text-xs font-semibold">
                        <CheckCircle2 size={14} /> Terverifikasi (Opname)
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-honey-50 text-honey-700 text-xs font-semibold">
                        <AlertCircle size={14} /> Belum Terverifikasi (Opening Balance)
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-700 text-base">
                    {p.totalQty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
