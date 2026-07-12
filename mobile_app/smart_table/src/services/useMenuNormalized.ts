// ============================================================
// Smart Table — useMenuNormalized Hook
// Drop-in replacement for useMenu() with O(1) lookups.
// Builds NormalizedMenu once; filteredProducts via HashMap join.
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
import {
  normalizeMenuData,
  resolveDefaultCategory,
  getFilteredProducts,
  POPULAR_CATEGORY_ID,
  type NormalizedMenu,
} from "@/utils/menuNormalizer";

const MENU_CACHE_TTL_MS = 60_000;
const productDetailCache = new Map<string, Product>();

interface MenuCacheEntry {
  normalized: NormalizedMenu;
  categories: Category[];
  products: Product[];
  timestamp: number;
}

const menuCache = new Map<string, MenuCacheEntry>();

export function invalidateMenuCaches(): void {
  menuCache.clear();
  productDetailCache.clear();
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

export function useMenuNormalized(): UseMenuReturn {
  const selectedBranchId = useTableStore((s) => s.selectedBranch?.id);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [normalized, setNormalized] = useState<NormalizedMenu | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMenu = useCallback(
    async (options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      const cacheKey = selectedBranchId ?? "__no_branch__";
      const cached = menuCache.get(cacheKey);
      const cacheValid =
        !force && cached && Date.now() - cached.timestamp < MENU_CACHE_TTL_MS;

      if (cacheValid && cached) {
        return {
          categories: cached.categories,
          products: cached.products,
          normalized: cached.normalized,
        };
      }

      try {
        const fetchParams = selectedBranchId
          ? { branch_id: selectedBranchId }
          : undefined;
        const [apiCategories, apiProducts] = await Promise.all([
          fetchCategories(fetchParams),
          fetchAllProducts(fetchParams),
        ]);

        const norm = normalizeMenuData(apiCategories, apiProducts);
        menuCache.set(cacheKey, {
          normalized: norm,
          categories: apiCategories,
          products: apiProducts,
          timestamp: Date.now(),
        });

        return {
          categories: apiCategories,
          products: apiProducts,
          normalized: norm,
        };
      } catch (err: unknown) {
        console.warn(
          "[useMenuNormalized] API error:",
          err instanceof Error ? err.message : err,
        );
        return {
          error: err instanceof Error ? err.message : "API bağlantı hatası",
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
        setNormalized(result.normalized);
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

  // WebSocket menu_catalog_refresh → silent refresh
  const refreshVersion = useMenuStore((s) => s.refreshVersion);
  const prevRefreshVersionRef = useRef(refreshVersion);
  useEffect(() => {
    if (refreshVersion !== prevRefreshVersionRef.current) {
      prevRefreshVersionRef.current = refreshVersion;
      invalidateMenuCaches();
      loadMenu({ force: true }).then((result) => {
        if (!result || "error" in result) return;
        setAllCategories(result.categories);
        setProducts(result.products);
        setNormalized(result.normalized);
        setSelectedCategoryId((prev) =>
          resolveDefaultCategory(prev, result.categories, result.products),
        );
      });
    }
  }, [refreshVersion, loadMenu]);

  // Featured products
  const featuredProducts = useMemo(
    () => products.filter((p) => p.isFeatured && p.isActive),
    [products],
  );

  // Root (parent) categories
  const rootCategories = useMemo(
    () => allCategories.filter((c) => !c.parentId),
    [allCategories],
  );

  // Parent categories + virtual "Featured"
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

  // Walk up to root parent of selected category
  const selectedRootParentId = useMemo<string | null>(() => {
    if (!selectedCategoryId || selectedCategoryId === POPULAR_CATEGORY_ID)
      return null;
    if (!normalized) return null;
    let catId: string | null = selectedCategoryId;
    let cat: Category | undefined;
    while (catId) {
      cat = normalized.categoriesById.get(catId);
      if (!cat) return null;
      catId = cat.parentId ?? null;
    }
    return cat?.id ?? null;
  }, [selectedCategoryId, normalized]);

  // First-level subcategories of selected root
  const subCategories = useMemo<Category[]>(() => {
    if (!selectedRootParentId || !normalized) return [];
    return normalized.childCategories.get(selectedRootParentId) ?? [];
  }, [selectedRootParentId, normalized]);

  // Filtered products — O(1) lookup via HashMap
  const filteredProducts = useMemo(() => {
    if (!normalized) return [];
    if (!selectedCategoryId) return products.filter((p) => p.isActive);
    return getFilteredProducts(
      selectedCategoryId,
      normalized,
      featuredProducts,
    );
  }, [normalized, products, selectedCategoryId, featuredProducts]);

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
        setNormalized(null);
        setSelectedCategoryId(null);
        setError(result?.error ?? "API bağlantı hatası");
      } else {
        setAllCategories(result.categories);
        setProducts(result.products);
        setNormalized(result.normalized);
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
