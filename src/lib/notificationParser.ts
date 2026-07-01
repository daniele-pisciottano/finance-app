// Pure parser for bank/payment notifications captured on the phone and forwarded
// to the ingest endpoint. No app/DOM/node-specific APIs so it can run both in the
// serverless function and in the browser. It never throws: on failure it returns a
// result with amount=null so the caller can keep the raw text for manual entry.

export type PaymentSource = 'intesa' | 'revolut' | 'paypal' | 'unknown'

export interface ParsedExpense {
  source: PaymentSource
  amount: number | null // final amount to record (Revolut already halved)
  rawAmount: number | null // amount as read from the text, before adjustments
  currency: string
  merchant: string | null
  card: string | null // last 4 digits when present
  occurredAt: string | null // YYYY-MM-DD if a date was in the text, else null
  time: string | null // HH:MM if present
  halved: boolean // true when the Revolut ÷2 rule was applied
  guess: { primaryCategory: string; secondaryCategory?: string } | null
  note: string | null
  raw: string
}

// "1.234,56" -> 1234.56 ; "1,99" -> 1.99 ; "14,00" -> 14
export function parseItalianAmount(s: string): number | null {
  const cleaned = s.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

// Best-effort merchant -> category mapping using the app's existing categories.
const CATEGORY_KEYWORDS: { match: RegExp; primaryCategory: string; secondaryCategory?: string }[] = [
  { match: /google|youtube premium/i, primaryCategory: 'Subscription', secondaryCategory: 'Google' },
  { match: /netflix/i, primaryCategory: 'Subscription', secondaryCategory: 'Netflix' },
  { match: /spotify/i, primaryCategory: 'Subscription', secondaryCategory: 'Spotify' },
  { match: /icloud|apple\.com\/bill/i, primaryCategory: 'Subscription' },
  { match: /lidl/i, primaryCategory: 'Groceries', secondaryCategory: 'Lidl' },
  { match: /\bpam\b/i, primaryCategory: 'Groceries', secondaryCategory: 'Pam' },
  { match: /aldi/i, primaryCategory: 'Groceries', secondaryCategory: 'Aldi' },
  { match: /coop/i, primaryCategory: 'Groceries', secondaryCategory: 'Coop' },
  { match: /cadoro|ca'?\s?d'?oro/i, primaryCategory: 'Groceries', secondaryCategory: 'Cadoro' },
  { match: /esselunga|conad|carrefour|eurospin|md\b|penny/i, primaryCategory: 'Groceries' },
  { match: /trenitalia|italo|gtt|atac|bus|metro/i, primaryCategory: 'Transport' },
  { match: /telepass/i, primaryCategory: 'Transport', secondaryCategory: 'Telepass' },
  { match: /\bq8\b|eni|ip\b|tamoil|esso|benzin|carburant/i, primaryCategory: 'Transport', secondaryCategory: 'Fuel' },
  { match: /pizz|ristorant|osteria|trattoria/i, primaryCategory: 'Out', secondaryCategory: 'Restaurants' },
  { match: /\bbar\b|caffe|caffè/i, primaryCategory: 'Out', secondaryCategory: 'Bar' },
  { match: /glovo|deliveroo|justeat|just eat|uber eats/i, primaryCategory: 'Out', secondaryCategory: 'FoodDelivery' },
  { match: /farmac|parafarm/i, primaryCategory: 'Health', secondaryCategory: 'Medicines' },
  { match: /amazon|zalando|zara|h&m/i, primaryCategory: 'Clothing' }
]

export function guessCategory(merchant: string | null): ParsedExpense['guess'] {
  if (!merchant) return null
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.match.test(merchant)) {
      return { primaryCategory: rule.primaryCategory, secondaryCategory: rule.secondaryCategory }
    }
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
  const t = text.toLowerCase()
  if (t.includes('revolut')) return 'revolut'
  if (t.includes('paypal')) return 'paypal'
  if (t.includes('hai pagato') && t.includes('con la carta')) return 'intesa'
  return 'unknown'
}

export interface ParseOptions {
  appHint?: string // app / package name from the phone automation
  today?: Date // reference date (defaults to now)
}

export function parseNotification(text: string, options: ParseOptions = {}): ParsedExpense {
  const today = options.today ?? new Date()
  const source = detectSource(text, options.appHint)

  const base: ParsedExpense = {
    source,
    amount: null,
    rawAmount: null,
    currency: 'EUR',
    merchant: null,
    card: null,
    occurredAt: null,
    time: null,
    halved: false,
    guess: null,
    note: null,
    raw: text
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
      base.guess = guessCategory(base.merchant)
      return base
    }
  }

  // Revolut / PayPal (and Intesa fallback): generic amount + best-effort merchant.
  const amtMatch = text.match(/(?:€|EUR)\s*([\d.]*\d,\d{2})|([\d.]*\d,\d{2})\s*(?:€|EUR)/i)
  if (amtMatch) {
    const raw = parseItalianAmount(amtMatch[1] || amtMatch[2])
    base.rawAmount = raw
    if (source === 'revolut' && raw != null) {
      base.amount = Math.round((raw / 2) * 100) / 100
      base.halved = true
      base.note = `Revolut (conto cointestato): quota 50% di ${raw?.toFixed(2)} €`
    } else {
      base.amount = raw
    }
  }
  // Merchant: text after "at " / "presso " / "da " up to end/period.
  const merchMatch = text.match(/(?:\bat\b|\bpresso\b|\bda\b)\s+(.+?)[.\n]?\s*$/i)
  if (merchMatch) {
    base.merchant = merchMatch[1].trim()
    base.guess = guessCategory(base.merchant)
  }
  if (source === 'paypal') {
    base.note = base.note
      ? base.note
      : 'PayPal: verifica il possibile riaddebito su Intesa (evita il doppione)'
  }
  return base
}
