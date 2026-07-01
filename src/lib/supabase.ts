import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Credentials come from Vite env vars (set locally in .env, and on Vercel in the
// project settings). When they are absent the app runs in pure local mode exactly
// as before — no login, no sync, everything stays in IndexedDB.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function isSupabaseConfigured(): boolean {
  return !!url && !!anonKey
}

// A single shared client (or null when not configured).
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'finance-auth'
      }
    })
  : null
