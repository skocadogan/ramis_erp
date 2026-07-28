import api from "@/lib/api"
import { resolveMediaUrl } from "@/lib/mediaUrl"
import type { Category, Product } from "@/types/pos"

/** Backend `MenuCatalogPagination.max_page_size` ile uyumlu. */
export const MENU_CATALOG_PAGE_SIZE = 500
const MAX_PAGES = 100

type Paginated<T> = {
  count?: number
  next?: string | null
  previous?: string | null
  results?: T[]
}

function normalizePosProduct(product: Product): Product {
  return {
    ...product,
    image: resolveMediaUrl(product.image),
  }
}

/**
 * DRF sayfalı yanıtı (veya düz dizi) bitene kadar çeker.
 * Tek sayfa tavanı (500) yüzünden kesilen katalogları tamamlar.
 */
async function fetchAllPages<T>(
  path: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  const out: T[] = []
  let page = 1
  for (;;) {
    const { data } = await api.get<T[] | Paginated<T>>(path, {
      params: { ...params, page, page_size: MENU_CATALOG_PAGE_SIZE },
    })
    if (Array.isArray(data)) {
      out.push(...data)
      break
    }
    const chunk = data.results ?? []
    out.push(...chunk)
    if (!data.next || chunk.length === 0) break
    page += 1
    if (page > MAX_PAGES) break
  }
  return out
}

export async function fetchAllPosProducts(branchId: string): Promise<Product[]> {
  const raw = await fetchAllPages<Product>("/menu/products/", {
    branch_id: branchId,
    is_active: true,
    show_on_pos: true,
  })
  return raw.map(normalizePosProduct)
}

export async function fetchAllPosCategories(branchId: string): Promise<Category[]> {
  return fetchAllPages<Category>("/menu/categories/", {
    branch_id: branchId,
  })
}
