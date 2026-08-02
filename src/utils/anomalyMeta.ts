export interface AnomalyMeta {
  label: string
  bg: string
  text: string
  border: string
}

/**
  * Centralized mapping function for anomaly types to human-friendly Indonesian labels and styling tokens.
  * Re-used across Dashboard ("Perlu Perhatian Hari Ini") and Worklist Anomali pages.
  */
export function getAnomalyMeta(type: string): AnomalyMeta {
  const map: Record<string, AnomalyMeta> = {
    NEGATIVE_BALANCE_ATTEMPT: {
      label: 'Percobaan Transaksi Ditolak (Stok Kurang)',
      bg: 'bg-brick-50',
      text: 'text-brick-700',
      border: 'border-brick-200'
    },
    NEGATIVE_BALANCE_DETECTED: {
      label: 'Saldo Batch Negatif Terdeteksi',
      bg: 'bg-brick-50',
      text: 'text-brick-700',
      border: 'border-brick-200'
    },
    STALE_ORDER: {
      label: 'Pesanan Menggantung (>3 Hari)',
      bg: 'bg-honey-50',
      text: 'text-honey-800',
      border: 'border-honey-200'
    },
    MISSING_LEDGER: {
      label: 'Order Diproses Tanpa Pencatatan Ledger',
      bg: 'bg-brick-50',
      text: 'text-brick-700',
      border: 'border-brick-200'
    }
  }

  return map[type] || {
    label: type.replace(/_/g, ' '),
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200'
  }
}
