// Pure parser for bank/payment notifications captured on the phone and forwarded
// to the ingest endpoint. No app/DOM/node-specific APIs so it can run both in the
// serverless function and in the browser. It never throws: on failure it returns a
// result with amount=null so the caller can keep the raw text for manual entry.
//
// The parser is deliberately taxonomy-agnostic: it emits a semantic `tag`, and each
// account's category set turns that tag into one of *its* categories. That is what lets
// two users with entirely different categories share one ingest endpoint.

import type { CaptureSettings, MerchantTag, PaymentSource } from '@/types'

export type { PaymentSource }

export interface ParsedExpense {
  source: PaymentSource
  isPayment: boolean // false for non-payment notifications (rewards, referrals, alerts...)
  amount: number | null // final amount to record (joint share already applied)
  rawAmount: number | null // amount as read from the text, before adjustments
  currency: string
  merchant: string | null
  card: string | null // last 4 digits when present
  occurredAt: string | null // YYYY-MM-DD if a date was in the text, else null
  time: string | null // HH:MM if present
  joint: boolean // the notification is marked as a shared ("Joint") account
  halved: boolean // true when the joint-share rule was applied
  possibleDeposit: boolean // amount matches a known pre-authorisation hold
  tag: MerchantTag | null
  note: string | null
  raw: string
}

// Defaults used when a caller has no per-account settings at hand.
export const DEFAULT_CAPTURE_RULES: Pick<CaptureSettings, 'revolutSplit' | 'depositAmounts' | 'paypalDuplicateWarning'> = {
  revolutSplit: 'joint-only',
  depositAmounts: [103.29],
  paypalDuplicateWarning: true
}

// Revolut prefixes the notification title with the account name: "Joint · Tenuterrico",
// "Personal · KFC". Detect the shared case before the prefix gets stripped.
export function isJointTitle(title: string | undefined): boolean {
  return /^\s*(joint|shared|condiviso|cointestato)\b/i.test(title || '')
}

// "Joint · Tenuterrico" -> "Tenuterrico" ; "KFC" -> "KFC".
export function cleanMerchantTitle(title: string): string {
  return title.replace(/^\s*(?:joint|shared|current|personal|condiviso|cointestato|conto\w*)\s*[·•|:-]\s*/i, '').trim()
}

// "1.234,56" -> 1234.56 ; "1,99" -> 1.99 ; "14,00" -> 14  (Italian convention)
export function parseItalianAmount(s: string): number | null {
  const cleaned = s.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

// Flexible parser that copes with both Italian ("1.234,56", "1,99") and English
// ("$2", "1,234.56", "1.38") amounts — used for Revolut, whose language/currency
// varies. Decides the decimal separator from whichever of . or , comes last.
export function parseAmountFlexible(s: string): number | null {
  const digits = s.replace(/[^\d.,]/g, '')
  if (!digits) return null
  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')
  let normalized: string
  if (lastComma > -1 && lastDot > -1) {
    // both present: the later one is the decimal separator
    normalized = lastComma > lastDot
      ? digits.replace(/\./g, '').replace(',', '.')
      : digits.replace(/,/g, '')
  } else if (lastComma > -1) {
    // only comma: decimal if exactly 2 trailing digits, else thousands
    normalized = /,\d{2}$/.test(digits) ? digits.replace(',', '.') : digits.replace(/,/g, '')
  } else if (lastDot > -1) {
    normalized = /\.\d{2}$/.test(digits) ? digits : digits.replace(/\./g, '')
  } else {
    normalized = digits
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

// True when the amount matches a configured pre-authorisation hold (the fuel-pump
// "cauzione"). Compared in cents so 103.29 doesn't miss by a float epsilon.
export function isDepositAmount(amount: number | null, depositAmounts: number[]): boolean {
  if (amount == null) return false
  const cents = Math.round(amount * 100)
  return depositAmounts.some((d) => Math.round(d * 100) === cents)
}

// Best-effort merchant -> semantic tag. Names, not categories: the account's category
// set decides where each tag lands.
const TAG_KEYWORDS: { match: RegExp; tag: MerchantTag }[] = [
  { match: /google|youtube premium|netflix|spotify|icloud|apple\.com\/bill|disney\+|prime video/i, tag: 'subscription' },
  { match: /lidl|\bpam\b|aldi|coop|cadoro|ca'?\s?d'?oro|esselunga|conad|carrefour|eurospin|\bmd\b|penny|despar|alì|supermerc/i, tag: 'groceries' },
  { match: /\bq8\b|\beni\b|\bip\b|tamoil|esso|agip|benzin|carburant|distributor|petrol|shell/i, tag: 'fuel' },
  { match: /telepass|autostrad|pedagg/i, tag: 'toll' },
  { match: /trenitalia|italo|\bgtt\b|atac|\bbus\b|metro|actv|trenord|flixbus/i, tag: 'transport' },
  { match: /glovo|deliveroo|just\s?eat|uber eats/i, tag: 'delivery' },
  { match: /pizz|ristorant|osteria|trattoria|sushi|hamburg|mcdonald|burger king|\bkfc\b/i, tag: 'restaurant' },
  { match: /\bbar\b|caffe|caffè|pasticc|gelat/i, tag: 'bar' },
  { match: /farmac|parafarm/i, tag: 'pharmacy' },
  { match: /poliambulator|dentist|studio medico|analisi clinic|ottic/i, tag: 'health' },
  { match: /parrucch|estetist|barbier|profumeri|douglas|sephora|kiko/i, tag: 'beauty' },
  { match: /arcaplanet|zooplus|veterinar|maxi\s?zoo/i, tag: 'pets' },
  { match: /ikea|leroy merlin|brico|obi\b|maison/i, tag: 'home' },
  { match: /zalando|zara|h&m|\bovs\b|decathlon|primark|calzedonia/i, tag: 'clothing' },
  { match: /cinema|teatro|ticketone|steam|nintendo|playstation/i, tag: 'leisure' },
  { match: /amazon/i, tag: 'leisure' }
]

export function guessTag(merchant: string | null): MerchantTag | null {
  if (!merchant) return null
  for (const rule of TAG_KEYWORDS) {
    if (rule.match.test(merchant)) return rule.tag
  }
  return null
}

// Parse a "DD.MM" (Italian) date into YYYY-MM-DD using a reference year, but only if
// the resulting date is not in the future relative to `today`; otherwise return null
// and let the caller fall back to the notification receipt date.
function parseDayMonth(dd: string, mm: string, today: Date): string | null {
  const day = parseInt(dd, 10)
  const month = parseInt(mm, 10)
  if (!day || !month || day > 31 || month > 12) return null
  const year = today.getFullYear()
  const candidate = new Date(year, month - 1, day)
  // If the candidate is in the future, it likely belongs to the previous year — but for
  // real-time capture we simply signal "unknown" and use the receipt date instead.
  if (candidate.getTime() > today.getTime() + 24 * 60 * 60 * 1000) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function detectSource(text: string, appHint?: string): PaymentSource {
  const hint = (appHint || '').toLowerCase()
  if (hint.includes('intesa') || hint.includes('sanpaolo')) return 'intesa'
  if (hint.includes('revolut')) return 'revolut'
  if (hint.includes('paypal')) return 'paypal'
  if (hint.includes('satispay')) return 'satispay'
  const t = text.toLowerCase()
  if (t.includes('revolut')) return 'revolut'
  if (t.includes('paypal')) return 'paypal'
  if (t.includes('satispay')) return 'satispay'
  if (t.includes('hai pagato') && t.includes('con la carta')) return 'intesa'
  return 'unknown'
}

export interface ParseOptions {
  appHint?: string // app / package name from the phone automation
  title?: string // notification title (Revolut / Satispay put the merchant here)
  today?: Date // reference date (defaults to now)
  // Per-account capture rules. Anything omitted falls back to DEFAULT_CAPTURE_RULES.
  capture?: Partial<Pick<CaptureSettings, 'revolutSplit' | 'depositAmounts' | 'paypalDuplicateWarning'>>
}

export function parseNotification(text: string, options: ParseOptions = {}): ParsedExpense {
  const today = options.today ?? new Date()
  const source = detectSource(text, options.appHint)
  const rules = { ...DEFAULT_CAPTURE_RULES, ...options.capture }

  const base: ParsedExpense = {
    source,
    isPayment: false,
    amount: null,
    rawAmount: null,
    currency: 'EUR',
    merchant: null,
    card: null,
    occurredAt: null,
    time: null,
    joint: false,
    halved: false,
    possibleDeposit: false,
    tag: null,
    note: null,
    raw: text
  }

  // Applied once at the end of every branch so no source can forget it.
  const finish = (result: ParsedExpense): ParsedExpense => {
    result.tag = guessTag(result.merchant)
    // Check the amount as it was read too: a hold on a joint Revolut card is halved
    // before it gets here, so only the raw figure still matches the known amount.
    const deposits = rules.depositAmounts ?? []
    if (
      result.isPayment &&
      (isDepositAmount(result.amount, deposits) || isDepositAmount(result.rawAmount, deposits))
    ) {
      result.possibleDeposit = true
      const depositNote =
        'Importo tipico di una cauzione (es. il blocco al distributore): controlla prima di confermare'
      result.note = result.note ? `${result.note} · ${depositNote}` : depositNote
    }
    return result
  }

  if (source === 'intesa') {
    // 💵 Hai pagato 1,99 € con la carta *2896 il 07.01 alle ore 12:44 da GOOGLE*GOOGLE ON.
    const m = text.match(
      /Hai pagato\s+([\d.]*\d,\d{2})\s*€\s+con la carta\s+\*?(\d+)\s+il\s+(\d{1,2})\.(\d{1,2})\s+alle ore\s+(\d{1,2}:\d{2})\s+da\s+(.+?)\.?\s*$/i
    )
    if (m) {
      const amount = parseItalianAmount(m[1])
      base.rawAmount = amount
      base.amount = amount
      base.card = m[2]
      base.occurredAt = parseDayMonth(m[3], m[4], today)
      base.time = m[5]
      base.merchant = m[6].trim()
      base.isPayment = amount != null
    }
    return finish(base) // no match -> not a payment (e.g. login alert)
  }

  if (source === 'paypal') {
    // "Hai inviato 24,00 € EUR a Michele Spano" / "Hai pagato 9,99 € a Spotify"
    const m = text.match(/Hai (?:inviato|pagato)\s+([\d.]*\d,\d{2})\s*€(?:\s*EUR)?\s+a\s+(.+?)[.\n]?\s*$/i)
    if (m) {
      base.rawAmount = parseItalianAmount(m[1])
      base.amount = base.rawAmount
      base.merchant = m[2].trim()
    } else {
      base.rawAmount = base.amount = firstAmount(text)
      base.merchant = options.title || null
    }
    base.isPayment = base.amount != null
    if (base.isPayment && rules.paypalDuplicateWarning) {
      base.note = 'PayPal: verifica il possibile riaddebito sulla carta (evita il doppione)'
    }
    return finish(base)
  }

  if (source === 'satispay') {
    // "Hai pagato 12,50 € a Bar Centrale" / "Pagamento di 12,50 € a NEGOZIO"
    // The merchant is usually also the notification title.
    const titleMerchant = cleanMerchantTitle(options.title || '')
    const m =
      text.match(/Hai (?:pagato|inviato)\s+([\d.]*\d,\d{2})\s*€\s+a\s+(.+?)[.\n]?\s*$/i) ||
      text.match(/Pagament\w*\s+(?:di\s+)?([\d.]*\d,\d{2})\s*€\s+(?:a|presso|da)\s+(.+?)[.\n]?\s*$/i)
    if (m) {
      base.rawAmount = base.amount = parseItalianAmount(m[1])
      base.merchant = titleMerchant || m[2].trim()
    } else {
      base.rawAmount = base.amount = firstAmount(text)
      base.merchant = titleMerchant || null
    }
    base.isPayment = base.amount != null
    return finish(base)
  }

  if (source === 'revolut') {
    // Real formats:
    //   "Paid $2 at KFC"                (merchant in the "at ..." part or the title)
    //   title "Joint · Tenuterrico" + body "€5 spent" / "EUR balance: €224.70"
    // Only treat as a payment if a spend keyword + amount are present (this filters
    // out reward / referral / info notifications).
    const titleMerchant = cleanMerchantTitle(options.title || '')
    base.joint = isJointTitle(options.title) || /\bjoint\b/i.test(text)
    let raw: number | null = null
    let merchant: string | null = titleMerchant || null

    const atLine = text.match(
      /(?:Paid|Spent|Pagato|Speso|Hai speso|Hai pagato)\s+[^\d-]*([\d.,]+)\s*(?:at|a|da|presso)\s+(.+?)\s*$/im
    )
    if (atLine) {
      raw = parseAmountFlexible(atLine[1])
      merchant = titleMerchant || atLine[2].trim()
    } else {
      const spent =
        text.match(/(?:€|\$|£)\s*([\d.,]+)\s*(?:spent|speso|paid|pagat\w*)/i) ||
        text.match(/([\d.,]+)\s*(?:€|\$|£)?\s*(?:spent|speso)/i) ||
        text.match(/(?:spent|speso|paid|pagat\w*)\s*(?:€|\$|£)?\s*([\d.,]+)/i)
      if (spent) raw = parseAmountFlexible(spent[1])
    }

    base.rawAmount = raw
    base.merchant = merchant
    if (raw != null) {
      const split = rules.revolutSplit === 'always' || (rules.revolutSplit === 'joint-only' && base.joint)
      base.amount = split ? Math.round((raw / 2) * 100) / 100 : raw
      base.halved = split
      base.isPayment = true
      if (split) base.note = `Revolut (conto cointestato): quota 50% di ${raw.toFixed(2)}`
    }
    return finish(base) // if no amount -> isPayment stays false, caller skips
  }

  // Unknown source: best-effort amount + title as merchant.
  base.rawAmount = base.amount = firstAmount(text)
  base.merchant = options.title || null
  base.isPayment = base.amount != null
  return finish(base)
}

// First currency-like amount in the text, skipping lines matching `skip` (e.g. balance).
function firstAmount(text: string, skip?: RegExp): number | null {
  for (const rawLine of text.split('\n')) {
    if (skip && skip.test(rawLine)) continue
    const m = rawLine.match(/(?:€|EUR|\$|£)\s*([\d.,]+)|([\d.,]+)\s*(?:€|EUR)/i)
    if (m) return parseAmountFlexible(m[1] || m[2])
  }
  return null
}
