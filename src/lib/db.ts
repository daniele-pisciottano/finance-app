import Dexie, { type EntityTable } from 'dexie'
import type {
  Transaction,
  SavingGoal,
  UserSettings,
  RecurringRule,
  Tombstone,
  CaptureSettings,
  CategoryDef,
  PrimaryCategory
} from '@/types'
import { DEFAULT_CATEGORY_SET_ID, getCategorySet } from '@/lib/categoryPresets'

// Simple key/value row for local sync bookkeeping (e.g. lastPulledAt).
interface SyncMeta {
  key: string
  value: number
}

// Define the database
const db = new Dexie('FinanceTrackerDB') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  savingGoals: EntityTable<SavingGoal, 'id'>
  settings: EntityTable<UserSettings & { id: string }, 'id'>
  recurringRules: EntityTable<RecurringRule, 'id'>
  tombstones: EntityTable<Tombstone, 'key'>
  syncMeta: EntityTable<SyncMeta, 'key'>
}

db.version(1).stores({
  transactions: 'id, type, date, primaryCategory, secondaryCategory, incomeType, createdAt',
  savingGoals: 'id, month',
  settings: 'id'
})

// v2: add recurring rules + index the recurringRuleId on transactions
db.version(2).stores({
  transactions: 'id, type, date, primaryCategory, secondaryCategory, incomeType, createdAt, recurringRuleId',
  savingGoals: 'id, month',
  settings: 'id',
  recurringRules: 'id, active, startMonth'
})

// v3: local sync bookkeeping (tombstones for deletes + lastPulledAt)
db.version(3).stores({
  transactions: 'id, type, date, primaryCategory, secondaryCategory, incomeType, createdAt, recurringRuleId',
  savingGoals: 'id, month',
  settings: 'id',
  recurringRules: 'id, active, startMonth',
  tombstones: 'key, collection',
  syncMeta: 'key'
})

function cloneCategories(categories: CategoryDef[]): CategoryDef[] {
  return categories.map((c) => ({ ...c, subcategories: [...c.subcategories] }))
}

// Fresh accounts trust the "Joint ·" marker Revolut puts in the notification title to
// decide whether a payment is shared.
const DEFAULT_CAPTURE: CaptureSettings = {
  sources: { intesa: true, revolut: true, paypal: true, satispay: true, youalert: true },
  revolutSplit: 'joint-only',
  paypalDuplicateWarning: true,
  depositAmounts: [103.29]
}

// Accounts that predate CaptureSettings were halving *every* Revolut payment; keep
// doing that for them rather than silently changing recorded amounts.
const LEGACY_CAPTURE: CaptureSettings = { ...DEFAULT_CAPTURE, revolutSplit: 'always' }

// Default settings
const DEFAULT_SETTINGS: UserSettings = {
  darkMode: false,
  currency: 'EUR',
  defaultSavingGoal: 300,
  categorySetId: DEFAULT_CATEGORY_SET_ID,
  onboarded: false,
  categories: cloneCategories(getCategorySet(DEFAULT_CATEGORY_SET_ID).categories),
  capture: { ...DEFAULT_CAPTURE }
}

export function defaultSettings(): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    categories: cloneCategories(DEFAULT_SETTINGS.categories),
    capture: { ...DEFAULT_CAPTURE, sources: { ...DEFAULT_CAPTURE.sources }, depositAmounts: [...DEFAULT_CAPTURE.depositAmounts] }
  }
}

// Bring a stored (possibly older) settings object up to the current shape. Older rows
// carried the taxonomy implicitly plus a `customSubcategories` map; rebuild the explicit
// category list from the preset they were using so nothing the user added is lost.
export function normalizeSettings(raw: Partial<UserSettings> | undefined): UserSettings {
  const base = defaultSettings()
  if (!raw) return base

  const categorySetId = raw.categorySetId ?? DEFAULT_CATEGORY_SET_ID
  let categories = raw.categories && raw.categories.length > 0 ? cloneCategories(raw.categories) : null
  if (!categories) {
    const preset = getCategorySet(categorySetId)
    categories = preset.categories.map((c) => ({
      ...c,
      subcategories: [...(raw.customSubcategories?.[c.name] ?? c.subcategories)]
    }))
  }

  const capture = raw.capture
    ? {
        ...LEGACY_CAPTURE,
        ...raw.capture,
        sources: { ...LEGACY_CAPTURE.sources, ...raw.capture.sources },
        depositAmounts: raw.capture.depositAmounts ?? [...LEGACY_CAPTURE.depositAmounts]
      }
    : { ...LEGACY_CAPTURE, sources: { ...LEGACY_CAPTURE.sources }, depositAmounts: [...LEGACY_CAPTURE.depositAmounts] }

  return {
    darkMode: raw.darkMode ?? base.darkMode,
    currency: raw.currency ?? base.currency,
    defaultSavingGoal: raw.defaultSavingGoal ?? base.defaultSavingGoal,
    categorySetId,
    // A row written before this field existed belongs to an account that has been in
    // use for a while — never send it back through setup.
    onboarded: raw.onboarded ?? raw.categories === undefined,
    categories,
    capture
  }
}

// Database operations
export const dbOperations = {
  // Transactions
  async addTransaction(transaction: Transaction): Promise<string> {
    return db.transactions.add(transaction)
  },

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<number> {
    return db.transactions.update(id, { ...updates, updatedAt: Date.now() })
  },

  async deleteTransaction(id: string): Promise<void> {
    return db.transactions.delete(id)
  },

  async getTransaction(id: string): Promise<Transaction | undefined> {
    return db.transactions.get(id)
  },

  async getAllTransactions(): Promise<Transaction[]> {
    return db.transactions.orderBy('date').reverse().toArray()
  },

  async getTransactionsByMonth(yearMonth: string): Promise<Transaction[]> {
    const startDate = `${yearMonth}-01`
    const [year, month] = yearMonth.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${yearMonth}-${lastDay.toString().padStart(2, '0')}`

    return db.transactions
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray()
  },

  async getTransactionsByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    return db.transactions
      .where('date')
      .between(startDate, endDate, true, true)
      .toArray()
  },

  async getRecentTransactions(limit = 10): Promise<Transaction[]> {
    return db.transactions.orderBy('createdAt').reverse().limit(limit).toArray()
  },

  // Recurring rules
  async getAllRecurringRules(): Promise<RecurringRule[]> {
    return db.recurringRules.toArray()
  },

  async addRecurringRule(rule: RecurringRule): Promise<string> {
    return db.recurringRules.add(rule)
  },

  async updateRecurringRule(id: string, updates: Partial<RecurringRule>): Promise<number> {
    return db.recurringRules.update(id, { ...updates, updatedAt: Date.now() })
  },

  async deleteRecurringRule(id: string): Promise<void> {
    return db.recurringRules.delete(id)
  },

  // Saving Goals
  async setSavingGoal(goal: SavingGoal): Promise<string> {
    const existing = await db.savingGoals.where('month').equals(goal.month).first()
    if (existing) {
      // put, not update: the goal's category budgets are an open-ended map, which
      // Dexie's UpdateSpec cannot express.
      await db.savingGoals.put({ ...goal, id: existing.id })
      return existing.id
    }
    return db.savingGoals.add(goal)
  },

  async getSavingGoal(month: string): Promise<SavingGoal | undefined> {
    return db.savingGoals.where('month').equals(month).first()
  },

  async getAllSavingGoals(): Promise<SavingGoal[]> {
    return db.savingGoals.orderBy('month').reverse().toArray()
  },

  // Settings
  async getSettings(): Promise<UserSettings> {
    const stored = await db.settings.get('user-settings')
    if (!stored) {
      const fresh = defaultSettings()
      await db.settings.add({ id: 'user-settings', ...fresh })
      return fresh
    }
    const { id: _id, ...rest } = stored
    const normalized = normalizeSettings(rest)
    // Write the upgraded shape back once, so later reads are cheap and the next sync
    // pushes the explicit taxonomy to the other devices.
    if (!rest.categories || !rest.capture) {
      await db.settings.put({ id: 'user-settings', ...normalized })
    }
    return normalized
  },

  async updateSettings(updates: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings()
    await db.settings.put({ id: 'user-settings', ...current, ...updates })
  },

  // Replace the whole taxonomy (preset switch / import). Marks the account as 'custom'
  // only when the caller says so — a plain preset switch keeps the preset id, which is
  // what the tag→category mapping for auto-capture keys off.
  async setCategories(categories: CategoryDef[], categorySetId?: string): Promise<void> {
    const updates: Partial<UserSettings> = { categories: cloneCategories(categories) }
    if (categorySetId) updates.categorySetId = categorySetId
    await this.updateSettings(updates)
  },

  async addCustomSubcategory(category: PrimaryCategory, subcategory: string): Promise<void> {
    const settings = await this.getSettings()
    const categories = settings.categories.map((c) =>
      c.name === category && !c.subcategories.includes(subcategory)
        ? { ...c, subcategories: [...c.subcategories, subcategory] }
        : c
    )
    await this.updateSettings({ categories })
  },

  // --- Sync support -------------------------------------------------------
  async addTombstone(collection: Tombstone['collection'], recordId: string): Promise<void> {
    await db.tombstones.put({
      key: `${collection}:${recordId}`,
      collection,
      recordId,
      updatedAt: Date.now()
    })
  },

  async getTombstones(): Promise<Tombstone[]> {
    return db.tombstones.toArray()
  },

  async removeTombstone(collection: Tombstone['collection'], recordId: string): Promise<void> {
    await db.tombstones.delete(`${collection}:${recordId}`)
  },

  async getSyncMeta(key: string): Promise<number> {
    const row = await db.syncMeta.get(key)
    return row?.value ?? 0
  },

  async setSyncMeta(key: string, value: number): Promise<void> {
    await db.syncMeta.put({ key, value })
  },

  // Raw writes used to apply data pulled from the server (no side effects).
  async putTransactionRaw(t: Transaction): Promise<void> {
    await db.transactions.put(t)
  },
  async putSavingGoalRaw(g: SavingGoal): Promise<void> {
    await db.savingGoals.put(g)
  },
  async putRecurringRuleRaw(r: RecurringRule): Promise<void> {
    await db.recurringRules.put(r)
  },
  async putSettingsRaw(settings: UserSettings): Promise<void> {
    // Remote payloads can come from a device still on the old shape.
    await db.settings.put({ id: 'user-settings', ...normalizeSettings(settings) })
  },
  async deleteRecordRaw(collection: Tombstone['collection'], id: string): Promise<void> {
    if (collection === 'transactions') await db.transactions.delete(id)
    else if (collection === 'savingGoals') await db.savingGoals.delete(id)
    else if (collection === 'recurringRules') await db.recurringRules.delete(id)
  },

  // Bulk operations for import
  async importTransactions(transactions: Transaction[]): Promise<void> {
    // bulkPut: re-importing a backup that overlaps existing data updates instead of throwing
    await db.transactions.bulkPut(transactions)
  },

  async clearAllData(): Promise<void> {
    await db.transactions.clear()
    await db.savingGoals.clear()
    await db.settings.clear()
    await db.recurringRules.clear()
    await db.tombstones.clear()
    await db.syncMeta.clear()
  },

  // Export all data
  async exportAllData(): Promise<{
    transactions: Transaction[]
    savingGoals: SavingGoal[]
    settings: UserSettings
    recurringRules: RecurringRule[]
  }> {
    return {
      transactions: await this.getAllTransactions(),
      savingGoals: await this.getAllSavingGoals(),
      settings: await this.getSettings(),
      recurringRules: await this.getAllRecurringRules()
    }
  }
}

export { db }
