import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envStr = fs.readFileSync('.env', 'utf-8')
const env = {}
envStr.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) env[match[1].trim()] = match[2].trim().replace(/\r$/, '')
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'admin@skincare.com',
    password: 'password123',
    email_confirm: true
  })
  
  if (error && error.message.includes('already exists')) {
    console.log('User already exists, updating password...')
    const { data: users } = await supabase.auth.admin.listUsers()
    const user = users.users.find(u => u.email === 'admin@skincare.com')
    if (user) {
      await supabase.auth.admin.updateUserById(user.id, { password: 'password123' })
      console.log('Password updated.')
    }
  } else if (error) {
    console.error('Error creating user:', error)
  } else {
    console.log('User created:', data.user.email)
  }
}
run()
