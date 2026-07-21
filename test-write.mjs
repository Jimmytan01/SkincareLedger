import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const env = fs.readFileSync('.env', 'utf-8')
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || ''
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || ''

const supabase = createClient(url, key)

async function run() {
  const productId = "00000000-0000-0000-0000-000000000001"
  const batchId = "10000000-0000-0000-0000-000000000001"
  
  console.log("Calling write_ledger_entry with qtyDelta: -1")
  
  const { data, error } = await supabase.rpc('write_ledger_entry', {
    p_product_id: productId,
    p_batch_id: batchId,
    p_qty_delta: -1,
    p_reason_code: 'SALE',
    p_channel: 'INTERNAL',
    p_source_type: 'MANUAL',
    p_source_ref_id: `TEST-${Date.now()}`,
    p_idempotency_key: `TEST-${Date.now()}`,
    p_created_by: null,
    p_reference_note: null
  })

  if (error) console.error("Error from write_ledger_entry:", error)
  else {
    console.log("Success! Result:", data)
    // Check what was stored in ledger
    const { data: ledger } = await supabase.from('stock_ledger').select('*').eq('id', data).single()
    console.log("Ledger Row:", ledger)
    
    // Check cache
    const { data: cache } = await supabase.from('stock_balance_cache').select('*').eq('batch_id', batchId).single()
    console.log("Cache Row:", cache)
  }
}
run()
