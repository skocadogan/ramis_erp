import type { Category, Product } from "@/types/pos"

const POS_FEATURED_CATEGORY = "FEATURED" as const

function hasFeaturedPosProducts(products: Product[]): boolean {
  return products.some((p) => p.is_featured && p.show_on_pos !== false)
}

function getAllDescendantIds(catId: string, categories: Category[]): Set<string> {
  const ids = new Set<string>([catId])
  for (const c of categories) {
    if (c.parent === catId) {
      const childIds = getAllDescendantIds(c.id, categories)
      childIds.forEach((id) => ids.add(id))
    }
  }
  return ids
}

/** Üst kategorileri sıra numarasına göre sıralar. */
function sortedRootCategories(categories: Category[]): Category[] {
  return categories
    .filter((c) => !c.parent)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
}

/** POS'ta görünür ürün barındıran üst kategoriler. */
function parentsWithPosProducts(categories: Category[], products: Product[]): Category[] {
  return sortedRootCategories(categories).filter((parent) => {
    const descendantIds = getAllDescendantIds(parent.id, categories)
    return products.some((p) => descendantIds.has(p.category) && p.show_on_pos !== false)
  })
}

/**
 * POS menüsü açılış varsayılanı:
 * 1) Öne çıkan ürün varsa FEATURED
 * 2) Yoksa sıra numarası 0 olan üst kategori (yoksa en düşük sıralı ürünlü üst kategori)
 */
export function resolveDefaultPosCategory(
  categories: Category[],
  products: Product[],
): string | null {
  if (hasFeaturedPosProducts(products)) {
    return POS_FEATURED_CATEGORY
  }

  const parents = parentsWithPosProducts(categories, products)
  if (!parents.length) return null

  const orderZero = parents.find((c) => c.order === 0)
  return (orderZero ?? parents[0]).id
}

export function isValidPosCategorySelection(
  selected: string | null,
  categories: Category[],
  products: Product[],
): boolean {
  if (!selected) return false
  if (selected === POS_FEATURED_CATEGORY) return hasFeaturedPosProducts(products)
  return categories.some((c) => c.id === selected)
}
