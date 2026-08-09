'use client'

import { useState } from 'react'
import Papa from 'papaparse'
import { MarketplaceEvent } from '@/types/marketplace'
import { processMarketplaceEvent } from '@/actions/marketplace'
import { createClient } from '@/utils/supabase/client'
import { 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  Activity, 
  ServerCrash, 
  Download, 
  HelpCircle, 
  X, 
  AlertTriangle, 
  ArrowLeft, 
  Play, 
  ShieldAlert,
  Check,
  RefreshCw,
  XCircle
} from 'lucide-react'

export interface ParsedCsvRow {
  rowNum: number
  event_id: string
  channel: string
  order_id: string
  event_type: string
  status: string
  sku: string
  qty: string
  timestamp: string
  isValid: boolean
  errorMessage: string | null
}

export interface ExecutionErrorRow {
  rowNum: number
  event_id: string
  channel: string
  order_id: string
  event_type: string
  sku: string
  qty: string
  errorMessage: string
}

export interface ExecutionLogItem {
  type: 'info' | 'success' | 'error'
  rowNum: number
  eventId: string
  eventTypeLabel: string
  orderId: string
  statusText: string
}

const REQUIRED_HEADERS = ['event_id', 'channel', 'order_id', 'event_type', 'status', 'sku', 'qty']

const getEventTypeLabel = (type: string) => {
  switch (type) {
    case 'ORDER_CREATED': return 'Pesanan Dibuat'
    case 'STATUS_UPDATED': return 'Status Dikirim'
    case 'CANCELLED': return 'Pesanan Dibatalkan'
    case 'RETURN_REQUESTED': return 'Retur Diajukan'
    default: return type
  }
}

export default function FileImportEventSource() {
  const [step, setStep] = useState<'UPLOAD' | 'PREVIEW' | 'RESULT'>('UPLOAD')
  const [parsedRows, setParsedRows] = useState<ParsedCsvRow[]>([])
  const [fileHeaderError, setFileHeaderError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  
  const [logs, setLogs] = useState<ExecutionLogItem[]>([])
  const [showLogsDetail, setShowLogsDetail] = useState(false)
  const [parsingLoading, setParsingLoading] = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const [processedCount, setProcessedCount] = useState(0)
  const [idempotentCount, setIdempotentCount] = useState(0)
  const [executionErrorCount, setExecutionErrorCount] = useState(0)
  const [executionErrorRows, setExecutionErrorRows] = useState<ExecutionErrorRow[]>([])

  const supabase = createClient()

  const handleDownloadSampleCsv = () => {
    const headers = 'event_id,channel,order_id,event_type,status,sku,qty,timestamp'
    const sampleRows = [
      '# 1. Order Shopee (Dikirim: SHIPPED)',
      'EV-SHP-101,SHOPEE,ORD-SHOPEE-001,ORDER_CREATED,,SKU-001,2,2026-07-25T10:00:00Z',
      'EV-SHP-102,SHOPEE,ORD-SHOPEE-001,STATUS_UPDATED,SHIPPED,SKU-001,2,2026-07-25T10:30:00Z',
      '# 2. Order TikTok (Dalam Perjalanan: IN_TRANSIT)',
      'EV-TT-201,TIKTOK,ORD-TIKTOK-002,ORDER_CREATED,,SKU-002,1,2026-07-25T11:00:00Z',
      'EV-TT-202,TIKTOK,ORD-TIKTOK-002,STATUS_UPDATED,IN_TRANSIT,SKU-002,1,2026-07-25T11:45:00Z',
      '# 3. Order Batal Sebelum Dikirim (CANCELLED)',
      'EV-CAN-301,SHOPEE,ORD-CANCEL-003,ORDER_CREATED,,SKU-001,1,2026-07-25T12:00:00Z',
      'EV-CAN-302,SHOPEE,ORD-CANCEL-003,CANCELLED,,SKU-001,1,2026-07-25T12:15:00Z',
      '# 4. Contoh Baris Error (Akan Terdeteksi di Preview)',
      'EV-ERR-401,LAZADA,ORD-ERR-004,ORDER_CREATED,,SKU-999,-5,2026-07-25T13:00:00Z'
    ].join('\n')
    const csvContent = `${headers}\n${sampleRows}`

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'contoh_import_event_simulasi.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setParsingLoading(true)
    setFileHeaderError(null)
    setLogs([{ type: 'info', rowNum: 0, eventId: 'FILE', eventTypeLabel: 'Import', orderId: '-', statusText: `Membaca file: ${file.name}` }])

    // Fetch SKUs from database for thorough SKU validation
    let validSkus = new Set<string>()
    try {
      const { data: prods } = await supabase.from('products').select('sku')
      const { data: bundles } = await supabase.from('bundle_recipes').select('bundle_sku')
      prods?.forEach(p => p.sku && validSkus.add(p.sku.trim()))
      bundles?.forEach(b => b.bundle_sku && validSkus.add(b.bundle_sku.trim()))
    } catch (err) {
      console.warn('Could not fetch SKUs for strict check, skipping SKU DB existence check', err)
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        // 1. FILE-LEVEL HEADER VALIDATION & NORMALIZATION
        const rawFields = (results.meta.fields || []).map(f => (f || '').toString().trim().toLowerCase())
        const normalizedFieldsSet = new Set(rawFields)

        const missingRequired = REQUIRED_HEADERS.filter(h => !normalizedFieldsSet.has(h))

        if (missingRequired.length > 0) {
          // REJECT ENTIRE FILE IMMEDIATELY
          setFileHeaderError(`Kolom wajib '${missingRequired.join(', ')}' tidak ditemukan pada header CSV.`)
          setParsedRows([])
          setParsingLoading(false)
          setStep('PREVIEW')
          e.target.value = ''
          return
        }

        // 2. PARSE ROWS WITH NORMALIZED COLUMN ACCESS BY NAME
        const rows: ParsedCsvRow[] = []

        results.data.forEach((rawRowObj: any, idx: number) => {
          // Normalize row keys once (lowercase + trimmed key names)
          const normalizedRow: Record<string, string> = {}
          Object.keys(rawRowObj || {}).forEach(k => {
            const normKey = (k || '').toString().trim().toLowerCase()
            const val = (rawRowObj[k] || '').toString().trim()
            normalizedRow[normKey] = val
          })

          // Skip comment lines starting with #
          const firstVal = Object.values(normalizedRow)[0] as string
          if (firstVal && typeof firstVal === 'string' && firstVal.startsWith('#')) {
            return
          }

          const rowNum = idx + 2 // 1-based index (+1 header line)
          const event_id = normalizedRow.event_id || ''
          const channel = (normalizedRow.channel || '').toUpperCase()
          const order_id = normalizedRow.order_id || ''
          const event_type = (normalizedRow.event_type || '').toUpperCase()
          const status = (normalizedRow.status || '').toUpperCase()
          const sku = normalizedRow.sku || ''
          const qty = normalizedRow.qty || ''
          const timestamp = normalizedRow.timestamp || ''

          const errs: string[] = []

          if (!event_id) {
            errs.push('event_id wajib diisi')
          }

          if (!channel) {
            errs.push('channel wajib diisi')
          } else if (!['SHOPEE', 'TIKTOK'].includes(channel)) {
            errs.push(`channel '${channel}' harus SHOPEE atau TIKTOK`)
          }

          if (!order_id) {
            errs.push('order_id wajib diisi')
          }

          const validEventTypes = ['ORDER_CREATED', 'STATUS_UPDATED', 'CANCELLED', 'RETURN_REQUESTED', 'DELIVERED']
          if (!event_type) {
            errs.push('event_type wajib diisi')
          } else if (!validEventTypes.includes(event_type)) {
            errs.push(`event_type '${event_type}' tidak valid (harus ${validEventTypes.join('/')})`)
          }

          if (event_type === 'STATUS_UPDATED') {
            if (channel === 'SHOPEE' && status !== 'SHIPPED') {
              errs.push(`Status Shopee untuk STATUS_UPDATED harus SHIPPED (ditemukan: '${status || 'kosong'}')`)
            } else if (channel === 'TIKTOK' && status !== 'IN_TRANSIT') {
              errs.push(`Status TikTok untuk STATUS_UPDATED harus IN_TRANSIT (ditemukan: '${status || 'kosong'}')`)
            } else if (!status) {
              errs.push('status pengiriman wajib diisi untuk STATUS_UPDATED')
            }
          }

          if (sku && validSkus.size > 0 && !validSkus.has(sku)) {
            errs.push(`SKU '${sku}' tidak ditemukan di master produk / bundle`)
          }

          // EXPLICIT QTY VALIDATION FOR ALL EVENT TYPES
          if (qty !== '') {
            const parsedQty = parseInt(qty, 10)
            if (isNaN(parsedQty) || parsedQty <= 0) {
              errs.push(`qty '${qty}' harus berupa angka bulat positif (> 0)`)
            }
          } else if (['ORDER_CREATED', 'CANCELLED', 'RETURN_REQUESTED'].includes(event_type)) {
            errs.push(`qty wajib diisi untuk event ${event_type}`)
          }

          const isValid = errs.length === 0

          rows.push({
            rowNum,
            event_id,
            channel,
            order_id,
            event_type,
            status,
            sku,
            qty,
            timestamp: timestamp || '',
            isValid,
            errorMessage: isValid ? null : errs.join('; ')
          })
        })

        setParsedRows(rows)
        setParsingLoading(false)
        setStep('PREVIEW')

        // Reset file input value
        e.target.value = ''
      }
    })
  }

  const validRows = parsedRows.filter(r => r.isValid)
  const errorRows = parsedRows.filter(r => !r.isValid)

  const handleCommitValidRows = async () => {
    if (fileHeaderError || validRows.length === 0) return

    setCommitLoading(true)
    const newLogs: ExecutionLogItem[] = []

    let newlyProcessed = 0
    let idempSkipped = 0
    let execErrorCount = 0
    const execErrors: ExecutionErrorRow[] = []

    // Process EVERY valid row sequentially in exact CSV row order
    for (const row of validRows) {
      const event: MarketplaceEvent = {
        event_id: row.event_id,
        channel: row.channel as any,
        order_id: row.order_id,
        event_type: row.event_type as any,
        status: row.status,
        timestamp: row.timestamp,
        items: row.sku && row.qty ? [{ sku: row.sku, qty: parseInt(row.qty, 10) }] : []
      }

      const typeLabel = getEventTypeLabel(row.event_type)
      const res = await processMarketplaceEvent(event)
      
      if (res.success) {
        if ((res as any).isIdempotent) {
          idempSkipped++
          newLogs.push({
            type: 'info',
            rowNum: row.rowNum,
            eventId: row.event_id,
            eventTypeLabel: typeLabel,
            orderId: row.order_id,
            statusText: 'sudah pernah diproses sebelumnya, tidak ada perubahan'
          })
        } else {
          newlyProcessed++
          newLogs.push({
            type: 'success',
            rowNum: row.rowNum,
            eventId: row.event_id,
            eventTypeLabel: typeLabel,
            orderId: row.order_id,
            statusText: 'berhasil disimpan'
          })
        }
      } else {
        execErrorCount++
        const errReason = (res as any).error || 'Gagal memproses event di server'
        execErrors.push({
          rowNum: row.rowNum,
          event_id: row.event_id,
          order_id: row.order_id,
          channel: row.channel,
          event_type: row.event_type,
          sku: row.sku,
          qty: row.qty,
          errorMessage: errReason
        })
        newLogs.push({
          type: 'error',
          rowNum: row.rowNum,
          eventId: row.event_id,
          eventTypeLabel: typeLabel,
          orderId: row.order_id,
          statusText: errReason
        })
      }
    }

    setProcessedCount(newlyProcessed)
    setIdempotentCount(idempSkipped)
    setExecutionErrorCount(execErrorCount)
    setExecutionErrorRows(execErrors)
    setLogs(newLogs)
    setCommitLoading(false)
    setStep('RESULT')
  }

  const handleResetToUpload = () => {
    setStep('UPLOAD')
    setParsedRows([])
    setLogs([])
    setFileHeaderError(null)
    setFileName('')
    setProcessedCount(0)
    setIdempotentCount(0)
    setExecutionErrorCount(0)
    setExecutionErrorRows([])
    setShowLogsDetail(false)
  }

  const columnGuide = [
    { name: 'event_id', desc: 'ID unik kejadian (bebas, misal: EV-001) - WAJIB' },
    { name: 'channel', desc: 'Kanal penjualan (SHOPEE atau TIKTOK) - WAJIB' },
    { name: 'order_id', desc: 'Nomor pesanan toko (misal: ORD-1001) - WAJIB' },
    { name: 'event_type', desc: 'Jenis kejadian (ORDER_CREATED, STATUS_UPDATED, CANCELLED, RETURN_REQUESTED) - WAJIB' },
    { name: 'status', desc: 'Status pengiriman (SHIPPED untuk Shopee, IN_TRANSIT untuk TikTok) - WAJIB untuk STATUS_UPDATED' },
    { name: 'sku', desc: 'Kode SKU produk/bundle yang dipesan (misal: SKU-001) - WAJIB' },
    { name: 'qty', desc: 'Jumlah barang yang dipesan (angka bulat > 0) - WAJIB' },
    { name: 'timestamp', desc: 'Waktu kejadian ISO (OPSIONAL — fallback otomatis ke waktu server jika kosong/tidak ada)' }
  ]

  return (
    <div className="bg-white rounded-xl shadow-soft border border-slate-200 overflow-hidden flex flex-col h-auto">
      {/* Card Header */}
      <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-jade-100 text-jade-600 rounded-lg shrink-0">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              Import CSV (Batch Events)
              {step === 'PREVIEW' && (
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                  fileHeaderError ? 'bg-brick-100 text-brick-800 border-brick-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {fileHeaderError ? 'File Ditolak' : 'Layar Preview (Belum Dicommit)'}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Simulasi webhook masal dari laporan Excel/CSV</p>
          </div>
        </div>
      </div>

      {/* Body Section */}
      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* STEP 1: UPLOAD FORM */}
        {step === 'UPLOAD' && (
          <>
            <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <div className="truncate">
                <span className="font-semibold text-slate-800">Format Kolom Header ({REQUIRED_HEADERS.length} Wajib): </span>
                <code className="font-mono text-dusty-600">{REQUIRED_HEADERS.join(', ')}</code>
                <span className="text-slate-400 text-[11px] ml-1">(timestamp: opsional)</span>
              </div>
              <button 
                type="button"
                onClick={() => setShowModal(true)}
                className="text-jade-600 hover:text-jade-700 font-bold hover:underline inline-flex items-center gap-1 shrink-0 text-xs"
              >
                <HelpCircle size={14} /> Lihat keterangan tiap kolom
              </button>
            </div>
            
            <label className={`
              flex flex-col items-center justify-center w-full min-h-40 h-auto py-6 px-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors
              ${parsingLoading ? 'bg-slate-50 border-slate-300 opacity-50 cursor-not-allowed' : 'bg-slate-50 border-jade-300 hover:bg-jade-50/50 hover:border-jade-400'}
            `}>
              <div className="flex flex-col items-center justify-center text-center max-w-sm">
                {parsingLoading ? (
                  <Activity className="w-8 h-8 text-jade-500 mb-2.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-8 h-8 text-jade-500 mb-2.5" />
                )}
                <p className="mb-1 text-sm text-slate-700 font-bold px-2">
                  {parsingLoading ? 'Membaca & Memvalidasi CSV...' : 'Klik untuk Upload & Preview CSV'}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed px-2">File akan divalidasi terlebih dahulu sebelum disimpan ke sistem</p>
              </div>
              <input type="file" accept=".csv" onChange={handleFileUpload} disabled={parsingLoading} className="hidden" />
            </label>
          </>
        )}

        {/* STEP 2: PREVIEW & VALIDATION SCREEN */}
        {step === 'PREVIEW' && (
          <div className="space-y-4 flex-1 flex flex-col">
            {/* FILE HEADER REJECTION BANNER (If missing required header) */}
            {fileHeaderError ? (
              <div className="p-5 rounded-2xl border border-brick-200 bg-brick-50 text-brick-950 space-y-4 shadow-sm w-full h-auto">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 bg-brick-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                    <XCircle size={22} />
                  </div>
                  <div className="space-y-1.5 flex-1">
                    <h4 className="font-bold text-base text-brick-900">Format File CSV Ditolak (0 Baris Diproses)</h4>
                    <p className="text-xs text-brick-800 leading-relaxed font-semibold">
                      ⚠️ {fileHeaderError}
                    </p>
                    <p className="text-[11px] text-brick-700 leading-relaxed">
                      Harap perbaiki baris header file CSV Anda agar menyertakan {REQUIRED_HEADERS.length} kolom wajib: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-brick-200">{REQUIRED_HEADERS.join(', ')}</code>.
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-brick-200/80 flex justify-end">
                  <button
                    type="button"
                    onClick={handleResetToUpload}
                    className="px-4 py-2.5 bg-brick-600 hover:bg-brick-700 active:bg-brick-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <ArrowLeft size={15} /> Upload Ulang File CSV Yang Benar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Normal Preview Banner Summary */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="text-slate-600" size={16} />
                      <span className="font-bold text-sm text-slate-900">File: {fileName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-600">Total: {parsedRows.length} baris CSV</span>
                      <span>•</span>
                      <span className="px-2 py-0.5 rounded font-bold bg-jade-100 text-jade-800 border border-jade-200 flex items-center gap-1">
                        <CheckCircle2 size={12} /> {validRows.length} Valid
                      </span>
                      <span>•</span>
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        errorRows.length > 0 ? 'bg-brick-100 text-brick-800 border border-brick-200' : 'bg-slate-100 text-slate-600'
                      } flex items-center gap-1`}>
                        <ShieldAlert size={12} /> {errorRows.length} Error
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons: SINGLE Batal button + Primary Process button */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetToUpload}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitValidRows}
                      disabled={validRows.length === 0 || commitLoading}
                      className="px-4 py-2 bg-jade-600 hover:bg-jade-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      {commitLoading ? (
                        <Activity className="animate-spin" size={16} />
                      ) : (
                        <Play size={16} />
                      )}
                      Proses {validRows.length} Baris Valid
                    </button>
                  </div>
                </div>

                {/* Warning Note for Error Rows */}
                {errorRows.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <AlertTriangle className="text-amber-600 shrink-0" size={16} />
                    <span>
                      <strong>Perhatian:</strong> Terdapat {errorRows.length} baris yang bermasalah. Baris berstatus <strong>ERROR</strong> akan dilewati dan <strong>TIDAK AKAN MASUK KE SYSTEM / LEDGER</strong>.
                    </span>
                  </div>
                )}

                {/* Preview Detail Table (Horizontal Scrollable with distinct SKU & Qty columns) */}
                <div className="border border-slate-200 rounded-xl overflow-x-auto overflow-y-auto flex-1 max-h-96 bg-white shadow-2xs">
                  <table className="w-full min-w-[850px] text-left text-xs text-slate-600 whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700 w-10 text-center">No</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700 w-24">Status</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Event ID</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Kanal</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Order ID</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Tipe Event</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Status (CSV)</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">SKU</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Qty</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Waktu</th>
                        <th className="px-3.5 py-2.5 font-semibold text-slate-700">Validasi / Detail Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedRows.map((r) => (
                        <tr 
                          key={r.rowNum}
                          className={r.isValid ? 'hover:bg-slate-50' : 'bg-brick-50/40 hover:bg-brick-50/70'}
                        >
                          <td className="px-3.5 py-2 font-mono text-center text-slate-400 font-semibold">{r.rowNum}</td>
                          <td className="px-3.5 py-2">
                            {r.isValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold bg-jade-100 text-jade-700 border border-jade-200 text-[10px]">
                                <Check size={12} /> VALID
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold bg-brick-100 text-brick-700 border border-brick-200 text-[10px]">
                                <X size={12} /> ERROR
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2 font-mono text-slate-800 font-medium">{r.event_id || '-'}</td>
                          <td className="px-3.5 py-2 font-semibold text-slate-700">{r.channel || '-'}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-800">{r.order_id || '-'}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-600">{r.event_type || '-'}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-700">
                            {r.status ? <span className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">{r.status}</span> : '-'}
                          </td>
                          <td className="px-3.5 py-2 font-mono text-slate-800 font-medium">{r.sku || '-'}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-800 font-bold">{r.qty || '-'}</td>
                          <td className="px-3.5 py-2 font-mono text-slate-600">
                            {r.timestamp ? (
                              <span className="px-1.5 py-0.5 bg-jade-50 text-jade-700 border border-jade-200 rounded text-[10px] font-medium">
                                {r.timestamp}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Otomatis (waktu proses)</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2">
                            {r.isValid ? (
                              <span className="text-jade-700 italic text-[11px]">Siap diproses</span>
                            ) : (
                              <span className="text-brick-700 font-medium text-[11px] flex items-center gap-1">
                                ⚠️ {r.errorMessage}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3: RESULT SUMMARY SCREEN */}
        {step === 'RESULT' && (
          <div className="space-y-4 flex-1 flex flex-col">
            <div className="p-4 rounded-xl border border-jade-200 bg-jade-50/70 text-jade-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-jade-600 text-white rounded-xl">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-base text-jade-950">Eksekusi Batch Selesai!</h4>
                  <p className="text-xs text-jade-900 mt-0.5 leading-relaxed font-medium">
                    <strong>{processedCount} event BARU</strong> berhasil diproses.
                    {idempotentCount > 0 && <span className="text-slate-700 font-semibold ml-1">({idempotentCount} sudah pernah diproses sebelumnya, tidak ada perubahan).</span>}
                    {executionErrorCount > 0 && <span className="text-brick-800 font-bold ml-1">({executionErrorCount} gagal eksekusi).</span>}
                    <span className="ml-1 font-semibold">{errorRows.length} baris error validasi dilewati.</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono mt-1">
                    Total {parsedRows.length} baris CSV = {processedCount} baru + {idempotentCount} sudah ada + {executionErrorCount} gagal eksekusi + {errorRows.length} error validasi
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetToUpload}
                className="px-4 py-2 bg-jade-600 hover:bg-jade-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
              >
                <RefreshCw size={14} /> Upload File Lain
              </button>
            </div>

            {/* Toggle Button for Execution Logs */}
            {logs.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowLogsDetail(prev => !prev)}
                  className="text-xs font-semibold text-slate-600 hover:text-jade-700 transition-colors flex items-center gap-1.5 cursor-pointer py-1 px-2.5 rounded-lg border border-slate-200 hover:border-jade-300 bg-white shadow-2xs"
                >
                  {showLogsDetail ? (
                    <>Sembunyikan Log Proses ↑</>
                  ) : (
                    <>Lihat Detail Log Proses ({logs.length} Baris) ↓</>
                  )}
                </button>
              </div>
            )}

            {/* Execution Console Logs (Collapsible, hidden by default) */}
            {showLogsDetail && (
              <div className="flex-1 max-h-56 overflow-y-auto bg-slate-900 rounded-xl p-4 font-mono text-xs flex flex-col gap-2 shadow-inner border border-slate-800">
                {logs.map((log, i) => {
                  const isSuccess = log.type === 'success'
                  const isInfo = log.type === 'info'
                  const isError = log.type === 'error'

                  return (
                    <div key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="shrink-0 mt-0.5 select-none">
                        {isSuccess && <CheckCircle2 size={14} className="text-jade-400" />}
                        {isInfo && <span className="text-honey-400 font-bold text-xs">⊘</span>}
                        {isError && <ServerCrash size={14} className="text-brick-400" />}
                      </span>

                      <div className="break-words">
                        <span className="text-slate-400 font-medium">Baris {log.rowNum} — </span>
                        <span className="text-slate-100 font-semibold">{log.eventId}</span>
                        <span className="text-slate-400"> ({log.eventTypeLabel}) </span>
                        <span className="text-slate-400">untuk Order </span>
                        <span className="text-slate-100 font-semibold">{log.orderId}</span>
                        <span className="text-slate-400 font-medium">: </span>

                        {/* High-contrast status message accents */}
                        {isSuccess && (
                          <span className="text-jade-400 font-semibold">
                            {log.statusText}
                          </span>
                        )}
                        {isInfo && (
                          <span className="text-honey-300 font-medium">
                            {log.statusText}
                          </span>
                        )}
                        {isError && (
                          <span className="text-brick-400 font-semibold">
                            {log.statusText}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Details of Execution Errors (Server/Order State Errors) */}
            {executionErrorRows.length > 0 && (
              <div className="border border-brick-300 bg-brick-50/60 rounded-xl p-3.5 space-y-2">
                <h5 className="text-xs font-bold text-brick-900 flex items-center gap-1.5">
                  <ServerCrash size={14} className="text-brick-600" />
                  Detail {executionErrorRows.length} Baris Gagal Eksekusi (Server / State Machine Error):
                </h5>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {executionErrorRows.map(r => (
                    <div key={r.rowNum} className="text-[11px] bg-white p-2.5 rounded-lg border border-brick-200 space-y-1 font-mono">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="font-bold text-brick-800">Baris {r.rowNum}</span>
                        <span className="text-brick-700 font-semibold font-sans text-[11px]">
                          ⚠️ {r.errorMessage}
                        </span>
                      </div>
                      <div className="text-slate-600 font-mono text-[11px] leading-relaxed break-words">
                        <span className="font-semibold text-slate-800">{r.event_id || 'no-id'}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span>{r.channel || '-'}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span>{r.order_id || '-'}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span className="font-semibold text-slate-700">{r.event_type || '-'}</span>
                        {r.sku && (
                          <>
                            <span className="mx-1 text-slate-300">|</span>
                            <span>SKU: {r.sku} ({r.qty || '0'})</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Details of Skipped Error Rows */}
            {errorRows.length > 0 && (
              <div className="border border-brick-200 bg-brick-50/30 rounded-xl p-3.5 space-y-2">
                <h5 className="text-xs font-bold text-brick-900 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-brick-600" />
                  Detail {errorRows.length} Baris Yang Dilewati (Tidak Diproses):
                </h5>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {errorRows.map(r => (
                    <div key={r.rowNum} className="text-[11px] bg-white p-2.5 rounded-lg border border-brick-200 space-y-1 font-mono">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-1">
                        <span className="font-bold text-brick-800">Baris {r.rowNum}</span>
                        <span className="text-brick-700 font-semibold font-sans text-[11px]">
                          ⚠️ {r.errorMessage}
                        </span>
                      </div>
                      <div className="text-slate-600 font-mono text-[11px] leading-relaxed break-words">
                        <span className="font-semibold text-slate-800">{r.event_id || 'no-id'}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span>{r.channel || '-'}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span>{r.order_id || '-'}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span className="font-semibold text-slate-700">{r.event_type || '-'}</span>
                        {r.sku && (
                          <>
                            <span className="mx-1 text-slate-300">|</span>
                            <span>SKU: {r.sku} ({r.qty || '0'})</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Keterangan & Download Sample CSV */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <HelpCircle className="text-jade-600" size={20} />
                <h3 className="font-bold text-slate-900 text-base">Panduan Format Header CSV</h3>
              </div>
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center justify-between bg-jade-50/70 border border-jade-200 p-3.5 rounded-xl gap-4">
                <div className="text-xs text-jade-800">
                  <p className="font-bold text-sm">Download File Contoh CSV (4 Skenario)</p>
                  <p className="text-[11px] text-jade-700 mt-0.5 leading-relaxed">
                    Mencakup 4 skenario pesanan nyata: Shopee shipped, TikTok in-transit, cancelled (batal), & contoh baris error.
                  </p>
                </div>
                <button 
                  type="button"
                  onClick={handleDownloadSampleCsv}
                  className="px-4 py-2 bg-jade-600 hover:bg-jade-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                >
                  <Download size={14} /> Download Contoh CSV
                </button>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2">Penjelasan Kolom Header (7 Wajib + 1 Opsional):</h4>
                <div className="space-y-2">
                  {columnGuide.map(col => (
                    <div key={col.name} className="flex flex-col sm:flex-row sm:items-center gap-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                      <code className="font-mono font-bold text-dusty-700 bg-white px-2 py-0.5 rounded border border-slate-200 w-fit shrink-0">
                        {col.name}
                      </code>
                      <span className="text-slate-600 sm:ml-2">&rarr; {col.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                type="button"
                onClick={() => setShowModal(false)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
