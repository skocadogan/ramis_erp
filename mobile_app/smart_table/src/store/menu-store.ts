// ============================================================
// Smart Table — Menu Store (Zustand)
//
// Tracks menu refresh signals from WebSocket. When the backend
// broadcasts a menu_catalog_refresh event, the version counter
// increments so useMenu() hook can re-fetch categories/products.
// ============================================================

import { create } from "zustand";

interface MenuState {
  /** Artan sürüm sayacı — her değiştiğinde menu yeniden yüklenir */
  refreshVersion: number;
  /** WebSocket'ten menu_catalog_refresh sinyali gelince çağrılır */
  signalRefresh: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  refreshVersion: 0,
  signalRefresh: () => set((s) => ({ refreshVersion: s.refreshVersion + 1 })),
}));
