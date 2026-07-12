export interface PosSettingsState {
  showReadyNotifs: boolean;
  showWaiterCallNotifs: boolean;
  playNotifSound: boolean;
  showCustomerDisplay: boolean;
  paymentPrinters: { printerId: string; templateSlug: string }[];
  autoPrintOrder: boolean;
  autoPrintPayment: boolean;
  stockTrackingMode: "PRODUCT" | "INGREDIENT";
  performanceMode: boolean;
  tableGridColumns: "auto" | "1" | "2" | "3" | "4";

  activeBranchId: string | null;

  settingsContext: "pos" | "waiter";
  initializeSettings: (context: "pos" | "waiter") => void;

  terminalId: string;
  posTerminalUuid: string | null;

  guestArrivedNotifs: { id: string; message: string; timestamp: number }[];
  addGuestArrivedNotif: (notif: { id: string; message: string }) => void;
  removeGuestArrivedNotif: (id: string) => void;

  waiterCallNotifs: {
    id: string;
    message: string;
    tableId?: string;
    source?: string;
    reservationId?: string;
    customerName?: string;
    timestamp: number;
    reminderPulse?: number;
  }[];
  addWaiterCallNotif: (notif: {
    id: string;
    message: string;
    tableId?: string;
    source?: string;
    reservationId?: string;
    customerName?: string;
  }) => void;
  removeWaiterCallNotif: (id: string) => void;
  applyWaiterCallDismissed: (opts: { dismissAll?: boolean; callIds?: string[] }) => void;
  pulseWaiterCallReminders: () => void;

  setShowReadyNotifs: (val: boolean) => void;
  setShowWaiterCallNotifs: (val: boolean) => void;
  setPlayNotifSound: (val: boolean) => void;
  setShowCustomerDisplay: (val: boolean) => void;
  setPaymentPrinters: (val: { printerId: string; templateSlug: string }[]) => void;
  setAutoPrintOrder: (val: boolean) => void;
  setAutoPrintPayment: (val: boolean) => void;
  setStockTrackingMode: (val: "PRODUCT" | "INGREDIENT") => void;
  setPerformanceMode: (val: boolean) => void;
  setTableGridColumns: (val: "auto" | "1" | "2" | "3" | "4") => void;
}

function loadSettingsFromStorage(context: "pos" | "waiter"): Partial<PosSettingsState> {
  const storageKey = context === "waiter" ? "waiter_prefs" : "pos_prefs";

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const p = JSON.parse(raw) as Record<string, unknown>;
      return {
        showReadyNotifs: p.showReadyNotifs !== undefined ? Boolean(p.showReadyNotifs) : true,
        showWaiterCallNotifs:
          p.showWaiterCallNotifs !== undefined ? Boolean(p.showWaiterCallNotifs) : true,
        playNotifSound: p.playNotifSound !== undefined ? Boolean(p.playNotifSound) : true,
        terminalId: typeof p.terminalId === "string" ? p.terminalId : "",
        posTerminalUuid: typeof p.posTerminalUuid === "string" ? p.posTerminalUuid : null,
        paymentPrinters: Array.isArray(p.paymentPrinters) ? p.paymentPrinters : [],
        autoPrintOrder: p.autoPrintOrder !== undefined ? Boolean(p.autoPrintOrder) : true,
        autoPrintPayment: p.autoPrintPayment !== undefined ? Boolean(p.autoPrintPayment) : false,
        stockTrackingMode: (p.stockTrackingMode as "PRODUCT" | "INGREDIENT") || "PRODUCT",
        performanceMode: Boolean(p.performanceMode),
        tableGridColumns: (p.tableGridColumns as "auto" | "1" | "2" | "3" | "4") || "auto",
        showCustomerDisplay:
          p.showCustomerDisplay !== undefined ? Boolean(p.showCustomerDisplay) : true,
      };
    }
  } catch {
    /* Bozuk JSON varsa varsayılanlarla devam et */
  }

  const prefix = context === "waiter" ? "waiter" : "pos";
  const legacyLoad = (key: string) => localStorage.getItem(`${prefix}_${key}`);
  const legacyBool = (key: string, fallback: boolean) => {
    const v = legacyLoad(key);
    return v !== null ? v === "true" : fallback;
  };

  return {
    showReadyNotifs: legacyBool("show_notifs", true),
    showWaiterCallNotifs: legacyBool("show_waiter_call_notifs", true),
    playNotifSound: legacyBool("play_sound", true),
    terminalId: legacyLoad("terminal_id") || "",
    posTerminalUuid: legacyLoad("terminal_uuid") || null,
    paymentPrinters: (() => {
      try {
        const v = legacyLoad("payment_printers");
        return v ? JSON.parse(v) : [];
      } catch {
        return [];
      }
    })(),
    autoPrintOrder: legacyBool("auto_print_order", true),
    autoPrintPayment: legacyBool("auto_print_payment", false),
    stockTrackingMode: (legacyLoad("stock_tracking_mode") as "PRODUCT" | "INGREDIENT") || "PRODUCT",
    performanceMode: legacyLoad("performance_mode") === "true",
    tableGridColumns: (legacyLoad("table_grid_columns") as "auto" | "1" | "2" | "3" | "4") || "auto",
    showCustomerDisplay: legacyBool("show_customer_display", true),
  };
}

export function createPosSettingsSlice(
  set: (partial: Partial<PosSettingsState> | ((state: PosSettingsState) => Partial<PosSettingsState>)) => void,
  get: () => PosSettingsState,
): PosSettingsState {
  return {
    showReadyNotifs: true,
    showWaiterCallNotifs: true,
    playNotifSound: true,
    showCustomerDisplay: true,
    paymentPrinters: [],
    autoPrintOrder: true,
    autoPrintPayment: false,
    stockTrackingMode: "PRODUCT",
    performanceMode: false,
    tableGridColumns: "auto",

    activeBranchId: null,

    settingsContext: "pos",
    initializeSettings: (context) => {
      set({ settingsContext: context, ...loadSettingsFromStorage(context) });
    },

    terminalId: "",
    posTerminalUuid: null,

    guestArrivedNotifs: [],
    addGuestArrivedNotif: (notif) =>
      set((state) => ({
        guestArrivedNotifs: [
          { ...notif, timestamp: Date.now() },
          ...state.guestArrivedNotifs,
        ].slice(0, 50),
      })),
    removeGuestArrivedNotif: (id) =>
      set((state) => ({
        guestArrivedNotifs: state.guestArrivedNotifs.filter((n) => n.id !== id),
      })),

    waiterCallNotifs: [],
    addWaiterCallNotif: (notif) =>
      set((state) => {
        if (state.waiterCallNotifs.some((n) => n.id === notif.id)) return state;
        return {
          waiterCallNotifs: [
            { ...notif, timestamp: Date.now() },
            ...state.waiterCallNotifs,
          ].slice(0, 50),
        };
      }),
    removeWaiterCallNotif: (id) =>
      set((state) => ({
        waiterCallNotifs: state.waiterCallNotifs.filter((n) => n.id !== id),
      })),
    applyWaiterCallDismissed: ({ dismissAll, callIds }) =>
      set((state) => {
        if (dismissAll) {
          return { waiterCallNotifs: [] };
        }
        if (!callIds?.length) return state;
        const drop = new Set(callIds);
        return {
          waiterCallNotifs: state.waiterCallNotifs.filter((n) => !drop.has(n.id)),
        };
      }),
    pulseWaiterCallReminders: () =>
      set((state) => {
        if (state.waiterCallNotifs.length === 0) return state;
        return {
          waiterCallNotifs: state.waiterCallNotifs.map((n) => ({
            ...n,
            reminderPulse: (n.reminderPulse ?? 0) + 1,
          })),
        };
      }),

    setShowReadyNotifs: (val) => {
      localStorage.setItem(`${get().settingsContext}_show_notifs`, String(val));
      set({ showReadyNotifs: val });
    },
    setShowWaiterCallNotifs: (val) => {
      localStorage.setItem(`${get().settingsContext}_show_waiter_call_notifs`, String(val));
      set({ showWaiterCallNotifs: val });
    },
    setPlayNotifSound: (val) => {
      localStorage.setItem(`${get().settingsContext}_play_sound`, String(val));
      set({ playNotifSound: val });
    },
    setPaymentPrinters: (val) => {
      const newVal = val.map((p) => ({ ...p }));
      localStorage.setItem(`${get().settingsContext}_payment_printers`, JSON.stringify(newVal));
      set({ paymentPrinters: newVal });
    },
    setAutoPrintOrder: (val) => {
      localStorage.setItem(`${get().settingsContext}_auto_print_order`, String(val));
      set({ autoPrintOrder: val });
    },
    setAutoPrintPayment: (val) => {
      localStorage.setItem(`${get().settingsContext}_auto_print_payment`, String(val));
      set({ autoPrintPayment: val });
    },
    setStockTrackingMode: (val) => {
      localStorage.setItem(`${get().settingsContext}_stock_tracking_mode`, val);
      set({ stockTrackingMode: val });
    },
    setPerformanceMode: (val) => {
      localStorage.setItem(`${get().settingsContext}_performance_mode`, String(val));
      set({ performanceMode: val });
    },
    setTableGridColumns: (val) => {
      localStorage.setItem(`${get().settingsContext}_table_grid_columns`, val);
      set({ tableGridColumns: val });
    },
    setShowCustomerDisplay: (val) => {
      localStorage.setItem(`${get().settingsContext}_show_customer_display`, String(val));
      set({ showCustomerDisplay: val });
    },
  };
}
