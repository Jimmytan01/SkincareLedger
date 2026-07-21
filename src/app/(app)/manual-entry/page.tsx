'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { ManualEntryPayload, validateManualEntry, commitManualEntry } from '@/actions/manual'
import { Keyboard, AlertTriangle, ArrowRight, CheckCircle2, Activity, Edit2 } from 'lucide-react'

export default function ManualEntryPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState<ManualEntryPayload>({
    productId: '',
    qty: 1,
    reasonCode: 'SALE',
    channel: 'OFFLINE',
    referenceNote: ''
  })

  // 0 = Draft, 1 = Confirmation, 2 = Success
  const [step, setStep] = useState(0)
  const [validationResult, setValidationResult] = useState<any>(null)
  
  const supabase = createClient()

  useEffect(() => {
    supabase.from('products').select('id, name, sku').then(({ data }) => {
      if (data) {
        setProducts(data)
        if (data.length > 0) {
          setForm(prev => ({ ...prev, productId: data[0].id }))
        }
      }
    })
  }, [])

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Client-side quick check
    if (['BONUS', 'PROMO', 'SAMPLE'].includes(form.reasonCode) && !form.referenceNote) {
      setError(`Catatan Referensi WAJIB diisi untuk alasan ${form.reasonCode}`)
      return
    }

    setLoading(true)
    const val = await validateManualEntry(form)
    setLoading(false)

    if (val.success) {
      setValidationResult(val)
      setStep(1) // Move to confirmation
    } else {
      setError(val.error || 'Terjadi kesalahan')
    }
  }

  const handleCommit = async () => {
    setError('')
    setLoading(true)
    const res = await commitManualEntry(form)
    setLoading(false)

    if (res.success) {
      setSuccess(res.message || 'Sukses')
      setStep(2)
    } else {
      setError(res.error || 'Terjadi kesalahan saat menulis ledger')
    }
  }

  const resetForm = () => {
    setForm({
      productId: products[0]?.id || '',
      qty: 1,
      reasonCode: 'SALE',
      channel: 'OFFLINE',
      referenceNote: ''
    })
    setStep(0)
    setError('')
    setSuccess('')
  }

  const productName = products.find(p => p.id === form.productId)?.name
  const isReasonRequiringNote = ['BONUS', 'PROMO', 'SAMPLE'].includes(form.reasonCode)

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl mx-auto">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Keyboard className="text-jade-500" /> Input Manual
        </h1>
        <p className="text-slate-500 mt-2">Keluarkan stok secara manual (tanpa melalui API Marketplace). Stok akan langsung dipotong dengan metode antrean FEFO.</p>
      </header>

      {error && (
        <div className="p-4 bg-brick-50 border border-brick-200 text-brick-700 rounded-xl flex gap-3 animate-in slide-in-from-top-2">
          <AlertTriangle className="shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold">Terjadi Kesalahan</h3>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {step === 0 && (
        <form onSubmit={handleReview} className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                Pilih Produk
                <select 
                  value={form.productId} 
                  onChange={e => setForm({...form, productId: e.target.value})}
                  className="border border-slate-300 rounded-lg px-3 py-2.5 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </label>

              <div className="flex gap-4">
                <label className="flex-1 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Alasan (Reason Code)
                  <select 
                    value={form.reasonCode} 
                    onChange={e => setForm({...form, reasonCode: e.target.value as any})}
                    className="border border-slate-300 rounded-lg px-3 py-2.5 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none font-semibold text-slate-800"
                  >
                    <option value="SALE">SALE (Penjualan Reguler)</option>
                    <option value="BONUS">BONUS (Bundling / Hadiah)</option>
                    <option value="PROMO">PROMO (Event Spesial)</option>
                    <option value="SAMPLE">SAMPLE (Barang Sampel)</option>
                    <option value="DAMAGED">DAMAGED (Rusak Gudang)</option>
                    <option value="EXPIRED">EXPIRED (Kedaluwarsa Gudang)</option>
                  </select>
                </label>

                <label className="flex-1 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Kanal Distribusi
                  <select 
                    value={form.channel} 
                    onChange={e => setForm({...form, channel: e.target.value as any})}
                    className="border border-slate-300 rounded-lg px-3 py-2.5 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none"
                  >
                    <option value="OFFLINE">OFFLINE (Toko Fisik)</option>
                    <option value="INTERNAL">INTERNAL (Keperluan Internal)</option>
                    <option value="SHOPEE">SHOPEE (Input Susulan)</option>
                    <option value="TIKTOK">TIKTOK (Input Susulan)</option>
                  </select>
                </label>

                <label className="w-32 flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Kuantitas Keluar
                  <input 
                    type="number" 
                    min="1" 
                    value={form.qty} 
                    onChange={e => setForm({...form, qty: Number(e.target.value)})} 
                    className="border border-slate-300 rounded-lg px-3 py-2.5 bg-white font-mono text-center text-lg focus:ring-2 focus:ring-jade-500 focus:outline-none" 
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                <div className="flex justify-between items-end">
                  <span>Catatan Referensi</span>
                  {isReasonRequiringNote && (
                    <span className="text-xs text-honey-600 font-bold px-2 py-0.5 bg-honey-50 border border-honey-200 rounded text-right">
                      * Wajib untuk alasan ini
                    </span>
                  )}
                </div>
                <input 
                  type="text" 
                  value={form.referenceNote || ''} 
                  onChange={e => setForm({...form, referenceNote: e.target.value})} 
                  placeholder={isReasonRequiringNote ? "Contoh: Hadiah Campaign Lebaran 2026" : "Opsional"}
                  className={`border rounded-lg px-3 py-2.5 bg-white focus:outline-none transition-colors ${
                    isReasonRequiringNote && !form.referenceNote 
                      ? 'border-honey-300 focus:ring-2 focus:ring-honey-500' 
                      : 'border-slate-300 focus:ring-2 focus:ring-jade-500'
                  }`} 
                />
              </label>
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
            <button 
              type="submit" 
              disabled={loading || (isReasonRequiringNote && !form.referenceNote)} 
              className="px-6 py-2.5 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors flex items-center gap-2 shadow-soft"
            >
              {loading ? <Activity className="animate-spin" size={18} /> : 'Tinjau & Validasi Stok'} <ArrowRight size={18} />
            </button>
          </div>
        </form>
      )}

      {step === 1 && validationResult && (
        <div className="bg-white rounded-xl shadow-xl border border-brick-200 overflow-hidden animate-in slide-in-from-right-8 duration-300">
          <div className="p-6 bg-brick-50 border-b border-brick-100 flex items-start gap-4">
            <div className="p-2 bg-brick-100 text-brick-600 rounded-lg shrink-0 mt-0.5">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-brick-900">Konfirmasi Pencatatan Permanen</h2>
              <p className="text-sm text-brick-700 mt-1">
                Tindakan ini akan mengunci alokasi FEFO secara permanen dan tidak bisa dibatalkan tanpa membuat entri koreksi. Mohon periksa ulang proyeksi stok.
              </p>
            </div>
          </div>
          
          <div className="p-6">
            <table className="w-full text-left text-sm text-slate-600 border-collapse">
              <tbody className="divide-y divide-slate-100">
                <tr><th className="py-3 font-medium text-slate-500 w-1/3">Produk</th><td className="py-3 font-semibold text-slate-900">{productName}</td></tr>
                <tr><th className="py-3 font-medium text-slate-500">Qty Keluar</th><td className="py-3 font-mono font-bold text-brick-600 text-lg">-{form.qty}</td></tr>
                <tr><th className="py-3 font-medium text-slate-500">Alasan</th><td className="py-3"><span className="bg-slate-100 text-slate-700 px-2 py-1 rounded font-semibold text-xs">{form.reasonCode}</span></td></tr>
                <tr><th className="py-3 font-medium text-slate-500">Kanal</th><td className="py-3 text-xs">{form.channel}</td></tr>
                <tr><th className="py-3 font-medium text-slate-500">Referensi</th><td className="py-3 italic">{form.referenceNote || '-'}</td></tr>
                
                <tr className="bg-slate-50">
                  <th className="py-3 px-4 rounded-l-lg font-medium text-slate-700">Stok Saat Ini (Sistem)</th>
                  <td className="py-3 px-4 rounded-r-lg font-mono text-slate-700">{validationResult.currentBalance}</td>
                </tr>
                <tr className="bg-brick-50/50">
                  <th className="py-4 px-4 rounded-l-lg font-bold text-brick-900">Proyeksi Sisa Stok</th>
                  <td className="py-4 px-4 rounded-r-lg font-mono font-bold text-brick-700 text-xl">{validationResult.projectedBalance}</td>
                </tr>
              </tbody>
            </table>

            <div className="flex gap-4 mt-8">
              <button 
                onClick={() => setStep(0)} 
                className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Edit2 size={18} /> Kembali Edit
              </button>
              <button 
                onClick={handleCommit} 
                disabled={loading} 
                className="flex-1 px-4 py-3 bg-brick-600 hover:bg-brick-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors shadow-soft flex items-center justify-center gap-2"
              >
                {loading ? <Activity className="animate-spin" size={18} /> : <CheckCircle2 size={18} />} Konfirmasi & Catat ke Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="p-8 bg-jade-50 border border-jade-200 text-center rounded-2xl animate-in zoom-in-95 duration-300 shadow-soft">
          <CheckCircle2 size={64} className="mx-auto text-jade-500 mb-4" />
          <h2 className="text-2xl font-bold text-jade-900 mb-2">{success}</h2>
          <p className="text-jade-700 mb-8 max-w-lg mx-auto">
            Baris Ledger telah berhasil ditambahkan dan stok fisik produk ini telah dialokasikan dengan sistem antrean FEFO otomatis.
          </p>
          <button 
            onClick={resetForm} 
            className="px-6 py-3 bg-jade-600 hover:bg-jade-700 text-white rounded-xl font-bold transition-colors shadow-sm inline-flex items-center gap-2"
          >
            <Keyboard size={20} /> Buat Entri Baru
          </button>
        </div>
      )}
    </div>
  )
}
