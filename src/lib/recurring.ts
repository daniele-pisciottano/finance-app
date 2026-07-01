import type { RecurringRule, Transaction } from '@/types'

// Deterministic id for a generated instance so that two devices generating the same
// (rule, month) produce the SAME id — sync then dedups them by primary key instead
// of creating cross-device duplicates.
export function recurringInstanceId(ruleId: string, month: string): string {
  return `${ruleId}__${month}`
}

// Inclusive list of 'YYYY-MM' between two months (max 60 to avoid runaway backfills).
export function enumerateMonths(startMonth: string, endMonth: string): string[] {
  const result: string[] = []
  const [sy, sm] = startMonth.split('-').map(Number)
  const [ey, em] = endMonth.split('-').map(Number)
  let year = sy
  let month = sm
  let guard = 0
  while ((year < ey || (year === ey && month <= em)) && guard < 60) {
    result.push(`${year}-${String(month).padStart(2, '0')}`)
    month++
    if (month > 12) {
      month = 1
      year++
    }
    guard++
  }
  return result
}

// Clamp a day-of-month to the actual length of that month (e.g. 31 -> 28/30).
export function buildRecurringDate(month: string, dayOfMonth: number): string {
  const [year, m] = month.split('-').map(Number)
  const lastDay = new Date(year, m, 0).getDate()
  const day = Math.min(Math.max(dayOfMonth, 1), lastDay)
  return `${month}-${String(day).padStart(2, '0')}`
}

// Match an existing transaction to a rule by content (used to adopt legacy copies
// created by the old recurring system instead of duplicating them).
function contentMatches(t: Transaction, rule: RecurringRule): boolean {
  return (
    t.type === 'expense' &&
    !t.recurringRuleId &&
    t.amount === rule.amount &&
    t.primaryCategory === rule.primaryCategory &&
    (t.secondaryCategory || '') === (rule.secondaryCategory || '') &&
    (t.description || '') === (rule.description || '')
  )
}

export interface RecurringSyncPlan {
  toAdd: Transaction[]
  toLink: { id: string; recurringRuleId: string }[]
}

/**
 * Given the active rules and all transactions, compute which recurring instances
 * are missing (up to and including currentMonth) and which existing transactions
 * should be adopted as instances. Deduplication is keyed on (ruleId, month) — never
 * on content — so editing a generated instance never triggers a duplicate.
 */
export function planRecurringSync(
  rules: RecurringRule[],
  transactions: Transaction[],
  currentMonth: string
): RecurringSyncPlan {
  const toAdd: Transaction[] = []
  const toLink: { id: string; recurringRuleId: string }[] = []

  // Track which (ruleId, month) pairs already have an instance, including ones we
  // create/adopt in this same pass, so a rule never produces two per month.
  const covered = new Set<string>()
  const monthOf = (date: string) => date.slice(0, 7)

  for (const t of transactions) {
    if (t.recurringRuleId) covered.add(`${t.recurringRuleId}|${monthOf(t.date)}`)
  }

  for (const rule of rules) {
    if (!rule.active) continue
    const months = enumerateMonths(rule.startMonth, currentMonth)
    for (const month of months) {
      const key = `${rule.id}|${month}`
      if (covered.has(key)) continue

      // Try to adopt a content-matching un-linked transaction already in this month.
      const existing = transactions.find(
        (t) => monthOf(t.date) === month && contentMatches(t, rule)
      )
      if (existing) {
        toLink.push({ id: existing.id, recurringRuleId: rule.id })
        covered.add(key)
        continue
      }

      // Otherwise create a fresh instance for that month (deterministic id).
      toAdd.push({
        id: recurringInstanceId(rule.id, month),
        type: 'expense',
        date: buildRecurringDate(month, rule.dayOfMonth),
        amount: rule.amount,
        primaryCategory: rule.primaryCategory,
        secondaryCategory: rule.secondaryCategory,
        description: rule.description,
        recurringRuleId: rule.id,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      covered.add(key)
    }
  }

  return { toAdd, toLink }
}
