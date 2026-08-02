import { NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  } else {
    // If no secret configured, warn but allow for local testing if needed, or reject?
    // Rule says "pastikan endpoint reject kalau header ada tapi valuenya tidak cocok persis".
    // We will reject if it doesn't match the environment variable, but if the variable is missing...
    return new NextResponse('CRON_SECRET is not configured on server', { status: 500 })
  }

  const adminClient = createAdminClient()
  const anomaliesToInsert: any[] = []

  // 1. STALE_ORDER: Shipped/In Transit > 3 days (EXCLUDING DELIVERED and CANCELLED orders)
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

  const { data: staleOrders, error: staleErr } = await adminClient
    .from('orders')
    .select('id, marketplace_order_id, created_at, status')
    .eq('status', 'SHIPPED_IN_TRANSIT')
    .lt('created_at', threeDaysAgo.toISOString())

  if (staleOrders && staleOrders.length > 0) {
    staleOrders.forEach(order => {
      anomaliesToInsert.push({
        type: 'STALE_ORDER',
        description: `Order ${order.marketplace_order_id} masih berstatus ${order.status} sejak ${new Date(order.created_at).toLocaleDateString('id-ID')}. Mohon cek dengan platform.`,
        related_ids: { order_id: order.id },
        status: 'OPEN'
      })
    })
  }

  // 2. MISSING_LEDGER: Shipped/In Transit but no ledger entry
  const { data: processedOrders } = await adminClient
    .from('orders')
    .select('id, marketplace_order_id')
    .eq('status', 'SHIPPED_IN_TRANSIT')

  if (processedOrders && processedOrders.length > 0) {
    const orderIds = processedOrders.map(o => o.id)
    
    // Get distinct source_ref_ids from ledger that match these orders
    const { data: ledgerEntries } = await adminClient
      .from('stock_ledger')
      .select('source_ref_id')
      .in('source_ref_id', orderIds)
    
    const ledgerSet = new Set((ledgerEntries || []).map(l => l.source_ref_id))

    processedOrders.forEach(order => {
      if (!ledgerSet.has(order.id)) {
        anomaliesToInsert.push({
          type: 'MISSING_LEDGER',
          description: `Order ${order.marketplace_order_id} sudah diproses (SHIPPED/IN_TRANSIT) tetapi tidak ditemukan pemotongan stok di Ledger.`,
          related_ids: { order_id: order.id },
          status: 'OPEN'
        })
      }
    })
  }

  // 3. NEGATIVE_BALANCE_DETECTED: Check for batches with negative stock
  const { data: negativeBalances } = await adminClient
    .from('stock_balance_cache')
    .select('batch_id, product_id, qty, products(name, sku)')
    .lt('qty', 0)

  if (negativeBalances && negativeBalances.length > 0) {
    // Prevent creating duplicate anomalies for the same batch if one is already OPEN
    const { data: existingAnomalies } = await adminClient
      .from('anomalies')
      .select('related_ids')
      .eq('type', 'NEGATIVE_BALANCE_DETECTED')
      .eq('status', 'OPEN')
      
    const existingBatchIds = new Set(
      existingAnomalies?.map(a => (a.related_ids as any)?.batch_id).filter(Boolean) || []
    )

    negativeBalances.forEach(balance => {
      if (!existingBatchIds.has(balance.batch_id)) {
        anomaliesToInsert.push({
          type: 'NEGATIVE_BALANCE_DETECTED',
          description: `Stok produk ${(balance.products as any)?.name} (${(balance.products as any)?.sku}) pada batch ${balance.batch_id} bernilai negatif (${balance.qty}).`,
          related_ids: { batch_id: balance.batch_id, product_id: balance.product_id },
          status: 'OPEN'
        })
      }
    })
  }

  // Save all anomalies
  if (anomaliesToInsert.length > 0) {
    const { error } = await adminClient.from('anomalies').insert(anomaliesToInsert)
    if (error) {
      console.error('Failed to save anomalies:', error)
      return NextResponse.json({ success: false, error: 'Failed to save anomalies' }, { status: 500 })
    }
  }

  return NextResponse.json({ 
    success: true, 
    anomaliesDetected: anomaliesToInsert.length 
  })
}
