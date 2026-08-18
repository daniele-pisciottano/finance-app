// Reads a JSON backup exported by this app — or by another build of it with a
// different category taxonomy — into records this account can store.
//
// The importer is deliberately permissive about *shape* and strict about *content*:
// anything without a usable type/date/amount is skipped and counted, so a partially
// corrupt file still restores everything it can.

import type { RecurringRule, SavingGoal, Transaction } from '@/types'
import { generateId } from '@/lib/utils'

export interface ParsedBackup {
  transactions: Transaction[]
  savingGoals: SavingGoal[]
  recurringRules: RecurringRule[]
  /** Distinct expense categories the file uses — the caller warns about unknown ones. */
  categories: string[]
  /** Records that could not be read at all. */
  skipped: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'))
    if (Number.isFinite(n)) return n
  }
  return null
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function toTransaction(raw: unknown): Transaction | null {
  if (!isRecord(raw)) return null
  const date = isoDate(raw.date)
  const amount = num(raw.amount)
  if (!date || amount == null) return null
  const type = raw.type === 'income' ? 'income' : 'expense'
  const now = Date.now()

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    type,
    date,
    amount: Math.abs(amount),
    primaryCategory: type === 'expense' && typeof raw.primaryCategory === 'string' ? raw.primaryCategory : undefined,
    secondaryCategory: typeof raw.secondaryCategory === 'string' ? raw.secondaryCategory : undefined,
    description: typeof raw.description === 'string' ? raw.description : '',
    incomeType: type === 'income' && typeof raw.incomeType === 'string' ? (raw.incomeType as Transaction['incomeType']) : undefined,
    // The legacy `isRecurring` flag would make this app synthesise recurring rules out
    // of somebody else's history on the next start — import the expenses as plain ones
    // and let the user set up the rules they actually want.
    isRecurring: false,
    createdAt: num(raw.createdAt) ?? now,
    updatedAt: num(raw.updatedAt) ?? now
  }
}

function toSavingGoal(raw: unknown): SavingGoal | null {
  if (!isRecord(raw)) return null
  const month = typeof raw.month === 'string' && /^\d{4}-\d{2}$/.test(raw.month) ? raw.month : null
  const goal = num(raw.savingGoal)
  if (!month || goal == null) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    month,
    savingGoal: goal,
    maxSpendingByCategory: isRecord(raw.maxSpendingByCategory)
      ? (raw.maxSpendingByCategory as SavingGoal['maxSpendingByCategory'])
      : undefined,
    updatedAt: num(raw.updatedAt) ?? Date.now()
  }
}

function toRecurringRule(raw: unknown): RecurringRule | null {
  if (!isRecord(raw)) return null
  const amount = num(raw.amount)
  const day = num(raw.dayOfMonth)
  if (amount == null || typeof raw.primaryCategory !== 'string') return null
  const now = Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    amount,
    primaryCategory: raw.primaryCategory,
    secondaryCategory: typeof raw.secondaryCategory === 'string' ? raw.secondaryCategory : undefined,
    description: typeof raw.description === 'string' ? raw.description : '',
    dayOfMonth: day != null ? Math.min(31, Math.max(1, Math.round(day))) : 1,
    active: raw.active !== false,
    startMonth: typeof raw.startMonth === 'string' ? raw.startMonth : new Date().toISOString().slice(0, 7),
    createdAt: num(raw.createdAt) ?? now,
    updatedAt: num(raw.updatedAt) ?? now
  }
}

/** Returns null when the file is not a backup at all (no transactions array). */
export function parseBackup(raw: unknown): ParsedBackup | null {
  if (!isRecord(raw) || !Array.isArray(raw.transactions)) return null

  let skipped = 0
  const transactions: Transaction[] = []
  for (const item of raw.transactions) {
    const t = toTransaction(item)
    if (t) transactions.push(t)
    else skipped++
  }

  const savingGoals: SavingGoal[] = []
  for (const item of Array.isArray(raw.savingGoals) ? raw.savingGoals : []) {
    const g = toSavingGoal(item)
    if (g) savingGoals.push(g)
  }

  const recurringRules: RecurringRule[] = []
  for (const item of Array.isArray(raw.recurringRules) ? raw.recurringRules : []) {
    const r = toRecurringRule(item)
    if (r) recurringRules.push(r)
  }

  const categories = [
    ...new Set(
      transactions
        .filter((t) => t.type === 'expense' && t.primaryCategory)
        .map((t) => t.primaryCategory as string)
    )
  ].sort()

  return { transactions, savingGoals, recurringRules, categories, skipped }
}

/** How well a backup's categories line up with a candidate category set. */
export function coverage(backupCategories: string[], setCategories: string[]): number {
  if (backupCategories.length === 0) return 1
  const known = new Set(setCategories)
  const hits = backupCategories.filter((c) => known.has(c)).length
  return hits / backupCategories.length
}
