import FileImportEventSource from '@/components/FileImportEventSource'
import SimulatedEventSource from '@/components/SimulatedEventSource'
import { Webhook, Info } from 'lucide-react'

export default function SimulationPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Webhook className="text-jade-500" /> Playground Integrasi
        </h1>
        <p className="text-slate-500 mt-2">Simulasikan webhook dari Shopee dan TikTok untuk menguji ketahanan Order State Machine dan algoritma FEFO.</p>
      </header>

      <div className="bg-honey-50 border border-honey-200 rounded-xl p-4 flex gap-3 text-honey-800 text-sm">
        <Info className="shrink-0 mt-0.5 text-honey-600" size={18} />
        <div>
          <p className="font-semibold mb-1">Cara Kerja Order State Machine</p>
          <ul className="list-disc list-inside space-y-1 text-honey-700">
            <li><strong>ORDER_CREATED</strong>: Sistem akan mereservasi stok dan pesanan terdaftar di aplikasi.</li>
            <li><strong>STATUS_UPDATED (SHIPPED/IN_TRANSIT)</strong>: Stok akan resmi dipotong dari Ledger dan reservasi dihapus.</li>
            <li><strong>CANCELLED</strong>: Jika sebelum dikirim, reservasi dihapus. Jika setelah dikirim, Ledger direversal.</li>
            <li><strong>RETURN_REQUESTED</strong>: Retur masuk ke Inbox Gudang untuk diinspeksi.</li>
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
