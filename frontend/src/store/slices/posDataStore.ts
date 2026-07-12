import type { ReadyItem } from "@/types/pos";

export interface PosDataState {
  /** WS'den gelen gerçek zamanlı bildirimler (server verisi ama UI state gibi davranır) */
  readyItems: ReadyItem[];

  setReadyItems: (readyItems: ReadyItem[] | ((prev: ReadyItem[]) => ReadyItem[])) => void;
}

export function createPosDataSlice(
  set: (partial: Partial<PosDataState> | ((state: PosDataState) => Partial<PosDataState>)) => void,
): PosDataState {
  return {
    readyItems: [],
    setReadyItems: (readyItems) =>
      set((state) => ({
        readyItems:
          typeof readyItems === "function"
            ? readyItems(state.readyItems)
            : readyItems,
      })),
  };
}
