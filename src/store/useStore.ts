import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Transaction, SavingGoal, UserSettings, PrimaryCategory, MonthlyStats, Alert, RecurringRule } from '@/types'
import { DEFAULT_SUBCATEGORIES, CATEGORY_COLORS } from '@/types'
import { dbOperations } from '@/lib/db'
import { generateId } from '@/lib/utils'
import { planRecurringSync } from '@/lib/recurring'
import { format, subMonths, startOfMonth } from 'date-fns'

// Next month (YYYY-MM) after a given YYYY-MM string.
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// Synchronous guard so React StrictMode's double-invocation (or any concurrent
// caller) can't run the migration / recurring generation twice in parallel.
let initInFlight = false

interface FinanceState {
  // Data
  transactions: Transaction[]
  savingGoals: SavingGoal[]
  recurringRules: RecurringRule[]
  settings: UserSettings
  isLoading: boolean
  initialized: boolean

  // Current view state
  currentMonth: string // YYYY-MM
  activeTab: 'dashboard' | 'analytics' | 'settings'

  // Actions
  initialize: () => Promise<void>
  setCurrentMonth: (month: string) => void
  setActiveTab: (tab: 'dashboard' | 'analytics' | 'settings') => void

  // Transaction actions
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>

  // Saving goal actions
  setSavingGoal: (month: string, goal: number, categoryBudgets?: Partial<Record<PrimaryCategory, number>>) => Promise<void>

  // Settings actions
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>
  addSubcategory: (category: PrimaryCategory, subcategory: string) => Promise<void>
  getSubcategories: (category: PrimaryCategory) => string[]

  // Recurring rule actions
  addRecurringRule: (rule: Omit<RecurringRule, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  updateRecurringRule: (id: string, updates: Partial<RecurringRule>) => Promise<void>
  deleteRecurringRule: (id: string, deleteInstances?: boolean) => Promise<void>

  // Computed getters
  getMonthlyStats: (month: string) => MonthlyStats
  getCurrentMonthStats: () => MonthlyStats
  getPreviousMonthStats: () => MonthlyStats
  getAlerts: () => Alert[]
  getCategoryBreakdown: (month: string) => { name: string; value: number; color: string; percentage: number }[]
  getMonthlyTrend: (months: number) => { month: string; income: number; expenses: number; savings: number }[]

  // Import/Export
  importData: (data: { transactions?: Transaction[]; savingGoals?: SavingGoal[] }) => Promise<void>
  exportData: () => Promise<string>
}

export const useStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      transactions: [],
      savingGoals: [],
      recurringRules: [],
      settings: {
        darkMode: false,
        currency: 'EUR',
        defaultSavingGoal: 300,
        customSubcategories: { ...DEFAULT_SUBCATEGORIES }
      },
      isLoading: true,
      initialized: false,
      currentMonth: format(new Date(), 'yyyy-MM'),
      activeTab: 'dashboard',

      initialize: async () => {
        if (get().initialized || initInFlight) return
        initInFlight = true

        set({ isLoading: true })
        try {
          const [transactions, savingGoals, settings, loadedRules] = await Promise.all([
            dbOperations.getAllTransactions(),
            dbOperations.getAllSavingGoals(),
            dbOperations.getSettings(),
            dbOperations.getAllRecurringRules()
          ])

          const currentMonth = format(new Date(), 'yyyy-MM')
          const workingTransactions = [...transactions]
          const rules = [...loadedRules]

          // --- One-time migration: convert legacy isRecurring transactions into rules ---
          // Each legacy template becomes a rule starting the month AFTER its own month
          // (its own month already contains the template as a real expense). Later months'
          // old auto-generated copies get adopted by planRecurringSync (content match).
          const legacyTemplates = workingTransactions.filter(t => t.isRecurring)
          for (const template of legacyTemplates) {
            const [, , dayStr] = template.date.split('-')
            const newRule: RecurringRule = {
              id: generateId(),
              amount: template.amount,
              primaryCategory: template.primaryCategory!,
              secondaryCategory: template.secondaryCategory,
              description: template.description,
              dayOfMonth: parseInt(dayStr, 10) || 1,
              active: true,
              // Start from the current month so migration never invents past history:
              // existing past copies stay as-is, and instances are generated going forward.
              startMonth: currentMonth,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
            await dbOperations.addRecurringRule(newRule)
            rules.push(newRule)

            // Clear the legacy flag so the template becomes a normal expense.
            await dbOperations.updateTransaction(template.id, { isRecurring: false })
            const idx = workingTransactions.findIndex(t => t.id === template.id)
            if (idx >= 0) workingTransactions[idx] = { ...workingTransactions[idx], isRecurring: false }
          }

          // --- Generate any missing recurring instances up to the current month ---
          const { toAdd, toLink } = planRecurringSync(rules, workingTransactions, currentMonth)

          for (const t of toAdd) {
            await dbOperations.addTransaction(t)
          }
          for (const link of toLink) {
            await dbOperations.updateTransaction(link.id, { recurringRuleId: link.recurringRuleId })
          }

          // Apply the links to the in-memory copies
          const linkMap = new Map(toLink.map(l => [l.id, l.recurringRuleId]))
          const merged = workingTransactions.map(t =>
            linkMap.has(t.id) ? { ...t, recurringRuleId: linkMap.get(t.id) } : t
          )

          const allTransactions = [...toAdd, ...merged].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          )

          set({
            transactions: allTransactions,
            savingGoals,
            recurringRules: rules,
            settings,
            initialized: true,
            isLoading: false
          })
        } catch (error) {
          console.error('Failed to initialize store:', error)
          set({ isLoading: false, initialized: true })
        } finally {
          initInFlight = false
        }
      },

      setCurrentMonth: (month) => set({ currentMonth: month }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      addTransaction: async (transactionData) => {
        const makeRecurring = transactionData.type === 'expense' && !!transactionData.isRecurring

        // The stored transaction is always a normal (non-recurring) expense for its
        // own month; recurrence is handled by a separate rule for the following months.
        const transaction: Transaction = {
          ...transactionData,
          isRecurring: false,
          id: generateId(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        }

        await dbOperations.addTransaction(transaction)

        // Add subcategory if new
        if (transaction.type === 'expense' && transaction.primaryCategory && transaction.secondaryCategory) {
          const settings = get().settings
          const existingSubs = settings.customSubcategories[transaction.primaryCategory] || []
          if (!existingSubs.includes(transaction.secondaryCategory)) {
            await get().addSubcategory(transaction.primaryCategory, transaction.secondaryCategory)
          }
        }

        set((state) => ({
          transactions: [transaction, ...state.transactions].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          )
        }))

        // Create a recurring rule for the months that follow this one.
        if (makeRecurring && transaction.primaryCategory) {
          const [, , dayStr] = transaction.date.split('-')
          await get().addRecurringRule({
            amount: transaction.amount,
            primaryCategory: transaction.primaryCategory,
            secondaryCategory: transaction.secondaryCategory,
            description: transaction.description,
            dayOfMonth: parseInt(dayStr, 10) || 1,
            active: true,
            startMonth: nextMonth(transaction.date.slice(0, 7))
          })
        }
      },

      updateTransaction: async (id, updates) => {
        await dbOperations.updateTransaction(id, updates)
        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
          )
        }))
      },

      deleteTransaction: async (id) => {
        await dbOperations.deleteTransaction(id)
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id)
        }))
      },

      setSavingGoal: async (month, goal, categoryBudgets) => {
        const savingGoal: SavingGoal = {
          id: generateId(),
          month,
          savingGoal: goal,
          maxSpendingByCategory: categoryBudgets
        }

        await dbOperations.setSavingGoal(savingGoal)
        set((state) => {
          const existingIndex = state.savingGoals.findIndex((g) => g.month === month)
          if (existingIndex >= 0) {
            const newGoals = [...state.savingGoals]
            newGoals[existingIndex] = savingGoal
            return { savingGoals: newGoals }
          }
          return { savingGoals: [...state.savingGoals, savingGoal] }
        })
      },

      updateSettings: async (updates) => {
        await dbOperations.updateSettings(updates)
        set((state) => ({
          settings: { ...state.settings, ...updates }
        }))
      },

      addSubcategory: async (category, subcategory) => {
        await dbOperations.addCustomSubcategory(category, subcategory)
        set((state) => ({
          settings: {
            ...state.settings,
            customSubcategories: {
              ...state.settings.customSubcategories,
              [category]: [...(state.settings.customSubcategories[category] || []), subcategory]
            }
          }
        }))
      },

      // Union of default + custom + every subcategory ever used in a transaction,
      // so any subcategory (typed in the form, imported from CSV, ...) always stays
      // available for future entries.
      getSubcategories: (category) => {
        const { settings, transactions } = get()
        const fromSettings = settings.customSubcategories[category] || []
        const fromHistory = transactions
          .filter((t) => t.type === 'expense' && t.primaryCategory === category && t.secondaryCategory)
          .map((t) => t.secondaryCategory as string)
        return [...new Set([...fromSettings, ...fromHistory])]
      },

      addRecurringRule: async (ruleData) => {
        const rule: RecurringRule = {
          ...ruleData,
          id: generateId(),
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        await dbOperations.addRecurringRule(rule)

        // Immediately generate any due instances (e.g. current + missed months).
        const currentMonth = format(new Date(), 'yyyy-MM')
        const { transactions } = get()
        const { toAdd } = planRecurringSync([rule], transactions, currentMonth)
        for (const t of toAdd) {
          await dbOperations.addTransaction(t)
        }

        set((state) => ({
          recurringRules: [...state.recurringRules, rule],
          transactions: [...toAdd, ...state.transactions].sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
          )
        }))
      },

      updateRecurringRule: async (id, updates) => {
        await dbOperations.updateRecurringRule(id, updates)
        set((state) => ({
          recurringRules: state.recurringRules.map((r) =>
            r.id === id ? { ...r, ...updates, updatedAt: Date.now() } : r
          )
        }))
      },

      deleteRecurringRule: async (id, deleteInstances = false) => {
        await dbOperations.deleteRecurringRule(id)

        if (deleteInstances) {
          const toDelete = get().transactions.filter((t) => t.recurringRuleId === id)
          for (const t of toDelete) {
            await dbOperations.deleteTransaction(t.id)
          }
          set((state) => ({
            recurringRules: state.recurringRules.filter((r) => r.id !== id),
            transactions: state.transactions.filter((t) => t.recurringRuleId !== id)
          }))
        } else {
          // Keep already-generated expenses, just unlink them from the (now gone) rule.
          const toUnlink = get().transactions.filter((t) => t.recurringRuleId === id)
          for (const t of toUnlink) {
            await dbOperations.updateTransaction(t.id, { recurringRuleId: undefined })
          }
          set((state) => ({
            recurringRules: state.recurringRules.filter((r) => r.id !== id),
            transactions: state.transactions.map((t) =>
              t.recurringRuleId === id ? { ...t, recurringRuleId: undefined } : t
            )
          }))
        }
      },

      getMonthlyStats: (month) => {
        const { transactions } = get()
        const monthTransactions = transactions.filter((t) => t.date.startsWith(month))

        const totalIncome = monthTransactions
          .filter((t) => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0)

        const totalExpenses = monthTransactions
          .filter((t) => t.type === 'expense')
          .reduce((sum, t) => sum + t.amount, 0)

        const byCategory = monthTransactions
          .filter((t) => t.type === 'expense' && t.primaryCategory)
          .reduce((acc, t) => {
            const cat = t.primaryCategory!
            acc[cat] = (acc[cat] || 0) + t.amount
            return acc
          }, {} as Record<PrimaryCategory, number>)

        const savings = totalIncome - totalExpenses
        const savingsPercentage = totalIncome > 0 ? (savings / totalIncome) * 100 : 0

        return {
          month,
          totalIncome,
          totalExpenses,
          savings,
          savingsPercentage,
          byCategory
        }
      },

      getCurrentMonthStats: () => {
        return get().getMonthlyStats(get().currentMonth)
      },

      getPreviousMonthStats: () => {
        const prevMonth = format(subMonths(new Date(get().currentMonth + '-01'), 1), 'yyyy-MM')
        return get().getMonthlyStats(prevMonth)
      },

      getAlerts: () => {
        const currentStats = get().getCurrentMonthStats()
        const prevStats = get().getPreviousMonthStats()
        const { savingGoals, settings } = get()
        const currentGoal = savingGoals.find((g) => g.month === get().currentMonth)
        const alerts: Alert[] = []

        // Check saving goal progress
        const goalAmount = currentGoal?.savingGoal || settings.defaultSavingGoal
        if (currentStats.savings < goalAmount * 0.5) {
          alerts.push({
            id: 'saving-behind',
            type: 'warning',
            message: `Risparmio: ${((currentStats.savings / goalAmount) * 100).toFixed(0)}% dell'obiettivo`,
            severity: 'medium'
          })
        } else if (currentStats.savings >= goalAmount) {
          alerts.push({
            id: 'saving-achieved',
            type: 'success',
            message: `Obiettivo risparmio raggiunto! +${(currentStats.savings - goalAmount).toFixed(0)}`,
            severity: 'low'
          })
        }

        // Check category budget overruns
        if (currentGoal?.maxSpendingByCategory) {
          Object.entries(currentGoal.maxSpendingByCategory).forEach(([cat, budget]) => {
            const spent = currentStats.byCategory[cat as PrimaryCategory] || 0
            if (budget && spent > budget) {
              alerts.push({
                id: `budget-${cat}`,
                type: 'danger',
                category: cat as PrimaryCategory,
                message: `${cat}: Budget superato di ${(spent - budget).toFixed(0)}`,
                severity: 'high'
              })
            } else if (budget && spent > budget * 0.8) {
              alerts.push({
                id: `budget-warning-${cat}`,
                type: 'warning',
                category: cat as PrimaryCategory,
                message: `${cat}: ${((spent / budget) * 100).toFixed(0)}% del budget`,
                severity: 'medium'
              })
            }
          })
        }

        // Compare with previous month
        Object.entries(currentStats.byCategory).forEach(([cat, amount]) => {
          const prevAmount = prevStats.byCategory[cat as PrimaryCategory] || 0
          if (prevAmount > 0) {
            const change = ((amount - prevAmount) / prevAmount) * 100
            if (change > 30) {
              alerts.push({
                id: `trend-${cat}`,
                type: 'warning',
                category: cat as PrimaryCategory,
                message: `${cat}: +${change.toFixed(0)}% vs mese scorso`,
                severity: change > 50 ? 'high' : 'medium'
              })
            } else if (change < -15) {
              alerts.push({
                id: `trend-good-${cat}`,
                type: 'success',
                category: cat as PrimaryCategory,
                message: `${cat}: ${change.toFixed(0)}% vs mese scorso`,
                severity: 'low'
              })
            }
          }
        })

        return alerts.slice(0, 5) // Limit to 5 alerts
      },

      getCategoryBreakdown: (month) => {
        const stats = get().getMonthlyStats(month)
        const total = stats.totalExpenses

        return Object.entries(stats.byCategory)
          .filter(([_, value]) => value > 0)
          .map(([name, value]) => ({
            name,
            value,
            color: CATEGORY_COLORS[name as PrimaryCategory],
            percentage: total > 0 ? (value / total) * 100 : 0
          }))
          .sort((a, b) => b.value - a.value)
      },

      getMonthlyTrend: (months) => {
        const result = []
        const today = new Date()

        for (let i = months - 1; i >= 0; i--) {
          const date = subMonths(startOfMonth(today), i)
          const month = format(date, 'yyyy-MM')
          const stats = get().getMonthlyStats(month)

          result.push({
            month: format(date, 'MMM'),
            income: stats.totalIncome,
            expenses: stats.totalExpenses,
            savings: stats.savings
          })
        }

        return result
      },

      importData: async (data) => {
        if (data.transactions) {
          await dbOperations.importTransactions(data.transactions)
          set((state) => ({
            transactions: [...data.transactions!, ...state.transactions].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            )
          }))
        }
        if (data.savingGoals) {
          for (const goal of data.savingGoals) {
            await dbOperations.setSavingGoal(goal)
          }
          set((state) => ({
            savingGoals: [...state.savingGoals, ...data.savingGoals!]
          }))
        }
      },

      exportData: async () => {
        const data = await dbOperations.exportAllData()
        return JSON.stringify(data, null, 2)
      }
    }),
    {
      name: 'finance-store',
      partialize: (state) => ({
        currentMonth: state.currentMonth,
        activeTab: state.activeTab
      })
    }
  )
)
