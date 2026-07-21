import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { sql: `
    SELECT pg_get_constraintdef(oid) as def
    FROM pg_constraint 
    WHERE conname = 'qty_non_negative'
  `})
  
  if (error) {
    console.error('RPC failed, trying query...', error.message)
    // alternative
  } else {
    console.log('Constraint:', data)
  }
}
run()
