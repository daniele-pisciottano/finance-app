import { useRef, useState } from 'react'
import { Check, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useStore } from '@/store/useStore'
import { CATEGORY_SETS } from '@/lib/categoryPresets'
import { coverage, parseBackup, type ParsedBackup } from '@/lib/backupImport'
import { cn } from '@/lib/utils'

// One-time setup for a brand-new account: pick the categories to budget with and,
// optionally, restore a backup exported from another device or another build of the app.
export function Onboarding() {
  const { applyCategorySet, importData, updateSettings } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)

  const [selectedSet, setSelectedSet] = useState<string>(CATEGORY_SETS[0].id)
  const [backup, setBackup] = useState<ParsedBackup | null>(null)
  const [backupName, setBackupName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const parsed = parseBackup(JSON.parse(await file.text()))
      if (!parsed) {
        setError('Non sembra un backup: manca l’elenco delle transazioni.')
        return
      }
      setBackup(parsed)
      setBackupName(file.name)
      // Pre-select whichever set the backup's own categories match best — that is
      // almost always the one the user was already using.
      const best = [...CATEGORY_SETS]
        .map((s) => ({ id: s.id, score: coverage(parsed.categories, s.categories.map((c) => c.name)) }))
        .sort((a, b) => b.score - a.score)[0]
      if (best && best.score > 0.5) setSelectedSet(best.id)
    } catch {
      setError('File non leggibile: deve essere il .json esportato dall’app.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const finish = async (withBackup: boolean) => {
    setBusy(true)
    try {
      await applyCategorySet(selectedSet)
      if (withBackup && backup) {
        await importData({
          transactions: backup.transactions,
          savingGoals: backup.savingGoals,
          recurringRules: backup.recurringRules
        })
      }
      await updateSettings({ onboarded: true })
    } finally {
      setBusy(false)
    }
  }

  const setNames = (id: string) => CATEGORY_SETS.find((s) => s.id === id)?.categories.map((c) => c.name) ?? []
  const missing = backup ? backup.categories.filter((c) => !setNames(selectedSet).includes(c)) : []

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl px-4 py-10 space-y-6">
        <div className="space-y-2">
          <div className="text-4xl">💰</div>
          <h1 className="text-2xl font-semibold">Come vuoi organizzare le spese?</h1>
          <p className="text-muted-foreground">
            Scegli il set di categorie da cui partire. Potrai rinominarle, aggiungerne e
            toglierne quando vuoi da Impostazioni.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CATEGORY_SETS.map((set) => (
            <button
              key={set.id}
              type="button"
              onClick={() => setSelectedSet(set.id)}
              className={cn(
                'text-left rounded-lg border-2 p-4 transition-all hover:border-primary',
                selectedSet === set.id ? 'border-primary bg-accent' : 'border-border'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{set.label}</span>
                {selectedSet === set.id && <Check className="h-4 w-4 text-primary shrink-0" />}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{set.description}</p>
              <div className="flex flex-wrap gap-1 mt-3">
                {set.categories.slice(0, 8).map((c) => (
                  <Badge key={c.name} variant="secondary" className="text-[11px]">
                    {c.icon} {c.name}
                  </Badge>
                ))}
                {set.categories.length > 8 && (
                  <Badge variant="outline" className="text-[11px]">
                    +{set.categories.length - 8}
                  </Badge>
                )}
              </div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hai già uno storico?</CardTitle>
            <CardDescription>
              Carica il backup <code>.json</code> esportato dall’altra app (Impostazioni →
              Esporta JSON). Spese, entrate e obiettivi di risparmio vengono importati così
              come sono.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4 mr-2" />
              {backup ? 'Scegli un altro file' : 'Carica backup JSON'}
            </Button>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {backup && (
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="font-medium">{backupName}</div>
                <div className="text-muted-foreground">
                  {backup.transactions.length} transazioni · {backup.categories.length} categorie usate
                  {backup.savingGoals.length > 0 && ` · ${backup.savingGoals.length} obiettivi`}
                  {backup.skipped > 0 && ` · ${backup.skipped} righe illeggibili saltate`}
                </div>
                {missing.length > 0 && (
                  <div className="text-muted-foreground">
                    {missing.length} categorie non presenti nel set scelto verranno aggiunte
                    automaticamente: {missing.slice(0, 5).join(', ')}
                    {missing.length > 5 && ` e altre ${missing.length - 5}`}.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={() => finish(true)} disabled={busy} className="sm:flex-1">
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {backup ? 'Importa e inizia' : 'Inizia'}
          </Button>
          {backup && (
            <Button variant="ghost" onClick={() => finish(false)} disabled={busy}>
              Inizia senza importare
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
