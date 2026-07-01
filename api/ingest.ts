// Vercel serverless function: receives a bank/payment notification forwarded from
// the phone, parses it into a draft expense, and writes it to Supabase for the
// single app user. The app then shows it under "Da confermare".
//
// Required Vercel environment variables (NOT prefixed with VITE_, so server-only):
//   INGEST_SECRET               a shared secret the phone must send
//   SUPABASE_URL                your project URL
//   SUPABASE_SERVICE_ROLE_KEY   service role key (bypasses RLS — server only!)
//   INGEST_USER_ID              your Supabase auth user id (Authentication → Users)
//
// Typed loosely (any) to avoid a build-time dependency on @vercel/node.

import { createClient } from '@supabase/supabase-js'
import { parseNotification } from '../src/lib/notificationParser'

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-ingest-secret')
    return res.status(204).end()
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const INGEST_SECRET = process.env.INGEST_SECRET
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const USER_ID = process.env.INGEST_USER_ID
  if (!INGEST_SECRET || !SUPABASE_URL || !SERVICE_KEY || !USER_ID) {
    return res.status(500).json({ error: 'Server not configured' })
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {}
  const provided = req.headers['x-ingest-secret'] || body.secret
  if (provided !== INGEST_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const text: string = body.text || ''
  if (!text.trim()) {
    return res.status(400).json({ error: 'Missing text' })
  }

  const parsed = parseNotification(text, { title: body.title, appHint: body.app })
  const amount = parsed.amount != null && parsed.amount > 0 ? parsed.amount : 0

  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const id = `cap_${now}_${Math.random().toString(36).slice(2, 8)}`

  const draft = {
    id,
    type: 'expense',
    date: today, // capture date (the parsed GG.MM can be ambiguous)
    amount,
    primaryCategory: parsed.guess?.primaryCategory,
    secondaryCategory: parsed.guess?.secondaryCategory,
    description: parsed.merchant || '',
    draft: true,
    source: parsed.source,
    possibleDuplicate: false, // the app flags duplicates dynamically on display
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

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({
    ok: true,
    amount,
    merchant: parsed.merchant,
    source: parsed.source,
    halved: parsed.halved
  })
}

function safeJson(s: string): any {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}
