import { useMemo, useState } from 'react'
import { format, subMonths } from 'date-fns'
import { it } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/store/useStore'
import { formatCurrency } from '@/lib/utils'
import { CATEGORY_ICONS, CATEGORY_COLORS, PRIMARY_CATEGORIES, type PrimaryCategory } from '@/types'
import { TransactionList } from '@/components/TransactionList'

export function Analytics() {
  const { getMonthlyTrend, getMonthlyStats } = useStore()
  const [monthsToShow, setMonthsToShow] = useState(6)
  const [selectedCategory, setSelectedCategory] = useState<PrimaryCategory | 'all'>('all')

  const trendData = getMonthlyTrend(monthsToShow)

  // Category trend over time
  const categoryTrendData = useMemo(() => {
    const result = []
    const today = new Date()

    for (let i = monthsToShow - 1; i >= 0; i--) {
      const date = subMonths(today, i)
      const month = format(date, 'yyyy-MM')
      const stats = getMonthlyStats(month)
      const monthLabel = format(date, 'MMM', { locale: it })

      const dataPoint: Record<string, number | string> = { month: monthLabel }

      if (selectedCategory === 'all') {
        PRIMARY_CATEGORIES.forEach((cat) => {
          dataPoint[cat] = stats.byCategory[cat] || 0
        })
      } else {
        dataPoint[selectedCategory] = stats.byCategory[selectedCategory] || 0
      }

      result.push(dataPoint)
    }

    return result
  }, [monthsToShow, selectedCategory, getMonthlyStats])

  // Category averages
  const categoryAverages = useMemo(() => {
    const totals: Record<PrimaryCategory, number[]> = {} as Record<PrimaryCategory, number[]>
    PRIMARY_CATEGORIES.forEach((cat) => { totals[cat] = [] })

    for (let i = monthsToShow - 1; i >= 0; i--) {
      const date = subMonths(new Date(), i)
      const month = format(date, 'yyyy-MM')
      const stats = getMonthlyStats(month)

      PRIMARY_CATEGORIES.forEach((cat) => {
        if (stats.byCategory[cat] > 0) {
          totals[cat].push(stats.byCategory[cat])
        }
      })
    }

    return PRIMARY_CATEGORIES.map((cat) => ({
      category: cat,
      icon: CATEGORY_ICONS[cat],
      color: CATEGORY_COLORS[cat],
      average: totals[cat].length > 0
        ? totals[cat].reduce((a, b) => a + b, 0) / totals[cat].length
        : 0,
      total: totals[cat].reduce((a, b) => a + b, 0),
      months: totals[cat].length
    })).filter(c => c.total > 0).sort((a, b) => b.average - a.average)
  }, [monthsToShow, getMonthlyStats])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totals = trendData.reduce(
      (acc, curr) => ({
        income: acc.income + curr.income,
        expenses: acc.expenses + curr.expenses,
        savings: acc.savings + curr.savings
      }),
      { income: 0, expenses: 0, savings: 0 }
    )

    const avgMonthlyIncome = trendData.length > 0 ? totals.income / trendData.length : 0
    const avgMonthlyExpenses = trendData.length > 0 ? totals.expenses / trendData.length : 0
    const avgMonthlySavings = trendData.length > 0 ? totals.savings / trendData.length : 0
    const savingsRate = totals.income > 0 ? (totals.savings / totals.income) * 100 : 0

    return {
      ...totals,
      avgMonthlyIncome,
      avgMonthlyExpenses,
      avgMonthlySavings,
      savingsRate
    }
  }, [trendData])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any) => {
    if (typeof value === 'number') {
      return formatCurrency(value)
    }
    return String(value)
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      {/* Time Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <Select value={monthsToShow.toString()} onValueChange={(v) => setMonthsToShow(parseInt(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Ultimi 3 mesi</SelectItem>
            <SelectItem value="6">Ultimi 6 mesi</SelectItem>
            <SelectItem value="12">Ultimo anno</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Media Entrate</div>
            <div className="text-lg font-bold text-success">
              {formatCurrency(summaryStats.avgMonthlyIncome)}/mese
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Media Spese</div>
            <div className="text-lg font-bold text-destructive">
              {formatCurrency(summaryStats.avgMonthlyExpenses)}/mese
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Media Risparmio</div>
            <div className="text-lg font-bold">
              {formatCurrency(summaryStats.avgMonthlySavings)}/mese
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Tasso Risparmio</div>
            <div className="text-lg font-bold">
              {summaryStats.savingsRate.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend Entrate vs Spese</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  formatter={tooltipFormatter}
                  contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="savings"
                  name="Risparmio"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.2}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                />
                <Bar dataKey="income" name="Entrate" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Spese" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Spese per Categoria</CardTitle>
          <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as PrimaryCategory | 'all')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              {PRIMARY_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {CATEGORY_ICONS[cat]} {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoryTrendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} tickFormatter={(v) => `€${v}`} />
                <Tooltip
                  formatter={tooltipFormatter}
                  contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                />
                {selectedCategory === 'all' ? (
                  categoryAverages.slice(0, 5).map((cat) => (
                    <Bar
                      key={cat.category}
                      dataKey={cat.category}
                      name={cat.category}
                      fill={cat.color}
                      stackId="a"
                    />
                  ))
                ) : (
                  <Bar
                    dataKey={selectedCategory}
                    name={selectedCategory}
                    fill={CATEGORY_COLORS[selectedCategory]}
                    radius={[4, 4, 0, 0]}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Category Averages Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Media Mensile per Categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {categoryAverages.slice(0, 10).map((cat) => (
              <div key={cat.category} className="flex items-center gap-3">
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${cat.color}20` }}
                >
                  <span>{cat.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="font-medium">{cat.category}</div>
                  <div className="text-xs text-muted-foreground">
                    Media su {cat.months} {cat.months === 1 ? 'mese' : 'mesi'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{formatCurrency(cat.average)}/mese</div>
                  <div className="text-xs text-muted-foreground">
                    Tot: {formatCurrency(cat.total)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* All Transactions with Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tutte le Transazioni</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionList showFilters />
        </CardContent>
      </Card>
    </div>
  )
}
