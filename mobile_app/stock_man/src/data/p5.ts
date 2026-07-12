// ============================================================
// Stock Man — P5 hook & service adapters
//
// This barrel re-exports the data-layer agent's P5 hooks and
// services so the mobile-ops components have a single, stable
// import surface:
//
//   import { useOfflineQueue, useWSPushStore, ... } from "@/data/p5";
//
// The underlying modules live in the data-layer agent's
// territory and are expected to be present at runtime:
//
//   @/hooks/useBarcodeLookup      — barcode/SKU lookup mutation
//   @/hooks/usePrinters           — printer list query
//   @/hooks/useOfflineQueue       — pending mutation queue
//   @/store/useWSPushStore         — low-stock + recent events
//   @/services/printingService    — print job creation
//   @/services/scannerService     — barcode lookup service
//   @/store/useBackendHealthStore  — (already exists)
//
// If a data-layer file is not yet on disk, TypeScript surfaces
// the missing-module error here in one place rather than
// scattered across every consuming component. The runtime
// `require` fallback below means the rest of the app still
// loads in dev even if a single adapter is absent.
// ============================================================

import { Platform } from "react-native";
import type {
  BarcodeLookupResult,
  LowStockAlert,
  OfflineQueueInfo,
} from "@/types/p5Data";

// Local generic event type (replaces the removed p5Data.WSPushEvent).
// The actual useWSPushStore uses its own `Event` union in the store file.
type WSPushEvent = { type: string; data?: unknown; received_at?: number };

// ─── Hook / service contracts ─────────────────────────────────

type BarcodeLookupMut<TData = BarcodeLookupResult, TError = Error> = {
  mutate: (code: string) => void;
  mutateAsync: (code: string) => Promise<TData>;
  data: TData | null;
  isPending: boolean;
  error: TError | null;
  reset: () => void;
};

type LowAlertState = {
  lowAlerts: LowStockAlert[];
  deficiencyAlerts: {
    id: string;
    report_number: string;
    station_name: string;
    branch_name: string;
    created_at: string;
    status: string;
    at: number;
  }[];
  removeLowAlert: (stockItemId: string) => void;
  removeDeficiencyAlert: (reportId: string) => void;
  clearLowAlerts: () => void;
  clearDeficiencyAlerts: () => void;
  recent: WSPushEvent[];
  push: (evt: WSPushEvent) => void;
  clearRecent: () => void;
};

type WSPushStoreHook = {
  (): LowAlertState;
  <T>(selector: (state: LowAlertState) => T): T;
  getState: () => LowAlertState;
};

// ─── useBarcodeLookup ─────────────────────────────────────────

let _useBarcodeLookup: (options?: unknown) => BarcodeLookupMut = () => ({
  mutate: () => {},
  mutateAsync: async () => ({ kind: "not_found", barcode: "" } as const),
  data: null,
  isPending: false,
  error: null,
  reset: () => {},
});
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@/hooks/useBarcodeLookup") as {
    useBarcodeLookup?: typeof _useBarcodeLookup;
  };
  if (typeof mod.useBarcodeLookup === "function") {
    _useBarcodeLookup = mod.useBarcodeLookup;
  }
} catch {
  /* data layer not yet wired */
}

export const useBarcodeLookup = _useBarcodeLookup;

// ─── useOfflineQueue ──────────────────────────────────────────

let _useOfflineQueue: () => OfflineQueueInfo = () => ({
  pendingCount: 0,
  syncing: false,
  lastSyncAt: null,
  refreshCount: async () => {},
  sync: async () => undefined,
});
// expo-sqlite WASM not supported on web — Platform tree-shakes the
// require() so the bundler never follows the db.ts → expo-sqlite chain.
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/hooks/useOfflineQueue") as {
      useOfflineQueue?: typeof _useOfflineQueue;
    };
    if (typeof mod.useOfflineQueue === "function") {
      _useOfflineQueue = mod.useOfflineQueue;
    }
  } catch {
    /* data layer not yet wired */
  }
}

export const useOfflineQueue = _useOfflineQueue;

// ─── useWSPushStore ───────────────────────────────────────────

const _noOpWSState: LowAlertState = {
  lowAlerts: [] as LowStockAlert[],
  deficiencyAlerts: [],
  removeLowAlert: () => {},
  removeDeficiencyAlert: () => {},
  clearLowAlerts: () => {},
  clearDeficiencyAlerts: () => {},
  recent: [] as WSPushEvent[],
  push: () => {},
  clearRecent: () => {},
};

function makeNoOpWSPushStore(): WSPushStoreHook {
  const fn = (() => _noOpWSState) as WSPushStoreHook;
  fn.getState = () => _noOpWSState;
  return fn;
}

let _useWSPushStore: WSPushStoreHook = makeNoOpWSPushStore();
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@/store/useWSPushStore") as {
    useWSPushStore?: WSPushStoreHook;
  };
  if (typeof mod.useWSPushStore === "function") {
    _useWSPushStore = mod.useWSPushStore;
  }
} catch {
  /* data layer not yet wired */
}

export const useWSPushStore: WSPushStoreHook = _useWSPushStore;
