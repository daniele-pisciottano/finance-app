import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Transaction, SavingGoal, UserSettings, PrimaryCategory, MonthlyStats, Alert } from '@/types'
import { DEFAULT_SUBCATEGORIES, CATEGORY_COLORS } from '@/types'
import { dbOperations } from '@/lib/db'
import { generateId } from '@/lib/utils'
import { format, subMonths, startOfMonth } from 'date-fns'

interface FinanceState {
  // Data
  transactions: Transaction[]
  savingGoals: SavingGoal[]
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
        if (get().initialized) return

        set({ isLoading: true })
        try {
          const [transactions, savingGoals, settings] = await Promise.all([
            dbOperations.getAllTransactions(),
            dbOperations.getAllSavingGoals(),
            dbOperations.getSettings()
          ])

          set({
            transactions,
            savingGoals,
            settings,
            initialized: true,
            isLoading: false
          })
        } catch (error) {
          console.error('Failed to initialize store:', error)
          set({ isLoading: false, initialized: true })
        }
      },

      setCurrentMonth: (month) => set({ currentMonth: month }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      addTransaction: async (transactionData) => {
        const transaction: Transaction = {
          ...transactionData,
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
