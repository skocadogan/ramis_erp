// ============================================================
// Stock Man — P5 data-layer contract types (mobile-ops owned)
//
// This file is the single source of truth for the *types* the
// P5 features (scanner, printing, low-stock banner, sync
// modal) consume. It mirrors the contracts the data-layer
// agent is implementing in `src/hooks/useBarcodeLookup`,
// `src/hooks/usePrinters`, `src/hooks/useOfflineQueue`,
// `src/services/scannerService`, `src/services/printingService`,
// and `src/store/useWSPushStore`.
//
// If you change a shape here, update the matching data-layer
// file (or vice-versa) so the screen-level components stay
// type-safe.
// ============================================================

import type { StockItem, Supplier, UUID } from "@/types";

// ─── Barcode / SKU lookup ─────────────────────────────────────

/** Barcode formats supported by expo-camera v56. */
export type SupportedBarcodeType =
  | "aztec"
  | "ean13"
  | "ean8"
  | "qr"
  | "pdf417"
  | "upc_e"
  | "datamatrix"
  | "code39"
  | "code93"
  | "itf14"
  | "codabar"
  | "code128"
  | "upc_a";

/** Subset of formats we actually request from expo-camera. */
export const SUPPORTED_BARCODE_TYPES = [
  "qr",
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "code128",
  "code39",
  "code93",
  "itf14",
  "pdf417",
] as const satisfies readonly SupportedBarcodeType[];

/**
 * Discriminated union describing what the backend's barcode
 * lookup returned. Mirrors `scannerService.BarcodeLookupResult`.
 *
 *   not_found    → nothing matched
 *   stock_item   → exactly one product matched
 *   supplier     → exactly one supplier matched
 *   multiple     → ambiguous — list of stock items + suppliers
 *                  to disambiguate
 *
 * NB: the data-layer agent uses `kind` (not `type`) and
 * `barcode` (not `code`) as the discriminator / payload key.
 */
export type BarcodeLookupResult =
  | { kind: "not_found"; barcode: string }
  | { kind: "stock_item"; barcode: string; item: StockItem }
  | { kind: "supplier"; barcode: string; supplier: Supplier }
  | {
      kind: "multiple";
      barcode: string;
      results: (StockItem | Supplier)[];
    };

// ─── Low-stock WebSocket alert ────────────────────────────────

/** Single low-stock entry held by `useWSPushStore.lowAlerts`.
 *  The data-layer agent builds this from the WS
 *  `stock.low_alert` event. */
export type LowStockAlert = {
  stock_item_id: UUID;
  stock_item_name: string;
  warehouse_id: UUID;
  warehouse_name: string;
  current_quantity: number;
  minimum_quantity: number;
  /** Epoch ms when the alert was pushed. */
  at: number;
  /** Derived UI severity hint. */
  severity?: "warning" | "critical";
};

// ─── Offline queue ────────────────────────────────────────────

/**
 * Snapshot the offline-queue hook returns. Mirrors the
 * contract of `useOfflineQueue` exactly.
 */
export type OfflineQueueInfo = {
  pendingCount: number;
  syncing: boolean;
  lastSyncAt: number | null;
  refreshCount: () => Promise<void>;
  sync: () => Promise<unknown>;
};

// ─── Print jobs ───────────────────────────────────────────────

/** Filters accepted by `usePrinters(...)`. The data-layer
 *  agent narrows to string to keep the hook decoupled from
 *  the `Printer.usage_type` enum. */
export type PrinterListParams = {
  usage_type?: string;
  is_active?: boolean;
};
