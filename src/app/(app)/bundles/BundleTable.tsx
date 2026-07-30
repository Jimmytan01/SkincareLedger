'use client'

import { useState } from 'react'
import { FileDigit, AlertCircle, CheckCircle2, Power, AlertTriangle, Loader2 } from 'lucide-react'
import { toggleBundleStatus } from '@/actions/bundle'
import { formatQty } from '@/utils/format'

export interface BundleGroup {
  bundleSku: string
  version: number
  isActive: boolean
  components: {
    id: string
    qty: number
    products?: { name: string; sku: string }
  }[]
}

interface BundleTableProps {
  bundles: BundleGroup[]
}

export default function BundleTable({ bundles }: BundleTableProps) {
  const [bundleList, setBundleList] = useState<BundleGroup[]>(bundles)
  const [deactivatingSku, setDeactivatingSku] = useState<string | null>(null)
  const [loadingSku, setLoadingSku] = useState<string | null>(null)

  // Sync state when props change
  if (JSON.stringify(bundles.map(b => `${b.bundleSku}:${b.isActive}`)) !== JSON.stringify(bundleList.map(b => `${b.bundleSku}:${b.isActive}`))) {
    setBundleList(bundles)
  }

  const handleToggleClick = (bundle: BundleGroup) => {
    if (bundle.isActive) {
      // Opening confirmation modal before deactivating
      setDeactivatingSku(bundle.bundleSku)
    } else {
      // Direct activation (low-risk & reversible)
      executeToggle(bundle.bundleSku, true)
    }
  }

  const executeToggle = async (sku: string, targetActive: boolean) => {
    setLoadingSku(sku)
    setDeactivatingSku(null)

    // Optimistic UI update
    setBundleList(prev =>
      prev.map(b => (b.bundleSku === sku ? { ...b, isActive: targetActive } : b))
    )

    const res = await toggleBundleStatus(sku, targetActive)
    if (!res.success) {
      alert(`Gagal mengubah status bundle: ${res.error}`)
      // Rollback on failure
      setBundleList(prev =>
        prev.map(b => (b.bundleSku === sku ? { ...b, isActive: !targetActive } : b))
      )
    }
    setLoadingSku(null)
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 shadow-xs">
            <tr>
              <th className="px-5 py-3 font-semibold text-slate-700">Bundle SKU</th>
              <th className="px-5 py-3 font-semibold text-slate-700">Versi & Status</th>
              <th className="px-5 py-3 font-semibold text-slate-700">Komponen Penyusun</th>
              <th className="px-5 py-3 font-semibold text-slate-700 text-right">Qty</th>
              <th className="px-5 py-3 font-semibold text-slate-700 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bundleList.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                  Belum ada resep bundle yang didaftarkan.
                </td>
              </tr>
            ) : (
              bundleList.map(bundle => {
                const isInactive = !bundle.isActive
                const isLoading = loadingSku === bundle.bundleSku

                return bundle.components.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`transition-all duration-200 ${
                      isInactive
                        ? 'bg-slate-50/70 opacity-65 hover:opacity-100 hover:bg-slate-100/80'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {idx === 0 ? (
                      <td
                        className="px-5 py-3 font-mono text-sm font-semibold text-slate-900 border-r border-slate-100 align-middle"
                        rowSpan={bundle.components.length}
                      >
                        <div className="flex items-center gap-2">
                          <span>{bundle.bundleSku}</span>
                        </div>
                      </td>
                    ) : null}

                    {idx === 0 ? (
                      <td
                        className="px-5 py-3 align-middle border-r border-slate-100"
                        rowSpan={bundle.components.length}
                      >
                        <div className="flex flex-col items-start gap-2">
                          {/* Badge Versi Resep (Informational Neutral) */}
                          <span 
                            title="Resep versi terbaru yang berlaku untuk pesanan baru. Pesanan lama tetap menggunakan snapshot versi saat pesanan dibuat."
                            className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-xs border border-slate-200 font-medium whitespace-nowrap"
                          >
                            <FileDigit size={13} className="text-slate-500 shrink-0" />
                            <span>
                              Resep Saat Ini
                              {bundle.version > 1 && (
                                <span className="text-[11px] text-slate-500 font-normal ml-1">
                                  · diubah {bundle.version - 1}x
                                </span>
                              )}
                            </span>
                          </span>

                          {/* Badge Status Operasional Bundle SKU (Aktif / Nonaktif) */}
                          <div>
                            {isInactive ? (
                              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200">
                                <AlertCircle size={11} className="text-slate-400" /> Nonaktif
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-jade-100/70 text-jade-800 px-2 py-0.5 rounded text-[11px] font-semibold border border-jade-200">
                                <CheckCircle2 size={11} className="text-jade-600" /> Aktif
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    ) : null}

                    <td className="px-5 py-3 align-top">
                      <div className="font-medium text-slate-900">{item.products?.name}</div>
                      <div className="font-mono text-xs text-slate-500">{item.products?.sku}</div>
                    </td>

                    <td className="px-5 py-3 align-top text-right font-mono font-bold text-base text-slate-700">
                      {formatQty(item.qty)}
                    </td>

                    {idx === 0 ? (
                      <td
                        className="px-5 py-3 align-middle text-center border-l border-slate-100"
                        rowSpan={bundle.components.length}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleClick(bundle)}
                          disabled={isLoading}
                          title={bundle.isActive ? 'Nonaktifkan Bundle SKU' : 'Aktifkan Bundle SKU'}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mx-auto transition-all shadow-xs ${
                            bundle.isActive
                              ? 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border border-slate-200'
                              : 'bg-jade-600 text-white hover:bg-jade-700 border border-jade-700'
                          }`}
                        >
                          {isLoading ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Power size={13} />
                          )}
                          <span>{bundle.isActive ? 'Nonaktifkan' : 'Aktifkan'}</span>
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal for Deactivation */}
      {deactivatingSku && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Konfirmasi Nonaktifkan Bundle SKU</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{deactivatingSku}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Bundle <strong className="text-slate-900 font-mono">{deactivatingSku}</strong> tidak akan bisa dipilih untuk pesanan baru. Resep dan histori tetap tersimpan.
            </p>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeactivatingSku(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => executeToggle(deactivatingSku, false)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition-colors shadow-soft flex items-center gap-1.5"
              >
                <Power size={14} /> Ya, Nonaktifkan
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
