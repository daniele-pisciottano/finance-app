import { useState } from 'react'
import { format } from 'date-fns'
import { Repeat, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/store/useStore'
import { formatCurrency } from '@/lib/utils'
import { PRIMARY_CATEGORIES, CATEGORY_ICONS, type PrimaryCategory } from '@/types'

function clampDay(value: string): number {
  const n = parseInt(value, 10)
  if (isNaN(n)) return 1
  return Math.min(Math.max(n, 1), 31)
}

// Dropdown of subcategories for a category (default + custom + history) with a
// "create new" option that reveals a free-text field. Mirrors the TransactionForm UX.
function SubcategoryPicker({
  category,
  value,
  onChange,
}: {
  category: PrimaryCategory | ''
  value: string
  onChange: (v: string) => void
}) {
  const getSubcategories = useStore((s) => s.getSubcategories)
  const subs = category ? getSubcategories(category) : []
  const [creating, setCreating] = useState(!!value && !subs.includes(value))

  return (
    <div className="space-y-2">
      <Select
        value={creating ? '__new__' : value}
        onValueChange={(v) => {
          if (v === '__new__') {
            setCreating(true)
            onChange('')
          } else {
            setCreating(false)
            onChange(v)
          }
        }}
        disabled={!category}
      >
        <SelectTrigger>
          <SelectValue placeholder="Sottocategoria" />
        </SelectTrigger>
        <SelectContent>
          {subs.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
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
      {creating && (
        <Input
          placeholder="Nome nuova sottocategoria"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
        />
      )}
    </div>
  )
}

export function RecurringRulesManager() {
  const { recurringRules, addRecurringRule, updateRecurringRule, deleteRecurringRule } = useStore()

  const [showAdd, setShowAdd] = useState(false)
  const [cat, setCat] = useState<PrimaryCategory | ''>('')
  const [sub, setSub] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [day, setDay] = useState('1')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')
  const [editSub, setEditSub] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editDay, setEditDay] = useState('1')

  const sortedRules = [...recurringRules].sort((a, b) =>
    a.primaryCategory.localeCompare(b.primaryCategory) || a.dayOfMonth - b.dayOfMonth
  )

  const resetAddForm = () => {
    setCat('')
    setSub('')
    setAmount('')
    setDesc('')
    setDay('1')
    setShowAdd(false)
  }

  const handleAdd = async () => {
    const value = parseFloat(amount)
    if (!cat || isNaN(value) || value <= 0) return
    await addRecurringRule({
      amount: value,
      primaryCategory: cat,
      secondaryCategory: sub.trim() || undefined,
      description: desc.trim(),
      dayOfMonth: clampDay(day),
      active: true,
      startMonth: format(new Date(), 'yyyy-MM')
    })
    resetAddForm()
  }

  const startEdit = (
    id: string,
    currentDesc: string,
    currentSub: string | undefined,
    currentAmount: number,
    currentDay: number
  ) => {
    setEditingId(id)
    setEditDesc(currentDesc)
    setEditSub(currentSub || '')
    setEditAmount(String(currentAmount))
    setEditDay(String(currentDay))
  }

  const saveEdit = async (id: string) => {
    const value = parseFloat(editAmount)
    if (isNaN(value) || value <= 0) return
    await updateRecurringRule(id, {
      description: editDesc.trim(),
      secondaryCategory: editSub.trim() || undefined,
      amount: value,
      dayOfMonth: clampDay(editDay)
    })
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa spesa ricorrente? Non verrà più generata nei mesi futuri.')) return
    const alsoInstances = confirm(
      'Vuoi eliminare anche le spese già generate da questa regola?\n\nOK = elimina anche quelle · Annulla = tieni lo storico'
    )
    await deleteRecurringRule(id, alsoInstances)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Repeat className="h-4 w-4" />
          Spese ricorrenti
        </CardTitle>
        <CardDescription>
          Vengono aggiunte automaticamente ogni mese. Attiva/disattiva, modifica nome, importo, giorno e sottocategoria, o elimina.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sortedRules.length === 0 && !showAdd && (
          <p className="text-sm text-muted-foreground">
            Nessuna spesa ricorrente. Aggiungine una qui, oppure attiva "Spesa ricorrente" quando registri una spesa.
          </p>
        )}

        {/* Rules list */}
        <div className="space-y-2">
          {sortedRules.map((rule) => (
            <div
              key={rule.id}
              className={`border rounded-lg p-3 ${rule.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl shrink-0">{CATEGORY_ICONS[rule.primaryCategory]}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {rule.description || `${rule.primaryCategory}${rule.secondaryCategory ? ' - ' + rule.secondaryCategory : ''}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatCurrency(rule.amount)} · ogni mese il giorno {rule.dayOfMonth}
                    {rule.secondaryCategory ? ` · ${rule.secondaryCategory}` : ''}
                  </div>
                </div>
                {!rule.active && <Badge variant="secondary">In pausa</Badge>}
              </div>

              {editingId === rule.id ? (
                <div className="space-y-2 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome</Label>
                    <Input
                      placeholder="Nome (es. Affitto)"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sottocategoria</Label>
                    <SubcategoryPicker category={rule.primaryCategory} value={editSub} onChange={setEditSub} />
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Importo</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-28"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Giorno</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={editDay}
                        onChange={(e) => setEditDay(e.target.value)}
                        className="w-20"
                      />
                    </div>
                    <Button size="sm" onClick={() => saveEdit(rule.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-1 mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => updateRecurringRule(rule.id, { active: !rule.active })}
                  >
                    {rule.active ? 'Metti in pausa' : 'Riattiva'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => startEdit(rule.id, rule.description, rule.secondaryCategory, rule.amount, rule.dayOfMonth)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(rule.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new rule */}
        {showAdd ? (
          <div className="border rounded-lg p-3 space-y-3">
            <Select value={cat} onValueChange={(v) => { setCat(v as PrimaryCategory); setSub('') }}>
              <SelectTrigger>
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {PRIMARY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_ICONS[c]} {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Subcategory dropdown (remounts when category changes) */}
            <SubcategoryPicker key={cat} category={cat} value={sub} onChange={setSub} />

            <Input
              placeholder="Nome (es. Affitto)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="pl-8"
                  inputMode="decimal"
                />
              </div>
              <div className="relative w-28">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">gg</span>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Giorno"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={!cat || !amount || parseFloat(amount) <= 0} className="flex-1">
                Aggiungi ricorrente
              </Button>
              <Button variant="ghost" onClick={resetAddForm}>Annulla</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuova spesa ricorrente
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
