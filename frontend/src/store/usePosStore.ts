import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import deepEqual from "fast-deep-equal";
import api from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import type { Table } from "@/types/pos";
import {
  normalizePrinterList,
  isCloudPrefsSaveAllowed,
  isSkipCloudPrefsRemoteSave,
  clearCloudPrefsSaveTimer,
  setCloudPrefsSaveTimer,
  setSkipCloudPrefsRemoteSave,
} from "./posSettingsLogic";
import { setupPosSyncChannel } from "./posSyncChannel";
import { createPosDataSlice, type PosDataState } from "./slices/posDataStore";
import { createPosCartSlice, type PosCartState } from "./slices/posCartStore";
import { createPosSettingsSlice, type PosSettingsState } from "./slices/posSettingsStore";
import { createPosDisplaySlice, type PosDisplayState } from "./slices/posDisplayStore";

type PosCrossSlice = {
  setSelectedTable: (table: Table | null) => void;
  setActiveBranchId: (id: string | null) => void;
  setTerminalId: (id: string) => void;
  switchPosTerminal: (code: string, uuid: string) => void;
  persistTerminalSelection: (code: string, uuid: string | null) => Promise<void>;
};

export type PosStore = PosDataState &
  PosCartState &
  PosSettingsState &
  PosDisplayState &
  PosCrossSlice;

export const usePosStore = create<PosStore>()(
  subscribeWithSelector((set, get) => {
    const dataSlice = createPosDataSlice(set);
    const cartSlice = createPosCartSlice(set, get);
    const settingsSlice = createPosSettingsSlice(set, get);
    const displaySlice = createPosDisplaySlice(set, get);

    return {
      ...dataSlice,
      ...cartSlice,
      ...settingsSlice,
      ...displaySlice,

      setSelectedTable: (table: Table | null) => {
        if (!table) {
          set({ selectedTable: null, cart: [] });
          return;
        }
        set({
          selectedTable: table,
          cart: [],
          selectedCategory: null,
        });
      },

      setActiveBranchId: (id: string | null) => {
        const currentId = get().activeBranchId;
        if (currentId === id) return;

        const isInitialSet = currentId === null;

        set({
          activeBranchId: id,
          selectedTable: null,
          selectedCategory: null,
          cart: [],
          ...(isInitialSet
            ? {}
            : {
                terminalId: "",
                posTerminalUuid: null,
              }),
        });
      },

      setTerminalId: (id: string) => set({ terminalId: id }),

      switchPosTerminal: (code: string, uuid: string) => {
        get().persistTerminalSelection(code, uuid);
        set({
          selectedTable: null,
          cart: [],
          orderModalTable: null,
          reservationConfirmTable: null,
          selectedCategory: null,
          displayCompletedSurveyContext: null,
          activeDisplayOrder: null,
          displayMetadata: {
            isPaymentMode: false,
            paymentMethod: null,
            isProcessing: false,
          },
          displayOptionsModal: null,
          displayAllergenModal: null,
          displayRecommendedModal: null,
          displaySurveyPrompt: null,
        });
      },

      persistTerminalSelection: async (code: string, uuid: string | null) => {
        set({
          terminalId: code,
          posTerminalUuid: uuid,
        });
        const st = get();
        const user = useAuthStore.getState().user;
        if (!user) return;
        try {
          await api.patch(
            "/auth/me/pos-screen-preferences/",
            {
              show_ready_notifs: st.showReadyNotifs,
              show_waiter_call_notifs: st.showWaiterCallNotifs,
              play_notif_sound: st.playNotifSound,
              payment_printers: st.paymentPrinters,
              auto_print_order: st.autoPrintOrder,
              auto_print_payment: st.autoPrintPayment,
              stock_tracking_mode: st.stockTrackingMode,
              performance_mode: st.performanceMode,
              show_customer_display: st.showCustomerDisplay,
              assigned_pos_terminal_uuid: uuid || null,
              assigned_terminal_code: code ?? "",
            },
            { params: { context: st.settingsContext } },
          );
        } catch (err) {
          console.error("[PosStore] Failed to persist terminal selection:", err);
        }
      },
    };
  }),
);

/** Sunucu PATCH debounce'unun ilk yüklemede tetiklenmesini kapatır / açar. */
export { markPosCloudPrefsSaveAllowed } from "./posSettingsLogic";

/** GET ile gelen tercihleri store'a yazar; terminal ataması sunucuda kayıtlıysa uygular. */
export function applyServerPosScreenPreferences(
  prefs: Record<string, unknown> | null | undefined,
) {
  if (!prefs || typeof prefs !== "object") return;

  setSkipCloudPrefsRemoteSave(true);
  const mode = prefs.stock_tracking_mode;

  const newState: Partial<PosStore> = {};
  if (prefs.show_ready_notifs !== undefined) {
    newState.showReadyNotifs = Boolean(prefs.show_ready_notifs);
  }
  if (prefs.show_waiter_call_notifs !== undefined) {
    newState.showWaiterCallNotifs = Boolean(prefs.show_waiter_call_notifs);
  }
  if (prefs.play_notif_sound !== undefined) {
    newState.playNotifSound = Boolean(prefs.play_notif_sound);
  }
  if (prefs.payment_printers !== undefined) {
    newState.paymentPrinters = normalizePrinterList(prefs.payment_printers);
  }
  if (prefs.auto_print_order !== undefined) {
    newState.autoPrintOrder = Boolean(prefs.auto_print_order);
  }
  if (prefs.auto_print_payment !== undefined) {
    newState.autoPrintPayment = Boolean(prefs.auto_print_payment);
  }
  if (mode === "INGREDIENT" || mode === "PRODUCT") {
    newState.stockTrackingMode = mode;
  }
  if (prefs.performance_mode !== undefined) {
    newState.performanceMode = Boolean(prefs.performance_mode);
  }
  if (prefs.show_customer_display !== undefined) {
    newState.showCustomerDisplay = Boolean(prefs.show_customer_display);
  }

  const stNow = usePosStore.getState();
  const localTerminalEmpty =
    !stNow.posTerminalUuid && !String(stNow.terminalId || "").trim();

  if (
    localTerminalEmpty &&
    (Object.prototype.hasOwnProperty.call(prefs, "assigned_pos_terminal_uuid") ||
      Object.prototype.hasOwnProperty.call(prefs, "assigned_terminal_code"))
  ) {
    const rawUuid = prefs.assigned_pos_terminal_uuid;
    const rawCode = prefs.assigned_terminal_code;
    if (rawUuid === null || rawUuid === undefined || rawUuid === "") {
      newState.posTerminalUuid = null;
      newState.terminalId = typeof rawCode === "string" ? rawCode : "";
    } else {
      newState.posTerminalUuid = String(rawUuid);
      newState.terminalId = typeof rawCode === "string" ? rawCode : "";
    }
  }

  usePosStore.setState(newState);
  queueMicrotask(() => {
    setSkipCloudPrefsRemoteSave(false);
  });
}

/** --- Derived selectors: Computed values --- */
export { selectCartTotal } from "./posStoreSelectors";

usePosStore.subscribe(
  (s) =>
    [
      s.showReadyNotifs,
      s.showWaiterCallNotifs,
      s.playNotifSound,
      s.terminalId,
      s.posTerminalUuid,
      s.paymentPrinters,
      s.autoPrintOrder,
      s.autoPrintPayment,
      s.stockTrackingMode,
      s.performanceMode,
      s.tableGridColumns,
      s.showCustomerDisplay,
      s.settingsContext,
    ] as const,
  (curr, prev) => {
    if (prev && deepEqual(curr, prev)) return;

    const [
      notifs,
      waiterCallNotifs,
      sound,
      tid,
      tuuid,
      pPrinters,
      autoOrder,
      autoPayment,
      stockMode,
      perfMode,
      gridCols,
      showCustomerDisplay,
      context,
    ] = curr;
    const storageKey = context === "waiter" ? "waiter_prefs" : "pos_prefs";

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        showReadyNotifs: notifs,
        showWaiterCallNotifs: waiterCallNotifs,
        playNotifSound: sound,
        terminalId: tid,
        posTerminalUuid: tuuid ?? null,
        paymentPrinters: pPrinters,
        autoPrintOrder: autoOrder,
        autoPrintPayment: autoPayment,
        stockTrackingMode: stockMode,
        performanceMode: perfMode,
        tableGridColumns: gridCols,
        showCustomerDisplay: showCustomerDisplay,
      }),
    );
  },
);

/** --- Sepet / seçili masa senkronu (sekme arası) --- */
setupPosSyncChannel({
  subscribe: (selector, callback, options) =>
    usePosStore.subscribe(
      (s) => selector(s as unknown as Record<string, unknown>),
      callback,
      options,
    ),
  getState: () => usePosStore.getState() as unknown as Record<string, unknown>,
  setState: (partial) => usePosStore.setState(partial as Partial<PosStore>),
});

usePosStore.subscribe(
  (s) => ({
    showReadyNotifs: s.showReadyNotifs,
    showWaiterCallNotifs: s.showWaiterCallNotifs,
    playNotifSound: s.playNotifSound,
    showCustomerDisplay: s.showCustomerDisplay,
    paymentPrinters: s.paymentPrinters,
    autoPrintOrder: s.autoPrintOrder,
    autoPrintPayment: s.autoPrintPayment,
    stockTrackingMode: s.stockTrackingMode,
    performanceMode: s.performanceMode,
    settingsContext: s.settingsContext,
    posTerminalUuid: s.posTerminalUuid,
    terminalId: s.terminalId,
  }),
  (selected, prev) => {
    if (!isCloudPrefsSaveAllowed()) return;
    if (isSkipCloudPrefsRemoteSave()) return;
    if (prev !== undefined && deepEqual(selected, prev)) return;

    clearCloudPrefsSaveTimer();
    setCloudPrefsSaveTimer(
      setTimeout(() => {
        setCloudPrefsSaveTimer(null);
        if (!useAuthStore.getState().user) return;
        const st = usePosStore.getState();
        const ctx = st.settingsContext;
        void api.patch(
          "/auth/me/pos-screen-preferences/",
          {
            show_ready_notifs: st.showReadyNotifs,
            show_waiter_call_notifs: st.showWaiterCallNotifs,
            play_notif_sound: st.playNotifSound,
            show_customer_display: st.showCustomerDisplay,
            payment_printers: st.paymentPrinters,
            auto_print_order: st.autoPrintOrder,
            auto_print_payment: st.autoPrintPayment,
            stock_tracking_mode: st.stockTrackingMode,
            performance_mode: st.performanceMode,
            assigned_pos_terminal_uuid: st.posTerminalUuid || null,
            assigned_terminal_code: st.terminalId ?? "",
          },
          { params: { context: ctx } },
        );
      }, 650),
    );
  },
);
