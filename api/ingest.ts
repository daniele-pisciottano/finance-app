// Vercel serverless function: receives a bank/payment notification forwarded from
// the phone, parses it into a draft expense, and writes it to Supabase for the
// single app user. The app then shows it under "Da confermare".
//
// This file is intentionally SELF-CONTAINED (no imports from ../src) so Vercel can
// bundle it reliably under "type": "module". The in-app paste box uses the canonical
// parser in src/lib/notificationParser.ts; keep the two in sync if a format changes.
//
// Required Vercel environment variables (NOT prefixed with VITE_, so server-only):
//   INGEST_SECRET               a shared secret the phone must send
//   SUPABASE_URL                your project URL
//   SUPABASE_SERVICE_ROLE_KEY   service role key (bypasses RLS — server only!)
//   INGEST_USER_ID              your Supabase auth user id (Authentication → Users)

import { createClient } from '@supabase/supabase-js'

export default async function handler(req: any, res: any) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-ingest-secret')

    if (req.method === 'OPTIONS') return res.status(204).end()

    const INGEST_SECRET = process.env.INGEST_SECRET
    const SUPABASE_URL = process.env.SUPABASE_URL
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    const USER_ID = process.env.INGEST_USER_ID

    // Health check: open the URL in a browser to see which env vars are configured.
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        env: {
          INGEST_SECRET: !!INGEST_SECRET,
          SUPABASE_URL: !!SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!SERVICE_KEY,
          INGEST_USER_ID: !!USER_ID
        }
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    if (!INGEST_SECRET || !SUPABASE_URL || !SERVICE_KEY || !USER_ID) {
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

    const provided = firstStr(req.headers['x-ingest-secret']) || q.secret || bodySecret
    if (provided !== INGEST_SECRET) return res.status(401).json({ error: 'Unauthorized' })

    if (!text.trim()) return res.status(400).json({ error: 'Missing text' })

    const parsed = parseNotification(text, title || undefined, app || undefined)
    const amount = parsed.amount != null && parsed.amount > 0 ? parsed.amount : 0

    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const id = `cap_${now}_${Math.random().toString(36).slice(2, 8)}`

    const draft = {
      id,
      type: 'expense',
      date: today,
      amount,
      primaryCategory: parsed.primaryCategory,
      secondaryCategory: parsed.secondaryCategory,
      description: parsed.merchant || '',
      draft: true,
      source: parsed.source,
      possibleDuplicate: false,
      createdAt: now,
      updatedAt: now
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const { error } = await supabase.from('records').insert({
      user_id: USER_ID,
      collection: 'transactions',
      id,
      data: draft,
      updated_at: now,
      deleted: false
    })
    if (error) return res.status(500).json({ error: 'DB insert failed', detail: error.message })

    return res.status(200).json({ ok: true, amount, merchant: parsed.merchant, source: parsed.source, halved: parsed.halved })
  } catch (err: any) {
    return res.status(500).json({ error: 'Unhandled', message: err?.message || String(err) })
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
  source: 'intesa' | 'revolut' | 'paypal' | 'unknown'
  amount: number | null
  merchant: string | null
  halved: boolean
  primaryCategory?: string
  secondaryCategory?: string
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

const CATEGORY_KEYWORDS: { m: RegExp; p: string; s?: string }[] = [
  { m: /google|youtube premium/i, p: 'Subscription', s: 'Google' },
  { m: /netflix/i, p: 'Subscription', s: 'Netflix' },
  { m: /spotify/i, p: 'Subscription', s: 'Spotify' },
  { m: /icloud|apple\.com\/bill/i, p: 'Subscription' },
  { m: /lidl/i, p: 'Groceries', s: 'Lidl' },
  { m: /\bpam\b/i, p: 'Groceries', s: 'Pam' },
  { m: /aldi/i, p: 'Groceries', s: 'Aldi' },
  { m: /coop/i, p: 'Groceries', s: 'Coop' },
  { m: /cadoro|ca'?\s?d'?oro/i, p: 'Groceries', s: 'Cadoro' },
  { m: /esselunga|conad|carrefour|eurospin|md\b|penny/i, p: 'Groceries' },
  { m: /trenitalia|italo|gtt|atac|bus|metro/i, p: 'Transport' },
  { m: /telepass/i, p: 'Transport', s: 'Telepass' },
  { m: /\bq8\b|eni|ip\b|tamoil|esso|benzin|carburant/i, p: 'Transport', s: 'Fuel' },
  { m: /pizz|ristorant|osteria|trattoria/i, p: 'Out', s: 'Restaurants' },
  { m: /\bbar\b|caffe|caffè/i, p: 'Out', s: 'Bar' },
  { m: /glovo|deliveroo|justeat|just eat|uber eats/i, p: 'Out', s: 'FoodDelivery' },
  { m: /farmac|parafarm/i, p: 'Health', s: 'Medicines' },
  { m: /amazon|zalando|zara|h&m/i, p: 'Clothing' }
]

function guessCategory(merchant: string | null): { primaryCategory?: string; secondaryCategory?: string } {
  if (!merchant) return {}
  for (const r of CATEGORY_KEYWORDS) if (r.m.test(merchant)) return { primaryCategory: r.p, secondaryCategory: r.s }
  return {}
}

function detectSource(text: string, appHint?: string): ParsedExpense['source'] {
  const h = (appHint || '').toLowerCase()
  if (h.includes('intesa') || h.includes('sanpaolo')) return 'intesa'
  if (h.includes('revolut')) return 'revolut'
  if (h.includes('paypal')) return 'paypal'
  const t = text.toLowerCase()
  if (t.includes('revolut')) return 'revolut'
  if (t.includes('paypal')) return 'paypal'
  if (t.includes('hai pagato') && t.includes('con la carta')) return 'intesa'
  return 'unknown'
}

function firstAmount(text: string, skip?: RegExp): number | null {
  for (const line of text.split('\n')) {
    if (skip && skip.test(line)) continue
    const m = line.match(/(?:€|EUR|\$|£)\s*([\d.,]+)|([\d.,]+)\s*(?:€|EUR)/i)
    if (m) return parseAmountFlexible(m[1] || m[2])
  }
  return null
}

function parseNotification(text: string, title?: string, appHint?: string): ParsedExpense {
  const source = detectSource(text, appHint)
  const out: ParsedExpense = { source, amount: null, merchant: null, halved: false }

  if (source === 'intesa') {
    const m = text.match(
      /Hai pagato\s+([\d.]*\d,\d{2})\s*€\s+con la carta\s+\*?(\d+)\s+il\s+\d{1,2}\.\d{1,2}\s+alle ore\s+\d{1,2}:\d{2}\s+da\s+(.+?)\.?\s*$/i
    )
    if (m) {
      out.amount = parseItalianAmount(m[1])
      out.merchant = m[3].trim()
      Object.assign(out, guessCategory(out.merchant))
      return out
    }
  }

  if (source === 'paypal') {
    const m = text.match(/Hai (?:inviato|pagato)\s+([\d.]*\d,\d{2})\s*€(?:\s*EUR)?\s+a\s+(.+?)[.\n]?\s*$/i)
    if (m) { out.amount = parseItalianAmount(m[1]); out.merchant = m[2].trim() }
    else { out.amount = firstAmount(text); out.merchant = title || null }
    Object.assign(out, guessCategory(out.merchant))
    return out
  }

  if (source === 'revolut') {
    const line = text.match(
      /(?:Paid|Spent|Pagato|Speso|Hai speso|Hai pagato)\s+[^\d-]*([\d.,]+)\s*(?:at|a|da|presso)\s+(.+?)\s*$/im
    )
    let raw: number | null
    if (line) { raw = parseAmountFlexible(line[1]); out.merchant = title || line[2].trim() }
    else { raw = firstAmount(text, /balance|saldo/i); out.merchant = title || null }
    if (raw != null) { out.amount = Math.round((raw / 2) * 100) / 100; out.halved = true }
    Object.assign(out, guessCategory(out.merchant))
    return out
  }

  out.amount = firstAmount(text)
  out.merchant = title || null
  Object.assign(out, guessCategory(out.merchant))
  return out
}
