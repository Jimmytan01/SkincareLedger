'use client'

import { useState } from 'react'
import { createBundleRecipe } from '@/actions/bundle'
import { PlusCircle, Trash2, Save, AlertCircle, CheckCircle2, Activity } from 'lucide-react'

interface Product {
  id: string
  name: string
  sku: string
}

export default function BundleForm({ products }: { products: Product[] }) {
  const [bundleSku, setBundleSku] = useState('')
  const [components, setComponents] = useState<{ productId: string; qty: number }[]>([
    { productId: products[0]?.id || '', qty: 1 }
  ])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const addRow = () => {
    const usedIds = new Set(components.map(c => c.productId))
    const unusedProduct = products.find(p => !usedIds.has(p.id)) || products[0]
    setComponents([...components, { productId: unusedProduct?.id || '', qty: 1 }])
  }

  const removeRow = (index: number) => {
    if (components.length <= 1) return
    setComponents(components.filter((_, i) => i !== index))
  }

  const updateRow = (index: number, field: 'productId' | 'qty', value: string | number) => {
    const updated = [...components]
    updated[index] = { ...updated[index], [field]: value }
    setComponents(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const cleanSku = bundleSku.trim().toUpperCase()
    if (!cleanSku) {
      setError('Bundle SKU wajib diisi')
      return
    }

    if (components.length === 0) {
      setError('Minimal 1 komponen produk wajib ditambahkan')
      return
    }

    // Check for duplicate products in selection
    const productIds = components.map(c => c.productId)
    if (new Set(productIds).size !== productIds.length) {
      setError('Produk komponen yang sama dipilih lebih dari sekali. Harap gabungkan kuantitasnya dalam 1 baris.')
      return
    }

    // Check qty > 0
    for (const c of components) {
      if (c.qty < 1) {
        setError('Kuantitas komponen harus minimal 1')
        return
      }
    }

    setLoading(true)
    const res = await createBundleRecipe(cleanSku, components)
    setLoading(false)

    if (res.success) {
      setSuccess(`Resep bundle ${cleanSku} (v${res.version}) berhasil disimpan dengan ${components.length} komponen!`)
      setBundleSku('')
      setComponents([{ productId: products[0]?.id || '', qty: 1 }])
    } else {
      setError(res.error || 'Gagal menyimpan resep bundle')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
      {error && (
        <div className="p-3 bg-brick-50 border border-brick-200 text-brick-700 rounded-lg text-xs flex items-center gap-2">
          <AlertCircle className="shrink-0" size={16} />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-3 bg-jade-50 border border-jade-200 text-jade-700 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="shrink-0 text-jade-600" size={16} />
          <span>{success}</span>
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
        Bundle SKU
        <input 
          type="text" 
          value={bundleSku}
          onChange={e => setBundleSku(e.target.value)}
          required 
          placeholder="Contoh: PAKET-GLOW-01"
          className="border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-jade-500 focus:outline-none font-mono text-sm uppercase" 
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">Komponen Penyusun ({components.length})</span>
          <button 
            type="button"
            onClick={addRow}
            className="text-xs font-bold text-jade-600 hover:text-jade-700 flex items-center gap-1 bg-jade-50 hover:bg-jade-100 px-2.5 py-1 rounded-lg transition-colors border border-jade-200"
          >
            <PlusCircle size={14} /> Tambah Komponen
          </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto overflow-x-hidden pr-1">
          {components.map((comp, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 w-full min-w-0">
              <select 
                value={comp.productId}
                onChange={e => updateRow(idx, 'productId', e.target.value)}
                required 
                className="flex-1 min-w-0 border border-slate-300 rounded-md px-2 py-1.5 bg-white text-xs text-slate-800 focus:ring-2 focus:ring-jade-500 focus:outline-none truncate"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>

              <input 
                type="number" 
                min="1"
                value={comp.qty}
                onChange={e => updateRow(idx, 'qty', parseInt(e.target.value) || 1)}
                required
                className="w-14 shrink-0 border border-slate-300 rounded-md px-1.5 py-1.5 bg-white text-xs font-mono text-center focus:ring-2 focus:ring-jade-500 focus:outline-none" 
              />

              <button 
                type="button"
                onClick={() => removeRow(idx)}
                disabled={components.length <= 1}
                className="shrink-0 p-1.5 text-slate-400 hover:text-brick-600 disabled:opacity-30 disabled:hover:text-slate-400 rounded-md transition-colors"
                title="Hapus baris ini"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button 
        type="submit" 
        disabled={loading}
        className="mt-2 w-full px-4 py-2.5 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
      >
        {loading ? <Activity className="animate-spin" size={18} /> : <Save size={18} />} Simpan Resep (Versi Baru)
      </button>
    </form>
  )
}
