import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const envStr = fs.readFileSync('.env', 'utf-8')
const env = {}
envStr.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) env[match[1]] = match[2].trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: `
    SELECT conname, pg_get_constraintdef(oid) as def, conrelid::regclass as table_name
    FROM pg_constraint 
    WHERE conname = 'qty_non_negative'
  `})
  
  if (error) {
    console.error('RPC execute_sql not available, querying directly via REST...')
    // Try to get schema info using PostgREST if execute_sql is not defined
    const res = await supabase.from('stock_balance_cache').select('qty').limit(1)
    console.log('Test query result:', res)
  } else {
    console.log('Constraint info:', data)
  }
}
run()
