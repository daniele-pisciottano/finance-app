import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { syncNow, wireAutoSync } from '@/lib/sync'

interface AuthState {
  configured: boolean
  loading: boolean
  session: Session | null
  user: User | null
  error: string | null

  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string) => Promise<{ ok: boolean; needsConfirmation: boolean }>
  signOut: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  configured: isSupabaseConfigured(),
  loading: isSupabaseConfigured(), // only "loading" when we actually need a session
  session: null,
  user: null,
  error: null,

  init: async () => {
    if (!isSupabaseConfigured() || !supabase) {
      set({ configured: false, loading: false })
      return
    }
    wireAutoSync()

    const { data } = await supabase.auth.getSession()
    set({ session: data.session, user: data.session?.user ?? null, loading: false })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
      if (session) void syncNow()
    })

    if (data.session) void syncNow()
  },

  signIn: async (email, password) => {
    if (!supabase) return false
    set({ error: null, loading: true })
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    set({ loading: false })
    if (error) {
      set({ error: error.message })
      return false
    }
    return true
  },

  signUp: async (email, password) => {
    if (!supabase) return { ok: false, needsConfirmation: false }
    set({ error: null, loading: true })
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    set({ loading: false })
    if (error) {
      set({ error: error.message })
      return { ok: false, needsConfirmation: false }
    }
    // If email confirmation is enabled, there is a user but no session yet.
    const needsConfirmation = !data.session
    return { ok: true, needsConfirmation }
  },

  signOut: async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },

  clearError: () => set({ error: null })
}))

// convenience getter
export const isLoggedIn = () => !!useAuthStore.getState().session
