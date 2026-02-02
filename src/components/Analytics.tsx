import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, PieChart, Pie, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { TrendingUp, TrendingDown, PiggyBank, Percent, Calendar, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

export function Analytics() {
  const { getMonthlyStats, transactions } = useStore()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  // Get available years from transactions
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    transactions.forEach(t => {
      const year = parseInt(t.date.substring(0, 4))
      if (!isNaN(year)) years.add(year)
    })
    // Always include current year
    years.add(currentYear)
    return Array.from(years).sort((a, b) => b - a)
  }, [transactions, currentYear])

  // Year overview data
  const yearOverview = useMemo(() => {
    let totalIncome = 0
    let totalExpenses = 0

    for (let month = 1; month <= 12; month++) {
      const monthStr = `${selectedYear}-${String(month).padStart(2, '0')}`
      const stats = getMonthlyStats(monthStr)
      totalIncome += stats.totalIncome
      totalExpenses += stats.totalExpenses
    }

    const totalSavings = totalIncome - totalExpenses
    const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0
    const expenseRate = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0

    return {
      totalIncome,
      totalExpenses,
      totalSavings,
      savingsRate,
      expenseRate,
      avgMonthlyIncome: totalIncome / 12,
      avgMonthlyExpenses: totalExpenses / 12,
      avgMonthlySavings: totalSavings / 12
    }
  }, [selectedYear, getMonthlyStats])

  // Monthly breakdown data
  const monthlyData = useMemo(() => {
    const data = []

    for (let month = 1; month <= 12; month++) {
      const monthStr = `${selectedYear}-${String(month).padStart(2, '0')}`
      const stats = getMonthlyStats(monthStr)

      data.push({
        month: MONTHS_IT[month - 1],
        monthFull: format(new Date(selectedYear, month - 1, 1), 'MMMM', { locale: it }),
        income: stats.totalIncome,
        expenses: stats.totalExpenses,
        savings: stats.savings,
        savingsRate: stats.savingsPercentage
      })
    }

    return data
  }, [selectedYear, getMonthlyStats])

  // Category breakdown for the year
  const categoryData = useMemo(() => {
    const totals: Record<PrimaryCategory, number> = {} as Record<PrimaryCategory, number>
    PRIMARY_CATEGORIES.forEach(cat => { totals[cat] = 0 })

    for (let month = 1; month <= 12; month++) {
      const monthStr = `${selectedYear}-${String(month).padStart(2, '0')}`
      const stats = getMonthlyStats(monthStr)

      PRIMARY_CATEGORIES.forEach(cat => {
        totals[cat] += stats.byCategory[cat] || 0
      })
    }

    const total = Object.values(totals).reduce((sum, val) => sum + val, 0)

    return PRIMARY_CATEGORIES
      .map(cat => ({
        category: cat,
        icon: CATEGORY_ICONS[cat],
        color: CATEGORY_COLORS[cat],
        total: totals[cat],
        percentage: total > 0 ? (totals[cat] / total) * 100 : 0
      }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [selectedYear, getMonthlyStats])

  // Category trend per month
  const categoryTrendData = useMemo(() => {
    const data = []

    for (let month = 1; month <= 12; month++) {
      const monthStr = `${selectedYear}-${String(month).padStart(2, '0')}`
      const stats = getMonthlyStats(monthStr)
      const dataPoint: Record<string, number | string> = { month: MONTHS_IT[month - 1] }

      categoryData.slice(0, 5).forEach(cat => {
        dataPoint[cat.category] = stats.byCategory[cat.category as PrimaryCategory] || 0
      })

      data.push(dataPoint)
    }

    return data
  }, [selectedYear, getMonthlyStats, categoryData])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any) => {
    if (typeof value === 'number') {
      return formatCurrency(value)
    }
    return String(value)
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      {/* Header with Year Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map(year => (
              <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Panoramica</span>
            <span className="sm:hidden">Anno</span>
          </TabsTrigger>
          <TabsTrigger value="monthly" className="text-xs sm:text-sm">
            <Calendar className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Mese per Mese</span>
            <span className="sm:hidden">Mesi</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="text-xs sm:text-sm">
            <Percent className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">Categorie</span>
            <span className="sm:hidden">Cat.</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab: Year Overview */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Year Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-success/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-success" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Entrate {selectedYear}</div>
                    <div className="text-lg font-bold text-success">
                      {formatCurrency(yearOverview.totalIncome)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Spese {selectedYear}</div>
                    <div className="text-lg font-bold text-destructive">
                      {formatCurrency(yearOverview.totalExpenses)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <PiggyBank className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Risparmiato</div>
                    <div className={cn(
                      "text-lg font-bold",
                      yearOverview.totalSavings >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {formatCurrency(yearOverview.totalSavings)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Percent className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Tasso Risparmio</div>
                    <div className={cn(
                      "text-lg font-bold",
                      yearOverview.savingsRate >= 0 ? "text-primary" : "text-destructive"
                    )}>
                      {yearOverview.savingsRate.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Averages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Medie Mensili</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-muted-foreground">Entrate</div>
                  <div className="font-semibold text-success">{formatCurrency(yearOverview.avgMonthlyIncome)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Spese</div>
                  <div className="font-semibold text-destructive">{formatCurrency(yearOverview.avgMonthlyExpenses)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Risparmio</div>
                  <div className={cn(
                    "font-semibold",
                    yearOverview.avgMonthlySavings >= 0 ? "text-primary" : "text-destructive"
                  )}>
                    {formatCurrency(yearOverview.avgMonthlySavings)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Year Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trend {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyData}>
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

          {/* Percentage Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuzione</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Spese</span>
                  <span className="text-sm font-medium">{yearOverview.expenseRate.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full transition-all"
                    style={{ width: `${Math.min(yearOverview.expenseRate, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Risparmio</span>
                  <span className="text-sm font-medium">{yearOverview.savingsRate.toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      yearOverview.savingsRate >= 0 ? "bg-primary" : "bg-destructive"
                    )}
                    style={{ width: `${Math.min(Math.abs(yearOverview.savingsRate), 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Monthly Breakdown */}
        <TabsContent value="monthly" className="space-y-4 mt-4">
          {/* Monthly Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dettaglio Mensile {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Mese</th>
                      <th className="text-right p-3 font-medium text-success">Entrate</th>
                      <th className="text-right p-3 font-medium text-destructive">Spese</th>
                      <th className="text-right p-3 font-medium">Risparmio</th>
                      <th className="text-right p-3 font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((row, idx) => (
                      <tr key={row.month} className={cn(
                        "border-b last:border-0",
                        idx % 2 === 0 && "bg-muted/20"
                      )}>
                        <td className="p-3 font-medium capitalize">{row.monthFull}</td>
                        <td className="p-3 text-right text-success tabular-nums">
                          {row.income > 0 ? formatCurrency(row.income) : '-'}
                        </td>
                        <td className="p-3 text-right text-destructive tabular-nums">
                          {row.expenses > 0 ? formatCurrency(row.expenses) : '-'}
                        </td>
                        <td className={cn(
                          "p-3 text-right tabular-nums",
                          row.savings >= 0 ? "text-primary" : "text-destructive"
                        )}>
                          {row.income > 0 || row.expenses > 0 ? formatCurrency(row.savings) : '-'}
                        </td>
                        <td className={cn(
                          "p-3 text-right tabular-nums",
                          row.savingsRate >= 0 ? "text-primary" : "text-destructive"
                        )}>
                          {row.income > 0 ? `${row.savingsRate.toFixed(0)}%` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted font-semibold">
                      <td className="p-3">Totale</td>
                      <td className="p-3 text-right text-success tabular-nums">
                        {formatCurrency(yearOverview.totalIncome)}
                      </td>
                      <td className="p-3 text-right text-destructive tabular-nums">
                        {formatCurrency(yearOverview.totalExpenses)}
                      </td>
                      <td className={cn(
                        "p-3 text-right tabular-nums",
                        yearOverview.totalSavings >= 0 ? "text-primary" : "text-destructive"
                      )}>
                        {formatCurrency(yearOverview.totalSavings)}
                      </td>
                      <td className={cn(
                        "p-3 text-right tabular-nums",
                        yearOverview.savingsRate >= 0 ? "text-primary" : "text-destructive"
                      )}>
                        {yearOverview.savingsRate.toFixed(0)}%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Comparison Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Confronto Mensile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={(v) => `€${v}`} />
                    <Tooltip
                      formatter={tooltipFormatter}
                      contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                    />
                    <Legend />
                    <Bar dataKey="income" name="Entrate" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="Spese" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Categories */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          {/* Category Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Distribuzione Spese {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="total"
                        nameKey="category"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={tooltipFormatter}
                        labelFormatter={(label) => `${CATEGORY_ICONS[label as PrimaryCategory] || ''} ${label}`}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nessuna spesa registrata nel {selectedYear}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spese per Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <div className="space-y-3">
                  {categoryData.map((cat) => (
                    <div key={cat.category} className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${cat.color}20` }}
                      >
                        <span className="text-lg">{cat.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate">{cat.category}</span>
                          <span className="font-semibold tabular-nums">{formatCurrency(cat.total)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${cat.percentage}%`,
                                backgroundColor: cat.color
                              }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">
                            {cat.percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nessuna spesa registrata nel {selectedYear}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category Trend Chart */}
          {categoryData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trend Categorie (Top 5)</CardTitle>
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
                      <Legend />
                      {categoryData.slice(0, 5).map((cat) => (
                        <Bar
                          key={cat.category}
                          dataKey={cat.category}
                          name={`${cat.icon} ${cat.category}`}
                          fill={cat.color}
                          stackId="a"
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Monthly Average per Category */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Media Mensile per Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Categoria</th>
                        <th className="text-right p-3 font-medium">Totale Anno</th>
                        <th className="text-right p-3 font-medium">Media Mese</th>
                        <th className="text-right p-3 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryData.map((cat, idx) => (
                        <tr key={cat.category} className={cn(
                          "border-b last:border-0",
                          idx % 2 === 0 && "bg-muted/20"
                        )}>
                          <td className="p-3">
                            <span className="mr-2">{cat.icon}</span>
                            {cat.category}
                          </td>
                          <td className="p-3 text-right tabular-nums">{formatCurrency(cat.total)}</td>
                          <td className="p-3 text-right tabular-nums">{formatCurrency(cat.total / 12)}</td>
                          <td className="p-3 text-right tabular-nums">{cat.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted font-semibold">
                        <td className="p-3">Totale</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(yearOverview.totalExpenses)}</td>
                        <td className="p-3 text-right tabular-nums">{formatCurrency(yearOverview.avgMonthlyExpenses)}</td>
                        <td className="p-3 text-right tabular-nums">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Nessuna spesa registrata nel {selectedYear}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
