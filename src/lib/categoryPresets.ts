// The concrete category sets an account can start from. A set is plain data: it is
// copied into the user's settings at first login, after which they own it and can edit
// it freely (which flips `categorySetId` to 'custom').
//
// Adding a new set here is all it takes to onboard someone who budgets differently —
// nothing in the UI hard-codes a category name.

import type { CategoryDef, CategorySet, MerchantTag, PrimaryCategory } from '@/types'

interface TagMapping {
  primaryCategory: PrimaryCategory
  secondaryCategory?: string
}

// --- Daniele: 12 broad categories, each with subcategories -------------------

const DANIELE_CATEGORIES: CategoryDef[] = [
  { name: 'Housing', icon: '🏠', color: '#3b82f6', subcategories: ['Rent', 'Internet', 'Decor', 'Trash', 'Electricity', 'Phone', 'OtherHousing'] },
  { name: 'Health', icon: '💊', color: '#ef4444', subcategories: ['Doctors', 'Psi', 'Sport', 'Gym', 'Medicines', 'OtherHealth'] },
  { name: 'Groceries', icon: '🛒', color: '#22c55e', subcategories: ['Lidl', 'Pam', 'Aldi', 'Coop', 'Cadoro', 'OtherGroceries'] },
  { name: 'Transport', icon: '🚗', color: '#f59e0b', subcategories: ['Train', 'Bus', 'Car', 'Telepass', 'Fuel', 'OtherTransport'] },
  { name: 'Out', icon: '🍽️', color: '#ec4899', subcategories: ['Bar', 'Restaurants', 'Pizza', 'FoodDelivery', 'OtherOut'] },
  { name: 'Travel', icon: '✈️', color: '#8b5cf6', subcategories: ['Rome', 'Edinburgh', 'Lubiana', 'Miami', 'OtherTravel'] },
  { name: 'Subscription', icon: '📱', color: '#06b6d4', subcategories: ['Spotify', 'Netflix', 'Google', 'OtherSubscription'] },
  { name: 'Clothing', icon: '👕', color: '#f97316', subcategories: ['Pants', 'Shoes', 'OtherClothing'] },
  { name: 'Leisure', icon: '🎮', color: '#84cc16', subcategories: ['Magic', 'Music', 'Networking', 'Tech', 'OtherLeisure'] },
  { name: 'Gifts', icon: '🎁', color: '#d946ef', subcategories: ['Birthdays', 'OtherGifts'] },
  { name: 'Fees', icon: '🏦', color: '#64748b', subcategories: ['Banks', 'OtherFees'] },
  { name: 'OtherExpenses', icon: '📦', color: '#94a3b8', subcategories: ['Miscellaneous'] }
]

const DANIELE_TAGS: Record<MerchantTag, TagMapping> = {
  groceries: { primaryCategory: 'Groceries' },
  fuel: { primaryCategory: 'Transport', secondaryCategory: 'Fuel' },
  transport: { primaryCategory: 'Transport' },
  toll: { primaryCategory: 'Transport', secondaryCategory: 'Telepass' },
  restaurant: { primaryCategory: 'Out', secondaryCategory: 'Restaurants' },
  bar: { primaryCategory: 'Out', secondaryCategory: 'Bar' },
  delivery: { primaryCategory: 'Out', secondaryCategory: 'FoodDelivery' },
  pharmacy: { primaryCategory: 'Health', secondaryCategory: 'Medicines' },
  health: { primaryCategory: 'Health' },
  subscription: { primaryCategory: 'Subscription' },
  clothing: { primaryCategory: 'Clothing' },
  beauty: { primaryCategory: 'Health' },
  pets: { primaryCategory: 'OtherExpenses' },
  home: { primaryCategory: 'Housing' },
  leisure: { primaryCategory: 'Leisure' },
  travel: { primaryCategory: 'Travel' },
  gift: { primaryCategory: 'Gifts' },
  phone: { primaryCategory: 'Housing', secondaryCategory: 'Phone' },
  sport: { primaryCategory: 'Health', secondaryCategory: 'Sport' }
}

// --- Marta: 32 flat categories, no subcategories -----------------------------

const MARTA_CATEGORIES: CategoryDef[] = [
  { name: 'Abbigliamento', icon: '👕', color: '#f97316', subcategories: [] },
  { name: 'Affitto / Spese', icon: '🏠', color: '#3b82f6', subcategories: [] },
  { name: 'Alimentari', icon: '🛒', color: '#22c55e', subcategories: [] },
  { name: 'Animali', icon: '🐾', color: '#a855f7', subcategories: [] },
  { name: 'Auto', icon: '🚗', color: '#ef4444', subcategories: [] },
  { name: 'Benzina', icon: '⛽', color: '#f59e0b', subcategories: [] },
  { name: 'Cancelleria / Cartoleria', icon: '✏️', color: '#64748b', subcategories: [] },
  { name: 'Casalinghi', icon: '🧼', color: '#06b6d4', subcategories: [] },
  { name: 'Concerti', icon: '🎫', color: '#8b5cf6', subcategories: [] },
  { name: 'Cosmetici / Profumi / Bijoux', icon: '💄', color: '#ec4899', subcategories: [] },
  { name: 'Coworking', icon: '🏢', color: '#6366f1', subcategories: [] },
  { name: 'Detersivi / CI / Assorbenti', icon: '🧴', color: '#14b8a6', subcategories: [] },
  { name: 'Divertimenti vari', icon: '🎮', color: '#84cc16', subcategories: [] },
  { name: 'Elettrodomestici / Riparazioni', icon: '🔌', color: '#78716c', subcategories: [] },
  { name: 'Enti benefici', icon: '🤝', color: '#10b981', subcategories: [] },
  { name: 'Fiori / Piante / Giardino', icon: '🌻', color: '#65a30d', subcategories: [] },
  { name: 'Investimenti', icon: '📈', color: '#0ea5e9', subcategories: [] },
  { name: 'Inviti / Cerimonie', icon: '💌', color: '#d946ef', subcategories: [] },
  { name: 'Lavasecco / Pulitura', icon: '👔', color: '#94a3b8', subcategories: [] },
  { name: 'Libri / Film / Musica', icon: '📚', color: '#a3e635', subcategories: [] },
  { name: 'Medicinali / Erboristeria', icon: '💊', color: '#ef4444', subcategories: [] },
  { name: 'Oreficeria / Orologeria / Ottica', icon: '💎', color: '#fbbf24', subcategories: [] },
  { name: 'Parrucchiera / Estetista', icon: '💇', color: '#f472b6', subcategories: [] },
  { name: 'Regali', icon: '🎁', color: '#c084fc', subcategories: [] },
  { name: 'Ristorante / Aperitivo', icon: '🍹', color: '#fb923c', subcategories: [] },
  { name: 'Sport / Nuoto / Palestra', icon: '🏋️', color: '#38bdf8', subcategories: [] },
  { name: 'Tasse / Ticket / Asporto Rifiuti', icon: '🧾', color: '#9ca3af', subcategories: [] },
  { name: 'Telefonia cellulare', icon: '📱', color: '#818cf8', subcategories: [] },
  { name: 'Utensili / Ricambi', icon: '🔧', color: '#a1a1aa', subcategories: [] },
  { name: 'Varie / Altre', icon: '📦', color: '#cbd5e1', subcategories: [] },
  { name: 'Viaggi / Ferie / Pedaggi', icon: '✈️', color: '#60a5fa', subcategories: [] },
  { name: 'Visite e spese mediche', icon: '🏥', color: '#f87171', subcategories: [] }
]

const MARTA_TAGS: Record<MerchantTag, TagMapping> = {
  groceries: { primaryCategory: 'Alimentari' },
  fuel: { primaryCategory: 'Benzina' },
  transport: { primaryCategory: 'Viaggi / Ferie / Pedaggi' },
  toll: { primaryCategory: 'Viaggi / Ferie / Pedaggi' },
  restaurant: { primaryCategory: 'Ristorante / Aperitivo' },
  bar: { primaryCategory: 'Ristorante / Aperitivo' },
  delivery: { primaryCategory: 'Ristorante / Aperitivo' },
  pharmacy: { primaryCategory: 'Medicinali / Erboristeria' },
  health: { primaryCategory: 'Visite e spese mediche' },
  subscription: { primaryCategory: 'Libri / Film / Musica' },
  clothing: { primaryCategory: 'Abbigliamento' },
  beauty: { primaryCategory: 'Cosmetici / Profumi / Bijoux' },
  pets: { primaryCategory: 'Animali' },
  home: { primaryCategory: 'Affitto / Spese' },
  leisure: { primaryCategory: 'Divertimenti vari' },
  travel: { primaryCategory: 'Viaggi / Ferie / Pedaggi' },
  gift: { primaryCategory: 'Regali' },
  phone: { primaryCategory: 'Telefonia cellulare' },
  sport: { primaryCategory: 'Sport / Nuoto / Palestra' }
}

// --- Registry ----------------------------------------------------------------

export const CATEGORY_SETS: CategorySet[] = [
  {
    id: 'daniele',
    label: 'Categorie ampie + sottocategorie',
    description: '12 categorie principali (Groceries, Transport, Out…) ognuna con le sue sottocategorie. Più sintetica da leggere, più precisa da compilare.',
    categories: DANIELE_CATEGORIES
  },
  {
    id: 'marta',
    label: 'Categorie dettagliate',
    description: '32 categorie specifiche (Alimentari, Benzina, Parrucchiera…) senza sottocategorie. Un solo livello, si sceglie e si va.',
    categories: MARTA_CATEGORIES
  }
]

export const DEFAULT_CATEGORY_SET_ID = 'daniele'

const TAG_MAPS: Record<string, Record<MerchantTag, TagMapping>> = {
  daniele: DANIELE_TAGS,
  marta: MARTA_TAGS
}

export function getCategorySet(id: string): CategorySet {
  return CATEGORY_SETS.find((s) => s.id === id) ?? CATEGORY_SETS[0]
}

// Resolve a parser tag into a category of the given set. Returns null when the set has
// no mapping (a custom set), leaving the draft uncategorised rather than guessing wrong.
export function resolveTag(
  setId: string,
  tag: MerchantTag | undefined,
  categories: CategoryDef[]
): TagMapping | null {
  if (!tag) return null
  const map = TAG_MAPS[setId]
  if (!map) return null
  const mapping = map[tag]
  if (!mapping) return null
  // The user may have renamed or deleted the target category — only use it if it exists.
  const category = categories.find((c) => c.name === mapping.primaryCategory)
  if (!category) return null
  const secondaryCategory =
    mapping.secondaryCategory && category.subcategories.includes(mapping.secondaryCategory)
      ? mapping.secondaryCategory
      : undefined
  return { primaryCategory: mapping.primaryCategory, secondaryCategory }
}

// --- Pure lookups (safe to call from the store; no React, no store import) ----

const FALLBACK_ICON = '📦'
const FALLBACK_COLOR = '#94a3b8'

export function iconOf(categories: CategoryDef[], name: PrimaryCategory | undefined): string {
  if (!name) return FALLBACK_ICON
  return categories.find((c) => c.name === name)?.icon ?? FALLBACK_ICON
}

export function colorOf(categories: CategoryDef[], name: PrimaryCategory | undefined): string {
  if (!name) return FALLBACK_COLOR
  return categories.find((c) => c.name === name)?.color ?? FALLBACK_COLOR
}
