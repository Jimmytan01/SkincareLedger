'use client'

import Link from 'next/link'
import { Package, AlertTriangle, Clock, Undo2, ShoppingBag, ArrowUpRight, ArrowDownRight, Activity, ChevronRight, ShieldAlert } from 'lucide-react'
import { formatQty } from '@/utils/format'
import { AttentionItem } from '@/app/(app)/page'
import ChannelBadge from '@/components/ChannelBadge'

interface DashboardClientProps {
  totalProducts: number
  anomalyCount: number
  totalReservedQty: number
  criticalExpiryCount: number
  pendingReturnsCount: number
  attentionItems: AttentionItem[]
  recentMovements: any[]
}

export default function DashboardClient({
  totalProducts,
  anomalyCount,
  totalReservedQty,
  criticalExpiryCount,
  pendingReturnsCount,
  attentionItems,
  recentMovements
}: DashboardClientProps) {

  const getSeverityStyle = (severity: 'CRITICAL' | 'WARNING' | 'INFO') => {
    switch (severity) {
      case 'CRITICAL':
        return {
          dotBg: 'bg-brick-500',
          badgeClass: 'bg-brick-50 text-brick-700 border-brick-200',
          borderHover: 'hover:border-brick-300'
        }
      case 'WARNING':
        return {
          dotBg: 'bg-amber-500',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          borderHover: 'hover:border-amber-300'
        }
      case 'INFO':
        return {
          dotBg: 'bg-jade-500',
          badgeClass: 'bg-jade-50 text-jade-700 border-jade-200',
          borderHover: 'hover:border-jade-300'
        }
    }
  }

  const formatMovementReason = (reason: string) => {
    const labels: Record<string, string> = {
      SALE: 'Penjualan',
      BONUS: 'Bonus',
      PROMO: 'Promo',
      SAMPLE: 'Sampel',
      DAMAGED: 'Barang Rusak',
      EXPIRED: 'Kedaluwarsa',
      RETURN_IN: 'Retur Masuk',
      OPNAME_CORRECTION: 'Koreksi Opname',
      MANUAL_CORRECTION: 'Koreksi Entri',
      CANCEL_REVERSAL: 'Batal Order',
      OPENING_BALANCE: 'Stok Awal',
      STOCK_IN: 'Barang Masuk'
    }
    return labels[reason] || reason
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Ringkasan kondisi stok dan tugas rekonsiliasi yang memerlukan perhatian Anda hari ini.</p>
      </header>

      {/* 1. 5 KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        
        {/* Total Produk */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-soft flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Produk</p>
              <h3 className="text-4xl font-bold font-mono text-slate-900">{formatQty(totalProducts)}</h3>
            </div>
            <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
              <Package size={24} />
            </div>
          </div>
        </div>

        {/* Anomali Terbuka */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-soft flex flex-col justify-between relative overflow-hidden">
          {anomalyCount > 0 && <div className="absolute top-0 left-0 w-1 h-full bg-brick-500" />}
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-1">Anomali Terbuka</p>
              <h3 className={`text-4xl font-bold font-mono ${anomalyCount > 0 ? 'text-brick-600' : 'text-slate-900'}`}>{formatQty(anomalyCount)}</h3>
            </div>
            <div className={`p-3 rounded-xl ${anomalyCount > 0 ? 'bg-brick-50 text-brick-500' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>

        {/* Kedaluwarsa Kritis */}
        <div className="bg-white rounded-2xl p-6 border border-honey-200 shadow-soft flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-honey-500" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-1">Kedaluwarsa Kritis</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className={`text-4xl font-bold font-mono ${criticalExpiryCount > 0 ? 'text-honey-600' : 'text-slate-900'}`}>{formatQty(criticalExpiryCount)}</h3>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80 whitespace-nowrap">
                  ≤ 30 Hari
                </span>
              </div>
            </div>
            <div className={`p-3 rounded-xl ${criticalExpiryCount > 0 ? 'bg-honey-50 text-honey-500' : 'bg-slate-50 text-slate-400'}`}>
              <Clock size={24} />
            </div>
          </div>
        </div>

        {/* Stok Terreservasi (Denim Blue) */}
        <div className="bg-white rounded-2xl p-6 border border-sky-200 shadow-soft flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-sky-500" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-1">Stok Terreservasi</p>
              <h3 className={`text-4xl font-bold font-mono ${totalReservedQty > 0 ? 'text-sky-700' : 'text-slate-900'}`}>{formatQty(totalReservedQty)}</h3>
            </div>
            <div className={`p-3 rounded-xl ${totalReservedQty > 0 ? 'bg-sky-50 text-sky-600' : 'bg-slate-50 text-slate-400'}`}>
              <ShoppingBag size={24} />
            </div>
          </div>
        </div>

        {/* Retur Tertunda */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-soft flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Retur Tertunda</p>
              <h3 className="text-4xl font-bold font-mono text-slate-900">{formatQty(pendingReturnsCount)}</h3>
            </div>
            <div className="p-3 bg-slate-50 text-slate-400 rounded-xl">
              <Undo2 size={24} />
            </div>
          </div>
        </div>

      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column (7/12): Perlu Perhatian Hari Ini */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-soft overflow-hidden flex flex-col h-[520px] relative">
            <div className="p-6 border-b border-slate-100 bg-slate-50/70 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brick-50 text-brick-600 rounded-xl shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Perlu Perhatian Hari Ini</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Worklist terpadu diprioritaskan berdasarkan tingkat urgensi</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold bg-slate-200 text-slate-700 px-3 py-1 rounded-full shrink-0">
                {attentionItems.length} Hal
              </span>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-3 pb-8 touch-pan-y">
              {attentionItems.length === 0 ? (
                <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-2">
                  <Package size={36} className="text-slate-300 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-600">Tidak ada isu kritis atau tugas tertunda hari ini.</p>
                  <p className="text-xs text-slate-400">Seluruh stok, batch, anomali, dan retur berada dalam batas aman.</p>
                </div>
              ) : (
                attentionItems.map(item => {
                  const style = getSeverityStyle(item.severity)
                  return (
                    <div 
                      key={item.id} 
                      className={`p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/80 transition-all duration-200 flex items-start justify-between gap-4 ${style.borderHover}`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Severity Dot Indicator */}
                        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${style.dotBg}`} />
                        
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${style.badgeClass}`}>
                              {item.badgeLabel}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900 leading-snug truncate">{item.title}</h4>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed truncate">{item.description}</p>
                        </div>
                      </div>

                      <Link
                        href={item.actionUrl}
                        className="shrink-0 text-xs font-bold text-jade-700 hover:text-jade-800 bg-jade-50 hover:bg-jade-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-jade-200/60"
                      >
                        <span>{item.actionLabel}</span>
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  )
                })
              )}
            </div>

            {/* Subtle scroll cue gradient overlay at the bottom */}
            {attentionItems.length > 3 && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none rounded-b-2xl" />
            )}
          </div>
        </div>

        {/* Right Column (5/12): Pergerakan Terbaru (Stock Ledger Feed) */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-soft overflow-hidden flex flex-col h-[520px] relative">
            <div className="p-6 border-b border-slate-100 bg-slate-50/70 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-jade-50 text-jade-600 rounded-xl shrink-0">
                  <Activity size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Pergerakan Terbaru</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Histori mutasi stok realtime dari Buku Besar</p>
                </div>
              </div>
              <Link href="/ledger" className="text-xs font-bold text-slate-500 hover:text-jade-600 transition-colors flex items-center gap-1 shrink-0">
                Semua <ChevronRight size={14} />
              </Link>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4 pb-8 touch-pan-y">
              {recentMovements.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-16">Belum ada transaksi pergerakan stok tercatat.</p>
              ) : (
                recentMovements.map(m => {
                  const isInbound = Number(m.qty_delta) > 0
                  const prodName = m.product?.name || 'Produk'
                  const prodSku = m.product?.sku || ''
                  const dateStr = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div key={m.id} className="flex items-center justify-between gap-3 text-sm pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-lg shrink-0 ${isInbound ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                          {isInbound ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs truncate">{prodName}</div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono">{prodSku}</span>
                            <span>·</span>
                            <span className="font-semibold text-slate-700">{formatMovementReason(m.reason_code)}</span>
                            {m.channel && <ChannelBadge channel={m.channel} />}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`font-mono font-bold text-xs px-2.5 py-1 rounded-lg ${
                          isInbound ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {isInbound ? `+${formatQty(m.qty_delta)}` : formatQty(m.qty_delta)}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{dateStr}</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Subtle scroll cue gradient overlay at the bottom */}
            {recentMovements.length > 5 && (
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none rounded-b-2xl" />
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
