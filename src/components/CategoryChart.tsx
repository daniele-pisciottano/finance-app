import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PieChart as PieIcon, BarChart2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { CATEGORY_ICONS, type PrimaryCategory } from '@/types'

interface CategoryChartProps {
  data: {
    name: string
    value: number
    color: string
    percentage: number
  }[]
}

export function CategoryChart({ data }: CategoryChartProps) {
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie')

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nessuna spesa registrata
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tooltipFormatter = (value: any) => {
    if (typeof value === 'number') {
      return formatCurrency(value)
    }
    return String(value)
  }

  return (
    <div className="space-y-4">
      {/* Chart Type Toggle */}
      <div className="flex justify-end gap-1">
        <Button
          variant={chartType === 'pie' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setChartType('pie')}
        >
          <PieIcon className="h-4 w-4" />
        </Button>
        <Button
          variant={chartType === 'bar' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setChartType('bar')}
        >
          <BarChart2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Chart */}
      <div className="h-[200px]">
        {chartType === 'pie' ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={tooltipFormatter}
                labelFormatter={(label) => `${CATEGORY_ICONS[label as PrimaryCategory] || ''} ${label}`}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ left: 0, right: 10 }}
            >
              <XAxis type="number" tickFormatter={(v) => `€${v}`} fontSize={12} />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                fontSize={12}
                tickFormatter={(v) => `${CATEGORY_ICONS[v as PrimaryCategory] || ''} ${v.slice(0, 6)}`}
              />
              <Tooltip formatter={tooltipFormatter} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {data.slice(0, 6).map((item) => (
          <div
            key={item.name}
            className="flex items-center gap-2 text-sm"
          >
            <div
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="truncate">
              {CATEGORY_ICONS[item.name as PrimaryCategory]} {item.name}
            </span>
            <span className="ml-auto text-muted-foreground text-xs">
              {item.percentage.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {data.length > 6 && (
        <div className="text-xs text-muted-foreground text-center">
          +{data.length - 6} altre categorie
        </div>
      )}
    </div>
  )
}
