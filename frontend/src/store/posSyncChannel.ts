import deepEqual from "fast-deep-equal";

const POS_SYNC_CHANNEL = "ramis_pos_sync";
let posSyncChannel: BroadcastChannel | null = null;
let isSyncingFromChannel = false;

type PosSyncSlice = {
  settingsContext: unknown;
  cart: unknown;
  selectedTable: unknown;
  activeBranchId: unknown;
};

type SyncStoreState = Record<string, unknown>;

type SyncStore = {
  subscribe: (
    selector: (s: SyncStoreState) => PosSyncSlice,
    callback: (state: PosSyncSlice) => void,
    options?: {
      fireImmediately?: boolean;
      equalityFn?: (a: PosSyncSlice, b: PosSyncSlice) => boolean;
    },
  ) => () => void;
  getState: () => SyncStoreState;
  setState: (partial: SyncStoreState) => void;
};

export function setupPosSyncChannel(store: SyncStore): void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;

  posSyncChannel = new BroadcastChannel(POS_SYNC_CHANNEL);

  store.subscribe(
    (s) => ({
      settingsContext: s.settingsContext,
      cart: s.cart,
      selectedTable: s.selectedTable,
      activeBranchId: s.activeBranchId,
    }),
    (state) => {
      if (isSyncingFromChannel) return;
      posSyncChannel?.postMessage({
        settingsContext: state.settingsContext,
        cart: state.cart,
        selectedTable: state.selectedTable,
        activeBranchId: state.activeBranchId,
      });
    },
    { fireImmediately: false, equalityFn: deepEqual },
  );

  posSyncChannel.onmessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;

    const localContext = store.getState().settingsContext;
    if (data.settingsContext !== localContext) return;

    isSyncingFromChannel = true;
    store.setState({
      cart: data.cart,
      selectedTable: data.selectedTable,
      activeBranchId: data.activeBranchId,
    });
    isSyncingFromChannel = false;
  };
}
