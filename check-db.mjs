import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf-8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || ''
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || ''

const supabase = createClient(url, key)

async function run() {
  console.log("=== STOCK BALANCE CACHE ===")
  const { data: cache, error: cacheErr } = await supabase.from('stock_balance_cache').select('*, products(name, sku), batches(batch_code, expiry_date)')
  if (cacheErr) console.error("Cache Error:", cacheErr)
  console.log(JSON.stringify(cache, null, 2))

  console.log("\n=== RECENT LEDGER ENTRIES ===")
  const { data: ledger, error: ledgerErr } = await supabase.from('stock_ledger').select('id, product_id, batch_id, qty_delta, reason_code, created_at').order('created_at', { ascending: false }).limit(5)
  if (ledgerErr) console.error("Ledger Error:", ledgerErr)
  console.log(JSON.stringify(ledger, null, 2))
}

run()
