// ============================================================
// Smart Table — Table Store
// Şube ve masa seçimini SecureStore'da tutar.
// API'den çekilen şube/masa listelerini cache'ler.
// ============================================================

import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import type { Table } from "@/types";

function extractArray<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (
    typeof data === "object" &&
    data !== null &&
    "results" in data &&
    Array.isArray((data as { results: unknown }).results)
  ) {
    return (data as { results: T[] }).results;
  }
  return [];
}
import { api } from "@/services/api";
import type { ApiBranch, ApiTable } from "@/types/api";

// ─── Storage Keys ───────────────────────────────────────────

const STORAGE_KEYS = {
  SELECTED_BRANCH: "smart_table_selected_branch",
  SELECTED_TABLE: "smart_table_selected_table",
  CACHED_BRANCHES: "smart_table_cached_branches",
  CACHED_TABLES: "smart_table_cached_tables",
} as const;

// ─── Types ──────────────────────────────────────────────────

export interface SelectedTable {
  id: string;
  name: string;
  zoneName: string;
}

export interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface TableState {
  /** Seçili şube (SecureStore'da kalıcı) */
  selectedBranch: BranchOption | null;
  /** Seçili masa (SecureStore'da kalıcı) */
  selectedTable: SelectedTable | null;
  /** API'den çekilen şubeler (cache) */
  availableBranches: BranchOption[];
  /** API'den çekilen masalar (cache) */
  availableTables: Table[];
  /** Branch listesi yükleniyor mu */
  isLoadingBranches: boolean;
  /** Masa listesi yükleniyor mu */
  isLoadingTables: boolean;
  /** Branch listesi hatası */
  branchesError: string | null;
  /** Masa listesi hatası */
  tablesError: string | null;

  // ── Actions ──
  /** Uygulama açılışında SecureStore'dan kayıtlı verileri yükle */
  init: () => Promise<void>;
  /** API'den şubeleri çek */
  fetchBranches: () => Promise<BranchOption[]>;
  /** Şube seç ve SecureStore'a kaydet */
  selectBranch: (branch: BranchOption) => Promise<void>;
  /** API'den masaları çek (branch_id zorunlu) */
  fetchTables: (branchId: string) => Promise<Table[]>;
  /** Masa seç ve SecureStore'a kaydet */
  selectTable: (table: SelectedTable) => Promise<void>;
}

// ─── Store ──────────────────────────────────────────────────

export const useTableStore = create<TableState>((set, _get) => ({
  selectedBranch: null,
  selectedTable: null,
  availableBranches: [],
  availableTables: [],
  isLoadingBranches: false,
  isLoadingTables: false,
  branchesError: null,
  tablesError: null,

  // ── Init from SecureStore ──
  init: async () => {
    try {
      const [branchStr, tableStr, branchesStr, tablesStr] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.SELECTED_BRANCH),
        SecureStore.getItemAsync(STORAGE_KEYS.SELECTED_TABLE),
        SecureStore.getItemAsync(STORAGE_KEYS.CACHED_BRANCHES),
        SecureStore.getItemAsync(STORAGE_KEYS.CACHED_TABLES),
      ]);

      set({
        selectedBranch: branchStr ? JSON.parse(branchStr) : null,
        selectedTable: tableStr ? JSON.parse(tableStr) : null,
        availableBranches: branchesStr ? JSON.parse(branchesStr) : [],
        availableTables: tablesStr ? JSON.parse(tablesStr) : [],
      });
    } catch (err) {
      console.warn("[TableStore] init error:", err);
    }
  },

  // ── Fetch branches ──
  fetchBranches: async () => {
    set({ isLoadingBranches: true, branchesError: null });

    try {
      const response = await api.get<ApiBranch[]>("/branches/");

      if (response.error || !response.data) {
        set({
          isLoadingBranches: false,
          branchesError: response.error || "Şubeler yüklenemedi",
        });
        return [];
      }

      const rawBranches = extractArray<ApiBranch>(response.data);
      const branches: BranchOption[] = rawBranches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code || "",
      }));

      // Cache to SecureStore
      try {
        await SecureStore.setItemAsync(
          STORAGE_KEYS.CACHED_BRANCHES,
          JSON.stringify(branches),
        );
      } catch {
        /* non-critical */
      }

      set({ availableBranches: branches, isLoadingBranches: false });
      return branches;
    } catch (err: unknown) {
      console.warn("[TableStore] fetchBranches error:", err);
      set({
        isLoadingBranches: false,
        branchesError:
          err instanceof Error ? err.message : "Şubeler yüklenemedi",
      });
      return [];
    }
  },

  // ── Select branch ──
  selectBranch: async (branch: BranchOption) => {
    try {
      await SecureStore.setItemAsync(
        STORAGE_KEYS.SELECTED_BRANCH,
        JSON.stringify(branch),
      );
      await SecureStore.deleteItemAsync(STORAGE_KEYS.SELECTED_TABLE);
      set({ selectedBranch: branch, selectedTable: null });

      try {
        const { useCartStore } = await import("./cart-store");
        useCartStore.getState().clearCart();
      } catch (e) {
        console.warn("[TableStore] failed to clear cart on branch change:", e);
      }
      try {
        const { useOrderStore } = await import("./order-store");
        useOrderStore.getState().clearOrders("other");
        useOrderStore.setState({ resolvedTableId: null });
      } catch (e) {
        console.warn("[TableStore] failed to clear orders on branch change:", e);
      }
    } catch (err) {
      console.warn("[TableStore] selectBranch error:", err);
    }
  },

  // ── Fetch tables from API ──
  fetchTables: async (branchId: string) => {
    set({ isLoadingTables: true, tablesError: null });

    try {
      const response = await api.get<ApiTable[]>("/tables/", {
        branch_id: branchId,
      });

      if (response.error || !response.data) {
        set({
          isLoadingTables: false,
          tablesError: response.error || "Masalar yüklenemedi",
        });
        return [];
      }

      // Map raw API response to Table interface (camelCase fields)
      const rawTables = extractArray<ApiTable>(response.data);
      const tables: Table[] = rawTables.map((apiTable) => ({
        id: apiTable.id,
        zoneId: apiTable.zone || "",
        zoneName: apiTable.zone_name || "Ana Salon",
        name: apiTable.name,
        tableNumber: apiTable.table_number || 0,
        capacity: apiTable.capacity || 4,
        size: (apiTable.size ?? "MEDIUM") as Table["size"],
        shape: (apiTable.shape ?? "SQUARE") as Table["shape"],
        status: (apiTable.status ?? "FREE") as Table["status"],
        positionX: apiTable.position_x || 0,
        positionY: apiTable.position_y || 0,
      }));

      // Cache to SecureStore
      try {
        await SecureStore.setItemAsync(
          STORAGE_KEYS.CACHED_TABLES,
          JSON.stringify(tables),
        );
      } catch {
        /* non-critical */
      }

      set({ availableTables: tables, isLoadingTables: false });
      return tables;
    } catch (err: unknown) {
      console.warn("[TableStore] fetchTables error:", err);
      set({
        isLoadingTables: false,
        tablesError: err instanceof Error ? err.message : "Masalar yüklenemedi",
      });
      return [];
    }
  },

  // ── Select table ──
  selectTable: async (table: SelectedTable) => {
    try {
      const previousTableId = get().selectedTable?.id;
      await SecureStore.setItemAsync(
        STORAGE_KEYS.SELECTED_TABLE,
        JSON.stringify(table),
      );
      set({ selectedTable: table });

      // Synchronise with cart-store tableId; masa değişince sepeti temizle
      try {
        const { useCartStore } = await import("./cart-store");
        const cart = useCartStore.getState();
        if (previousTableId && previousTableId !== table.id) {
          cart.clearCart();
        }
        cart.setTable(table.id);
      } catch (e) {
        console.warn("[TableStore] failed to sync with cart-store:", e);
      }

      // Synchronise with order-store resolvedTableId
      try {
        const { useOrderStore } = await import("./order-store");
        if (previousTableId && previousTableId !== table.id) {
          useOrderStore.getState().clearOrders("other");
        }
        useOrderStore.setState({ resolvedTableId: table.id });
      } catch (e) {
        console.warn("[TableStore] failed to sync with order-store:", e);
      }
    } catch (err) {
      console.warn("[TableStore] selectTable error:", err);
    }
  },
}));
