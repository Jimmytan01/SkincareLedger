import FileImportEventSource from '@/components/FileImportEventSource'
import SimulatedEventSource from '@/components/SimulatedEventSource'
import { Webhook, Info } from 'lucide-react'

export default function SimulationPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Webhook className="text-jade-500" /> Simulasi Sistem
        </h1>
        <p className="text-slate-500 mt-2">Simulasikan kejadian pesanan dari Shopee dan TikTok untuk menguji alur reservasi stok dan algoritma FEFO.</p>
      </header>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 text-slate-800 text-sm">
        <Info className="shrink-0 mt-0.5 text-slate-500" size={18} />
        <div className="space-y-1 leading-relaxed">
          <p className="font-semibold">Informasi Alur Pengujian Injeksi Marketplace Event:</p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-600">
            <li>
              <strong>Pesanan Dibuat</strong> <span className="text-xs font-mono opacity-75 font-normal">(ORDER_CREATED)</span>: Sistem menyisihkan stok untuk pesanan ini, tapi belum mengurangi stok asli.
            </li>
            <li>
              <strong>Barang Dikirim / Dalam Perjalanan</strong> <span className="text-xs font-mono opacity-75 font-normal">(STATUS_UPDATED: SHIPPED / IN_TRANSIT)</span>: Stok resmi berkurang dan tercatat di Buku Besar.
            </li>
            <li>
              <strong>Dibatalkan</strong> <span className="text-xs font-mono opacity-75 font-normal">(CANCELLED)</span>: Kalau dibatalkan sebelum dikirim, penyisihan stok dilepas. Kalau dibatalkan setelah dikirim, stok yang sudah berkurang dikembalikan.
            </li>
            <li>
              <strong>Retur Diajukan</strong> <span className="text-xs font-mono opacity-75 font-normal">(RETURN_REQUESTED)</span>: Barang masuk ke Inbox Retur untuk diperiksa gudang.
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FileImportEventSource />
        <SimulatedEventSource />
      </div>
    </div>
  )
}
