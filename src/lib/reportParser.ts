import { strFromU8 } from 'fflate'
import { readXlsx, excelSerialToDate, type Cell } from '@/lib/xlsx'
import { guessTag, parseAmountFlexible } from '@/lib/notificationParser'
import type { MerchantTag } from '@/types'

// --- CSV support ---------------------------------------------------------
function detectDelimiter(text: string): string {
  const line = (text.split(/\r?\n/).find((l) => l.trim()) || '')
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  for (const d of Object.keys(counts)) counts[d] = line.split(d).length - 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ','
}

function parseCsv(text: string): Cell[][] {
  const delim = detectDelimiter(text)
  const rows: Cell[][] = []
  let field = ''
  let row: Cell[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

// Amount from either an xlsx number or a CSV string, preserving the sign.
function cellToAmount(cell: Cell): number {
  if (typeof cell === 'number') return cell
  const s = String(cell ?? '')
  if (!s.trim()) return NaN
  const negative = /-/.test(s) || /^\(.*\)$/.test(s.trim())
  const abs = parseAmountFlexible(s)
  if (abs == null) return NaN
  return negative ? -abs : abs
}

// Date from either an Excel serial (number) or a CSV date string.
function cellToDate(cell: Cell): string {
  if (typeof cell === 'number') return excelSerialToDate(cell)
  const s = String(cell ?? '').trim()
  if (!s) return ''
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const dmy = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/) // DD/MM/YYYY (Italian)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const n = Number(s)
  if (Number.isFinite(n) && n > 20000) return excelSerialToDate(n) // serial stored as text
  return ''
}

export type ReportSource = 'revolut' | 'intesa' | 'unknown'

export interface ReportTransaction {
  date: string // YYYY-MM-DD
  amount: number // positive; amount to RECORD (Revolut already halved)
  rawAmount: number // original absolute amount from the report
  merchant: string
  source: ReportSource
  rawCategory?: string
  // Taxonomy-neutral hint; the caller maps it onto the account's own categories.
  tag?: MerchantTag
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

// Intesa's own category -> semantic tag (never a category name: the account's set
// decides where each tag lands).
const INTESA_TAG_MAP: Record<string, MerchantTag> = {
  'generi alimentari e supermercati': 'groceries',
  'ristoranti e bar': 'restaurant',
  'carburanti': 'fuel',
  'corsi e sport': 'sport',
  'cellulare': 'phone',
  'libri, film e musica': 'leisure',
  'tempo libero varie': 'leisure',
  'abbigliamento e accessori': 'clothing',
  'cura della persona': 'beauty',
  'salute e benessere': 'health',
  'regali': 'gift',
  'donazioni': 'gift',
  'pagamento affitti': 'home',
  'viaggi e vacanze': 'travel'
}

function mapIntesaCategory(cat: string): MerchantTag | null {
  const key = cat.trim().toLowerCase()
  if (INTESA_TAG_MAP[key]) return INTESA_TAG_MAP[key]
  if (key.startsWith('trasporti')) return 'transport'
  return null
}

function s(cell: Cell): string {
  return cell == null ? '' : String(cell).trim()
}

export interface ParseReportOptions {
  // Revolut CSV exports carry no account marker, so whether to record only your share
  // is a per-account decision the caller passes in.
  halveRevolut?: boolean
}

export function parseReport(data: Uint8Array, options: ParseReportOptions = {}): ParsedReport {
  const halveRevolut = options.halveRevolut ?? true
  // .xlsx files are ZIP archives (start with "PK"); anything else is treated as CSV.
  const isZip = data[0] === 0x50 && data[1] === 0x4b
  const rows = isZip ? readXlsx(data) : parseCsv(strFromU8(data))

  const header0 = (rows[0] || []).map((c) => s(c).toLowerCase())
  if (header0.includes('type') && header0.includes('amount') && header0.some((h) => h.includes('description'))) {
    return parseRevolut(rows, halveRevolut)
  }

  const hi = rows.findIndex((r) => {
    const cols = r.map((c) => s(c).toLowerCase())
    return cols.includes('operazione') && cols.includes('importo')
  })
  if (hi >= 0) return parseIntesa(rows, hi)

  return { source: 'unknown', transactions: [], ignoredCount: 0, totalRows: rows.length }
}

function parseRevolut(rows: Cell[][], halveRevolut: boolean): ParsedReport {
  const h = rows[0].map((c) => s(c).toLowerCase())
  const iDesc = h.indexOf('description')
  const iAmt = h.indexOf('amount')
  const iDate = h.indexOf('started date') >= 0 ? h.indexOf('started date') : h.indexOf('completed date')

  const transactions: ReportTransaction[] = []
  let ignored = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const amount = cellToAmount(row[iAmt])
    if (!Number.isFinite(amount) || amount === 0) continue
    if (amount > 0) {
      ignored++ // Deposit / Top-up / refund
      continue
    }
    const merchant = s(row[iDesc])
    const date = cellToDate(row[iDate])
    const rawAmount = Math.abs(amount)
    transactions.push({
      date,
      amount: halveRevolut ? round2(rawAmount / 2) : rawAmount,
      rawAmount,
      merchant,
      source: 'revolut',
      tag: guessTag(merchant) ?? undefined,
      halved: halveRevolut,
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
    const amount = cellToAmount(row[iAmt])
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
    const date = cellToDate(row[iDate])
    const cat = s(row[iCat])
    const dettagli = iDet >= 0 ? s(row[iDet]) : ''
    const rawAmount = Math.abs(amount)

    // Generic POS rows carry the real merchant in "Dettagli" (e.g. "Google*google One").
    const genericOp = /^pagamento effettuato su po/i.test(op)
    const detIsMerchant = dettagli && !/^effettuato il/i.test(dettagli)
    const merchant = genericOp && detIsMerchant ? dettagli : op

    const mapped = mapIntesaCategory(cat)
    const tag = mapped ?? guessTag(`${op} ${dettagli}`) ?? undefined
    const flags: string[] = []
    if (/paypal/i.test(op)) flags.push('paypal')
    transactions.push({
      date,
      amount: rawAmount,
      rawAmount,
      merchant,
      source: 'intesa',
      rawCategory: cat || undefined,
      tag,
      halved: false,
      flags
    })
  }
  return { source: 'intesa', transactions, ignoredCount: ignored, totalRows: rows.length - hi - 1 }
}
