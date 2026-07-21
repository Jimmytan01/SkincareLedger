'use client'

import { useState } from 'react'
import { Package, AlertTriangle, Clock, Undo2, Search } from 'lucide-react'

interface DashboardClientProps {
  totalProducts: number
  anomalyCount: number
  expiringBatches: any[]
  pendingReturns: any[]
  stockBalances: any[]
}

export default function DashboardClient({
  totalProducts,
  anomalyCount,
  expiringBatches,
  pendingReturns,
  stockBalances
}: DashboardClientProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredStock = stockBalances.filter(item => {
    const name = item.products?.name || ''
    const sku = item.products?.sku || ''
    return name.toLowerCase().includes(searchTerm.toLowerCase()) || 
           sku.toLowerCase().includes(searchTerm.toLowerCase())
  })

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Ikhtisar Operasional</h1>
        <p className="text-slate-500 mt-2">Ringkasan kondisi stok dan tugas rekonsiliasi yang memerlukan perhatian Anda.</p>
      </header>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-soft flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Produk</p>
              <h3 className="text-4xl font-bold font-mono text-slate-900">{totalProducts}</h3>
            </div>
            <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
              <Package size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-brick-200 shadow-soft flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-brick-500" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Anomali Terbuka</p>
              <h3 className={`text-4xl font-bold font-mono ${anomalyCount > 0 ? 'text-brick-600' : 'text-slate-900'}`}>{anomalyCount}</h3>
            </div>
            <div className={`p-3 rounded-xl ${anomalyCount > 0 ? 'bg-brick-50 text-brick-500' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-honey-200 shadow-soft flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-honey-500" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Peringatan Kedaluwarsa</p>
              <h3 className={`text-4xl font-bold font-mono ${expiringBatches.length > 0 ? 'text-honey-600' : 'text-slate-900'}`}>{expiringBatches.length}</h3>
            </div>
            <div className={`p-3 rounded-xl ${expiringBatches.length > 0 ? 'bg-honey-50 text-honey-500' : 'bg-slate-50 text-slate-400'}`}>
              <Clock size={24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-soft flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Retur Tertunda</p>
              <h3 className="text-4xl font-bold font-mono text-slate-900">{pendingReturns.length}</h3>
            </div>
            <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
              <Undo2 size={24} />
            </div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Stock Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-soft overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="text-lg font-bold text-slate-800">Sisa Stok per Produk</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari SKU atau Nama..." 
                  className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-jade-500 w-64"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-white sticky top-0 border-b border-slate-100 shadow-sm z-10">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700">SKU</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">Nama Produk</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right">Saldo Sistem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStock.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                        Tidak ada produk yang cocok dengan pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredStock.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{item.products?.sku}</td>
                        <td className="px-6 py-4">{item.products?.name}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">
                          {item.total_qty}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Attention Areas */}
        <div className="space-y-6">
          
          {/* Expiry Alerts */}
          <div className="bg-white border border-honey-200 rounded-2xl shadow-soft overflow-hidden">
            <div className="p-5 border-b border-honey-100 bg-honey-50/50">
              <h3 className="font-bold text-honey-800 flex items-center gap-2">
                <Clock size={18} /> Peringatan Kedaluwarsa
              </h3>
            </div>
            <div className="p-5">
              {expiringBatches.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Tidak ada batch yang kedaluwarsa dalam 30 hari ke depan.</p>
              ) : (
                <ul className="space-y-4">
                  {expiringBatches.map(b => (
                    <li key={b.id} className="text-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-slate-900">{b.products?.sku}</span>
                        <span className="font-mono bg-honey-100 text-honey-800 px-2 py-0.5 rounded text-xs">Sisa {b.qty}</span>
                      </div>
                      <p className="text-slate-600">{b.products?.name}</p>
                      <p className="text-xs text-honey-600 mt-1">
                        Batch: <span className="font-mono">{b.batch_code}</span> | Exp: {new Date(b.expiry_date).toLocaleDateString('id-ID')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Pending Returns Alerts */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-soft overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Undo2 size={18} /> Retur Pending
              </h3>
            </div>
            <div className="p-5">
              {pendingReturns.length === 0 ? (
                <p className="text-sm text-slate-500 italic">Semua retur telah diinspeksi.</p>
              ) : (
                <ul className="space-y-4">
                  {pendingReturns.map(r => (
                    <li key={r.id} className="text-sm border-l-2 border-slate-300 pl-3">
                      <div className="font-medium text-slate-900 mb-1">Pesanan: {r.orders?.marketplace_order_id}</div>
                      <p className="text-slate-500 text-xs mt-1">Diajukan: {new Date(r.created_at).toLocaleDateString('id-ID')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
