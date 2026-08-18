import { useState } from 'react'
import { Inbox, Check, Pencil, Trash2, AlertTriangle, Plus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import type { Transaction } from '@/types'
import { useCategories } from '@/lib/categories'

const SOURCE_LABELS: Record<string, string> = {
  intesa: 'Intesa Sanpaolo',
  revolut: 'Revolut',
  paypal: 'PayPal',
  manual: 'Manuale',
  unknown: 'Sconosciuto'
}

interface DraftsCardProps {
  onEdit: (transaction: Transaction) => void
}

export function DraftsCard({ onEdit }: DraftsCardProps) {
  const { icon } = useCategories()
  const { getDrafts, confirmDraft, deleteTransaction, addDraftFromText, transactions, getMerchantMemory } = useStore()
  const drafts = getDrafts()

  // Effective category = the draft's own, or the one remembered for this place.
  const effectiveCategory = (d: Transaction) => {
    if (d.primaryCategory) return { primaryCategory: d.primaryCategory, secondaryCategory: d.secondaryCategory }
    const mem = d.capturedMerchant ? getMerchantMemory(d.capturedMerchant) : null
    return mem?.primaryCategory
      ? { primaryCategory: mem.primaryCategory, secondaryCategory: mem.secondaryCategory }
      : null
  }

  // A draft looks like a duplicate if a confirmed expense with the same amount exists
  // within ±3 days (e.g. a PayPal charge later re-billed by Intesa).
  const looksDuplicate = (d: Transaction) =>
    transactions.some((t) => {
      if (t.draft || t.type !== 'expense' || Math.abs(t.amount - d.amount) >= 0.01) return false
      const diff = Math.abs(new Date(t.date + 'T00:00:00').getTime() - new Date(d.date + 'T00:00:00').getTime())
      return diff <= 3 * 24 * 60 * 60 * 1000
    })

  const [showAdd, setShowAdd] = useState(false)
  const [text, setText] = useState('')
  const [app, setApp] = useState<string>('auto')
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!text.trim()) return
    const res = await addDraftFromText(text.trim(), { appHint: app === 'auto' ? undefined : app })
    if (!res.ok) {
      setFeedback('Non sembra una notifica di pagamento: ignorata.')
      return
    }
    setText('')
    setFeedback(
      res.amount != null
        ? `Bozza creata (${formatCurrency(res.amount)}). Controllala qui sotto.`
        : 'Bozza creata, ma non ho letto l’importo: aprila e completala.'
    )
  }

  // Hide the card entirely when there are no drafts and the paste box is closed.
  if (drafts.length === 0 && !showAdd) {
    return (
      <button
        onClick={() => setShowAdd(true)}
        className="w-full text-sm text-muted-foreground flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed hover:bg-muted/50"
      >
        <Plus className="h-4 w-4" /> Aggiungi spesa da notifica
      </button>
    )
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Inbox className="h-4 w-4" />
          Da confermare
          {drafts.length > 0 && <Badge variant="secondary">{drafts.length}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {drafts.map((d) => {
          const eff = effectiveCategory(d)
          const remembered = !d.primaryCategory && !!eff // filled from history, not the draft itself
          return (
          <div key={d.id} className="border rounded-lg p-3">
            <div className="flex items-center gap-3">
              <span className="text-xl shrink-0">
                {eff ? icon(eff.primaryCategory) : '❓'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{d.description || 'Spesa senza descrizione'}</div>
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">{SOURCE_LABELS[d.source || 'unknown']}</Badge>
                  {eff ? (
                    <span>
                      {eff.primaryCategory}{eff.secondaryCategory ? ` · ${eff.secondaryCategory}` : ''}
                      {remembered && <span className="text-primary"> · ricordata</span>}
                    </span>
                  ) : (
                    <span className="text-warning">categoria da scegliere</span>
                  )}
                </div>
              </div>
              <div className="font-semibold text-destructive tabular-nums shrink-0">
                -{formatCurrency(d.amount)}
              </div>
            </div>

            {(d.possibleDuplicate || looksDuplicate(d)) && (
              <div className="mt-2 text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Possibile doppione (stesso importo di recente) — verifica prima di confermare.
              </div>
            )}

            <div className="flex justify-end gap-1 mt-2">
              <Button size="sm" variant="ghost" onClick={() => onEdit(d)}>
                <Pencil className="h-4 w-4 mr-1" /> Modifica
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-success hover:text-success hover:bg-success/10"
                onClick={() => confirmDraft(d.id)}
                disabled={!eff || d.amount <= 0}
                title={!eff ? 'Scegli prima una categoria' : 'Conferma'}
              >
                <Check className="h-4 w-4 mr-1" /> Conferma
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => deleteTransaction(d.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          )
        })}

        {/* Manual paste box */}
        {showAdd ? (
          <div className="border rounded-lg p-3 space-y-2">
            <textarea
              className="w-full min-h-[64px] rounded-md border bg-transparent p-2 text-sm"
              placeholder="Incolla qui il testo della notifica (es. Hai pagato 12,50 € con la carta *2896 ... da LIDL)"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex gap-2">
              <Select value={app} onValueChange={setApp}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Rileva automaticamente</SelectItem>
                  <SelectItem value="intesa">Intesa Sanpaolo</SelectItem>
                  <SelectItem value="revolut">Revolut</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleCreate} disabled={!text.trim()} className="flex-1">
                Crea bozza
              </Button>
              <Button variant="ghost" onClick={() => { setShowAdd(false); setFeedback(null) }}>Chiudi</Button>
            </div>
            {feedback && <p className="text-xs text-muted-foreground">{feedback}</p>}
          </div>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi da notifica
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
