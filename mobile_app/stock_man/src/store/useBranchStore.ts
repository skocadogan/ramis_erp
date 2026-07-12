// ============================================================
// Stock Man — Branch + Warehouse selection store
//
// Holds the user's currently active branch & warehouse so
// every screen in the app can scope its queries to the same
// selection. The selection is persisted to SecureStore and
// re-hydrated at boot via `hydrateFromStorage()`.
//
// Switching branch clears the active warehouse (a warehouse
// from one branch is never a valid selection in another).
//
// This store does NOT own authentication or permissions —
// it only tracks "where am I working right now?".
// ============================================================

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { Branch, Warehouse, UUID } from "@/types";
import { axiosClient } from "@/api/client";
import { extractResults } from "@/types/api";

const KEY_BRANCH = "stockman_active_branch";
const KEY_WAREHOUSE = "stockman_active_warehouse";

type BranchState = {
  activeBranchId: UUID | null;
  activeWarehouseId: UUID | null;
  availableBranches: Branch[];
  availableWarehouses: Warehouse[];
  isLoadingBranches: boolean;
  isLoadingWarehouses: boolean;
  branchesError: string | null;
  fetchBranches: () => Promise<Branch[]>;
  fetchWarehouses: (branchId: UUID) => Promise<Warehouse[]>;
  setActiveBranch: (id: UUID | null) => Promise<void>;
  setActiveWarehouse: (id: UUID | null) => Promise<void>;
  hydrateFromStorage: () => Promise<void>;
  clear: () => Promise<void>;
};

// SecureStore helpers — never throw to the caller, just no-op
// on platforms that don't support a keystore (jest tests, etc).
const safeGet = async (k: string) => {
  try {
    return await SecureStore.getItemAsync(k);
  } catch {
    return null;
  }
};
const safeSet = async (k: string, v: string) => {
  try {
    await SecureStore.setItemAsync(k, v);
  } catch {
    /* ignore */
  }
};
const safeDel = async (k: string) => {
  try {
    await SecureStore.deleteItemAsync(k);
  } catch {
    /* ignore */
  }
};

export const useBranchStore = create<BranchState>((set) => ({
  activeBranchId: null,
  activeWarehouseId: null,
  availableBranches: [],
  availableWarehouses: [],
  isLoadingBranches: false,
  isLoadingWarehouses: false,
  branchesError: null,

  fetchBranches: async () => {
    set({ isLoadingBranches: true, branchesError: null });
    try {
      const res = await axiosClient.get("/branches/");
      const list = extractResults<Branch>(res.data);
      set({ availableBranches: list, isLoadingBranches: false, branchesError: null });
      return list;
    } catch {
      set({ isLoadingBranches: false, branchesError: "fetch_failed" });
      return [];
    }
  },

  fetchWarehouses: async (branchId) => {
    set({ isLoadingWarehouses: true });
    try {
      const res = await axiosClient.get("/warehouse/warehouses/", {
        params: { branch_id: branchId },
      });
      const list = extractResults<Warehouse>(res.data);
      set({ availableWarehouses: list, isLoadingWarehouses: false });
      return list;
    } catch {
      set({ availableWarehouses: [], isLoadingWarehouses: false });
      return [];
    }
  },

  setActiveBranch: async (id) => {
    if (id) await safeSet(KEY_BRANCH, id);
    else await safeDel(KEY_BRANCH);
    // Switching branch invalidates the active warehouse — the
    // selected warehouse may not belong to the new branch.
    await safeDel(KEY_WAREHOUSE);
    set({ activeBranchId: id, activeWarehouseId: null });
  },

  setActiveWarehouse: async (id) => {
    if (id) await safeSet(KEY_WAREHOUSE, id);
    else await safeDel(KEY_WAREHOUSE);
    set({ activeWarehouseId: id });
  },

  hydrateFromStorage: async () => {
    const [bid, wid] = await Promise.all([
      safeGet(KEY_BRANCH),
      safeGet(KEY_WAREHOUSE),
    ]);
    set({ activeBranchId: bid, activeWarehouseId: wid });
  },

  clear: async () => {
    await Promise.all([safeDel(KEY_BRANCH), safeDel(KEY_WAREHOUSE)]);
    set({
      activeBranchId: null,
      activeWarehouseId: null,
      availableBranches: [],
      availableWarehouses: [],
    });
  },
}));
