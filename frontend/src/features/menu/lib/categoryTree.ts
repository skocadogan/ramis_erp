import type { Category } from "@/features/menu/types"

/** Verilen kategorinin tüm alt kategorilerinin ID'lerini recursive bulur. */
export function getDescendantIds(categories: Category[], parentId: string): string[] {
  const ids: string[] = []
  for (const child of categories.filter((c) => c.parent === parentId)) {
    ids.push(child.id)
    ids.push(...getDescendantIds(categories, child.id))
  }
  return ids
}
