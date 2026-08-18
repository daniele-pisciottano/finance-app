import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useStore } from '@/store/useStore'
import { formatCurrency } from '@/lib/utils'
import type { CaptureSettings as CaptureSettingsType } from '@/types'

const SOURCE_LABELS: Record<keyof CaptureSettingsType['sources'], string> = {
  intesa: 'Intesa Sanpaolo',
  revolut: 'Revolut',
  paypal: 'PayPal',
  satispay: 'Satispay'
}

const SPLIT_LABELS: Record<CaptureSettingsType['revolutSplit'], string> = {
  never: 'Mai — registra sempre l’importo intero',
  'joint-only': 'Solo sul conto cointestato (notifiche “Joint”)',
  always: 'Sempre — ogni pagamento Revolut'
}

// Per-account rules for the notifications captured from the phone. These travel with
// the account, so two people on the same deployment can capture different apps and
// treat shared accounts differently.
export function CaptureSettings() {
  const { settings, updateSettings } = useStore()
  const capture = settings.capture
  const [newAmount, setNewAmount] = useState('')

  const patch = (updates: Partial<CaptureSettingsType>) =>
    updateSettings({ capture: { ...capture, ...updates } })

  const toggleSource = (key: keyof CaptureSettingsType['sources']) =>
    patch({ sources: { ...capture.sources, [key]: !capture.sources[key] } })

  const addDeposit = () => {
    const value = parseFloat(newAmount.replace(',', '.'))
    if (!Number.isFinite(value) || value <= 0) return
    const rounded = Math.round(value * 100) / 100
    if (capture.depositAmounts.some((d) => Math.round(d * 100) === Math.round(rounded * 100))) return
    patch({ depositAmounts: [...capture.depositAmounts, rounded].sort((a, b) => a - b) })
    setNewAmount('')
  }

  const removeDeposit = (value: number) =>
    patch({ depositAmounts: capture.depositAmounts.filter((d) => d !== value) })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cattura automatica dalle notifiche</CardTitle>
        <CardDescription>
          Quali notifiche diventano bozze da confermare, e come trattarle.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm">App da catturare</Label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SOURCE_LABELS) as (keyof CaptureSettingsType['sources'])[]).map((key) => (
              <button key={key} type="button" onClick={() => toggleSource(key)}>
                <Badge variant={capture.sources[key] ? 'default' : 'outline'} className="cursor-pointer">
                  {SOURCE_LABELS[key]}
                </Badge>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Spegni una fonte quando le sue spese sono già coperte in altro modo — per
            esempio PayPal, se quei pagamenti sono tutti spese ricorrenti già registrate.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Revolut: dividi a metà</Label>
          <Select
            value={capture.revolutSplit}
            onValueChange={(v) => patch({ revolutSplit: v as CaptureSettingsType['revolutSplit'] })}
          >
            <SelectTrigger className="sm:w-[420px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SPLIT_LABELS) as CaptureSettingsType['revolutSplit'][]).map((key) => (
                <SelectItem key={key} value={key}>
                  {SPLIT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Sul conto cointestato Revolut scrive “Joint” nel titolo della notifica: con la
            seconda opzione l’app registra la tua metà solo in quel caso, e l’importo
            intero sui pagamenti personali.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Importi da segnalare come cauzione</Label>
          <div className="flex flex-wrap gap-2">
            {capture.depositAmounts.length === 0 && (
              <span className="text-sm text-muted-foreground">Nessuno.</span>
            )}
            {capture.depositAmounts.map((amount) => (
              <Badge key={amount} variant="secondary" className="gap-1.5 pr-1">
                {formatCurrency(amount)}
                <button
                  type="button"
                  onClick={() => removeDeposit(amount)}
                  className="ml-0.5 rounded p-0.5 hover:bg-destructive/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="103,29"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addDeposit()}
              className="sm:w-[160px]"
              inputMode="decimal"
            />
            <Button variant="outline" onClick={addDeposit} disabled={!newAmount.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Il blocco del distributore di benzina arriva come pagamento ma non lo è. Le
            bozze con questi importi restano in “Da confermare” con un avviso, così le
            elimini invece di registrarle.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
