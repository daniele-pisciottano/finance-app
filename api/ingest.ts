// Vercel serverless function: receives a bank/payment notification forwarded from a
// phone, parses it into a draft expense, and writes it to Supabase for the account the
// token belongs to. The app then shows it under "Da confermare".
//
// This file is intentionally SELF-CONTAINED (no imports from ../src) so Vercel can
// bundle it reliably under "type": "module". The in-app paste box uses the canonical
// parser in src/lib/notificationParser.ts; keep the two in sync if a format changes.
//
// It stays deliberately taxonomy-agnostic: it stores a semantic tag (`capturedTag`),
// never a category name. The app resolves that tag against whatever categories the
// account actually uses, which is what lets one endpoint serve several people who
// budget with completely different categories.
//
// Required Vercel environment variables (NOT prefixed with VITE_, so server-only):
//   SUPABASE_URL                your project URL
//   SUPABASE_SERVICE_ROLE_KEY   service role key (bypasses RLS — server only!)
//   INGEST_TOKENS               one token per person, mapping a secret to a user id:
//                                 {"secretA":"uuid-of-daniele","secretB":"uuid-of-marta"}
//                               (a compact "secretA:uuid,secretB:uuid" form also works)
// Legacy single-user setup, still honoured:
//   INGEST_SECRET + INGEST_USER_ID

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type MerchantTag =
  | 'groceries' | 'fuel' | 'transport' | 'toll' | 'restaurant' | 'bar' | 'delivery'
  | 'pharmacy' | 'health' | 'subscription' | 'clothing' | 'beauty' | 'pets' | 'home'
  | 'leisure' | 'travel' | 'gift' | 'phone' | 'sport'

type Source = 'intesa' | 'revolut' | 'paypal' | 'satispay' | 'youalert' | 'unknown'

interface CaptureRules {
  sources: Record<Exclude<Source, 'unknown'>, boolean>
  revolutSplit: 'never' | 'joint-only' | 'always'
  paypalDuplicateWarning: boolean
  depositAmounts: number[]
}

const FALLBACK_RULES: CaptureRules = {
  sources: { intesa: true, revolut: true, paypal: true, satispay: true, youalert: true },
  revolutSplit: 'joint-only',
  paypalDuplicateWarning: true,
  depositAmounts: [103.29]
}

export default async function handler(req: any, res: any) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-ingest-secret')

    if (req.method === 'OPTIONS') return res.status(204).end()

    const SUPABASE_URL = process.env.SUPABASE_URL
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    const tokens = parseTokens(process.env.INGEST_TOKENS, process.env.INGEST_SECRET, process.env.INGEST_USER_ID)

    // Health check: open the URL in a browser to see which env vars are configured.
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        env: {
          SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
          // How many people this endpoint can accept notifications for. Never echoes
          // the tokens themselves.
          configuredAccounts: Object.keys(tokens).length
        }
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    if (!SUPABASE_URL || !SERVICE_KEY || Object.keys(tokens).length === 0) {
      return res.status(500).json({ error: 'Server not configured (missing env vars)' })
    }

    // Accept fields from a JSON/form body, OR a plain-text body with app/title/text
    // on separate lines (the most reliable from phone tools that don't URL-encode).
    const q = (req.query || {}) as Record<string, any>
    let app = '', title = '', text = '', bodySecret: any
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body

    if (raw && typeof raw === 'object') {
      app = str(raw.app); title = str(raw.title); text = str(raw.text); bodySecret = raw.secret
    } else if (typeof raw === 'string') {
      const j = raw.trim().startsWith('{') ? safeJson(raw) : null
      if (j && typeof j === 'object') {
        app = str(j.app); title = str(j.title); text = str(j.text); bodySecret = j.secret
      } else {
        const lines = raw.split(/\r?\n/)
        app = (lines[0] || '').trim()
        title = (lines[1] || '').trim()
        text = lines.slice(2).join('\n').trim()
      }
    }

    const provided = firstStr(req.headers['x-ingest-secret']) || str(q.secret) || str(bodySecret)
    const userId = provided ? tokens[provided] : undefined
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    if (!text.trim()) return res.status(400).json({ error: 'Missing text' })

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // The capture rules live on the account, so two phones can be treated differently
    // (one splits joint Revolut charges, the other doesn't; one ignores PayPal...).
    const rules = await loadRules(supabase, userId)

    const parsed = parseNotification(text, title || undefined, app || undefined, rules)

    // Skip non-payment notifications (Revolut rewards/referrals, login alerts, ...).
    if (!parsed.isPayment) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'not a payment notification' })
    }

    // Sources the account switched off never reach "Da confermare".
    if (parsed.source !== 'unknown' && rules.sources[parsed.source] === false) {
      return res.status(200).json({ ok: true, skipped: true, reason: `source '${parsed.source}' disabled for this account` })
    }

    const amount = parsed.amount != null && parsed.amount > 0 ? parsed.amount : 0

    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const id = `cap_${now}_${Math.random().toString(36).slice(2, 8)}`

    const draft = {
      id,
      // The SMS alert states a full date; every other source only has the receipt time.
      date: parsed.occurredAt || today,
      type: 'expense',
      amount,
      // No category: the app maps `capturedTag` onto its own taxonomy.
      capturedTag: parsed.tag,
      description: parsed.merchant || '',
      capturedMerchant: parsed.merchant || undefined,
      draft: true,
      source: parsed.source,
      possibleDuplicate: false,
      possibleDeposit: parsed.possibleDeposit || undefined,
      createdAt: now,
      updatedAt: now
    }

    const { error } = await supabase.from('records').insert({
      user_id: userId,
      collection: 'transactions',
      id,
      data: draft,
      updated_at: now,
      deleted: false
    })
    if (error) return res.status(500).json({ error: 'DB insert failed', detail: error.message })

    return res.status(200).json({
      ok: true,
      amount,
      merchant: parsed.merchant,
      source: parsed.source,
      tag: parsed.tag,
      halved: parsed.halved,
      possibleDeposit: parsed.possibleDeposit
    })
  } catch (err: any) {
    return res.status(500).json({ error: 'Unhandled', message: err?.message || String(err) })
  }
}

// --- Token map ---------------------------------------------------------------

// INGEST_TOKENS accepts either JSON ({"secret":"uuid"}) or a compact
// "secret:uuid,secret:uuid" list, so it can be pasted into Vercel without quoting pain.
function parseTokens(rawTokens?: string, legacySecret?: string, legacyUser?: string): Record<string, string> {
  const out: Record<string, string> = {}
  const raw = (rawTokens || '').trim()
  if (raw.startsWith('{')) {
    const parsed = safeJson(raw)
    if (parsed && typeof parsed === 'object') {
      for (const [secret, user] of Object.entries(parsed)) {
        if (secret && typeof user === 'string' && user) out[secret] = user
      }
    }
  } else if (raw) {
    for (const pair of raw.split(',')) {
      const idx = pair.indexOf(':')
      if (idx <= 0) continue
      const secret = pair.slice(0, idx).trim()
      const user = pair.slice(idx + 1).trim()
      if (secret && user) out[secret] = user
    }
  }
  if (legacySecret && legacyUser) out[legacySecret] = legacyUser
  return out
}

async function loadRules(supabase: SupabaseClient, userId: string): Promise<CaptureRules> {
  try {
    const { data } = await supabase
      .from('records')
      .select('data')
      .eq('user_id', userId)
      .eq('collection', 'settings')
      .eq('id', 'user-settings')
      .maybeSingle()
    const capture = data?.data?.capture
    if (!capture) return FALLBACK_RULES
    return {
      sources: { ...FALLBACK_RULES.sources, ...(capture.sources || {}) },
      revolutSplit: capture.revolutSplit ?? FALLBACK_RULES.revolutSplit,
      paypalDuplicateWarning: capture.paypalDuplicateWarning ?? FALLBACK_RULES.paypalDuplicateWarning,
      depositAmounts: Array.isArray(capture.depositAmounts) ? capture.depositAmounts : FALLBACK_RULES.depositAmounts
    }
  } catch {
    // A settings row that hasn't synced yet must not stop capture.
    return FALLBACK_RULES
  }
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return {} }
}

function str(v: any): string {
  return v == null ? '' : String(v)
}

function firstStr(v: any): string {
  return Array.isArray(v) ? String(v[0] ?? '') : v == null ? '' : String(v)
}

// ---- Inlined compact parser (kept in sync with src/lib/notificationParser.ts) ----

interface ParsedExpense {
  source: Source
  isPayment: boolean
  amount: number | null
  rawAmount: number | null
  merchant: string | null
  joint: boolean
  halved: boolean
  possibleDeposit: boolean
  occurredAt?: string
  tag?: MerchantTag
}

// Revolut names the account in the title, in the phone's own language: "Joint · Tamoil"
// on an English phone, "Conto cointestato · Google Play" on an Italian one. Requiring the
// separator keeps a merchant that merely starts with the word from being halved.
const SHARED_ACCOUNT_PREFIX = /^\s*(?:conto\s+)?(?:joint|shared|condivis\w*|cointestat\w*)\s*[·•|:-]/i

function isJointTitle(title?: string): boolean {
  return SHARED_ACCOUNT_PREFIX.test(title || '')
}

// "18/08/2026" -> "2026-08-18"
function parseSlashDate(dd: string, mm: string, yyyy: string): string | null {
  const day = parseInt(dd, 10), month = parseInt(mm, 10), year = parseInt(yyyy, 10)
  if (!day || !month || day > 31 || month > 12 || year < 2000 || year > 2100) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// The card SMS alert arrives through a messaging app, which sees every other message too.
// An unrecognised notification from one is never a payment.
const MESSAGING_APPS = /messag|messenger|\bsms\b|\bmms\b|whatsapp|telegram|signal|textra|mensajes|chat/i

function cleanMerchantTitle(title: string): string {
  return title
    .replace(
      /^\s*(?:conto\s+)?(?:joint|shared|current|personal\w*|condivis\w*|cointestat\w*|conto\w*)\s*[·•|:-]\s*/i,
      ''
    )
    .trim()
}

function parseItalianAmount(s: string): number | null {
  const cleaned = s.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseAmountFlexible(s: string): number | null {
  const d = s.replace(/[^\d.,]/g, '')
  if (!d) return null
  const lc = d.lastIndexOf(','), ld = d.lastIndexOf('.')
  let n: string
  if (lc > -1 && ld > -1) n = lc > ld ? d.replace(/\./g, '').replace(',', '.') : d.replace(/,/g, '')
  else if (lc > -1) n = /,\d{2}$/.test(d) ? d.replace(',', '.') : d.replace(/,/g, '')
  else if (ld > -1) n = /\.\d{2}$/.test(d) ? d : d.replace(/\./g, '')
  else n = d
  const v = parseFloat(n)
  return Number.isFinite(v) ? v : null
}

function isDepositAmount(amount: number | null, depositAmounts: number[]): boolean {
  if (amount == null) return false
  const cents = Math.round(amount * 100)
  return depositAmounts.some((d) => Math.round(d * 100) === cents)
}

const TAG_KEYWORDS: { m: RegExp; t: MerchantTag }[] = [
  { m: /google|youtube premium|netflix|spotify|icloud|apple\.com\/bill|disney\+|prime video/i, t: 'subscription' },
  { m: /lidl|\bpam\b|aldi|coop|cadoro|ca'?\s?d'?oro|esselunga|conad|carrefour|eurospin|\bmd\b|penny|despar|alì|supermerc/i, t: 'groceries' },
  { m: /\bq8\b|\beni\b|\bip\b|tamoil|esso|agip|benzin|carburant|distributor|petrol|shell/i, t: 'fuel' },
  { m: /telepass|autostrad|pedagg/i, t: 'toll' },
  { m: /trenitalia|italo|\bgtt\b|atac|\bbus\b|metro|actv|trenord|flixbus/i, t: 'transport' },
  { m: /glovo|deliveroo|just\s?eat|uber eats/i, t: 'delivery' },
  { m: /pizz|ristorant|osteria|trattoria|sushi|hamburg|mcdonald|burger king|\bkfc\b/i, t: 'restaurant' },
  { m: /\bbar\b|caffe|caffè|pasticc|gelat/i, t: 'bar' },
  { m: /farmac|parafarm/i, t: 'pharmacy' },
  { m: /poliambulator|dentist|studio medico|analisi clinic|ottic/i, t: 'health' },
  { m: /parrucch|estetist|barbier|profumeri|douglas|sephora|kiko/i, t: 'beauty' },
  { m: /arcaplanet|zooplus|veterinar|maxi\s?zoo/i, t: 'pets' },
  { m: /ikea|leroy merlin|brico|obi\b|maison/i, t: 'home' },
  { m: /zalando|zara|h&m|\bovs\b|decathlon|primark|calzedonia/i, t: 'clothing' },
  { m: /cinema|teatro|ticketone|steam|nintendo|playstation/i, t: 'leisure' },
  { m: /amazon/i, t: 'leisure' }
]

function guessTag(merchant: string | null): MerchantTag | undefined {
  if (!merchant) return undefined
  for (const r of TAG_KEYWORDS) if (r.m.test(merchant)) return r.t
  return undefined
}

function detectSource(text: string, appHint?: string, title?: string): Source {
  const h = (appHint || '').toLowerCase()
  if (h.includes('intesa') || h.includes('sanpaolo')) return 'intesa'
  if (h.includes('revolut')) return 'revolut'
  if (h.includes('paypal')) return 'paypal'
  if (h.includes('satispay')) return 'satispay'
  if ((title || '').toLowerCase().includes('youalert')) return 'youalert'
  const t = text.toLowerCase()
  if (t.includes('youalert')) return 'youalert'
  if (/autorizzat\w*\s+pagament\w*\s+di\s+[\d.,]+\s*(?:euro|eur|€)/i.test(text)) return 'youalert'
  if (t.includes('revolut')) return 'revolut'
  if (t.includes('paypal')) return 'paypal'
  if (t.includes('satispay')) return 'satispay'
  if (t.includes('hai pagato') && t.includes('con la carta')) return 'intesa'
  return 'unknown'
}

function firstAmount(text: string): number | null {
  for (const line of text.split('\n')) {
    const m = line.match(/(?:€|EUR|\$|£)\s*([\d.,]+)|([\d.,]+)\s*(?:€|EUR)/i)
    if (m) return parseAmountFlexible(m[1] || m[2])
  }
  return null
}

function parseNotification(text: string, title: string | undefined, appHint: string | undefined, rules: CaptureRules): ParsedExpense {
  const source = detectSource(text, appHint, title)
  const out: ParsedExpense = { source, isPayment: false, amount: null, rawAmount: null, merchant: null, joint: false, halved: false, possibleDeposit: false }

  const finish = (): ParsedExpense => {
    out.tag = guessTag(out.merchant)
    // Check the amount as it was read too: a hold on a joint Revolut card is halved
    // before it gets here, so only the raw figure still matches the known amount.
    if (
      out.isPayment &&
      (isDepositAmount(out.amount, rules.depositAmounts) || isDepositAmount(out.rawAmount, rules.depositAmounts))
    ) {
      out.possibleDeposit = true
    }
    return out
  }

  if (source === 'intesa') {
    const m = text.match(
      /Hai pagato\s+([\d.]*\d,\d{2})\s*€\s+con la carta\s+\*?(\d+)\s+il\s+\d{1,2}\.\d{1,2}\s+alle ore\s+\d{1,2}:\d{2}\s+da\s+(.+?)\.?\s*$/i
    )
    if (m) {
      out.amount = out.rawAmount = parseItalianAmount(m[1])
      out.merchant = m[3].trim()
      out.isPayment = out.amount != null
    }
    return finish()
  }

  if (source === 'paypal') {
    const m = text.match(/Hai (?:inviato|pagato)\s+([\d.]*\d,\d{2})\s*€(?:\s*EUR)?\s+a\s+(.+?)[.\n]?\s*$/i)
    if (m) { out.amount = parseItalianAmount(m[1]); out.merchant = m[2].trim() }
    else { out.amount = firstAmount(text); out.merchant = title || null }
    out.rawAmount = out.amount
    out.isPayment = out.amount != null
    return finish()
  }

  if (source === 'satispay') {
    const titleMerchant = cleanMerchantTitle(title || '')
    const m =
      text.match(/Hai (?:pagato|inviato)\s+([\d.]*\d,\d{2})\s*€\s+a\s+(.+?)[.\n]?\s*$/i) ||
      text.match(/Pagament\w*\s+(?:di\s+)?([\d.]*\d,\d{2})\s*€\s+(?:a|presso|da)\s+(.+?)[.\n]?\s*$/i)
    if (m) { out.amount = parseItalianAmount(m[1]); out.merchant = titleMerchant || m[2].trim() }
    else { out.amount = firstAmount(text); out.merchant = titleMerchant || null }
    out.rawAmount = out.amount
    out.isPayment = out.amount != null
    return finish()
  }

  if (source === 'youalert') {
    // Autorizzato pagamento di 54,48 Euro - AURORA PAESTUM ITALY(Via Dante Alighi
    // con KDue Black n.: *5069 Data: 18/08/2026 Ora: 13:02 Saldo disponibile: +867,66 Euro
    //
    // Anchored on the wording on purpose: this source shares the inbox with every other
    // SMS, and the trailing "Saldo disponibile" carries an amount that is not the payment.
    const m = text.match(
      /Autorizzat\w*\s+pagament\w*\s+di\s+([\d.]*\d,\d{2})\s*(?:Euro|EUR|€)\s*[-–—]\s*(.+?)\s*(?=\(|\s+con\s+\w|\s*n\.\s*:|\s*Data\s*:|$)/i
    )
    if (m) {
      out.amount = out.rawAmount = parseItalianAmount(m[1])
      out.merchant = m[2].trim() || null
      out.isPayment = out.amount != null
      const date = text.match(/Data\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i)
      if (date) out.occurredAt = parseSlashDate(date[1], date[2], date[3]) ?? undefined
    }
    return finish() // any other SMS from this sender is not a payment
  }

  if (source === 'revolut') {
    const titleMerchant = cleanMerchantTitle(title || '')
    out.joint = isJointTitle(title)
    let raw: number | null = null
    out.merchant = titleMerchant || null
    const atLine = text.match(
      /(?:Paid|Spent|Pagato|Speso|Hai speso|Hai pagato)\s+[^\d-]*([\d.,]+)\s*(?:at|a|da|presso)\s+(.+?)\s*$/im
    )
    if (atLine) {
      raw = parseAmountFlexible(atLine[1])
      out.merchant = titleMerchant || atLine[2].trim()
    } else {
      // Every Revolut body carries a balance too ("Saldo del Pocket EUR: 88,82 €"), so
      // each pattern anchors on a spending word — none takes "the first number".
      const spent =
        text.match(/(?:spesa|pagamento|addebito)\s+di\s+([\d.,]+)\s*(?:€|EUR|\$|£)?/i) ||
        text.match(/(?:€|\$|£)\s*([\d.,]+)\s*(?:spent|speso|paid|pagat\w*)/i) ||
        text.match(/([\d.,]+)\s*(?:€|\$|£)?\s*(?:spent|speso)/i) ||
        text.match(/(?:spent|speso|paid|pagat\w*)\s*(?:€|\$|£)?\s*([\d.,]+)/i)
      if (spent) raw = parseAmountFlexible(spent[1])
    }
    out.rawAmount = raw
    if (raw != null) {
      const split = rules.revolutSplit === 'always' || (rules.revolutSplit === 'joint-only' && out.joint)
      out.amount = split ? Math.round((raw / 2) * 100) / 100 : raw
      out.halved = split
      out.isPayment = true
    }
    return finish()
  }

  if (MESSAGING_APPS.test(appHint || '')) return finish()
  out.amount = out.rawAmount = firstAmount(text)
  out.merchant = title || null
  out.isPayment = out.amount != null
  return finish()
}
