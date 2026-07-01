import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { dbOperations } from '@/lib/db'
import type { Transaction, SavingGoal, RecurringRule, UserSettings } from '@/types'

// A single Supabase table `records` holds every synced item as an envelope:
//   { user_id, collection, id, data (jsonb), updated_at (bigint), deleted (bool) }
// One table + one RLS policy keeps the schema tiny and the local data model
// authoritative (CSV/export keep working untouched).

type Collection = 'transactions' | 'savingGoals' | 'recurringRules' | 'settings'
const SYNCED_COLLECTIONS: Exclude<Collection, 'settings'>[] = ['transactions', 'savingGoals', 'recurringRules']

interface Envelope {
  collection: Collection
  id: string
  data: unknown
  updated_at: number
  deleted: boolean
}

export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'offline'

let running = false
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let onDataChanged: (() => void | Promise<void>) | null = null

// Lightweight status broadcast for the UI.
let status: SyncStatus = 'idle'
let lastError: string | null = null
const listeners = new Set<() => void>()

export function getSyncStatus(): { status: SyncStatus; lastError: string | null } {
  return { status, lastError }
}
export function subscribeSync(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function setStatus(s: SyncStatus, err: string | null = null) {
  status = s
  lastError = err
  listeners.forEach((fn) => fn())
}

// The store registers a callback so pulled changes refresh the in-memory state.
export function setOnDataChanged(fn: () => void | Promise<void>) {
  onDataChanged = fn
}

function updatedAtOf(collection: Collection, record: unknown, settingsTs: number): number {
  if (collection === 'settings') return settingsTs
  const r = record as { updatedAt?: number }
  return r.updatedAt ?? 0
}

// Read everything local as envelopes (excluding deletes — those come from tombstones).
async function gatherLocalEnvelopes(sinceTs: number): Promise<Envelope[]> {
  const [transactions, savingGoals, recurringRules, settings, settingsTs] = await Promise.all([
    dbOperations.getAllTransactions(),
    dbOperations.getAllSavingGoals(),
    dbOperations.getAllRecurringRules(),
    dbOperations.getSettings(),
    dbOperations.getSyncMeta('settingsUpdatedAt')
  ])

  const out: Envelope[] = []
  const pushIf = (collection: Collection, id: string, data: unknown) => {
    const ts = updatedAtOf(collection, data, settingsTs)
    if (ts > sinceTs) out.push({ collection, id, data, updated_at: ts, deleted: false })
  }

  transactions.forEach((t) => pushIf('transactions', t.id, t))
  savingGoals.forEach((g) => pushIf('savingGoals', g.id, g))
  recurringRules.forEach((r) => pushIf('recurringRules', r.id, r))
  // settings is a singleton
  if (settingsTs > sinceTs) {
    out.push({ collection: 'settings', id: 'user-settings', data: settings, updated_at: settingsTs, deleted: false })
  }

  // Deletions as tombstone envelopes
  const tombstones = await dbOperations.getTombstones()
  tombstones
    .filter((tomb) => tomb.updatedAt > sinceTs)
    .forEach((tomb) => out.push({ collection: tomb.collection, id: tomb.recordId, data: null, updated_at: tomb.updatedAt, deleted: true }))

  return out
}

async function localUpdatedAtFor(collection: Collection, id: string): Promise<number | null> {
  if (collection === 'settings') {
    return dbOperations.getSyncMeta('settingsUpdatedAt')
  }
  let rec: { updatedAt?: number } | undefined
  if (collection === 'transactions') rec = await dbOperations.getTransaction(id)
  else if (collection === 'savingGoals') rec = (await dbOperations.getAllSavingGoals()).find((g) => g.id === id)
  else if (collection === 'recurringRules') rec = (await dbOperations.getAllRecurringRules()).find((r) => r.id === id)
  return rec ? (rec.updatedAt ?? 0) : null
}

// Apply one remote envelope to local storage using last-write-wins.
async function applyRemote(env: Envelope): Promise<boolean> {
  const localTs = await localUpdatedAtFor(env.collection, env.id)

  if (env.deleted) {
    if (env.collection === 'settings') return false // never delete settings
    if (localTs === null) return false // already absent
    if (localTs > env.updated_at) return false // local is newer, keep it
    await dbOperations.deleteRecordRaw(env.collection, env.id)
    await dbOperations.removeTombstone(env.collection, env.id)
    return true
  }

  if (localTs !== null && localTs >= env.updated_at) return false // local same/newer

  if (env.collection === 'transactions') await dbOperations.putTransactionRaw(env.data as Transaction)
  else if (env.collection === 'savingGoals') await dbOperations.putSavingGoalRaw(env.data as SavingGoal)
  else if (env.collection === 'recurringRules') await dbOperations.putRecurringRuleRaw(env.data as RecurringRule)
  else if (env.collection === 'settings') {
    await dbOperations.putSettingsRaw(env.data as UserSettings)
    await dbOperations.setSyncMeta('settingsUpdatedAt', env.updated_at)
  }
  return true
}

export async function syncNow(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return
  if (running) return
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return // not logged in

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setStatus('offline')
    return
  }

  running = true
  setStatus('syncing')
  try {
    const since = await dbOperations.getSyncMeta('lastPulledAt')
    const watermark = Date.now()
    let maxSeen = since

    // --- PULL ---
    const { data: remoteRows, error: pullError } = await supabase
      .from('records')
      .select('collection,id,data,updated_at,deleted')
      .gt('updated_at', since)
    if (pullError) throw pullError

    let changed = false
    for (const row of (remoteRows ?? []) as Envelope[]) {
      if (row.updated_at > maxSeen) maxSeen = row.updated_at
      const applied = await applyRemote(row)
      if (applied) changed = true
    }

    // --- PUSH (delta since last watermark) ---
    const localEnvelopes = await gatherLocalEnvelopes(since)
    if (localEnvelopes.length > 0) {
      const userId = sessionData.session.user.id
      const payload = localEnvelopes.map((e) => ({
        user_id: userId,
        collection: e.collection,
        id: e.id,
        data: e.data,
        updated_at: e.updated_at,
        deleted: e.deleted
      }))
      for (const e of localEnvelopes) if (e.updated_at > maxSeen) maxSeen = e.updated_at

      // Chunk to keep request sizes sane.
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200)
        const { error: pushError } = await supabase
          .from('records')
          .upsert(chunk, { onConflict: 'user_id,collection,id' })
        if (pushError) throw pushError
      }

      // Successfully pushed tombstones can be dropped locally.
      for (const e of localEnvelopes) {
        if (e.deleted && e.collection !== 'settings') {
          await dbOperations.removeTombstone(e.collection as Exclude<Collection, 'settings'>, e.id)
        }
      }
    }

    await dbOperations.setSyncMeta('lastPulledAt', Math.max(watermark, maxSeen))
    await dbOperations.setSyncMeta('lastSyncedAt', Date.now())

    if (changed && onDataChanged) await onDataChanged()
    setStatus('ok')
  } catch (err) {
    console.error('Sync failed:', err)
    setStatus('error', err instanceof Error ? err.message : String(err))
  } finally {
    running = false
  }
}

// Debounced trigger used after local mutations.
export function scheduleSync(delay = 1500): void {
  if (!isSupabaseConfigured()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void syncNow()
  }, delay)
}

// Wire up online / focus triggers once.
let wired = false
export function wireAutoSync(): void {
  if (wired || typeof window === 'undefined' || !isSupabaseConfigured()) return
  wired = true
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('focus', () => scheduleSync(300))
}

// Avoid unused-var lint for the collection list (documents the synced set).
void SYNCED_COLLECTIONS
