import { useState, useRef } from 'react'
import { format } from 'date-fns'
import { Moon, Sun, Download, Upload, Target, Trash2, Plus } from 'lucide-react'
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
import { formatCurrency, generateId } from '@/lib/utils'
import { PRIMARY_CATEGORIES, CATEGORY_ICONS, type PrimaryCategory, type Transaction } from '@/types'
import { dbOperations } from '@/lib/db'

export function Settings() {
  const { settings, updateSettings, savingGoals, setSavingGoal, currentMonth, importData, exportData, addSubcategory } = useStore()
  const [newGoal, setNewGoal] = useState(settings.defaultSavingGoal.toString())
  const [exportLoading, setExportLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<PrimaryCategory | ''>('')
  const [newSubcategoryName, setNewSubcategoryName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentGoal = savingGoals.find(g => g.month === currentMonth)

  const handleThemeToggle = () => {
    const newDarkMode = !settings.darkMode
    updateSettings({ darkMode: newDarkMode })
    document.documentElement.classList.toggle('dark', newDarkMode)
  }

  const handleSaveGoal = async () => {
    const goal = parseFloat(newGoal)
    if (!isNaN(goal) && goal >= 0) {
      await setSavingGoal(currentMonth, goal)
      await updateSettings({ defaultSavingGoal: goal })
    }
  }

  const handleExport = async () => {
    setExportLoading(true)
    try {
      const data = await exportData()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-backup-${format(new Date(), 'yyyy-MM-dd')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExportLoading(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (data.transactions) {
        await importData({ transactions: data.transactions })
        alert(`Importate ${data.transactions.length} transazioni con successo!`)
      }
    } catch (error) {
      console.error('Import failed:', error)
      alert('Errore durante l\'importazione. Verifica il formato del file.')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())

      // Skip header if present
      const startIndex = lines[0].includes('date') || lines[0].includes('Data') ? 1 : 0

      const transactions: Transaction[] = []

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i]
        // Try to parse CSV (handle quoted values)
        const values = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g)?.map(v =>
          v.replace(/^,/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()
        ) || line.split(',').map(v => v.trim())

        if (values.length >= 4) {
          const [date, amount, category, subcategory, description = ''] = values

          // Determine if income or expense
          const numAmount = parseFloat(amount.replace(/[€$,]/g, ''))
          const isIncome = numAmount > 0 || category.toLowerCase().includes('income') || category.toLowerCase().includes('stipend')

          if (!isNaN(numAmount) && date) {
            transactions.push({
              id: generateId(),
              type: isIncome ? 'income' : 'expense',
              date: date.includes('/') ? date.split('/').reverse().join('-') : date,
              amount: Math.abs(numAmount),
              primaryCategory: isIncome ? undefined : (category as PrimaryCategory),
              secondaryCategory: isIncome ? undefined : subcategory,
              description: description || '',
              incomeType: isIncome ? 'Stipendio' : undefined,
              createdAt: Date.now(),
              updatedAt: Date.now()
            })
          }
        }
      }

      if (transactions.length > 0) {
        await importData({ transactions })
        alert(`Importate ${transactions.length} transazioni con successo!`)
      } else {
        alert('Nessuna transazione valida trovata nel file.')
      }
    } catch (error) {
      console.error('CSV Import failed:', error)
      alert('Errore durante l\'importazione CSV. Verifica il formato del file.')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleAddSubcategory = async () => {
    if (selectedCategory && newSubcategoryName.trim()) {
      await addSubcategory(selectedCategory, newSubcategoryName.trim())
      setNewSubcategoryName('')
    }
  }

  const handleClearData = async () => {
    if (confirm('Sei sicuro di voler eliminare TUTTI i dati? Questa azione non può essere annullata.')) {
      if (confirm('Conferma definitiva: tutti i dati verranno eliminati permanentemente.')) {
        await dbOperations.clearAllData()
        window.location.reload()
      }
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-24">
      <h2 className="text-xl font-semibold">Impostazioni</h2>

      {/* Theme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tema</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full justify-between"
            onClick={handleThemeToggle}
          >
            <span className="flex items-center gap-2">
              {settings.darkMode ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {settings.darkMode ? 'Tema Scuro' : 'Tema Chiaro'}
            </span>
            <Badge variant="secondary">
              {settings.darkMode ? 'Attivo' : 'Disattivo'}
            </Badge>
          </Button>
        </CardContent>
      </Card>

      {/* Saving Goal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            Obiettivo Risparmio
          </CardTitle>
          <CardDescription>
            Imposta l'obiettivo di risparmio mensile
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">€</span>
              <Input
                type="number"
                min="0"
                step="10"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button onClick={handleSaveGoal}>Salva</Button>
          </div>
          {currentGoal && (
            <div className="text-sm text-muted-foreground">
              Obiettivo attuale per {currentMonth}: {formatCurrency(currentGoal.savingGoal)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subcategories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gestione Sottocategorie</CardTitle>
          <CardDescription>
            Aggiungi nuove sottocategorie alle categorie esistenti
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as PrimaryCategory)}>
              <SelectTrigger className="sm:w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {PRIMARY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {CATEGORY_ICONS[cat]} {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Nome sottocategoria"
              value={newSubcategoryName}
              onChange={(e) => setNewSubcategoryName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleAddSubcategory} disabled={!selectedCategory || !newSubcategoryName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Aggiungi
            </Button>
          </div>

          {selectedCategory && (
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Sottocategorie di {CATEGORY_ICONS[selectedCategory]} {selectedCategory}:
              </Label>
              <div className="flex flex-wrap gap-2">
                {(settings.customSubcategories[selectedCategory] || []).map((sub) => (
                  <Badge key={sub} variant="secondary">
                    {sub}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import/Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import/Export Dati</CardTitle>
          <CardDescription>
            Esporta un backup o importa dati esistenti
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleExport} disabled={exportLoading}>
              <Download className="h-4 w-4 mr-2" />
              {exportLoading ? 'Esportando...' : 'Esporta JSON'}
            </Button>

            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Importa JSON
            </Button>
          </div>

          <div className="border-t pt-4">
            <Label className="text-sm text-muted-foreground mb-2 block">
              Importa da CSV (formato: data, importo, categoria, sottocategoria, descrizione)
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file?.name.endsWith('.csv')) {
                  handleImportCSV(e)
                } else {
                  handleImport(e)
                }
              }}
              className="hidden"
            />
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = '.csv'
                  fileInputRef.current.click()
                  fileInputRef.current.accept = '.json,.csv'
                }
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Importa CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona Pericolo</CardTitle>
          <CardDescription>
            Azioni irreversibili - procedi con cautela
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleClearData}>
            <Trash2 className="h-4 w-4 mr-2" />
            Elimina tutti i dati
          </Button>
        </CardContent>
      </Card>

      {/* App Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground space-y-1">
            <div className="font-semibold">Finance Tracker</div>
            <div>Versione 1.0.0</div>
            <div>PWA per la gestione finanziaria personale</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
