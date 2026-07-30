'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { saveOpnameDraft } from '@/actions/opname'
import { ClipboardList, Save, ArrowRight, Activity, Info, ChevronLeft, Search } from 'lucide-react'
import { formatQty } from '@/utils/format'

export default function OpnameDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const sessionId = resolvedParams.id
  
  const [products, setProducts] = useState<any[]>([])
  const [inputData, setInputData] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sessionInfo, setSessionInfo] = useState<any>(null)
  
  const [searchQuery, setSearchQuery] = useState('')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const fetchData = async () => {
      // Get session
      const { data: sess } = await supabase.from('opname_sessions').select('*').eq('id', sessionId).single()
      setSessionInfo(sess)

      // Get products and their current balances
      const { data: prods } = await supabase.from('products').select('id, name, sku')
      const { data: balances } = await supabase.from('stock_balance_cache').select('product_id, qty')
      
      const balMap = new Map()
      balances?.forEach(b => {
        balMap.set(b.product_id, (balMap.get(b.product_id) || 0) + b.qty)
      })

      const prodList = (prods || []).map(p => ({
        ...p,
        systemQty: balMap.get(p.id) || 0
      }))

      setProducts(prodList)

      // Check if there's existing draft
      const { data: items } = await supabase.from('opname_items').select('*').eq('session_id', sessionId)
      if (items && items.length > 0) {
        const initialInput: Record<string, number> = {}
        items.forEach(i => {
          initialInput[i.product_id] = i.physical_qty
        })
        setInputData(initialInput)
      } else {
        // Blind counting: DO NOT pre-fill with system balance
        setInputData({})
      }
      setLoading(false)
    }
    fetchData()
  }, [sessionId])

  const handleSaveAndReview = async () => {
    setSaving(true)
    const itemsToSave = products.map(p => ({
      productId: p.id,
      systemQty: p.systemQty,
      physicalQty: inputData[p.id] ?? 0
    }))

    const res = await saveOpnameDraft({ sessionId, items: itemsToSave })
    if (res.success) {
      router.push(`/opname/${sessionId}/review`)
    } else {
      alert(res.error)
      setSaving(false)
    }
  }

  const handleSaveDraftOnly = async () => {
    setSaving(true)
    const itemsToSave = products.map(p => ({
      productId: p.id,
      systemQty: p.systemQty,
      physicalQty: inputData[p.id] ?? 0
    }))

    const res = await saveOpnameDraft({ sessionId, items: itemsToSave })
    if (res.success) {
      router.push('/opname')
    } else {
      alert(res.error)
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
      <Activity className="animate-spin mb-4" size={32} />
      <p>Memuat lembar kerja opname...</p>
    </div>
  )

  if (sessionInfo?.status === 'COMPLETED') return (
    <div className="bg-jade-50 border border-jade-200 rounded-xl p-8 text-center max-w-lg mx-auto mt-12 shadow-soft">
      <ClipboardList className="mx-auto text-jade-500 mb-4" size={48} />
      <h2 className="text-xl font-bold text-jade-900 mb-2">Sesi Ini Sudah Selesai</h2>
      <p className="text-jade-700 mb-6">Penghitungan fisik pada sesi ini telah dikonfirmasi dan selisihnya sudah dicatat ke buku besar.</p>
      <button 
        onClick={() => router.push(`/opname/${sessionId}/review`)}
        className="px-6 py-2.5 bg-jade-600 hover:bg-jade-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
      >
        Lihat Hasil Review
      </button>
    </div>
  )

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <button 
            onClick={() => router.push('/opname')}
            className="text-dusty-600 hover:text-jade-600 font-medium text-sm flex items-center gap-1 mb-2 transition-colors"
          >
            <ChevronLeft size={16} /> Kembali ke Daftar Sesi
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ClipboardList className="text-jade-600" /> Input Hitung Fisik
          </h1>
          <p className="text-slate-500 mt-2 flex items-center gap-1.5 font-mono text-sm">
            ID Sesi: <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{sessionId.split('-')[0]}</span>
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 flex items-start gap-2 max-w-md">
          <Info className="shrink-0 mt-0.5 text-slate-400" size={16} />
          <p>
            Kolom <strong>Hitung Fisik</strong> dikosongkan secara default (Blind Counting) untuk menjaga independensi hitungan fisik di lapangan tanpa terpengaruh angka sistem.
          </p>
        </div>
      </header>

      <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center gap-4">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Cari SKU atau Nama Produk..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-jade-500 focus:outline-none text-sm"
            />
          </div>
          <div className="text-sm font-medium text-slate-500">
            {filteredProducts.length} Produk
          </div>
        </div>

        {/* Table Container (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-0">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-6 py-3 font-semibold text-slate-700 w-[15%]">SKU</th>
                <th className="px-6 py-3 font-semibold text-slate-700 w-[35%]">Nama Produk</th>
                <th className="px-6 py-3 font-semibold text-slate-700 text-right w-[15%]">Saldo Sistem</th>
                <th className="px-6 py-3 font-semibold text-slate-700 w-[20%]">Hitung Fisik</th>
                <th className="px-6 py-3 font-semibold text-slate-700 w-[15%] text-right">Selisih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-400">Pencarian tidak ditemukan.</td>
                </tr>
              ) : (
                filteredProducts.map(p => {
                  const currentPhysical = inputData[p.id]
                  const hasInput = currentPhysical !== undefined
                  const diff = hasInput ? currentPhysical - p.systemQty : null
                  const hasDiff = hasInput && diff !== 0

                  return (
                    <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${hasDiff ? 'bg-honey-50/20' : ''}`}>
                      <td className="px-6 py-3 font-mono text-xs text-dusty-600">{p.sku}</td>
                      <td className="px-6 py-3 font-medium text-slate-900">{p.name}</td>
                      <td className="px-6 py-3 text-right font-mono text-slate-500 text-base">{formatQty(p.systemQty)}</td>
                      <td className="px-6 py-3">
                        <input 
                          type="number" 
                          min="0"
                          value={currentPhysical ?? ''} 
                          onChange={e => {
                            const val = e.target.value
                            setInputData({...inputData, [p.id]: val === '' ? undefined : parseInt(val) || 0})
                          }}
                          className={`w-28 px-3 py-2 border rounded-lg font-mono text-base focus:outline-none transition-colors ${
                            hasDiff 
                              ? 'border-honey-300 bg-honey-50 text-honey-900 focus:ring-2 focus:ring-honey-500' 
                              : 'border-slate-300 bg-white focus:ring-2 focus:ring-jade-500'
                          }`}
                        />
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-base">
                        {hasInput ? (
                          diff! > 0 ? <span className="text-jade-600">+{formatQty(diff)}</span> :
                          diff! < 0 ? <span className="text-brick-600">{formatQty(diff)}</span> :
                          <span className="text-slate-400">Cocok</span>
                        ) : <span className="text-slate-300">-</span>}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center gap-4">
          <button 
            onClick={handleSaveDraftOnly}
            disabled={saving}
            className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center gap-2"
          >
            <Save size={18} /> Simpan Draft & Keluar
          </button>
          <button 
            onClick={handleSaveAndReview} 
            disabled={saving || Object.keys(inputData).length < products.length} 
            className="px-8 py-2.5 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 shadow-soft"
          >
            {saving ? (
              <><Activity className="animate-spin" size={18} /> Menyimpan...</>
            ) : Object.keys(inputData).length < products.length ? (
              <>Sisa {products.length - Object.keys(inputData).length} item</>
            ) : (
              <>Tinjau Selisih & Konfirmasi <ArrowRight size={18} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
