// ============================================================
// Smart Table — useMenu Hook
// Fetches categories and products from RAMIS backend API.
// Supports hierarchical categories (parent/child).
// Only parent (root) categories are shown in the top row.
// Subcategories appear as a second row below.
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  fetchCategories,
  fetchAllProducts,
  fetchProductById,
} from "./menuService";
import type { Category, Product } from "@/types";
import { useTableStore } from "@/store/table-store";
import { useMenuStore } from "@/store/menu-store";

/** Sanal "Popüler" kategori ID'si — backend'de böyle bir kategori yoktur. */
const POPULAR_CATEGORY_ID = "__popular__";

const MENU_CACHE_TTL_MS = 60_000;

interface MenuCacheEntry {
  categories: Category[];
  products: Product[];
  timestamp: number;
}

const menuCache = new Map<string, MenuCacheEntry>();

// Basit in-memory cache: aynı ürün aynı oturumda tekrar fetch edilmez.
// Anahtar: `${productId}:${branchId}` — branch değişince stale olmaz.
const productDetailCache = new Map<string, Product>();

/** WebSocket menü yenilemesi veya manuel refresh öncesi çağrılır. */
export function invalidateMenuCaches(): void {
  menuCache.clear();
  productDetailCache.clear();
}

function resolveDefaultCategory(
  previousId: string | null,
  categories: Category[],
  products: Product[],
): string | null {
  if (
    previousId &&
    previousId !== POPULAR_CATEGORY_ID &&
    categories.find((c) => c.id === previousId)
  ) {
    return previousId;
  }
  const hasFeatured = products.some((p) => p.isFeatured && p.isActive);
  if (hasFeatured) return POPULAR_CATEGORY_ID;
  const firstParent = categories.find((c) => !c.parentId);
  return firstParent?.id ?? categories[0]?.id ?? null;
}

/** Verilen kategori ve tüm alt kategorilerinin ID'lerini toplar. */
function getAllDescendantIds(catId: string, allCats: Category[]): Set<string> {
  const ids = new Set<string>([catId]);
  for (const c of allCats) {
    if (c.parentId === catId) {
      const childIds = getAllDescendantIds(c.id, allCats);
      childIds.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

interface UseMenuReturn {
  categories: Category[];
  products: Product[];
  filteredProducts: Product[];
  selectedCategoryId: string | null;
  setSelectedCategoryId: (id: string) => void;
  parentCategories: Category[];
  subCategories: Category[];
  selectedRootParentId: string | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMenu(): UseMenuReturn {
  const selectedBranchId = useTableStore((s) => s.selectedBranch?.id);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMenu = useCallback(
    async (options?: { background?: boolean; force?: boolean }) => {
      const force = options?.force ?? false;
      const cacheKey = selectedBranchId ?? "__no_branch__";
      const cached = menuCache.get(cacheKey);
      const cacheValid =
        !force && cached && Date.now() - cached.timestamp < MENU_CACHE_TTL_MS;

      if (cacheValid) {
        return { categories: cached.categories, products: cached.products };
      }

      try {
        const fetchParams = selectedBranchId
          ? { branch_id: selectedBranchId }
          : undefined;
        const [apiCategories, apiProducts] = await Promise.all([
          fetchCategories(fetchParams),
          fetchAllProducts(fetchParams),
        ]);

        menuCache.set(cacheKey, {
          categories: apiCategories,
          products: apiProducts,
          timestamp: Date.now(),
        });

        return { categories: apiCategories, products: apiProducts };
      } catch (err: unknown) {
        console.warn(
          "[useMenu] API error:",
          err instanceof Error ? err.message : err,
        );
        return {
          error: err instanceof Error ? err.message : "API bağlantı hatası",
          categories: null,
          products: null,
        };
      }
    },
    [selectedBranchId],
  );

  useEffect(() => {
    let cancelled = false;
    loadMenu().then((result) => {
      if (cancelled) return;
      if (!result || "error" in result) {
        setError(result?.error ?? "API bağlantı hatası");
      } else {
        setAllCategories(result.categories);
        setProducts(result.products);
        setSelectedCategoryId((prev) =>
          resolveDefaultCategory(prev, result.categories, result.products),
        );
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadMenu]);

  // WebSocket'ten gelen menu_catalog_refresh sinyaliyle sessiz yenile
  const refreshVersion = useMenuStore((s) => s.refreshVersion);
  const prevRefreshVersionRef = useRef(refreshVersion);
  useEffect(() => {
    if (refreshVersion !== prevRefreshVersionRef.current) {
      prevRefreshVersionRef.current = refreshVersion;
      invalidateMenuCaches();
      loadMenu({ background: true, force: true }).then((result) => {
        if (!result || "error" in result) return;
        setAllCategories(result.categories);
        setProducts(result.products);
        setSelectedCategoryId((prev) =>
          resolveDefaultCategory(prev, result.categories, result.products),
        );
      });
    }
  }, [refreshVersion, loadMenu]);

  // Featured (öne çıkan) ürünler
  const featuredProducts = useMemo(
    () => products.filter((p) => p.isFeatured && p.isActive),
    [products],
  );

  // Sadece parent (root) kategoriler
  const rootCategories = useMemo(
    () => allCategories.filter((c) => !c.parentId),
    [allCategories],
  );

  // Parent kategoriler + sanal "Popüler"
  const parentCategories = useMemo<Category[]>(() => {
    if (featuredProducts.length === 0) return rootCategories;
    return [
      {
        id: POPULAR_CATEGORY_ID,
        name: "Öne Çıkan",
        nameEn: "Featured",
        description: "",
        descriptionEn: "",
        order: -1,
        color: "#F59E0B",
        productCount: featuredProducts.length,
      },
      ...rootCategories,
    ];
  }, [rootCategories, featuredProducts]);

  // Seçili kategorinin kök parent'ı
  const selectedRootParentId = useMemo<string | null>(() => {
    if (!selectedCategoryId || selectedCategoryId === POPULAR_CATEGORY_ID)
      return null;
    let catId: string | null = selectedCategoryId;
    let cat: Category | undefined;
    while (catId) {
      cat = allCategories.find((c) => c.id === catId);
      if (!cat) return null;
      catId = cat.parentId ?? null;
    }
    return cat?.id ?? null;
  }, [selectedCategoryId, allCategories]);

  // Seçili parent'ın birinci seviye alt kategorileri
  const subCategories = useMemo<Category[]>(() => {
    if (!selectedRootParentId) return [];
    return allCategories.filter((c) => c.parentId === selectedRootParentId);
  }, [selectedRootParentId, allCategories]);

  // Filtrelenmiş ürünler (recursive)
  const filteredProducts = useMemo(() => {
    if (!selectedCategoryId) return products.filter((p) => p.isActive);
    if (selectedCategoryId === POPULAR_CATEGORY_ID) return featuredProducts;
    const descendantIds = getAllDescendantIds(
      selectedCategoryId,
      allCategories,
    );
    return products.filter(
      (p) => descendantIds.has(p.categoryId) && p.isActive,
    );
  }, [products, selectedCategoryId, allCategories, featuredProducts]);

  return {
    categories: parentCategories,
    products,
    filteredProducts,
    selectedCategoryId,
    setSelectedCategoryId,
    parentCategories,
    subCategories,
    selectedRootParentId,
    isLoading,
    error,
    refresh: async () => {
      setIsLoading(true);
      setError(null);
      invalidateMenuCaches();
      const result = await loadMenu({ force: true });
      if (!result || "error" in result) {
        setAllCategories([]);
        setProducts([]);
        setSelectedCategoryId(null);
        setError(result?.error ?? "API bağlantı hatası");
      } else {
        setAllCategories(result.categories);
        setProducts(result.products);
        setSelectedCategoryId((prev) =>
          resolveDefaultCategory(prev, result.categories, result.products),
        );
      }
      setIsLoading(false);
    },
  };
}

export function useProductDetail(productId: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedBranchId = useTableStore((s) => s.selectedBranch?.id);

  const loadProduct = useCallback(
    async (
      forceRefresh = false,
    ): Promise<{ product: Product | null; error: string | null }> => {
      if (!productId) {
        return { product: null, error: null };
      }

      const cacheKey = `${productId}:${selectedBranchId ?? ""}`;
      if (!forceRefresh) {
        const cached = productDetailCache.get(cacheKey);
        if (cached) {
          return { product: cached, error: null };
        }
      }

      try {
        const fetchParams = selectedBranchId
          ? { branch_id: selectedBranchId }
          : undefined;
        const apiProduct = await fetchProductById(productId, fetchParams);
        if (!apiProduct) {
          return { product: null, error: "Ürün bulunamadı" };
        }
        productDetailCache.set(cacheKey, apiProduct);
        return { product: apiProduct, error: null };
      } catch (err: unknown) {
        console.warn(
          "[useProductDetail] API error:",
          err instanceof Error ? err.message : err,
        );
        return {
          product: null,
          error: err instanceof Error ? err.message : "API bağlantı hatası",
        };
      }
    },
    [productId, selectedBranchId],
  );

  useEffect(() => {
    let cancelled = false;
    loadProduct().then((result) => {
      if (cancelled) return;
      setProduct(result.product);
      setError(result.error);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadProduct]);

  const refreshVersion = useMenuStore((s) => s.refreshVersion);
  const prevDetailRefreshRef = useRef(refreshVersion);
  useEffect(() => {
    if (refreshVersion === prevDetailRefreshRef.current) return;
    prevDetailRefreshRef.current = refreshVersion;
    let cancelled = false;
    loadProduct(true).then((result) => {
      if (cancelled) return;
      setProduct(result.product);
      setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion, loadProduct]);

  return {
    product,
    isLoading,
    error,
    refresh: async () => {
      setIsLoading(true);
      setError(null);
      const result = await loadProduct(true);
      setProduct(result.product);
      setError(result.error);
      setIsLoading(false);
    },
  };
}
