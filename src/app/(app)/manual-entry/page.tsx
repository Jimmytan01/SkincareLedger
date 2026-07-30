'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { formatQty } from '@/utils/format'
import { 
  ManualEntryPayload, 
  validateManualEntry, 
  commitManualEntry, 
  MaklonStockInPayload, 
  validateMaklonStockIn, 
  commitMaklonStockIn,
  getProductBatches 
} from '@/actions/manual'
import { 
  Keyboard, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle2, 
  Activity, 
  Edit2, 
  PackagePlus, 
  PackageMinus,
  Calendar,
  Layers
} from 'lucide-react'

export default function ManualEntryPage() {
  const [products, setProducts] = useState<any[]>([])
  const [loadingOut, setLoadingOut] = useState(false)
  const [loadingIn, setLoadingIn] = useState(false)
  
  const [errorOut, setErrorOut] = useState('')
  const [errorIn, setErrorIn] = useState('')

  const [successMsg, setSuccessMsg] = useState('')

  // Card Kanan: Form Barang Keluar
  const [formOut, setFormOut] = useState<ManualEntryPayload>({
    productId: '',
    qty: 1,
    reasonCode: 'SALE',
    channel: 'OFFLINE',
    referenceNote: ''
  })
  const [stepOut, setStepOut] = useState<0 | 1 | 2>(0) // 0 = Draft, 1 = Confirm, 2 = Success
  const [valResultOut, setValResultOut] = useState<any>(null)

  // Card Kiri: Form Barang Masuk Maklon
  const [formIn, setFormIn] = useState<MaklonStockInPayload>({
    productId: '',
    qty: 10,
    batchMode: 'NEW',
    batchCode: '',
    expiryDate: '',
    existingBatchId: '',
    referenceNote: ''
  })
  const [existingBatches, setExistingBatches] = useState<any[]>([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [stepIn, setStepIn] = useState<0 | 1 | 2>(0) // 0 = Draft, 1 = Confirm, 2 = Success
  const [valResultIn, setValResultIn] = useState<any>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.from('products').select('id, name, sku').then(({ data }) => {
      if (data && data.length > 0) {
        setProducts(data)
        const firstProdId = data[0].id
        setFormOut(prev => ({ ...prev, productId: firstProdId }))
        setFormIn(prev => ({ 
          ...prev, 
          productId: firstProdId,
          batchCode: `B-${data[0].sku}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`
        }))
        loadProductBatches(firstProdId)
      }
    })
  }, [])

  const loadProductBatches = async (productId: string) => {
    setLoadingBatches(true)
    const batches = await getProductBatches(productId)
    setExistingBatches(batches)
    if (batches.length > 0) {
      setFormIn(prev => ({ ...prev, existingBatchId: batches[0].id }))
    } else {
      setFormIn(prev => ({ ...prev, existingBatchId: '', batchMode: 'NEW' }))
    }
    setLoadingBatches(false)
  }

  const handleProductInChange = (prodId: string) => {
    const selProd = products.find(p => p.id === prodId)
    const defaultBatch = selProd ? `B-${selProd.sku}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}` : ''
    setFormIn(prev => ({
      ...prev,
      productId: prodId,
      batchCode: defaultBatch
    }))
    loadProductBatches(prodId)
  }

  // Handle Barang Masuk Maklon Review
  const handleReviewIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorIn('')
    
    setLoadingIn(true)
    const val = await validateMaklonStockIn(formIn)
    setLoadingIn(false)

    if (val.success) {
      setValResultIn(val)
      setStepIn(1)
    } else {
      setErrorIn(val.error || 'Terjadi kesalahan validasi')
    }
  }

  // Handle Barang Masuk Commit
  const handleCommitIn = async () => {
    setErrorIn('')
    setLoadingIn(true)
    const res = await commitMaklonStockIn(formIn)
    setLoadingIn(false)

    if (res.success) {
      setSuccessMsg(res.message || 'Barang masuk maklon berhasil dicatat')
      setStepIn(2)
    } else {
      setErrorIn(res.error || 'Gagal mencatat barang masuk')
    }
  }

  // Handle Barang Keluar Review
  const handleReviewOut = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorOut('')
    
    if (['BONUS', 'PROMO', 'SAMPLE'].includes(formOut.reasonCode) && !formOut.referenceNote) {
      setErrorOut(`Catatan Referensi WAJIB diisi untuk alasan ${formOut.reasonCode}`)
      return
    }

    setLoadingOut(true)
    const val = await validateManualEntry(formOut)
    setLoadingOut(false)

    if (val.success) {
      setValResultOut(val)
      setStepOut(1)
    } else {
      setErrorOut(val.error || 'Terjadi kesalahan validasi')
    }
  }

  // Handle Barang Keluar Commit
  const handleCommitOut = async () => {
    setErrorOut('')
    setLoadingOut(true)
    const res = await commitManualEntry(formOut)
    setLoadingOut(false)

    if (res.success) {
      setSuccessMsg(res.message || 'Entri barang keluar berhasil dicatat')
      setStepOut(2)
    } else {
      setErrorOut(res.error || 'Gagal mencatat barang keluar')
    }
  }

  const resetFormIn = () => {
    const firstProd = products[0]
    setFormIn({
      productId: firstProd?.id || '',
      qty: 10,
      batchMode: 'NEW',
      batchCode: firstProd ? `B-${firstProd.sku}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}` : '',
      expiryDate: '',
      existingBatchId: '',
      referenceNote: ''
    })
    if (firstProd) loadProductBatches(firstProd.id)
    setStepIn(0)
    setErrorIn('')
  }

  const resetFormOut = () => {
    setFormOut({
      productId: products[0]?.id || '',
      qty: 1,
      reasonCode: 'SALE',
      channel: 'OFFLINE',
      referenceNote: ''
    })
    setStepOut(0)
    setErrorOut('')
  }

  const prodInName = products.find(p => p.id === formIn.productId)?.name
  const prodOutName = products.find(p => p.id === formOut.productId)?.name
  const isReasonRequiringNote = ['BONUS', 'PROMO', 'SAMPLE'].includes(formOut.reasonCode)
  const selectedExistingBatch = existingBatches.find(b => b.id === formIn.existingBatchId)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Keyboard className="text-jade-500" /> Input Manual & Maklon
        </h1>
        <p className="text-slate-500 mt-2">Keluarkan atau terima stok secara manual (Barang Masuk Maklon & Barang Keluar Manual).</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ========================================== */}
        {/* CARD KIRI: BARANG MASUK (MAKLON)          */}
        {/* ========================================== */}
        <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-full">
          <div className="p-5 border-b border-slate-100 bg-jade-50/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-jade-100 text-jade-700 rounded-lg shrink-0">
                <PackagePlus size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base">Barang Masuk (Maklon)</h2>
                <p className="text-xs text-slate-500 mt-0.5">Penerimaan stok dari produsen/maklon (Batch Baru/Existing)</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-jade-700 bg-jade-100 px-2.5 py-1 rounded-md">
              + STOK IN
            </span>
          </div>

          <div className="p-5 flex-1 flex flex-col gap-4">
            {errorIn && (
              <div className="p-3 bg-brick-50 border border-brick-200 text-brick-700 rounded-xl text-xs flex gap-2 animate-in slide-in-from-top-1">
                <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                <span>{errorIn}</span>
              </div>
            )}

            {stepIn === 0 && (
              <form onSubmit={handleReviewIn} className="space-y-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Pilih Produk
                  <select 
                    value={formIn.productId} 
                    onChange={e => handleProductInChange(e.target.value)}
                    className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs font-medium text-slate-800"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </label>

                {/* Opsi Mode Batch */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Layers size={14} className="text-jade-600" /> Mode Batch
                  </label>
                  <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setFormIn({ ...formIn, batchMode: 'NEW' })}
                      className={`py-1.5 px-3 rounded-md text-xs font-bold transition-all ${
                        formIn.batchMode === 'NEW' 
                          ? 'bg-white text-jade-700 shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      + Buat Batch Baru
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormIn({ ...formIn, batchMode: 'EXISTING' })}
                      className={`py-1.5 px-3 rounded-md text-xs font-bold transition-all ${
                        formIn.batchMode === 'EXISTING' 
                          ? 'bg-white text-jade-700 shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Batch Yang Sudah Ada
                    </button>
                  </div>
                </div>

                {/* Conditional Batch Inputs */}
                {formIn.batchMode === 'NEW' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                      Kode Batch (Wajib)
                      <input 
                        type="text" 
                        value={formIn.batchCode || ''} 
                        onChange={e => setFormIn({ ...formIn, batchCode: e.target.value })}
                        required
                        placeholder="Contoh: B-MKL-2026-01"
                        className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none"
                      />
                    </label>

                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                      <div className="flex items-center justify-between">
                        <span>Tanggal Expired (Wajib)</span>
                        <Calendar size={12} className="text-jade-600" />
                      </div>
                      <input 
                        type="date" 
                        value={formIn.expiryDate || ''} 
                        onChange={e => setFormIn({ ...formIn, expiryDate: e.target.value })}
                        required
                        className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                      Pilih Batch Existing
                      <select 
                        value={formIn.existingBatchId} 
                        onChange={e => setFormIn({ ...formIn, existingBatchId: e.target.value })}
                        disabled={loadingBatches || existingBatches.length === 0}
                        required
                        className="border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        {existingBatches.length === 0 ? (
                          <option value="">- Belum ada batch terdaftar -</option>
                        ) : (
                          existingBatches.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.batch_code} (Exp: {b.expiry_date})
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    {existingBatches.length === 0 && (
                      <p className="text-[11px] text-amber-600 mt-1">
                        Produk ini belum memiliki batch terdaftar. Silakan pilih mode &apos;Buat Batch Baru&apos;.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <label className="col-span-1 flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Jumlah (Qty)
                    <input 
                      type="number" 
                      min="1" 
                      value={formIn.qty} 
                      onChange={e => setFormIn({ ...formIn, qty: Number(e.target.value) })}
                      required
                      className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-center font-mono text-base font-bold text-jade-700 focus:ring-2 focus:ring-jade-500 focus:outline-none"
                    />
                  </label>

                  <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Catatan Referensi / PO
                    <input 
                      type="text" 
                      value={formIn.referenceNote || ''} 
                      onChange={e => setFormIn({ ...formIn, referenceNote: e.target.value })}
                      placeholder="Contoh: PO Maklon PT Cosmax No. 8812"
                      className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none"
                    />
                  </label>
                </div>

                <button 
                  type="submit" 
                  disabled={loadingIn || (formIn.batchMode === 'EXISTING' && existingBatches.length === 0)}
                  className="w-full mt-2 py-3 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors shadow-soft flex items-center justify-center gap-2 text-sm"
                >
                  {loadingIn ? <Activity className="animate-spin" size={18} /> : <PackagePlus size={18} />} Catat Barang Masuk
                </button>
              </form>
            )}

            {/* Step 1 In: Konfirmasi Modal */}
            {stepIn === 1 && valResultIn && (
              <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
                <div className="p-4 bg-jade-50 border border-jade-200 rounded-xl">
                  <h3 className="font-bold text-jade-900 text-sm flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-jade-600" /> Konfirmasi Penerimaan Barang Masuk
                  </h3>
                  <p className="text-xs text-jade-700 mt-1">
                    Mohon periksa data batch dan jumlah fisik sebelum disimpan permanen ke Ledger.
                  </p>
                </div>

                <table className="w-full text-xs text-slate-700 border-collapse">
                  <tbody className="divide-y divide-slate-100">
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Produk</th><td className="py-2 font-bold text-slate-900">{prodInName}</td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Mode Batch</th><td className="py-2 font-semibold text-slate-800">{formIn.batchMode === 'NEW' ? 'Batch Baru' : 'Batch Existing'}</td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Kode Batch</th><td className="py-2 font-mono font-bold text-jade-700">{formIn.batchMode === 'NEW' ? formIn.batchCode : selectedExistingBatch?.batch_code}</td></tr>
                    {formIn.batchMode === 'NEW' && (
                      <tr><th className="py-2 font-medium text-slate-500 text-left">Tgl Expired</th><td className="py-2 font-mono text-slate-800">{formIn.expiryDate}</td></tr>
                    )}
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Qty Masuk</th><td className="py-2 font-mono font-bold text-jade-600 text-sm">+{formatQty(formIn.qty)} unit</td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Alasan (Reason)</th><td className="py-2"><span className="bg-jade-100 text-jade-800 px-2 py-0.5 rounded font-bold text-[11px]">STOCK_IN</span></td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Kanal</th><td className="py-2 text-slate-600">INTERNAL</td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Referensi</th><td className="py-2 italic text-slate-600">{formIn.referenceNote || '-'}</td></tr>
                    
                    <tr className="bg-slate-50">
                      <th className="py-2 px-3 rounded-l-lg font-medium text-slate-700 text-left">Stok Saat Ini</th>
                      <td className="py-2 px-3 rounded-r-lg font-mono font-bold text-slate-800">{formatQty(valResultIn.currentBalance)} unit</td>
                    </tr>
                    <tr className="bg-jade-50">
                      <th className="py-2.5 px-3 rounded-l-lg font-bold text-jade-900 text-left">Proyeksi Stok Baru</th>
                      <td className="py-2.5 px-3 rounded-r-lg font-mono font-bold text-jade-700 text-base">+{formatQty(valResultIn.projectedBalance)} unit</td>
                    </tr>
                  </tbody>
                </table>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setStepIn(0)} 
                    className="flex-1 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Edit2 size={14} /> Kembali Edit
                  </button>
                  <button 
                    onClick={handleCommitIn} 
                    disabled={loadingIn}
                    className="flex-1 py-2.5 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl font-bold text-xs transition-colors shadow-soft flex items-center justify-center gap-1.5"
                  >
                    {loadingIn ? <Activity className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} Simpan ke Ledger
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 In: Sukses */}
            {stepIn === 2 && (
              <div className="p-6 bg-jade-50 border border-jade-200 text-center rounded-xl space-y-3 animate-in zoom-in-95 duration-200">
                <CheckCircle2 size={48} className="mx-auto text-jade-500" />
                <h3 className="font-bold text-jade-900 text-base">{successMsg}</h3>
                <p className="text-xs text-jade-700">
                  Stok barang masuk maklon telah ditambahkan ke batch dan dicatat di Buku Besar (Ledger).
                </p>
                <button 
                  onClick={resetFormIn}
                  className="px-4 py-2 bg-jade-600 hover:bg-jade-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1.5 mt-2"
                >
                  <PackagePlus size={16} /> Catat Barang Masuk Lainnya
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* CARD KANAN: BARANG KELUAR MANUAL          */}
        {/* ========================================== */}
        <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-full">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-200 text-slate-700 rounded-lg shrink-0">
                <PackageMinus size={22} />
              </div>
              <div>
                <h2 className="font-bold text-slate-900 text-base">Barang Keluar Manual</h2>
                <p className="text-xs text-slate-500 mt-0.5">Pengeluaran stok manual dengan alokasi otomatis (FEFO)</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
              - STOK OUT
            </span>
          </div>

          <div className="p-5 flex-1 flex flex-col gap-4">
            {errorOut && (
              <div className="p-3 bg-brick-50 border border-brick-200 text-brick-700 rounded-xl text-xs flex gap-2 animate-in slide-in-from-top-1">
                <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                <span>{errorOut}</span>
              </div>
            )}

            {stepOut === 0 && (
              <form onSubmit={handleReviewOut} className="space-y-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                  Pilih Produk
                  <select 
                    value={formOut.productId} 
                    onChange={e => setFormOut({ ...formOut, productId: e.target.value })}
                    className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs font-medium text-slate-800"
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Alasan (Reason Code)
                    <select 
                      value={formOut.reasonCode} 
                      onChange={e => setFormOut({ ...formOut, reasonCode: e.target.value as any })}
                      className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none font-semibold text-slate-800 text-xs"
                    >
                      <option value="SALE">SALE (Penjualan Reguler)</option>
                      <option value="BONUS">BONUS (Bundling / Hadiah)</option>
                      <option value="PROMO">PROMO (Event Spesial)</option>
                      <option value="SAMPLE">SAMPLE (Barang Sampel)</option>
                      <option value="DAMAGED">DAMAGED (Rusak Gudang)</option>
                      <option value="EXPIRED">EXPIRED (Kedaluwarsa Gudang)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Kanal Distribusi
                    <select 
                      value={formOut.channel} 
                      onChange={e => setFormOut({ ...formOut, channel: e.target.value as any })}
                      className="border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:ring-2 focus:ring-jade-500 focus:outline-none text-xs"
                    >
                      <option value="OFFLINE">OFFLINE (Toko Fisik)</option>
                      <option value="INTERNAL">INTERNAL (Keperluan Internal)</option>
                      <option value="SHOPEE">SHOPEE (Input Susulan)</option>
                      <option value="TIKTOK">TIKTOK (Input Susulan)</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="col-span-1 flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    Qty Keluar
                    <input 
                      type="number" 
                      min="1" 
                      value={formOut.qty} 
                      onChange={e => setFormOut({ ...formOut, qty: Number(e.target.value) })}
                      required
                      className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-center font-mono text-base font-bold text-brick-600 focus:ring-2 focus:ring-jade-500 focus:outline-none"
                    />
                  </label>

                  <label className="col-span-2 flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                    <div className="flex justify-between items-center">
                      <span>Catatan Referensi</span>
                      {isReasonRequiringNote && (
                        <span className="text-[10px] text-amber-700 font-bold px-1.5 py-0.5 bg-amber-50 rounded">
                          *Wajib
                        </span>
                      )}
                    </div>
                    <input 
                      type="text" 
                      value={formOut.referenceNote || ''} 
                      onChange={e => setFormOut({ ...formOut, referenceNote: e.target.value })}
                      placeholder={isReasonRequiringNote ? "Contoh: Hadiah Campaign Lebaran 2026" : "Opsional"}
                      className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-xs focus:ring-2 focus:ring-jade-500 focus:outline-none"
                    />
                  </label>
                </div>

                <button 
                  type="submit" 
                  disabled={loadingOut || (isReasonRequiringNote && !formOut.referenceNote)}
                  className="w-full mt-2 py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl font-bold transition-colors shadow-soft flex items-center justify-center gap-2 text-sm"
                >
                  {loadingOut ? <Activity className="animate-spin" size={18} /> : <ArrowRight size={18} />} Tinjau & Validasi Pengeluaran
                </button>
              </form>
            )}

            {/* Step 1 Out: Konfirmasi Modal */}
            {stepOut === 1 && valResultOut && (
              <div className="space-y-4 animate-in slide-in-from-right-4 duration-200">
                <div className="p-4 bg-brick-50 border border-brick-200 rounded-xl">
                  <h3 className="font-bold text-brick-900 text-sm flex items-center gap-2">
                    <AlertTriangle size={18} className="text-brick-600" /> Konfirmasi Pengeluaran Permanen
                  </h3>
                  <p className="text-xs text-brick-700 mt-1">
                    Tindakan ini akan memotong stok fisik via FEFO secara permanen.
                  </p>
                </div>

                {valResultOut.isEatingReservation && (
                  <div className="p-4 bg-brick-50 border-2 border-brick-300 rounded-xl flex items-start gap-3 text-brick-950 animate-in fade-in">
                    <AlertTriangle size={20} className="text-brick-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-brick-900 text-sm">Tidak Bisa Diproses (Di-Block System)</div>
                      <p className="text-brick-800 leading-relaxed">
                        Tidak bisa diproses — Qty Keluar ini (<strong>{formatQty(formOut.qty)} unit</strong>) melebihi Stok Aman Dijual (sisa <strong>{formatQty(valResultOut.availableQty)} unit</strong> tersedia). Sisa <strong>{formatQty(valResultOut.reservedQty)} unit</strong> sedang direservasi untuk order yang belum dikirim. Silakan kurangi Qty Keluar atau batalkan.
                      </p>
                    </div>
                  </div>
                )}

                <table className="w-full text-xs text-slate-700 border-collapse">
                  <tbody className="divide-y divide-slate-100">
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Produk</th><td className="py-2 font-bold text-slate-900">{prodOutName}</td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Qty Keluar</th><td className="py-2 font-mono font-bold text-brick-600 text-sm">-{formatQty(formOut.qty)} unit</td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Alasan (Reason)</th><td className="py-2"><span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded font-bold text-[11px]">{formOut.reasonCode}</span></td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Kanal</th><td className="py-2 text-slate-600">{formOut.channel}</td></tr>
                    <tr><th className="py-2 font-medium text-slate-500 text-left">Referensi</th><td className="py-2 italic text-slate-600">{formOut.referenceNote || '-'}</td></tr>
                    
                    <tr className="bg-slate-50">
                      <th className="py-2 px-3 rounded-l-lg font-medium text-slate-700 text-left">Stok Fisik Saat Ini</th>
                      <td className="py-2 px-3 rounded-r-lg font-mono text-slate-700">{formatQty(valResultOut.currentBalance)} unit</td>
                    </tr>
                    <tr className="bg-amber-50/50">
                      <th className="py-2 px-3 rounded-l-lg font-medium text-amber-900 text-left">Stok Aman Dijual</th>
                      <td className="py-2 px-3 rounded-r-lg font-mono font-bold text-amber-800">{formatQty(valResultOut.availableQty)} unit</td>
                    </tr>
                    <tr className="bg-brick-50">
                      <th className="py-2.5 px-3 rounded-l-lg font-bold text-brick-900 text-left">Proyeksi Sisa Stok Fisik</th>
                      <td className="py-2.5 px-3 rounded-r-lg font-mono font-bold text-brick-700 text-base">{formatQty(valResultOut.projectedBalance)} unit</td>
                    </tr>
                  </tbody>
                </table>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button"
                    onClick={() => setStepOut(0)} 
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Edit2 size={14} /> Kembali Edit
                  </button>
                  <button 
                    type="button"
                    onClick={handleCommitOut} 
                    disabled={loadingOut || valResultOut.isEatingReservation || valResultOut.projectedBalance < 0}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 disabled:border disabled:border-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs transition-colors shadow-soft flex items-center justify-center gap-1.5"
                  >
                    {loadingOut ? <Activity className="animate-spin" size={14} /> : <CheckCircle2 size={14} />} 
                    {valResultOut.isEatingReservation ? 'Transaksi Ditolak (Stok Terreservasi)' : 'Potong Stok via FEFO'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 Out: Sukses */}
            {stepOut === 2 && (
              <div className="p-6 bg-slate-900 text-white text-center rounded-xl space-y-3 animate-in zoom-in-95 duration-200">
                <CheckCircle2 size={48} className="mx-auto text-jade-400" />
                <h3 className="font-bold text-lg">{successMsg}</h3>
                <p className="text-xs text-slate-300">
                  Stok telah dipotong dan dialokasikan sesuai urutan FEFO di Buku Besar.
                </p>
                <button 
                  onClick={resetFormOut}
                  className="px-4 py-2 bg-jade-600 hover:bg-jade-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm inline-flex items-center gap-1.5 mt-2"
                >
                  <PackageMinus size={16} /> Buat Pengeluaran Lainnya
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
