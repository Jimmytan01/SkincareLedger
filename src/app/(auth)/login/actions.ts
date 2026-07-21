'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const data = {
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const { error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    // We can't return complex errors from server actions easily without a redirect or error state
    // For simplicity, we redirect back to login with an error query param
    redirect('/login?error=true')
  }

  revalidatePath('/', 'layout')
  redirect('/')
}
