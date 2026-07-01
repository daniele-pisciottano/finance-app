import { useMemo, useState } from 'react'
import { getDaysInMonth, getDate, format } from 'date-fns'
import { TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle, Info, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store/useStore'
import { formatCurrency, formatPercentage, getMonthName } from '@/lib/utils'
import { CATEGORY_ICONS } from '@/types'
import { CategoryChart } from '@/components/CategoryChart'
import { TransactionList } from '@/components/TransactionList'

interface DashboardProps {
  onEditTransaction?: (transaction: import('@/types').Transaction) => void
}

export function Dashboard({ onEditTransaction }: DashboardProps) {
  const {
    currentMonth,
    setCurrentMonth,
    getCurrentMonthStats,
    getPreviousMonthStats,
    getAlerts,
    getCategoryBreakdown,
    savingGoals,
    settings,
    transactions
  } = useStore()

  const [showAllTransactions, setShowAllTransactions] = useState(false)

  const currentStats = getCurrentMonthStats()
  const previousStats = getPreviousMonthStats()
  const alerts = getAlerts()
  const categoryBreakdown = getCategoryBreakdown(currentMonth)

  const currentGoal = savingGoals.find(g => g.month === currentMonth)
  const savingGoalAmount = currentGoal?.savingGoal || settings.defaultSavingGoal

  // Calculate variations
  const variations = useMemo(() => {
    const calcChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0
      return ((current - previous) / previous) * 100
    }

    return {
      income: calcChange(currentStats.totalIncome, previousStats.totalIncome),
      expenses: calcChange(currentStats.totalExpenses, previousStats.totalExpenses),
      savings: calcChange(currentStats.savings, previousStats.savings)
    }
  }, [currentStats, previousStats])

  // Saving goal progress (income = only income actually recorded this month)
  const savingProgress = useMemo(() => {
    const goal = savingGoalAmount
    const income = currentStats.totalIncome
    const savings = currentStats.savings // income - expenses

    const progress = goal > 0
      ? Math.max(Math.min((savings / goal) * 100, 100), 0)
      : 0

    // How much you can still spend this month and hit the goal. Negative => over budget.
    const spendableRemaining = savings - goal
    const stillToSave = goal - savings // positive => behind

    const nowMonth = format(new Date(), 'yyyy-MM')
    const isCurrentMonth = currentMonth === nowMonth
    const [year, month] = currentMonth.split('-').map(Number)
    const daysInMonth = getDaysInMonth(new Date(year, month - 1))
    const currentDay = getDate(new Date())
    // Today counts as a spendable day.
    const daysRemaining = isCurrentMonth ? Math.max(daysInMonth - currentDay + 1, 0) : 0

    const dailyBudget = isCurrentMonth && daysRemaining > 0 && spendableRemaining > 0
      ? spendableRemaining / daysRemaining
      : 0

    // Determine the state for messaging.
    // spendableRemaining >= 0  => you currently meet the goal and still have room to
    //                             spend `spendableRemaining` before dropping below it.
    // spendableRemaining < 0   => you are below the goal; since spending only lowers
    //                             savings, it's unreachable without more income.
    let state: 'onTrack' | 'reached' | 'noIncome' | 'behind'
    if (isCurrentMonth && income <= 0 && goal > 0) {
      state = 'noIncome'
    } else if (spendableRemaining >= 0) {
      state = isCurrentMonth ? 'onTrack' : 'reached'
    } else {
      state = 'behind'
    }

    return {
      progress,
      spendableRemaining,
      stillToSave,
      daysRemaining,
      dailyBudget,
      isCurrentMonth,
      state
    }
  }, [currentStats.savings, currentStats.totalIncome, savingGoalAmount, currentMonth])

  // Navigate months
  const navigateMonth = (direction: 'prev' | 'next') => {
    const [year, month] = currentMonth.split('-').map(Number)
    let newYear = year
    let newMonth = month + (direction === 'next' ? 1 : -1)

    if (newMonth > 12) {
      newMonth = 1
      newYear++
    } else if (newMonth < 1) {
      newMonth = 12
      newYear--
    }

    setCurrentMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`)
  }

  const [year, month] = currentMonth.split('-').map(Number)
  const monthName = getMonthName(month - 1)

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      {/* Month Selector */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateMonth('prev')}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-xl font-semibold">
          {monthName} {year}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateMonth('next')}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Monthly Overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>Panoramica Mensile</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Income */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
              <span className="text-sm text-muted-foreground">Entrate</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-success">
                {formatCurrency(currentStats.totalIncome)}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                {variations.income >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-success" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                {formatPercentage(variations.income)} vs mese scorso
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-destructive/20 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-destructive" />
              </div>
              <span className="text-sm text-muted-foreground">Spese</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-destructive">
                {formatCurrency(currentStats.totalExpenses)}
              </div>
              <div className="text-xs text-muted-foreground flex items-center justify-end gap-1">
                {variations.expenses <= 0 ? (
                  <TrendingDown className="h-3 w-3 text-success" />
                ) : (
                  <TrendingUp className="h-3 w-3 text-destructive" />
                )}
                {formatPercentage(variations.expenses)} vs mese scorso
              </div>
            </div>
          </div>

          {/* Balance */}
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="font-medium">Risparmio</span>
              <div className="text-right">
                <div className={`text-lg font-bold ${currentStats.savings >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {formatCurrency(currentStats.savings)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {currentStats.savingsPercentage.toFixed(1)}% delle entrate
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saving Goal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Obiettivo Risparmio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Target: {formatCurrency(savingGoalAmount)}/mese
            </span>
            <span className={
              savingProgress.state === 'reached' || savingProgress.state === 'onTrack'
                ? 'text-success font-medium'
                : savingProgress.state === 'behind'
                  ? 'text-destructive font-medium'
                  : ''
            }>
              {savingProgress.progress.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={savingProgress.progress}
            className="h-2"
            indicatorClassName={
              savingProgress.state === 'reached' || savingProgress.state === 'onTrack'
                ? 'bg-success'
                : savingProgress.state === 'behind'
                  ? 'bg-destructive'
                  : 'bg-warning'
            }
          />

          {/* Status message per state */}
          {savingProgress.state === 'reached' ? (
            <div className="text-sm text-success flex items-center gap-1">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Obiettivo raggiunto! +{formatCurrency(Math.abs(savingProgress.spendableRemaining))} oltre il target
            </div>
          ) : savingProgress.state === 'onTrack' ? (
            <div className="text-sm text-muted-foreground">
              <span className="text-success font-medium flex items-center gap-1">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Sei in linea con l'obiettivo
              </span>
              <span className="block mt-1">
                Puoi ancora spendere <span className="font-medium text-foreground">{formatCurrency(savingProgress.spendableRemaining)}</span> restando nel target
                {savingProgress.daysRemaining > 0 && (
                  <> — circa {formatCurrency(savingProgress.dailyBudget)}/giorno per {savingProgress.daysRemaining} giorni</>
                )}.
              </span>
            </div>
          ) : savingProgress.state === 'noIncome' ? (
            <div className="text-sm text-muted-foreground">
              Registra le entrate del mese per calcolare quanto puoi ancora spendere.
              <span className="block mt-1">
                Manca <span className="font-medium text-foreground">{formatCurrency(savingProgress.stillToSave)}</span> all'obiettivo.
              </span>
            </div>
          ) : (
            // behind
            <div className="text-sm text-destructive flex items-start gap-1">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Sei sotto l'obiettivo di <span className="font-medium">{formatCurrency(savingProgress.stillToSave)}</span>.
                {savingProgress.isCurrentMonth
                  ? " Con le entrate registrate non è raggiungibile senza altre entrate (o riducendo le spese)."
                  : " Obiettivo non raggiunto per questo mese."}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts & Insights */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Alert & Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-2 p-2 rounded-lg text-sm ${
                  alert.type === 'danger'
                    ? 'bg-destructive/10 text-destructive'
                    : alert.type === 'warning'
                      ? 'bg-warning/10 text-warning'
                      : alert.type === 'success'
                        ? 'bg-success/10 text-success'
                        : 'bg-muted'
                }`}
              >
                {alert.type === 'danger' ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : alert.type === 'success' ? (
                  <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  {alert.category && (
                    <span className="mr-1">{CATEGORY_ICONS[alert.category]}</span>
                  )}
                  {alert.message}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown */}
      {categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spese per Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryChart data={categoryBreakdown} />
          </CardContent>
        </Card>
      )}

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Transazioni Recenti</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionList limit={showAllTransactions ? undefined : 10} onEdit={onEditTransaction} />
          {(() => {
            const monthCount = transactions.filter(t => t.date.startsWith(currentMonth)).length
            if (monthCount > 10) {
              return (
                <Button
                  variant="ghost"
                  className="w-full mt-3"
                  onClick={() => setShowAllTransactions(!showAllTransactions)}
                >
                  {showAllTransactions
                    ? 'Mostra meno'
                    : `Visualizza tutto (${monthCount})`}
                </Button>
              )
            }
            return null
          })()}
        </CardContent>
      </Card>
    </div>
  )
}
