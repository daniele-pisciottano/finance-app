import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { dbOperations } from '@/lib/db'
import type { Transaction, SavingGoal, RecurringRule, UserSettings } from '@/types'

// A single Supabase table `records` holds every synced item as an envelope:
//   { user_id, collection, id, data (jsonb), updated_at (bigint), deleted (bool) }
// One table + one RLS policy keeps the schema tiny and the local data model
// authoritative (CSV/export keep working untouched).
//
// Two cursors, deliberately not one:
//   lastPulledAt — the highest `updated_at` actually seen from the server. It has to
//     live in the same coordinate space as the column it filters on. Advancing it to
//     Date.now() instead would skip every row another device writes with an earlier
//     stamp, which is precisely what restored history looks like.
//   lastPushedAt — this device's own clock at the last successful push, compared
//     against local `updatedAt` values, which are always local write times.

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

// PostgREST caps how many rows one response may carry, and a restored history runs
// well past that cap — so the pull walks pages instead of trusting a single request.
const PULL_PAGE = 500

function updatedAtOf(collection: Collection, record: unknown, settingsTs: number): number {
  if (collection === 'settings') return settingsTs
  const r = record as { updatedAt?: number; createdAt?: number }
  // Records predating the sync engine still have to reach the server: fall back to
  // the creation time, then to 1 so they clear a zeroed cursor rather than sitting
  // at 0 and failing the strict `>` test forever.
  return r.updatedAt ?? r.createdAt ?? 1
}

// One IndexedDB serves whoever signs in on this browser, so a session change has to
// be noticed: pushing with the new session's user_id would file the previous
// account's records under the new account. Two people sharing a laptop is the normal
// case here, not an exotic one. Returns true when the local copy was reset.
async function adoptLocalCopy(userId: string): Promise<boolean> {
  const owner = await dbOperations.getSyncOwner()
  if (owner === userId) return false
  // No owner recorded means the copy predates this check: it belongs to whoever is
  // signing in now (the only account that has ever used it), so claim it as-is.
  if (owner !== null) await dbOperations.clearAllData()
  await dbOperations.setSyncOwner(userId)
  return owner !== null
}

// Installs that ran the single-cursor engine have only `lastPulledAt`. Seed the push
// cursor from it rather than zeroing it: a browser can still hold records belonging
// to whoever used it before this check existed, and a blanket push would file them
// under the account signed in now. Repairing a device that never sent its history is
// therefore a deliberate act — resyncEverything, behind a confirmation.
async function splitCursorsOnce(): Promise<void> {
  if (await dbOperations.getSyncMeta('cursorSplitDone')) return
  const legacy = await dbOperations.getSyncMeta('lastPulledAt')
  await dbOperations.setSyncMeta('lastPushedAt', legacy)
  await dbOperations.setSyncMeta('cursorSplitDone', 1)
}

// Replay this device's whole history in both directions. Re-dating the records is
// what makes it work regardless of which device comes online first: a row re-sent
// with its original stamp would land behind cursors that already moved past it,
// which is how the imported backup stayed invisible in the first place.
export async function resyncEverything(): Promise<void> {
  await dbOperations.restampForResync()
  await dbOperations.setSyncMeta('lastPulledAt', 0)
  await dbOperations.setSyncMeta('lastPushedAt', 0)
  await syncNow()
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
    const reset = await adoptLocalCopy(sessionData.session.user.id)
    await splitCursorsOnce()
    const pullSince = await dbOperations.getSyncMeta('lastPulledAt')
    const pushSince = await dbOperations.getSyncMeta('lastPushedAt')
    const pushWatermark = Date.now()
    let maxSeen = pullSince

    // --- PULL (paged) ---
    let changed = reset
    for (let offset = 0; ; offset += PULL_PAGE) {
      const { data: page, error: pullError } = await supabase
        .from('records')
        .select('collection,id,data,updated_at,deleted')
        .gt('updated_at', pullSince)
        .order('updated_at', { ascending: true })
        .order('collection', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PULL_PAGE - 1)
      if (pullError) throw pullError

      const rows = (page ?? []) as Envelope[]
      for (const row of rows) {
        if (row.updated_at > maxSeen) maxSeen = row.updated_at
        const applied = await applyRemote(row)
        if (applied) changed = true
      }
      if (rows.length < PULL_PAGE) break
    }

    // --- PUSH (delta since this device's last push) ---
    const localEnvelopes = await gatherLocalEnvelopes(pushSince)
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

    // Only what the server actually showed us advances the pull cursor — our own
    // freshly pushed rows come back once as a no-op, which is cheaper than the risk
    // of stepping over a peer's older row.
    await dbOperations.setSyncMeta('lastPulledAt', maxSeen)
    await dbOperations.setSyncMeta('lastPushedAt', pushWatermark)
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
