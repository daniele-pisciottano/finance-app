import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Plus, Minus, Scissors, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/store/useStore'
import { PRIMARY_CATEGORIES, CATEGORY_ICONS, INCOME_TYPES, type PrimaryCategory, type IncomeType, type Transaction } from '@/types'
import { cn } from '@/lib/utils'

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTransaction?: Transaction
}

export function TransactionForm({ open, onOpenChange, editTransaction }: TransactionFormProps) {
  const { addTransaction, updateTransaction, settings, getSubcategories, getMerchantMemory } = useStore()
  const isEditing = !!editTransaction
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [amount, setAmount] = useState('')
  const [primaryCategory, setPrimaryCategory] = useState<PrimaryCategory | ''>('')
  const [secondaryCategory, setSecondaryCategory] = useState('')
  const [newSubcategory, setNewSubcategory] = useState('')
  const [showNewSubcategory, setShowNewSubcategory] = useState(false)
  const [description, setDescription] = useState('')
  const [incomeType, setIncomeType] = useState<IncomeType | ''>('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get subcategories for selected primary category (default + custom + history)
  const subcategories = primaryCategory
    ? getSubcategories(primaryCategory as PrimaryCategory)
    : []

  // Reset form when dialog opens, or pre-populate for editing
  useEffect(() => {
    if (open) {
      if (editTransaction) {
        // For a captured draft, let the "intelligent history" pre-fill category and
        // description from the last time this place was recorded.
        const memory = editTransaction.draft && editTransaction.capturedMerchant
          ? getMerchantMemory(editTransaction.capturedMerchant)
          : null
        setType(editTransaction.type)
        setDate(editTransaction.date)
        setAmount(String(editTransaction.amount))
        setPrimaryCategory((memory?.primaryCategory || editTransaction.primaryCategory || '') as PrimaryCategory | '')
        setSecondaryCategory(memory?.secondaryCategory || editTransaction.secondaryCategory || '')
        setNewSubcategory('')
        setShowNewSubcategory(false)
        setDescription(memory?.description || editTransaction.description || '')
        setIncomeType(editTransaction.incomeType || '')
        setIsRecurring(editTransaction.isRecurring || false)
      } else {
        setType('expense')
        setDate(format(new Date(), 'yyyy-MM-dd'))
        setAmount('')
        setPrimaryCategory('')
        setSecondaryCategory('')
        setNewSubcategory('')
        setShowNewSubcategory(false)
        setDescription('')
        setIncomeType('')
        setIsRecurring(false)
      }
    }
  }, [open, editTransaction])

  // Reset secondary category when primary changes
  useEffect(() => {
    setSecondaryCategory('')
    setShowNewSubcategory(false)
    setNewSubcategory('')
  }, [primaryCategory])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || parseFloat(amount) <= 0) return
    if (type === 'expense' && (!primaryCategory || (!secondaryCategory && !newSubcategory))) return
    if (type === 'income' && !incomeType) return

    setIsSubmitting(true)

    try {
      const finalSecondaryCategory = showNewSubcategory && newSubcategory
        ? newSubcategory
        : secondaryCategory

      const transactionData = {
        type,
        date,
        amount: parseFloat(amount),
        primaryCategory: type === 'expense' ? primaryCategory as PrimaryCategory : undefined,
        secondaryCategory: type === 'expense' ? finalSecondaryCategory : undefined,
        description,
        incomeType: type === 'income' ? incomeType as IncomeType : undefined,
        isRecurring: type === 'expense' ? isRecurring : undefined,
      }

      if (isEditing) {
        // Saving a captured draft confirms it (clears the draft flag).
        const confirmDraft = editTransaction.draft
          ? { draft: false, possibleDuplicate: false }
          : {}
        await updateTransaction(editTransaction.id, { ...transactionData, ...confirmDraft })
      } else {
        await addTransaction(transactionData)
      }

      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save transaction:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isValid = type === 'expense'
    ? amount && parseFloat(amount) > 0 && primaryCategory && (secondaryCategory || newSubcategory)
    : amount && parseFloat(amount) > 0 && incomeType

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {editTransaction?.draft
              ? 'Conferma spesa (bozza)'
              : isEditing
                ? 'Modifica Transazione'
                : 'Nuova Transazione'}
          </DialogTitle>
          {editTransaction?.draft && (
            <p className="text-sm text-muted-foreground">
              Spesa catturata automaticamente. Controlla categoria e importo, poi salva per confermarla.
            </p>
          )}
        </DialogHeader>

        <Tabs value={type} onValueChange={(v) => setType(v as 'expense' | 'income')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="expense" className="gap-2">
              <Minus className="h-4 w-4" />
              Spesa
            </TabsTrigger>
            <TabsTrigger value="income" className="gap-2">
              <Plus className="h-4 w-4" />
              Entrata
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Importo</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {settings.currency === 'EUR' ? '€' : '$'}
                  </span>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className="pl-8"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </div>
                {amount && parseFloat(amount) > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Dividi a meta"
                    onClick={() => setAmount((parseFloat(amount) / 2).toFixed(2))}
                  >
                    <Scissors className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <TabsContent value="expense" className="space-y-4 mt-0">
              {/* Primary Category */}
              <div className="space-y-2">
                <Label>Categoria</Label>
                <div className="grid grid-cols-4 gap-2">
                  {PRIMARY_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setPrimaryCategory(cat)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-lg border-2 transition-all",
                        "hover:border-primary hover:bg-accent",
                        primaryCategory === cat
                          ? "border-primary bg-accent"
                          : "border-transparent bg-muted"
                      )}
                    >
                      <span className="text-xl">{CATEGORY_ICONS[cat]}</span>
                      <span className="text-[10px] mt-1 text-center leading-tight">
                        {cat}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Secondary Category */}
              {primaryCategory && (
                <div className="space-y-2">
                  <Label>Sottocategoria</Label>
                  <Select
                    value={showNewSubcategory ? '__new__' : secondaryCategory}
                    onValueChange={(value) => {
                      if (value === '__new__') {
                        setShowNewSubcategory(true)
                        setSecondaryCategory('')
                      } else {
                        setShowNewSubcategory(false)
                        setSecondaryCategory(value)
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona sottocategoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {subcategories.map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Crea nuova
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {showNewSubcategory && (
                    <Input
                      placeholder="Nome nuova sottocategoria"
                      value={newSubcategory}
                      onChange={(e) => setNewSubcategory(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="income" className="space-y-4 mt-0">
              {/* Income Type */}
              <div className="space-y-2">
                <Label>Tipo di entrata</Label>
                <Select
                  value={incomeType}
                  onValueChange={(value) => setIncomeType(value as IncomeType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {INCOME_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione (opzionale)</Label>
              <Input
                id="description"
                placeholder="es. Cena con amici"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Recurring toggle - only for new expenses */}
            {type === 'expense' && !isEditing && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setIsRecurring(!isRecurring)}
                  className={cn(
                    "flex items-center gap-2 w-full p-3 rounded-lg border-2 transition-all text-sm",
                    isRecurring
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent bg-muted text-muted-foreground"
                  )}
                >
                  <Repeat className="h-4 w-4" />
                  <span className="font-medium">Spesa ricorrente</span>
                  <span className="text-xs ml-auto">
                    {isRecurring ? 'Attiva' : 'Si ripete ogni mese'}
                  </span>
                </button>
                {isRecurring && (
                  <p className="text-xs text-muted-foreground px-1">
                    Verrà aggiunta automaticamente ogni mese. Puoi gestirla o eliminarla in Impostazioni → Spese ricorrenti.
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? 'Salvando...' : isEditing ? 'Aggiorna' : 'Salva'}
            </Button>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
