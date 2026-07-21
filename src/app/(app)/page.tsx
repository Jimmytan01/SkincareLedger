import { createClient } from '@/utils/supabase/server'
import DashboardClient from '@/components/DashboardClient'

export default async function Home() {
  const supabase = await createClient()

  // 1. Total Products
  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })

  // 2. Open Anomalies
  const { count: anomalyCount } = await supabase
    .from('anomalies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'OPEN')

  // 3. Expiring Batches
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  const { data: expiring } = await supabase
    .from('batches')
    .select('id, batch_code, expiry_date, products(name, sku)')
    .lte('expiry_date', thirtyDaysFromNow.toISOString())
    .gte('expiry_date', new Date().toISOString())

  const expiringWithBalances = []
  if (expiring && expiring.length > 0) {
    const batchIds = expiring.map(b => b.id)
    const { data: balances } = await supabase
      .from('stock_balance_cache')
      .select('batch_id, qty')
      .in('batch_id', batchIds)
      .gt('qty', 0)
    
    if (balances && balances.length > 0) {
      const balMap = new Map(balances.map(b => [b.batch_id, b.qty]))
      for (const batch of expiring) {
        if (balMap.has(batch.id)) {
          expiringWithBalances.push({
            ...batch,
            qty: balMap.get(batch.id)
          })
        }
      }
    }
  }

  // 4. Pending Returns
  const { data: pendingReturns } = await supabase
    .from('returns')
    .select('id, created_at, orders(marketplace_order_id)')
    .eq('status', 'PENDING_INSPECTION')
    .order('created_at', { ascending: true })
    .limit(5)

  // 5. Stock Balances grouped by Product
  const { data: allBalances } = await supabase
    .from('stock_balance_cache')
    .select('product_id, qty')
  
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name, sku')

  const prodBalMap = new Map()
  allBalances?.forEach(b => {
    prodBalMap.set(b.product_id, (prodBalMap.get(b.product_id) || 0) + b.qty)
  })

  const stockSummary = (allProducts || []).map(p => ({
    products: p,
    total_qty: prodBalMap.get(p.id) || 0
  }))

  return (
    <DashboardClient 
      totalProducts={totalProducts || 0}
      anomalyCount={anomalyCount || 0}
      expiringBatches={expiringWithBalances}
      pendingReturns={pendingReturns || []}
      stockBalances={stockSummary}
    />
  )
}
