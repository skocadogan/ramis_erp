// ============================================================
// Smart Table — Menu Service
// API calls for categories and products
// ============================================================

import { api, PaginatedResponse } from "./api";
import { ApiCategory, ApiProduct, mapCategory, mapProduct } from "./mappers";
import type { Category, Product } from "@/types";

// ─── Categories ─────────────────────────────────────────────

export async function fetchCategories(params?: {
  branch_id?: string;
}): Promise<Category[]> {
  const queryParams: Record<string, string | number> = {
    page_size: 500,
  };
  if (params?.branch_id) {
    queryParams.branch_id = params.branch_id;
  }

  const response = await api.get<PaginatedResponse<ApiCategory>>(
    "/menu/categories/",
    queryParams,
  );

  if (response.error || !response.data) {
    console.warn("[MenuService] Kategori yüklenemedi:", response.error);
    return [];
  }

  return response.data.results
    .filter((c) => c.is_active)
    .sort((a, b) => a.order - b.order)
    .map(mapCategory);
}

// ─── Products ───────────────────────────────────────────────

/**
 * Tüm aktif ürünleri getir (menu için).
 * show_on_pos=1 filtresi ile sadece POS'da görünenler alınır.
 */
export async function fetchAllProducts(params?: {
  category_id?: string;
  branch_id?: string;
}): Promise<Product[]> {
  const queryParams: Record<string, string | number> = {
    show_on_pos: 1,
    page_size: 500,
  };

  if (params?.category_id) queryParams.category_id = params.category_id;
  if (params?.branch_id) queryParams.branch_id = params.branch_id;

  const response = await api.get<PaginatedResponse<ApiProduct>>(
    "/menu/products/",
    queryParams,
  );

  if (response.error || !response.data) {
    console.warn("[MenuService] Ürünler yüklenemedi:", response.error);
    return [];
  }

  return response.data.results
    .filter((p) => p.is_active && p.show_on_pos)
    .sort((a, b) => a.order - b.order)
    .map(mapProduct);
}

/**
 * Tek ürün detayını getir.
 */
export async function fetchProductById(
  id: string,
  params?: { branch_id?: string },
): Promise<Product | null> {
  const queryParams = new URLSearchParams();
  if (params?.branch_id) {
    queryParams.set("branch_id", params.branch_id);
  }
  const qs = queryParams.toString();
  const url = `/menu/products/${id}/${qs ? `?${qs}` : ""}`;
  const response = await api.get<ApiProduct>(url);

  if (response.error || !response.data) {
    console.warn("[MenuService] Ürün detayı yüklenemedi:", response.error);
    return null;
  }

  return mapProduct(response.data);
}
