import type { RecipeMenuItem } from "../types"

/** Reçete formunda menü ürünü seçiminde listelenecek ürünler. */
export function filterSelectableMenuProducts(
  products: RecipeMenuItem[],
  selectedBranchIds: string[],
  currentProductId?: string,
): RecipeMenuItem[] {
  return products.filter((product) => {
    const productBranches = product.branches ?? []
    if (productBranches.length === 0) return false

    if (currentProductId && product.id === currentProductId) return true

    if (selectedBranchIds.length === 0) return true

    return selectedBranchIds.some((branchId) => productBranches.includes(branchId))
  })
}
