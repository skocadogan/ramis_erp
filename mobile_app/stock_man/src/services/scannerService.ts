// ============================================================
// Stock Man — Barcode / SKU lookup service (P5)
//
// The mobile scanner hardware (expo-camera barcode detector)
// hands us a raw string. We don't maintain a local barcode
// table on the tablet — we round-trip the backend's list
// endpoints, scoped to the active branch, to resolve the
// string to a `StockItem` or `Supplier`.
//
// Lookup strategy (cheap → expensive):
//   1. GET /inventory/stock-items/?search=<code>&page_size=5
//        - If exactly one result whose `barcode` or `sku`
//          matches the cleaned code, return `stock_item`.
//        - Otherwise return `multiple` so the UI can show a
//          disambiguation picker.
//   2. GET /inventory/suppliers/?search=<code>&page_size=5
//        - Single result → `supplier`; multiple → `multiple`.
//   3. Otherwise → `not_found`.
//
// Each endpoint failure is swallowed so a temporary glitch on
// one side doesn't kill the other lookup path.
// ============================================================

import { axiosClient } from "@/api/client";
import type { StockItem, Supplier } from "@/types";

export type BarcodeLookupResult =
  | { kind: "stock_item"; barcode: string; item: StockItem }
  | { kind: "supplier"; barcode: string; supplier: Supplier }
  | { kind: "not_found"; barcode: string }
  | { kind: "multiple"; barcode: string; results: (StockItem | Supplier)[] };

export type StockOnlyLookupResult =
  | { kind: "exact"; item: StockItem; query: string }
  | { kind: "multiple"; items: StockItem[]; query: string }
  | { kind: "not_found"; query: string };

export type BarcodeRegistrationLookupResult =
  | { kind: "registered"; item: StockItem; barcode: string }
  | { kind: "available"; barcode: string };

/** Internal type — both stock items and suppliers live in the
 *  `multiple` results bucket. We never mix them inside the
 *  same call (the lookup is sequential), so the consumer is
 *  safe to check `result.kind` and narrow from there. */
export const scannerService = {
  /**
   * Lookup a barcode/SKU across stock items and suppliers.
   * Tries stock-items first (most common), then suppliers.
   */
  lookup: async (code: string): Promise<BarcodeLookupResult> => {
    const cleaned = code.trim();
    if (!cleaned) return { kind: "not_found", barcode: "" };

    // 1) Stock items — exact-match on barcode or sku wins immediately.
    try {
      const itemsRes = await axiosClient.get("/inventory/stock-items/", {
        params: { search: cleaned, page_size: 5 },
      });
      const results: StockItem[] = itemsRes.data?.results ?? [];
      const exact = results.find(
        (it) => it.barcode === cleaned || it.sku === cleaned
      );
      if (exact) return { kind: "stock_item", barcode: cleaned, item: exact };
      if (results.length > 0) {
        return { kind: "multiple", barcode: cleaned, results: results };
      }
    } catch {
      // Network blip on this endpoint shouldn't block the next attempt.
    }

    // 2) Suppliers — single match wins; multiple fall into the same picker.
    try {
      const supRes = await axiosClient.get("/inventory/suppliers/", {
        params: { search: cleaned, page_size: 5 },
      });
      const results: Supplier[] = supRes.data?.results ?? [];
      if (results.length === 1 && results[0]) {
        return { kind: "supplier", barcode: cleaned, supplier: results[0] };
      }
      if (results.length > 1) {
        return { kind: "multiple", barcode: cleaned, results: results };
      }
    } catch {
      // ignore
    }

    return { kind: "not_found", barcode: cleaned };
  },

  /** Stock-item lookup for product search (no supplier path). */
  lookupStockOnly: async (query: string): Promise<StockOnlyLookupResult> => {
    const cleaned = query.trim();
    if (!cleaned) return { kind: "not_found", query: "" };

    try {
      const itemsRes = await axiosClient.get("/inventory/stock-items/", {
        params: { search: cleaned, page_size: 10 },
      });
      const results: StockItem[] = itemsRes.data?.results ?? [];
      const lowered = cleaned.toLowerCase();
      const exact = results.find(
        (it) =>
          it.barcode === cleaned ||
          it.sku === cleaned ||
          it.name.toLowerCase() === lowered
      );
      if (exact) return { kind: "exact", item: exact, query: cleaned };
      if (results.length === 1 && results[0]) {
        return { kind: "exact", item: results[0], query: cleaned };
      }
      if (results.length > 1) {
        return { kind: "multiple", items: results, query: cleaned };
      }
    } catch {
      // fall through to not_found
    }

    return { kind: "not_found", query: cleaned };
  },

  /** Exact barcode match for new-product form (no SKU/name fallback). */
  lookupByBarcode: async (
    barcode: string
  ): Promise<BarcodeRegistrationLookupResult> => {
    const cleaned = barcode.trim();
    if (!cleaned) return { kind: "available", barcode: "" };

    try {
      const itemsRes = await axiosClient.get("/inventory/stock-items/", {
        params: { search: cleaned, page_size: 20 },
      });
      const results: StockItem[] = itemsRes.data?.results ?? [];
      const registered = results.find((it) => it.barcode === cleaned);
      if (registered) {
        return { kind: "registered", item: registered, barcode: cleaned };
      }
    } catch {
      // treat as available so the scanned value is still captured
    }

    return { kind: "available", barcode: cleaned };
  },
};

// `UUID` is re-exported for consumers that need the same identity
// type when narrowing the `multiple` result bucket. We don't
// narrow inside the service — that's the caller's job.
;
