import { createClient } from '@/utils/supabase/server'
// Unused imports removed

export default async function TestPage() {
  const supabase = await createClient()

  // Fetch all products
  const { data: products } = await supabase.from('products').select('*')
  
  // Fetch all batches
  const { data: batches } = await supabase.from('batches').select('*')

  // Fetch ledger count
  const { count: ledgerCount } = await supabase.from('stock_ledger').select('*', { count: 'exact', head: true })

  // Fetch cache balance
  const { data: cacheBalances } = await supabase.from('stock_balance_cache').select(`
    product_id,
    batch_id,
    qty,
    products ( name ),
    batches ( batch_code, expiry_date )
  `)

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Phase 2 - Verification Page</h1>
      <p>This page connects to Supabase and verifies the schema and dummy data.</p>
      
      <section style={{ marginTop: '2rem' }}>
        <h2>Database Stats</h2>
        <ul>
          <li>Products: {products?.length || 0}</li>
          <li>Batches: {batches?.length || 0}</li>
          <li>Ledger Entries: {ledgerCount || 0}</li>
        </ul>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Current Stock Balances (Cache)</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f3f4f6', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Product</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Batch Code</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Expiry</th>
              <th style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>Qty</th>
            </tr>
          </thead>
          <tbody>
            {cacheBalances?.map((bal: any) => (
              <tr key={`${bal.product_id}-${bal.batch_id}`}>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{bal.products?.name}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{bal.batches?.batch_code}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{bal.batches?.expiry_date}</td>
                <td style={{ padding: '0.5rem', border: '1px solid #d1d5db' }}>{bal.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Test APIs</h2>
        <p>You can run tests from the frontend or use the server actions defined in <code>src/actions/stock.ts</code>.</p>
      </section>
    </div>
  )
}
