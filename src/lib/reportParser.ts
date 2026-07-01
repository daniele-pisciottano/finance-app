import { readXlsx, excelSerialToDate, type Cell } from '@/lib/xlsx'
import { guessCategory } from '@/lib/notificationParser'

export type ReportSource = 'revolut' | 'intesa' | 'unknown'

export interface ReportTransaction {
  date: string // YYYY-MM-DD
  amount: number // positive; amount to RECORD (Revolut already halved)
  rawAmount: number // original absolute amount from the report
  merchant: string
  source: ReportSource
  rawCategory?: string
  primaryCategory?: string
  secondaryCategory?: string
  halved: boolean
  flags: string[] // e.g. 'paypal'
}

export interface ParsedReport {
  source: ReportSource
  transactions: ReportTransaction[] // expenses only
  ignoredCount: number // income + transfers skipped
  totalRows: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Intesa's own category -> app category.
const INTESA_CATEGORY_MAP: Record<string, { p: string; s?: string }> = {
  'generi alimentari e supermercati': { p: 'Groceries' },
  'ristoranti e bar': { p: 'Out' },
  'carburanti': { p: 'Transport', s: 'Fuel' },
  'corsi e sport': { p: 'Health', s: 'Sport' },
  'cellulare': { p: 'Housing', s: 'Phone' },
  'libri, film e musica': { p: 'Leisure' },
  'tempo libero varie': { p: 'Leisure' },
  'abbigliamento e accessori': { p: 'Clothing' },
  'cura della persona': { p: 'Health' },
  'salute e benessere': { p: 'Health' },
  'regali': { p: 'Gifts' },
  'donazioni': { p: 'Gifts' },
  'pagamento affitti': { p: 'Housing', s: 'Rent' },
  'tabaccai e simili': { p: 'OtherExpenses' },
  'viaggi e vacanze': { p: 'Travel' }
}

function mapIntesaCategory(cat: string): { p: string; s?: string } | null {
  const key = cat.trim().toLowerCase()
  if (INTESA_CATEGORY_MAP[key]) return INTESA_CATEGORY_MAP[key]
  if (key.startsWith('trasporti')) return { p: 'Transport' }
  return null
}

function s(cell: Cell): string {
  return cell == null ? '' : String(cell).trim()
}

export function parseReport(data: Uint8Array): ParsedReport {
  const rows = readXlsx(data)

  const header0 = (rows[0] || []).map((c) => s(c).toLowerCase())
  if (header0.includes('type') && header0.includes('amount') && header0.some((h) => h.includes('description'))) {
    return parseRevolut(rows)
  }

  const hi = rows.findIndex((r) => {
    const cols = r.map((c) => s(c).toLowerCase())
    return cols.includes('operazione') && cols.includes('importo')
  })
  if (hi >= 0) return parseIntesa(rows, hi)

  return { source: 'unknown', transactions: [], ignoredCount: 0, totalRows: rows.length }
}

function parseRevolut(rows: Cell[][]): ParsedReport {
  const h = rows[0].map((c) => s(c).toLowerCase())
  const iDesc = h.indexOf('description')
  const iAmt = h.indexOf('amount')
  const iDate = h.indexOf('started date') >= 0 ? h.indexOf('started date') : h.indexOf('completed date')

  const transactions: ReportTransaction[] = []
  let ignored = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const amount = Number(row[iAmt])
    if (!Number.isFinite(amount) || amount === 0) continue
    if (amount > 0) {
      ignored++ // Deposit / Top-up / refund
      continue
    }
    const merchant = s(row[iDesc])
    const dateSerial = Number(row[iDate])
    const date = Number.isFinite(dateSerial) ? excelSerialToDate(dateSerial) : ''
    const rawAmount = Math.abs(amount)
    const g = guessCategory(merchant)
    transactions.push({
      date,
      amount: round2(rawAmount / 2), // joint account: record your 50%
      rawAmount,
      merchant,
      source: 'revolut',
      primaryCategory: g?.primaryCategory,
      secondaryCategory: g?.secondaryCategory,
      halved: true,
      flags: []
    })
  }
  return { source: 'revolut', transactions, ignoredCount: ignored, totalRows: rows.length - 1 }
}

function parseIntesa(rows: Cell[][], hi: number): ParsedReport {
  const h = rows[hi].map((c) => s(c).toLowerCase())
  const iDate = h.indexOf('data')
  const iOp = h.indexOf('operazione')
  const iDet = h.indexOf('dettagli')
  const iCat = h.indexOf('categoria')
  const iAmt = h.indexOf('importo')

  const transactions: ReportTransaction[] = []
  let ignored = 0
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r]
    const amount = Number(row[iAmt])
    if (!Number.isFinite(amount) || amount === 0) continue
    const op = s(row[iOp])
    if (!op) continue
    if (amount > 0) {
      ignored++ // income (stipendio, bonifici, disinvestimenti)
      continue
    }
    // Money moved to Revolut is a transfer; the real spend is tracked in Revolut (÷2).
    if (/^revolut/i.test(op)) {
      ignored++
      continue
    }
    const date = excelSerialToDate(Number(row[iDate]))
    const cat = s(row[iCat])
    const dettagli = iDet >= 0 ? s(row[iDet]) : ''
    const rawAmount = Math.abs(amount)

    // Generic POS rows carry the real merchant in "Dettagli" (e.g. "Google*google One").
    const genericOp = /^pagamento effettuato su po/i.test(op)
    const detIsMerchant = dettagli && !/^effettuato il/i.test(dettagli)
    const merchant = genericOp && detIsMerchant ? dettagli : op

    const mapped = mapIntesaCategory(cat)
    let primaryCategory: string | undefined
    let secondaryCategory: string | undefined
    if (mapped) {
      primaryCategory = mapped.p
      secondaryCategory = mapped.s
    } else {
      const g = guessCategory(`${op} ${dettagli}`)
      primaryCategory = g?.primaryCategory
      secondaryCategory = g?.secondaryCategory
    }
    const flags: string[] = []
    if (/paypal/i.test(op)) flags.push('paypal')
    transactions.push({
      date,
      amount: rawAmount,
      rawAmount,
      merchant,
      source: 'intesa',
      rawCategory: cat || undefined,
      primaryCategory,
      secondaryCategory,
      halved: false,
      flags
    })
  }
  return { source: 'intesa', transactions, ignoredCount: ignored, totalRows: rows.length - hi - 1 }
}
