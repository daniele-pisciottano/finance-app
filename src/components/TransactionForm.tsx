import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Plus, Minus } from 'lucide-react'
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
import { PRIMARY_CATEGORIES, CATEGORY_ICONS, INCOME_TYPES, type PrimaryCategory, type IncomeType } from '@/types'
import { cn } from '@/lib/utils'

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TransactionForm({ open, onOpenChange }: TransactionFormProps) {
  const { addTransaction, settings } = useStore()
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [amount, setAmount] = useState('')
  const [primaryCategory, setPrimaryCategory] = useState<PrimaryCategory | ''>('')
  const [secondaryCategory, setSecondaryCategory] = useState('')
  const [newSubcategory, setNewSubcategory] = useState('')
  const [showNewSubcategory, setShowNewSubcategory] = useState(false)
  const [description, setDescription] = useState('')
  const [incomeType, setIncomeType] = useState<IncomeType | ''>('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get subcategories for selected primary category
  const subcategories = primaryCategory
    ? settings.customSubcategories[primaryCategory] || []
    : []

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setDate(format(new Date(), 'yyyy-MM-dd'))
      setAmount('')
      setPrimaryCategory('')
      setSecondaryCategory('')
      setNewSubcategory('')
      setShowNewSubcategory(false)
      setDescription('')
      setIncomeType('')
    }
  }, [open])

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

      await addTransaction({
        type,
        date,
        amount: parseFloat(amount),
        primaryCategory: type === 'expense' ? primaryCategory as PrimaryCategory : undefined,
        secondaryCategory: type === 'expense' ? finalSecondaryCategory : undefined,
        description,
        incomeType: type === 'income' ? incomeType as IncomeType : undefined,
      })

      onOpenChange(false)
    } catch (error) {
      console.error('Failed to add transaction:', error)
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
          <DialogTitle>Nuova Transazione</DialogTitle>
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
              <div className="relative">
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

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? 'Salvando...' : 'Salva'}
            </Button>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
