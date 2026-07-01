import Dexie, { type EntityTable } from 'dexie'
import type { Transaction, SavingGoal, UserSettings, RecurringRule } from '@/types'
import { DEFAULT_SUBCATEGORIES, type PrimaryCategory } from '@/types'

// Define the database
const db = new Dexie('FinanceTrackerDB') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>
  savingGoals: EntityTable<SavingGoal, 'id'>
  settings: EntityTable<UserSettings & { id: string }, 'id'>
  recurringRules: EntityTable<RecurringRule, 'id'>
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

// Default settings
const DEFAULT_SETTINGS: UserSettings = {
  darkMode: false,
  currency: 'EUR',
  defaultSavingGoal: 300,
  customSubcategories: { ...DEFAULT_SUBCATEGORIES }
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
      await db.savingGoals.update(existing.id, goal)
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
    const settings = await db.settings.get('user-settings')
    if (!settings) {
      await db.settings.add({ id: 'user-settings', ...DEFAULT_SETTINGS })
      return DEFAULT_SETTINGS
    }
    const { id: _id, ...rest } = settings
    return rest
  },

  async updateSettings(updates: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings()
    await db.settings.put({ id: 'user-settings', ...current, ...updates })
  },

  async addCustomSubcategory(category: PrimaryCategory, subcategory: string): Promise<void> {
    const settings = await this.getSettings()
    const currentSubs = settings.customSubcategories[category] || []
    if (!currentSubs.includes(subcategory)) {
      await this.updateSettings({
        customSubcategories: {
          ...settings.customSubcategories,
          [category]: [...currentSubs, subcategory]
        }
      })
    }
  },

  // Bulk operations for import
  async importTransactions(transactions: Transaction[]): Promise<void> {
    await db.transactions.bulkAdd(transactions)
  },

  async clearAllData(): Promise<void> {
    await db.transactions.clear()
    await db.savingGoals.clear()
    await db.settings.clear()
    await db.recurringRules.clear()
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
