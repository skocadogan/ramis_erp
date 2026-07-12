import type { Category, MenuCatalogSettings, MenuTag, Product } from "@/features/menu/types"

export const UNTAGGED_FILTER_VALUE = "__untagged__"
export const NO_TAG_FILTER_VALUE = "__none__"

function tagBranchId(tag: MenuTag): string | undefined {
  return tag.branch_id ?? tag.branch
}

function productTagsForBranch(product: Product, branchId: string | null): MenuTag[] {
  if (!branchId) return product.tags ?? []
  return (product.tags ?? []).filter((t) => tagBranchId(t) === branchId)
}

function categoryTagsForBranch(category: Category, branchId: string | null): MenuTag[] {
  if (!branchId) return category.tags ?? []
  return (category.tags ?? []).filter((t) => tagBranchId(t) === branchId)
}

function categoryAncestorIds(categoryId: string, categories: Category[]): string[] {
  const ids: string[] = []
  let current: string | null = categoryId
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    ids.push(current)
    const cat = categories.find((c) => c.id === current)
    current = cat?.parent ?? null
  }
  return ids
}

function categoriesWithTag(tagId: string, categories: Category[], branchId: string | null): Set<string> {
  const taggedRoots = new Set(
    categories
      .filter((c) => categoryTagsForBranch(c, branchId).some((t) => t.id === tagId))
      .map((c) => c.id),
  )
  const result = new Set(taggedRoots)
  const childrenMap = new Map<string, string[]>()
  for (const c of categories) {
    if (c.parent) {
      const list = childrenMap.get(c.parent) ?? []
      list.push(c.id)
      childrenMap.set(c.parent, list)
    }
  }
  const collect = (rootId: string) => {
    for (const childId of childrenMap.get(rootId) ?? []) {
      if (!result.has(childId)) {
        result.add(childId)
        collect(childId)
      }
    }
  }
  for (const rootId of taggedRoots) collect(rootId)
  return result
}

function categoryHasAnyTagForBranch(categoryId: string, categories: Category[], branchId: string | null): boolean {
  return categoryAncestorIds(categoryId, categories).some((cid) => {
    const cat = categories.find((c) => c.id === cid)
    return categoryTagsForBranch(cat!, branchId).length > 0
  })
}

export function isTagFilterActive(
  settings: MenuCatalogSettings | null,
  tags: MenuTag[],
  branchId: string | null,
): boolean {
  if (!branchId || !settings?.has_tags || tags.length === 0) return false
  return settings.filter_untagged || !!settings.active_tag_id
}

export function productMatchesActiveTag(
  product: Product,
  settings: MenuCatalogSettings | null,
  categories: Category[],
  tags: MenuTag[],
  branchId: string | null,
): boolean {
  if (!isTagFilterActive(settings, tags, branchId)) return true

  if (settings!.filter_untagged) {
    if (productTagsForBranch(product, branchId).length > 0) return false
    return !categoryHasAnyTagForBranch(product.category, categories, branchId)
  }

  const tagId = settings!.active_tag_id!
  return productTagsForBranch(product, branchId).some((t) => t.id === tagId)
}

function categoryMatchesActiveTag(
  category: Category,
  settings: MenuCatalogSettings | null,
  categories: Category[],
  tags: MenuTag[],
  branchId: string | null,
): boolean {
  if (!isTagFilterActive(settings, tags, branchId)) return true

  if (settings!.filter_untagged) {
    return !categoryAncestorIds(category.id, categories).some((cid) => {
      const cat = categories.find((c) => c.id === cid)
      return categoryTagsForBranch(cat!, branchId).length > 0
    })
  }

  const tagId = settings!.active_tag_id!
  const taggedCats = categoriesWithTag(tagId, categories, branchId)
  return categoryAncestorIds(category.id, categories).some((cid) => taggedCats.has(cid))
}

export function categoryVisibleInPanel(
  category: Category,
  products: Product[],
  settings: MenuCatalogSettings | null,
  categories: Category[],
  tags: MenuTag[],
  showAll: boolean,
  branchId: string | null,
): boolean {
  if (showAll || !isTagFilterActive(settings, tags, branchId)) return true
  if (categoryMatchesActiveTag(category, settings, categories, tags, branchId)) return true
  const collectDescendants = (catId: string): Set<string> => {
    const ids = new Set<string>([catId])
    for (const c of categories) {
      if (c.parent === catId) {
        for (const d of collectDescendants(c.id)) ids.add(d)
      }
    }
    return ids
  }
  const treeIds = collectDescendants(category.id)
  return products.some(
    (p) =>
      treeIds.has(p.category) &&
      productMatchesActiveTag(p, settings, categories, tags, branchId),
  )
}

export function effectiveMenuActive(
  product: Product,
  settings: MenuCatalogSettings | null,
  categories: Category[],
  tags: MenuTag[],
  branchId: string | null,
): boolean {
  if (!isTagFilterActive(settings, tags, branchId)) return product.is_active
  return productMatchesActiveTag(product, settings, categories, tags, branchId)
}

export function filterTagIdsForBranch(allTagIds: string[], branchTags: MenuTag[]): string[] {
  const branchIds = new Set(branchTags.map((t) => t.id))
  return allTagIds.filter((id) => branchIds.has(id))
}

export function mergeTagIdsForBranch(
  existingTags: MenuTag[],
  branchTags: MenuTag[],
  selectedBranchTagIds: string[],
): string[] {
  const branchIdSet = new Set(branchTags.map((t) => t.id))
  const otherBranchIds = existingTags
    .map((t) => t.id)
    .filter((id) => !branchIdSet.has(id))
  return [...otherBranchIds, ...selectedBranchTagIds]
}

export function getTagsForBranch(tags: MenuTag[] | undefined, branchId: string | null): MenuTag[] {
  if (!tags?.length) return []
  return branchId
    ? tags.filter((t) => tagBranchId(t) === branchId)
    : tags
}

export function formatTagsForBranch(tags: MenuTag[] | undefined, branchId: string | null): string {
  return getTagsForBranch(tags, branchId).map((t) => t.name).join(" · ")
}
