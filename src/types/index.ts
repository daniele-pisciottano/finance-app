// Primary categories are fixed
export const PRIMARY_CATEGORIES = [
  'Housing',
  'Health',
  'Groceries',
  'Transport',
  'Out',
  'Travel',
  'Subscription',
  'Clothing',
  'Leisure',
  'Gifts',
  'Fees',
  'OtherExpenses'
] as const

export type PrimaryCategory = typeof PRIMARY_CATEGORIES[number]

// Category icons mapping
export const CATEGORY_ICONS: Record<PrimaryCategory, string> = {
  Housing: '🏠',
  Health: '💊',
  Groceries: '🛒',
  Transport: '🚗',
  Out: '🍽️',
  Travel: '✈️',
  Subscription: '📱',
  Clothing: '👕',
  Leisure: '🎮',
  Gifts: '🎁',
  Fees: '🏦',
  OtherExpenses: '📦'
}

// Category colors for charts
export const CATEGORY_COLORS: Record<PrimaryCategory, string> = {
  Housing: '#3b82f6',
  Health: '#ef4444',
  Groceries: '#22c55e',
  Transport: '#f59e0b',
  Out: '#ec4899',
  Travel: '#8b5cf6',
  Subscription: '#06b6d4',
  Clothing: '#f97316',
  Leisure: '#84cc16',
  Gifts: '#d946ef',
  Fees: '#64748b',
  OtherExpenses: '#94a3b8'
}

// Default subcategories per primary category
export const DEFAULT_SUBCATEGORIES: Record<PrimaryCategory, string[]> = {
  Housing: ['Rent', 'Internet', 'Decor', 'Trash', 'Electricity', 'Phone', 'OtherHousing'],
  Health: ['Doctors', 'Psi', 'Sport', 'Gym', 'Medicines', 'OtherHealth'],
  Groceries: ['Lidl', 'Pam', 'Aldi', 'Coop', 'Cadoro', 'OtherGroceries'],
  Transport: ['Train', 'Bus', 'Car', 'Telepass', 'Fuel', 'OtherTransport'],
  Out: ['Bar', 'Restaurants', 'Pizza', 'FoodDelivery', 'OtherOut'],
  Travel: ['Rome', 'Edinburgh', 'Lubiana', 'Miami', 'OtherTravel'],
  Subscription: ['Spotify', 'Netflix', 'Google', 'OtherSubscription'],
  Clothing: ['Pants', 'Shoes', 'OtherClothing'],
  Leisure: ['Magic', 'Music', 'Networking', 'Tech', 'OtherLeisure'],
  Gifts: ['Birthdays', 'OtherGifts'],
  Fees: ['Banks', 'OtherFees'],
  OtherExpenses: ['Miscellaneous']
}

export const INCOME_TYPES = [
  'Stipendio',
  'Referal',
  'Partita IVA',
  'Bonus',
  'Freelance',
  'Altro'
] as const

export type IncomeType = typeof INCOME_TYPES[number]

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
}

export interface UserSettings {
  darkMode: boolean
  currency: string
  defaultSavingGoal: number
  customSubcategories: Record<PrimaryCategory, string[]>
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
