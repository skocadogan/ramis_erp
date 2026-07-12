import { create } from "zustand";

/** Persist yok — sipariş sonrası masa detayı yenilemesi için geçiş bayrağı */
interface TableDetailRefreshState {
  pendingTableId: string | null;
  requestRefreshAfterOrder: (tableId: string) => void;
  clearPending: () => void;
}

export const useTableDetailRefreshStore = create<TableDetailRefreshState>((set) => ({
  pendingTableId: null,
  requestRefreshAfterOrder: (tableId) => set({ pendingTableId: tableId }),
  clearPending: () => set({ pendingTableId: null }),
}));
