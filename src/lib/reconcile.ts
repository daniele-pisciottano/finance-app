import type { Transaction } from '@/types'
import type { ParsedReport, ReportTransaction, ReportSource } from '@/lib/reportParser'

export interface MatchedEntry {
  report: ReportTransaction
  appId: string
  appAmount: number
  appDate: string
}

export interface ReconResult {
  source: ReportSource
  missing: ReportTransaction[] // in the report but not found in the app
  matched: MatchedEntry[] // already loaded
  ignoredCount: number // income + transfers skipped during parsing
}

function dayDiff(a: string, b: string): number {
  return Math.abs(new Date(a + 'T00:00:00').getTime() - new Date(b + 'T00:00:00').getTime()) / 86400000
}

/**
 * Compare a parsed report against the app's existing (confirmed) expenses.
 * A report entry counts as already-loaded when a not-yet-used app expense has the
 * same amount (±0.02) within `dayTolerance` days. Each app expense matches at most
 * one report entry, so genuine repeats (two identical amounts) still surface.
 */
export function reconcile(report: ParsedReport, appTx: Transaction[], dayTolerance = 4): ReconResult {
  const appExpenses = appTx.filter((t) => t.type === 'expense' && !t.draft)
  const used = new Set<string>()
  const missing: ReportTransaction[] = []
  const matched: MatchedEntry[] = []

  const txs = [...report.transactions].sort((a, b) => (a.date < b.date ? 1 : -1))

  for (const tx of txs) {
    const m = appExpenses.find(
      (a) =>
        !used.has(a.id) &&
        Math.abs(a.amount - tx.amount) < 0.02 &&
        (!tx.date || !a.date || dayDiff(a.date, tx.date) <= dayTolerance)
    )
    if (m) {
      used.add(m.id)
      matched.push({ report: tx, appId: m.id, appAmount: m.amount, appDate: m.date })
    } else {
      missing.push(tx)
    }
  }

  return { source: report.source, missing, matched, ignoredCount: report.ignoredCount }
}
