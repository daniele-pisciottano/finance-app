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
import type { PrimaryCategory, Transaction } from '@/types'
import { useCategories } from '@/lib/categories'
import { dbOperations } from '@/lib/db'
import { RecurringRulesManager } from '@/components/RecurringRulesManager'
import { SyncAccount } from '@/components/SyncAccount'
import { Reconciliation } from '@/components/Reconciliation'
import { CategorySettings } from '@/components/CategorySettings'
import { CaptureSettings } from '@/components/CaptureSettings'
import { parseBackup } from '@/lib/backupImport'

// Generate list of months for selection (current year and previous year)
function generateMonthOptions(): { value: string; label: string }[] {
  const months = []
  const currentYear = new Date().getFullYear()
  const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']

  for (let year = currentYear; year >= currentYear - 1; year--) {
    for (let month = 12; month >= 1; month--) {
      const value = `${year}-${String(month).padStart(2, '0')}`
      const label = `${monthNames[month - 1]} ${year}`
      months.push({ value, label })
    }
  }
  return months
}

export function Settings() {
  const { settings, updateSettings, savingGoals, setSavingGoal, currentMonth, importData, exportData, addSubcategory, transactions } = useStore()
  const { categories, names, icon } = useCategories()
  const [newGoal, setNewGoal] = useState(settings.defaultSavingGoal.toString())
  const [exportLoading, setExportLoading] = useState(false)
  const [csvExportLoading, setCsvExportLoading] = useState(false)
  const [csvExportMonth, setCsvExportMonth] = useState(currentMonth)
  const [csvImportMonth, setCsvImportMonth] = useState(currentMonth)
  const [csvImportLoading, setCsvImportLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<PrimaryCategory | ''>('')
  const [newSubcategoryName, setNewSubcategoryName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvFileInputRef = useRef<HTMLInputElement>(null)

  const currentGoal = savingGoals.find(g => g.month === currentMonth)

  // Get available months from transactions for export
  const availableMonths = [...new Set(transactions.map(t => t.date.slice(0, 7)))].sort().reverse()

  // All months for import
  const allMonths = generateMonthOptions()

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

  const handleExportCSV = () => {
    setCsvExportLoading(true)
    try {
      // Filter only expenses for the selected month (drafts excluded until confirmed)
      const expenses = transactions.filter(t =>
        t.type === 'expense' && !t.draft && t.date.startsWith(csvExportMonth)
      )

      if (expenses.length === 0) {
        alert('Nessuna spesa trovata per il mese selezionato')
        setCsvExportLoading(false)
        return
      }

      // CSV Header
      const header = 'Expense name,Date,Amount,Primary,Secondary'

      // CSV Rows
      const rows = expenses.map(t => {
        // Escape values that might contain commas or quotes
        const escapeCsv = (value: string) => {
          if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        }

        const expenseName = escapeCsv(t.description || `${t.primaryCategory} - ${t.secondaryCategory}`)
        // Extract only the day number from the date
        const dayNumber = parseInt(t.date.split('-')[2], 10).toString()
        const amount = t.amount.toFixed(2)
        const primary = t.primaryCategory || ''
        const secondary = t.secondaryCategory || ''

        return `${expenseName},${dayNumber},${amount},${primary},${secondary}`
      })

      // Combine header and rows
      const csvContent = [header, ...rows].join('\n')

      // Download with month in filename
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `expenses-${csvExportMonth}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setCsvExportLoading(false)
    }
  }

  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const parsed = parseBackup(JSON.parse(await file.text()))

      if (!parsed) {
        alert('Formato file non valido. Assicurati che sia un backup JSON valido.')
      } else if (parsed.transactions.length === 0) {
        alert('Nessuna transazione valida trovata nel file.')
      } else {
        const { addedCategories } = await importData({
          transactions: parsed.transactions,
          savingGoals: parsed.savingGoals,
          recurringRules: parsed.recurringRules
        })
        const lines = [`Importate ${parsed.transactions.length} transazioni.`]
        if (parsed.savingGoals.length > 0) lines.push(`${parsed.savingGoals.length} obiettivi di risparmio.`)
        if (parsed.skipped > 0) lines.push(`${parsed.skipped} righe illeggibili saltate.`)
        if (addedCategories.length > 0) {
          lines.push(`Aggiunte ${addedCategories.length} categorie nuove: ${addedCategories.join(', ')}.`)
        }
        alert(lines.join('\n'))
      }
    } catch (error) {
      console.error('Import failed:', error)
      alert('Errore durante l\'importazione. Verifica il formato del file.')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // New CSV import handler - expenses only with day number + selected month
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvImportLoading(true)

    try {
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())

      if (lines.length === 0) {
        alert('Il file è vuoto.')
        return
      }

      // Check if first line is header
      const firstLine = lines[0].toLowerCase()
      const hasHeader = firstLine.includes('expense') || firstLine.includes('date') ||
                        firstLine.includes('amount') || firstLine.includes('primary') ||
                        firstLine.includes('name') || firstLine.includes('secondary')
      const startIndex = hasHeader ? 1 : 0

      const newTransactions: Transaction[] = []
      const errors: string[] = []
      const [year, month] = csvImportMonth.split('-')

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        try {
          // Parse CSV line (handle quoted values)
          const values = line.match(/(?:^|,)("(?:[^"]*(?:""[^"]*)*)"|[^,]*)/g)?.map(v =>
            v.replace(/^,/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()
          ) || line.split(',').map(v => v.trim())

          if (values.length < 4) {
            errors.push(`Riga ${i + 1}: formato non valido (servono almeno 4 colonne)`)
            continue
          }

          // Expected format: Expense name, Date (day number), Amount, Primary, Secondary
          const [expenseName, dayStr, amountStr, primary, secondary = ''] = values

          // Parse day number
          const day = parseInt(dayStr, 10)
          if (isNaN(day) || day < 1 || day > 31) {
            errors.push(`Riga ${i + 1}: giorno non valido "${dayStr}"`)
            continue
          }

          // Parse amount (always positive, it's an expense)
          const amount = Math.abs(parseFloat(amountStr.replace(/[€$,\s]/g, '').replace(',', '.')))
          if (isNaN(amount) || amount <= 0) {
            errors.push(`Riga ${i + 1}: importo non valido "${amountStr}"`)
            continue
          }

          // Validate primary category
          const validPrimary = names.includes(primary)
          if (!validPrimary) {
            errors.push(`Riga ${i + 1}: categoria "${primary}" non valida`)
            continue
          }

          // Build the full date
          const fullDate = `${year}-${month}-${String(day).padStart(2, '0')}`

          newTransactions.push({
            id: generateId(),
            type: 'expense',
            date: fullDate,
            amount: amount,
            primaryCategory: primary as PrimaryCategory,
            secondaryCategory: secondary || undefined,
            description: expenseName || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
        } catch (err) {
          errors.push(`Riga ${i + 1}: errore di parsing`)
        }
      }

      if (newTransactions.length > 0) {
        await importData({ transactions: newTransactions })

        let message = `Importate ${newTransactions.length} spese per ${allMonths.find(m => m.value === csvImportMonth)?.label}!`
        if (errors.length > 0) {
          message += `\n\n${errors.length} righe ignorate:\n${errors.slice(0, 5).join('\n')}`
          if (errors.length > 5) {
            message += `\n... e altre ${errors.length - 5}`
          }
        }
        alert(message)
      } else {
        let message = 'Nessuna spesa valida trovata nel file.'
        if (errors.length > 0) {
          message += `\n\nErrori:\n${errors.slice(0, 5).join('\n')}`
          if (errors.length > 5) {
            message += `\n... e altri ${errors.length - 5}`
          }
        }
        alert(message)
      }
    } catch (error) {
      console.error('CSV Import failed:', error)
      alert('Errore durante l\'importazione. Verifica il formato del file.')
    } finally {
      setCsvImportLoading(false)
      if (csvFileInputRef.current) {
        csvFileInputRef.current.value = ''
      }
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

      {/* Account & sync (only when Supabase is configured) */}
      <SyncAccount />

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

      {/* Categories: the account's own taxonomy */}
      <CategorySettings />

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
                {categories.map((cat) => (
                  <SelectItem key={cat.name} value={cat.name}>
                    {cat.icon} {cat.name}
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
                Sottocategorie di {icon(selectedCategory)} {selectedCategory}:
              </Label>
              <div className="flex flex-wrap gap-2">
                {(categories.find((c) => c.name === selectedCategory)?.subcategories ?? []).map((sub) => (
                  <Badge key={sub} variant="secondary">
                    {sub}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-capture rules */}
      <CaptureSettings />

      {/* Recurring expenses */}
      <RecurringRulesManager />

      {/* Reconciliation: upload bank reports and find forgotten expenses */}
      <Reconciliation />

      {/* Import/Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import/Export Dati</CardTitle>
          <CardDescription>
            Esporta un backup o importa dati esistenti
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export CSV */}
          <div className="space-y-3">
            <Label className="text-sm text-muted-foreground block">
              Esporta spese mensili in CSV
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={csvExportMonth} onValueChange={setCsvExportMonth}>
                <SelectTrigger className="sm:w-[180px]">
                  <SelectValue placeholder="Seleziona mese" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.length > 0 ? (
                    availableMonths.map((month) => {
                      const [y, m] = month.split('-')
                      const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
                      const monthName = monthNames[parseInt(m, 10) - 1]
                      return (
                        <SelectItem key={month} value={month}>
                          {monthName} {y}
                        </SelectItem>
                      )
                    })
                  ) : (
                    <SelectItem value={currentMonth} disabled>
                      Nessun dato
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={csvExportLoading || availableMonths.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                {csvExportLoading ? 'Esportando...' : 'Esporta CSV'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Formato: Expense name, Date (giorno), Amount, Primary, Secondary
            </p>
          </div>

          {/* Import CSV */}
          <div className="border-t pt-4 space-y-3">
            <Label className="text-sm text-muted-foreground block">
              Importa spese da CSV (seleziona il mese di riferimento)
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={csvImportMonth} onValueChange={setCsvImportMonth}>
                <SelectTrigger className="sm:w-[180px]">
                  <SelectValue placeholder="Seleziona mese" />
                </SelectTrigger>
                <SelectContent>
                  {allMonths.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => csvFileInputRef.current?.click()}
                disabled={csvImportLoading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {csvImportLoading ? 'Importando...' : 'Importa CSV'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Formato richiesto: Expense name, Date (giorno 1-31), Amount, Primary, Secondary
            </p>
          </div>

          {/* JSON Backup */}
          <div className="border-t pt-4">
            <Label className="text-sm text-muted-foreground mb-2 block">
              Backup completo (JSON) - include tutte le transazioni e impostazioni
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleExport} disabled={exportLoading}>
                <Download className="h-4 w-4 mr-2" />
                {exportLoading ? 'Esportando...' : 'Esporta JSON'}
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Importa JSON
              </Button>
            </div>
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
            <div>Versione 1.1.0</div>
            <div>PWA per la gestione finanziaria personale - Maddaniello ©</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
