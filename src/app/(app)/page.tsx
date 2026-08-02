import { createAdminClient } from '@/utils/supabase/admin'
import DashboardClient from '@/components/DashboardClient'
import { formatQty } from '@/utils/format'
import { getOpenAnomalies } from '@/actions/anomalies'
import { getAnomalyMeta } from '@/utils/anomalyMeta'

export const dynamic = 'force-dynamic'

export interface AttentionItem {
  id: string
  category: 'ANOMALY' | 'EXPIRY' | 'TIKTOK_CLAIM' | 'PENDING_RETURN'
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  severityOrder: number
  badgeLabel: string
  title: string
  description: string
  actionUrl: string
  actionLabel: string
  timestamp?: string
}

export default async function Home() {
  const supabase = createAdminClient()
  const now = new Date()

  const ninetyDaysFromNow = new Date()
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90)
  const ninetyDaysStr = ninetyDaysFromNow.toISOString().split('T')[0]

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Execute independent dashboard queries concurrently in parallel (Promise.all)
  const [
    totalProductsRes,
    anomaliesRes,
    reservedItemsRes,
    expiringBatchesRes,
    returnsRes,
    recentMovementsRes,
    trendLedgerRes
  ] = await Promise.all([
    // 1. Total Products Count (using indexed 'id' projection for fast head count)
    supabase.from('products').select('id', { count: 'exact', head: true }),

    // 2. Open Anomalies Count & Data
    getOpenAnomalies(),

    // 3. Total Reserved Stock across all products (from CREATED orders)
    supabase.from('order_items').select('qty, orders!inner(status)').eq('orders.status', 'CREATED'),

    // 4. Batches & Expiry Data (Up to 90 days out for attention list)
    supabase.from('batches').select('id, batch_code, expiry_date, product:products!batches_product_id_fkey(name, sku)').lte('expiry_date', ninetyDaysStr),

    // 5. Returns Data (Pending Inspection ONLY & TikTok 40-Day Claim Countdown)
    supabase.from('returns').select(`
      id,
      created_at,
      status,
      qty_requested,
      orders!inner (
        id,
        marketplace_order_id,
        channel,
        status
      ),
      order_items (
        product:products (name, sku)
      )
    `, { count: 'exact' }).eq('status', 'PENDING_INSPECTION').order('created_at', { ascending: true }),

    // 6. Recent Ledger Movements (5-6 items)
    supabase.from('stock_ledger').select(`
      id,
      created_at,
      qty_delta,
      reason_code,
      channel,
      source_type,
      source_ref_id,
      product:products (id, name, sku),
      batch:batches (id, batch_code)
    `).order('created_at', { ascending: false }).limit(6),

    // 7. 30-Day Stock Movement Trend Query (Filtered by indexed created_at timestamp)
    supabase.from('stock_ledger').select('created_at, qty_delta, reason_code').gte('created_at', thirtyDaysAgo)
  ])

  // Extract parallel results
  const totalProducts = totalProductsRes.count
  const { data: openAnomalies, count: anomalyCount } = anomaliesRes
  const reservedItems = reservedItemsRes.data
  const expiringBatchesData = expiringBatchesRes.data
  const returnsData = returnsRes.data
  const pendingReturnsCount = returnsRes.count
  const recentMovements = recentMovementsRes.data
  const trendLedgerData = trendLedgerRes.data

  // Process 30-Day Trend Chart Data (Asia/Jakarta WIB)
  const trendMap = new Map<string, { date: string; displayDate: string; stockIn: number; stockOut: number }>()

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const displayDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })
    trendMap.set(dateStr, { date: dateStr, displayDate, stockIn: 0, stockOut: 0 })
  }

  trendLedgerData?.forEach(row => {
    const rowDate = new Date(row.created_at)
    const dateKey = rowDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    const entry = trendMap.get(dateKey)
    if (entry) {
      const delta = Number(row.qty_delta) || 0
      if (row.reason_code === 'SALE' || delta < 0) {
        entry.stockOut += Math.abs(delta)
      } else if (['OPENING_BALANCE', 'RETURN_IN', 'STOCK_IN'].includes(row.reason_code) || delta > 0) {
        entry.stockIn += Math.abs(delta)
      }
    }
  })

  const stockTrendData = Array.from(trendMap.values())

  // Calculate Total Reserved Qty
  const totalReservedQty = (reservedItems || []).reduce((sum, item) => sum + (item.qty || 0), 0)

  // Process Expiring Batches Balances
  const processedExpiringBatches: any[] = []
  if (expiringBatchesData && expiringBatchesData.length > 0) {
    const batchIds = expiringBatchesData.map(b => b.id)
    const { data: balances } = await supabase
      .from('stock_balance_cache')
      .select('batch_id, qty')
      .in('batch_id', batchIds)
      .gt('qty', 0)

    if (balances && balances.length > 0) {
      const balMap = new Map(balances.map(b => [b.batch_id, b.qty]))
      for (const b of expiringBatchesData) {
        if (balMap.has(b.id)) {
          const expDate = b.expiry_date ? new Date(b.expiry_date) : null
          const daysRemaining = expDate ? Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24)) : 999
          const prod: any = Array.isArray(b.product) ? b.product[0] : b.product

          processedExpiringBatches.push({
            id: b.id,
            batch_code: b.batch_code,
            expiry_date: b.expiry_date,
            daysRemaining,
            product_name: prod?.name || 'Produk',
            product_sku: prod?.sku || '',
            qty: balMap.get(b.id)
          })
        }
      }
    }
  }

  // Count only critical expiry (<= 30 days) for KPI Card
  const criticalExpiryCount = processedExpiringBatches.filter(b => b.daysRemaining <= 30).length

  const pendingReturnsList = (returnsData || []).filter(r => r.status === 'PENDING_INSPECTION')

  // 6. Assemble "Perlu Perhatian Hari Ini" (Unified Attention Items)
  const attentionItems: AttentionItem[] = []

  // a. Add Open Anomalies
  if (openAnomalies) {
    for (const a of openAnomalies) {
      const meta = getAnomalyMeta(a.type)
      attentionItems.push({
        id: `anomaly-${a.id}`,
        category: 'ANOMALY',
        severity: 'CRITICAL',
        severityOrder: 1,
        badgeLabel: 'Anomali',
        title: meta.label,
        description: a.description || 'Selisih atau kejanggalan stok terdeteksi di sistem.',
        actionUrl: '/anomalies',
        actionLabel: 'Buka Worklist Anomali',
        timestamp: a.detected_at
      })
    }
  }

  // b. Add Expiring Batches
  for (const b of processedExpiringBatches) {
    const isCritical = b.daysRemaining <= 30
    attentionItems.push({
      id: `expiry-${b.id}`,
      category: 'EXPIRY',
      severity: isCritical ? 'CRITICAL' : 'WARNING',
      severityOrder: isCritical ? 2 : 4,
      badgeLabel: isCritical ? 'Kritis ≤30 Hari' : 'Perhatian ≤90 Hari',
      title: `${b.product_name} (${b.product_sku}) — Batch ${b.batch_code}`,
      description: `Sisa ${formatQty(b.qty)} unit · Tgl Kedaluwarsa: ${b.expiry_date} (${b.daysRemaining <= 0 ? 'Sudah Kedaluwarsa' : `${b.daysRemaining} hari lagi`})`,
      actionUrl: '/products',
      actionLabel: 'Lihat di Master Produk',
      timestamp: b.expiry_date
    })
  }

  // c. Add TikTok 40-Day Claim Countdown Returns
  const tikTokReturns = (returnsData || []).filter(r => (r.orders as any)?.channel === 'TIKTOK')
  for (const r of tikTokReturns) {
    const orderInfo: any = r.orders
    const createdAt = new Date(r.created_at)
    
    // Rule #6: TikTok 40-day claim countdown starts from created_at RETUR DIAJUKAN
    const deadlineDate = new Date(createdAt.getTime() + 40 * 24 * 60 * 60 * 1000)
    const daysLeft = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 3600 * 24))

    let severity: 'CRITICAL' | 'WARNING' | 'INFO' = 'INFO'
    let severityOrder = 5
    let badgeLabel = 'Klaim TikTok'

    if (daysLeft <= 7) {
      severity = 'CRITICAL'
      severityOrder = 1
      badgeLabel = 'Klaim TikTok (Mendesak)'
    } else if (daysLeft <= 14) {
      severity = 'WARNING'
      severityOrder = 3
      badgeLabel = 'Klaim TikTok'
    }

    const deadlineStr = deadlineDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

    attentionItems.push({
      id: `tiktok-claim-${r.id}`,
      category: 'TIKTOK_CLAIM',
      severity,
      severityOrder,
      badgeLabel,
      title: `Batas Klaim TikTok: ${orderInfo?.marketplace_order_id || 'Order TikTok'}`,
      description: `Retur diajukan ${createdAt.toLocaleDateString('id-ID')} · Sisa ${daysLeft <= 0 ? '0' : daysLeft} hari batas klaim (Deadline: ${deadlineStr})`,
      actionUrl: '/returns',
      actionLabel: 'Buka Inbox Retur',
      timestamp: r.created_at
    })
  }

  // d. Add Pending Inspection Returns (avoiding duplicate if TikTok claim already listed)
  for (const r of pendingReturnsList) {
    const orderInfo: any = r.orders
    const isTikTok = orderInfo?.channel === 'TIKTOK'
    
    // If it's TikTok and already included in claim countdown above, skip duplicating
    if (isTikTok && tikTokReturns.some(t => t.id === r.id)) continue

    const createdAt = new Date(r.created_at)
    const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 3600 * 24))
    const isOverdue = ageDays >= 3

    attentionItems.push({
      id: `pending-return-${r.id}`,
      category: 'PENDING_RETURN',
      severity: isOverdue ? 'WARNING' : 'INFO',
      severityOrder: isOverdue ? 3 : 5,
      badgeLabel: isOverdue ? 'Perlu Diproses' : 'Retur Pending',
      title: `Inspeksi Retur: ${orderInfo?.marketplace_order_id || 'Order'} (${orderInfo?.channel || 'MARKETPLACE'})`,
      description: `Diajukan ${createdAt.toLocaleDateString('id-ID')} (${ageDays === 0 ? 'Hari ini' : `${ageDays} hari lalu`}) — Menunggu inspeksi gudang`,
      actionUrl: '/returns',
      actionLabel: 'Inspeksi Gudang',
      timestamp: r.created_at
    })
  }

  // Sort Attention Items by severityOrder ascending (CRITICAL -> WARNING -> INFO)
  attentionItems.sort((a, b) => a.severityOrder - b.severityOrder)

  return (
    <DashboardClient 
      totalProducts={totalProducts || 0}
      anomalyCount={anomalyCount || 0}
      totalReservedQty={totalReservedQty}
      criticalExpiryCount={criticalExpiryCount}
      pendingReturnsCount={pendingReturnsCount || 0}
      attentionItems={attentionItems}
      recentMovements={recentMovements || []}
      stockTrendData={stockTrendData}
    />
  )
}
