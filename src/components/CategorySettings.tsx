import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStore } from '@/store/useStore'
import { useCategories } from '@/lib/categories'
import { CATEGORY_SETS } from '@/lib/categoryPresets'

const NEW_CATEGORY_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

// The account's taxonomy, editable. Categories still referenced by a transaction can't
// be deleted — that expense would otherwise disappear from every chart and total.
export function CategorySettings() {
  const { settings, applyCategorySet, setCategories, transactions } = useStore()
  const { categories } = useCategories()

  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [pendingSet, setPendingSet] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'expense' || !t.primaryCategory) continue
      counts.set(t.primaryCategory, (counts.get(t.primaryCategory) ?? 0) + 1)
    }
    return counts
  }, [transactions])

  const currentSet = CATEGORY_SETS.find((s) => s.id === settings.categorySetId)

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name || categories.some((c) => c.name === name)) return
    setBusy(true)
    try {
      await setCategories([
        ...categories,
        {
          name,
          icon: newIcon.trim() || '📦',
          color: NEW_CATEGORY_COLORS[categories.length % NEW_CATEGORY_COLORS.length],
          subcategories: []
        }
      ])
      setNewName('')
      setNewIcon('')
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (name: string) => {
    setBusy(true)
    try {
      await setCategories(categories.filter((c) => c.name !== name))
    } finally {
      setBusy(false)
    }
  }

  const handleSwitchSet = async () => {
    if (!pendingSet) return
    setBusy(true)
    try {
      await applyCategorySet(pendingSet)
      setPendingSet(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Categorie</CardTitle>
        <CardDescription>
          {currentSet
            ? `Set attuale: ${currentSet.label}.`
            : 'Set personalizzato.'}{' '}
          Le categorie sono tue: aggiungi quelle che ti servono, togli quelle che non usi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm">Le tue categorie ({categories.length})</Label>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const used = usage.get(c.name) ?? 0
              return (
                <Badge key={c.name} variant="secondary" className="gap-1.5 pr-1">
                  <span>{c.icon}</span>
                  <span>{c.name}</span>
                  {used > 0 && <span className="text-muted-foreground text-[10px]">{used}</span>}
                  <button
                    type="button"
                    onClick={() => handleDelete(c.name)}
                    disabled={used > 0 || busy}
                    title={used > 0 ? `Usata da ${used} spese: non eliminabile` : 'Elimina'}
                    className="ml-0.5 rounded p-0.5 hover:bg-destructive/10 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              )
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Aggiungi una categoria</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="🙂"
              value={newIcon}
              onChange={(e) => setNewIcon(e.target.value)}
              className="sm:w-20 text-center"
              maxLength={4}
            />
            <Input
              placeholder="Nome categoria"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAdd} disabled={!newName.trim() || busy}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi
            </Button>
          </div>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label className="text-sm">Riparti da un set predefinito</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={pendingSet ?? ''} onValueChange={setPendingSet}>
              <SelectTrigger className="sm:w-[260px]">
                <SelectValue placeholder="Scegli un set" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_SETS.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label} ({s.categories.length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleSwitchSet} disabled={!pendingSet || busy}>
              Applica
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Le categorie già usate dalle tue spese vengono mantenute, così niente sparisce
            dai grafici. Le spese non vengono ricategorizzate automaticamente.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
