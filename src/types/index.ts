// The category taxonomy is per-account configuration, not a compile-time constant:
// each user picks (or builds) their own set, so one deployment can serve people who
// budget in completely different ways. The concrete sets live in `@/lib/categoryPresets`
// and the runtime accessors in `@/lib/categories`.

export type PrimaryCategory = string

export interface CategoryDef {
  name: string
  icon: string
  color: string
  subcategories: string[]
}

export interface CategorySet {
  id: string // 'daniele' | 'marta' | 'custom'
  label: string
  description: string
  categories: CategoryDef[]
}

// Taxonomy-neutral hint produced by the notification parser. The parser runs on the
// server (ingest endpoint) where the user's category names are unknown, so it emits a
// semantic tag; each category set maps tags onto its own categories.
export type MerchantTag =
  | 'groceries'
  | 'fuel'
  | 'transport'
  | 'toll'
  | 'restaurant'
  | 'bar'
  | 'delivery'
  | 'pharmacy'
  | 'health'
  | 'subscription'
  | 'clothing'
  | 'beauty'
  | 'pets'
  | 'home'
  | 'leisure'
  | 'travel'
  | 'gift'
  | 'phone'
  | 'sport'

export const INCOME_TYPES = [
  'Stipendio',
  'Referal',
  'Partita IVA',
  'Bonus',
  'Freelance',
  'Altro'
] as const

export type IncomeType = typeof INCOME_TYPES[number]

export type PaymentSource = 'intesa' | 'revolut' | 'paypal' | 'satispay' | 'manual' | 'unknown'

// Which notification sources this account captures, and how to treat each of them.
export interface CaptureSettings {
  // Sources to accept. A disabled source is skipped at ingest time (nothing is stored),
  // e.g. PayPal when its charges are already covered by recurring rules.
  sources: Record<Exclude<PaymentSource, 'manual' | 'unknown'>, boolean>
  // Revolut joint accounts: record only your share. 'joint-only' halves just the
  // notifications whose title marks a shared account ("Joint · Merchant"), 'always'
  // halves every Revolut payment, 'never' disables the rule.
  revolutSplit: 'never' | 'joint-only' | 'always'
  // Warn when a PayPal charge looks like it will be re-billed by the bank.
  paypalDuplicateWarning: boolean
  // Amounts that are pre-authorisations rather than real spending — typically the
  // fuel-pump hold. Matching drafts are flagged, never dropped, so the user decides.
  depositAmounts: number[]
}

export interface Transaction {
  id: string
  type: 'expense' | 'income'
  date: string // YYYY-MM-DD
  amount: number
  primaryCategory?: PrimaryCategory
  secondaryCategory?: string
  description: string
  incomeType?: IncomeType
  isRecurring?: boolean // legacy flag, kept for backward compatibility / migration
  recurringRuleId?: string // set on transactions generated from a RecurringRule
  // Auto-capture (Phase 3): a captured-but-unconfirmed expense. Drafts are excluded
  // from stats and CSV export until confirmed.
  draft?: boolean
  source?: PaymentSource
  possibleDuplicate?: boolean
  // Matches one of `capture.depositAmounts` (e.g. the 103,29 € fuel hold): shown with a
  // warning so the user can delete it instead of confirming a phantom expense.
  possibleDeposit?: boolean
  // Raw merchant name from the notification/report, preserved even if the user edits
  // the description — used by the "intelligent history" to remember category/description
  // for the same place next time.
  capturedMerchant?: string
  // Semantic hint from the parser, resolved to a real category by the category set.
  capturedTag?: MerchantTag
  createdAt: number
  updatedAt: number
}

// A recurring expense "template": generates one transaction per month.
export interface RecurringRule {
  id: string
  amount: number
  primaryCategory: PrimaryCategory
  secondaryCategory?: string
  description: string
  dayOfMonth: number // 1-31, clamped to the last day of shorter months
  active: boolean
  startMonth: string // YYYY-MM — first month the rule applies to
  createdAt: number
  updatedAt: number
}

export interface SavingGoal {
  id: string
  month: string // YYYY-MM
  savingGoal: number
  maxSpendingByCategory?: Partial<Record<PrimaryCategory, number>>
  updatedAt?: number // for sync last-write-wins
}

// Local tombstone: records a deleted item so the deletion can be propagated on sync.
export interface Tombstone {
  key: string // `${collection}:${id}`
  collection: 'transactions' | 'savingGoals' | 'recurringRules'
  recordId: string
  updatedAt: number
}

export interface UserSettings {
  darkMode: boolean
  currency: string
  defaultSavingGoal: number
  // Which preset this account started from ('custom' once edited beyond a preset).
  categorySetId: string
  // False until the account has chosen a category set (and optionally restored a
  // backup). Drives the one-time setup screen.
  onboarded: boolean
  // The account's own taxonomy — the single source of truth for the whole UI.
  categories: CategoryDef[]
  capture: CaptureSettings
  // Legacy shape (subcategories keyed by category name), migrated into `categories`
  // on first load and kept only so older synced payloads still parse.
  customSubcategories?: Record<string, string[]>
}

export interface MonthlyStats {
  month: string
  totalIncome: number
  totalExpenses: number
  savings: number
  savingsPercentage: number
  byCategory: Record<PrimaryCategory, number>
}

export interface Alert {
  id: string
  type: 'warning' | 'danger' | 'success' | 'info'
  category?: PrimaryCategory
  message: string
  severity: 'low' | 'medium' | 'high'
}
