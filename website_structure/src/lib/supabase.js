import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // This will surface as a runtime error in the browser, not a build error.
  // Run `cp .env.example .env.local` and fill in your Supabase credentials.
  console.error(
    '[CoursePilot] Missing Supabase environment variables. ' +
    'Copy website_structure/.env.example to website_structure/.env.local ' +
    'and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key'
)
