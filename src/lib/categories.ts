// Reactive access to the account's own category taxonomy.
//
// Everything the UI needs to draw a category — the list, its icon, its chart colour —
// comes from here rather than from a compile-time constant, so two accounts on the same
// deployment can budget with completely different categories.
//
// This module imports the store (never the other way round); the pure lookups live in
// `@/lib/categoryPresets` so the store can use them without a cycle.

import { useStore } from '@/store/useStore'
import { colorOf, iconOf } from '@/lib/categoryPresets'
import type { CategoryDef, PrimaryCategory } from '@/types'

export { iconOf, colorOf }

export interface CategoriesApi {
  /** The account's categories, in display order. */
  categories: CategoryDef[]
  /** Just the names — the common case for a <Select> or a totals map. */
  names: PrimaryCategory[]
  /** False only mid-onboarding, before a category set has been chosen. */
  ready: boolean
  icon: (name: PrimaryCategory | undefined) => string
  color: (name: PrimaryCategory | undefined) => string
  /** Whether this account uses a second level at all — drives hiding the sub-field. */
  hasSubcategories: boolean
}

export function useCategories(): CategoriesApi {
  const categories = useStore((s) => s.settings.categories)
  const list = categories ?? []
  return {
    categories: list,
    names: list.map((c) => c.name),
    ready: list.length > 0,
    icon: (name) => iconOf(list, name),
    color: (name) => colorOf(list, name),
    hasSubcategories: list.some((c) => c.subcategories.length > 0)
  }
}
