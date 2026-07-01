import { useRef, useState } from 'react'
import { FileSpreadsheet, Upload, AlertTriangle, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useStore } from '@/store/useStore'
import { formatCurrency } from '@/lib/utils'
import { parseReport } from '@/lib/reportParser'
import { reconcile, type ReconResult } from '@/lib/reconcile'
import { PRIMARY_CATEGORIES, CATEGORY_ICONS, type PrimaryCategory } from '@/types'

const SOURCE_LABEL: Record<string, string> = { revolut: 'Revolut', intesa: 'Intesa Sanpaolo', unknown: 'Sconosciuto' }

export function Reconciliation() {
  const { transactions, addTransaction, getMerchantMemory } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReconResult | null>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [cats, setCats] = useState<Record<number, string>>({})
  const [adding, setAdding] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const buf = new Uint8Array(await file.arrayBuffer())
      const report = parseReport(buf)
      if (report.source === 'unknown' || report.transactions.length === 0) {
        setError('Formato non riconosciuto. Usa l’export .xlsx o .csv di Revolut o Intesa Sanpaolo.')
        return
      }
      const rec = reconcile(report, transactions)
      const initSel = new Set<number>()
      const initCats: Record<number, string> = {}
      rec.missing.forEach((m, i) => {
        initSel.add(i)
        const mem = getMerchantMemory(m.merchant)
        initCats[i] = mem?.primaryCategory || m.primaryCategory || ''
      })
      setResult(rec)
      setSelected(initSel)
      setCats(initCats)
      setOpen(true)
    } catch {
      setError('Errore nella lettura del file.')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const toggle = (i: number) => {
    setSelected((s) => {
      const n = new Set(s)
      n.has(i) ? n.delete(i) : n.add(i)
      return n
    })
  }

  const handleAdd = async () => {
    if (!result) return
    setAdding(true)
    try {
      for (const i of selected) {
        const m = result.missing[i]
        const primary = (cats[i] || m.primaryCategory || undefined) as PrimaryCategory | undefined
        const mem = getMerchantMemory(m.merchant)
        const secondary =
          primary && primary === m.primaryCategory ? m.secondaryCategory : mem?.secondaryCategory
        await addTransaction({
          type: 'expense',
          date: m.date,
          amount: m.amount,
          primaryCategory: primary,
          secondaryCategory: secondary,
          description: mem?.description || m.merchant,
          source: m.source,
          capturedMerchant: m.merchant
        })
      }
      setOpen(false)
      setResult(null)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4" />
          Riconciliazione report
        </CardTitle>
        <CardDescription>
          Carica l’export della banca (.xlsx o .csv di Revolut o Intesa): l’app confronta con le spese già
          inserite e ti suggerisce quelle che potresti aver dimenticato. Revolut ÷2, PayPal segnalati.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" onChange={handleFile} className="hidden" />
        <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()} disabled={loading}>
          <Upload className="h-4 w-4 mr-2" />
          {loading ? 'Analisi in corso…' : 'Carica report (.xlsx o .csv)'}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Report {SOURCE_LABEL[result?.source || 'unknown']}
            </DialogTitle>
          </DialogHeader>

          {result && (
            <>
              <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                <span><strong className="text-foreground">{result.missing.length}</strong> forse dimenticate</span>
                <span>· {result.matched.length} già presenti</span>
                <span>· {result.ignoredCount} ignorate (entrate/trasferimenti)</span>
              </div>

              {result.missing.length === 0 ? (
                <div className="py-8 text-center text-success flex flex-col items-center gap-2">
                  <Check className="h-8 w-8" />
                  Tutto quadra: nessuna spesa dimenticata.
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-2 mt-2">
                  {result.missing.map((m, i) => (
                    <div key={i} className="border rounded-lg p-2 flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => toggle(i)}
                        className="mt-1.5 h-4 w-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{m.merchant}</span>
                          <span className="font-semibold text-destructive tabular-nums shrink-0">
                            -{formatCurrency(m.amount)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1 mt-0.5">
                          <span>{m.date}</span>
                          {m.halved && <Badge variant="outline" className="text-[10px]">÷2 di {formatCurrency(m.rawAmount)}</Badge>}
                          {m.flags.includes('paypal') && (
                            <span className="text-warning flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> PayPal: possibile doppione
                            </span>
                          )}
                        </div>
                        <select
                          value={cats[i] || ''}
                          onChange={(e) => setCats((c) => ({ ...c, [i]: e.target.value }))}
                          className="mt-1.5 w-full h-8 rounded-md border bg-background px-2 text-sm"
                        >
                          <option value="">— categoria —</option>
                          {PRIMARY_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_ICONS[c]} {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {result.missing.length > 0 && (
                <div className="flex gap-2 pt-2 border-t mt-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const all = selected.size === result.missing.length
                      setSelected(all ? new Set() : new Set(result.missing.map((_, i) => i)))
                    }}
                  >
                    {selected.size === result.missing.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
                  </Button>
                  <Button className="flex-1" onClick={handleAdd} disabled={adding || selected.size === 0}>
                    {adding ? 'Aggiungo…' : `Aggiungi selezionate (${selected.size})`}
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
