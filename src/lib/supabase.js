import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// Accept either name: the explicit "publishable" name or the conventional "anon" name.
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    '[supabase] Missing env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY ' +
      '(or VITE_SUPABASE_ANON_KEY) in your Cloudflare Pages project settings, then redeploy.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
