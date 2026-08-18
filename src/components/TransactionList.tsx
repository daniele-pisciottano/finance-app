import { useState, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Trash2, Pencil, ChevronDown, TrendingUp, TrendingDown, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/store/useStore'
import { formatCurrency } from '@/lib/utils'
import type { Transaction } from '@/types'
import { useCategories } from '@/lib/categories'
import { cn } from '@/lib/utils'

interface TransactionListProps {
  limit?: number
  showFilters?: boolean
  onEdit?: (transaction: Transaction) => void
}

export function TransactionList({ limit, showFilters = false, onEdit }: TransactionListProps) {
  const { names, icon } = useCategories()
  const { transactions, deleteTransaction, currentMonth } = useStore()
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredTransactions = useMemo(() => {
    // Drafts live in the "Da confermare" card, not in the normal list.
    let result = transactions.filter(t => !t.draft)

    // Filter by current month if no specific filters
    if (!showFilters) {
      result = result.filter(t => t.date.startsWith(currentMonth))
    }

    // Filter by type
    if (typeFilter !== 'all') {
      result = result.filter(t => t.type === typeFilter)
    }

    // Filter by category
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.primaryCategory === categoryFilter)
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.description?.toLowerCase().includes(query) ||
        t.primaryCategory?.toLowerCase().includes(query) ||
        t.secondaryCategory?.toLowerCase().includes(query) ||
        t.incomeType?.toLowerCase().includes(query)
      )
    }

    // Limit results
    if (limit) {
      result = result.slice(0, limit)
    }

    return result
  }, [transactions, currentMonth, typeFilter, categoryFilter, searchQuery, limit, showFilters])

  const handleDelete = async (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questa transazione?')) {
      await deleteTransaction(id)
    }
  }

  if (filteredTransactions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nessuna transazione trovata
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      {showFilters && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <Input
            placeholder="Cerca..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sm:max-w-[200px]"
          />
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | 'expense' | 'income')}>
            <SelectTrigger className="sm:w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="expense">Spese</SelectItem>
              <SelectItem value="income">Entrate</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le categorie</SelectItem>
              {names.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {icon(cat)} {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Transaction List */}
      <div className="space-y-2">
        {filteredTransactions.map((transaction) => (
          <TransactionItem
            key={transaction.id}
            transaction={transaction}
            expanded={expandedId === transaction.id}
            onToggle={() => setExpandedId(expandedId === transaction.id ? null : transaction.id)}
            onDelete={() => handleDelete(transaction.id)}
            onEdit={onEdit ? () => onEdit(transaction) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

interface TransactionItemProps {
  transaction: Transaction
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit?: () => void
}

function TransactionItem({ transaction, expanded, onToggle, onDelete, onEdit }: TransactionItemProps) {
  const { icon } = useCategories()
  const isExpense = transaction.type === 'expense'

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-all",
        expanded && "ring-2 ring-primary"
      )}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        {/* Icon */}
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
          isExpense ? "bg-destructive/10" : "bg-success/10"
        )}>
          {isExpense ? (
            transaction.primaryCategory ? (
              <span className="text-lg">{icon(transaction.primaryCategory)}</span>
            ) : (
              <TrendingDown className="h-5 w-5 text-destructive" />
            )
          ) : (
            <TrendingUp className="h-5 w-5 text-success" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {transaction.description ||
              (isExpense
                ? `${transaction.primaryCategory} - ${transaction.secondaryCategory}`
                : transaction.incomeType)}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>{format(parseISO(transaction.date), 'd MMM', { locale: it })}</span>
            {isExpense && transaction.secondaryCategory && (
              <>
                <span>•</span>
                <span>{transaction.secondaryCategory}</span>
              </>
            )}
            {(transaction.isRecurring || transaction.recurringRuleId) && (
              <>
                <span>•</span>
                <span className="flex items-center gap-0.5 text-primary">
                  <Repeat className="h-3 w-3" />
                  Ricorrente
                </span>
              </>
            )}
          </div>
        </div>

        {/* Amount */}
        <div className={cn(
          "font-semibold tabular-nums",
          isExpense ? "text-destructive" : "text-success"
        )}>
          {isExpense ? '-' : '+'}{formatCurrency(transaction.amount)}
        </div>

        {/* Chevron */}
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground transition-transform",
          expanded && "rotate-180"
        )} />
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t bg-muted/30">
          <div className="flex flex-col gap-2 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data</span>
              <span>{format(parseISO(transaction.date), 'd MMMM yyyy', { locale: it })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <Badge variant={isExpense ? 'destructive' : 'success'}>
                {isExpense ? 'Spesa' : 'Entrata'}
              </Badge>
            </div>
            {isExpense && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Categoria</span>
                  <span>{icon(transaction.primaryCategory)} {transaction.primaryCategory}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sottocategoria</span>
                  <span>{transaction.secondaryCategory}</span>
                </div>
              </>
            )}
            {!isExpense && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tipo entrata</span>
                <span>{transaction.incomeType}</span>
              </div>
            )}
            {transaction.description && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descrizione</span>
                <span className="text-right max-w-[200px]">{transaction.description}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Modifica
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Elimina
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
