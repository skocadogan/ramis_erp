import { create } from "zustand";
import { persist, createJSONStorage, StateStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import apiClient from "../api/client";
import { fetchTerminalStockTrackingMode, type StockTrackingMode } from "../api/posStockCheck";

// Hata Toleranslı Depolama Sarmalayıcısı
// AsyncStorage Native modülü null ise (derleme/restart sorunu) uygulamanın çökmesini engeller.
const customStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(name);
    } catch (e) {
      console.warn("AsyncStorage getItem error, falling back to null", e);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (e) {
      console.warn("AsyncStorage setItem error, skipping persistence", e);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (e) {
      console.warn("AsyncStorage removeItem error", e);
    }
  },
};

import type { Product, ProductUnit } from "../types/models";

export interface CartItem {
  cartId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  selectedUnit?: ProductUnit;
  selectedModifiers?: { id: string; name: string; price_adjustment: number }[];
  notes?: string;
}

/**
 * Sepete ekleme/miktar güncelleme sonucu.
 * - `capped=true` ise kullanıcıya "En fazla X adet ekleyebilirsiniz" uyarısı
 *   gösterilmelidir.
 * - `maxAddable` sepete hâlâ kaç adet daha eklenebileceğini gösterir
 *   (LIMITED ürünler için). null ise sınır yok demektir.
 */
export interface CartAddResult {
  added: number;
  requested: number;
  capped: boolean;
  maxAddable: number | null;
}

type CartProductIndex = {
  cartProductQty: Record<string, number>;
  cartFirstItemByProductId: Record<string, CartItem>;
};

function rebuildCartProductIndex(cart: CartItem[]): CartProductIndex {
  const cartProductQty: Record<string, number> = {};
  const cartFirstItemByProductId: Record<string, CartItem> = {};
  for (const item of cart) {
    const pid = String(item.product.id);
    cartProductQty[pid] = (cartProductQty[pid] ?? 0) + item.quantity;
    if (!cartFirstItemByProductId[pid]) {
      cartFirstItemByProductId[pid] = item;
    }
  }
  return { cartProductQty, cartFirstItemByProductId };
}

const EMPTY_CART_INDEX = rebuildCartProductIndex([]);

/**
 * "Ürün kısıtına göre" modunda (`availability_mode === "LIMITED"`) sepete
 * eklenebilecek maksimum adedi hesaplar. Aksi halde sınır yoktur.
 *
 * - Aynı ürünün sepette farklı varyasyonları (unit, modifier) olabilir;
 *   bunların toplam miktarı `remaining_portions` ile sınırlanır.
 * - Bu fonksiyon sadece hesap yapar; state'i değiştirmez.
 */
function computeAddToCartConstraint(
  product: Product,
  cart: CartItem[],
  requested: number
): { maxAddable: number | null; added: number; capped: boolean } {
  if (product?.availability_mode !== "LIMITED") {
    return { maxAddable: null, added: requested, capped: false };
  }
  const remaining = product.remaining_portions;
  if (remaining == null) {
    return { maxAddable: null, added: requested, capped: false };
  }
  const inCart = cart
    .filter((item) => {
      const pid = item.product?.id;
      return pid != null && String(pid) === String(product.id);
    })
    .reduce((sum, item) => sum + item.quantity, 0);
  const maxAddable = Math.max(0, Number(remaining) - inCart);
  if (requested <= maxAddable) {
    return { maxAddable, added: requested, capped: false };
  }
  return { maxAddable, added: maxAddable, capped: true };
}

interface PosState {
  terminalId: string;
  posTerminalUuid: string | null;
  activeBranchId: string | null;
  selectedTable: import("../types/models").Table | null;
  cart: CartItem[];
  cartProductQty: Record<string, number>;
  cartFirstItemByProductId: Record<string, CartItem>;
  cartTableId: string | null;
  stockTrackingMode: StockTrackingMode;
  showReadyNotifs: boolean;
  showWaiterCallNotifs: boolean;
  playNotifSound: boolean;
  language: "tr" | "en" | "bg" | "sq";
  autoPrintOrder: boolean;
  autoPrintPayment: boolean;
  paymentPrinterId: string | null;
  paymentTemplateSlug: string | null;
  tableGridColumns: "auto" | "1" | "2" | "3" | "4" | "5";
  themePreference: "light" | "dark" | "system";
  setTerminal: (code: string, uuid: string | null) => void;
  setActiveBranchId: (id: string | null) => void;
  setSelectedTable: (table: import("../types/models").Table | null) => void;
  setCartTableId: (tableId: string | null) => void;
  /**
   * Sepete ürün ekler. `availability_mode === "LIMITED"` ürünlerde
   * `remaining_portions` sınırını aşmadan (sığdığı kadar) ekler.
   * @returns Eklenen miktar, talep edilen miktar, sınıra takılıp takılmadığı,
   *          ve sınıra takıldıysa sepete hâlâ kaç adet eklenebileceği.
   */
  addToCart: (
    product: Product,
    unit?: ProductUnit,
    qty?: number,
    selectedModifiers?: { id: string; name: string; price_adjustment: number }[]
  ) => CartAddResult;
  /**
   * Sepetteki ürün miktarını arttırır/azaltır. `availability_mode === "LIMITED"`
   * ürünlerde `remaining_portions` sınırını aşmaz.
   * @returns Eklenen/çıkarılan miktar, talep edilen delta, sınıra takılıp
   *          takılmadığı, ve sınıra takıldıysa sepete hâlâ kaç adet daha
   *          eklenebileceği.
   */
  updateQuantity: (cartId: string, delta: number) => CartAddResult;
  updateCartItemNotes: (cartId: string, notes: string) => void;
  clearCart: () => void;
  syncStockTrackingModeFromTerminal: (terminalUuid: string | null) => Promise<void>;
  persistTerminalSelection: (code: string, uuid: string | null) => Promise<void>;
  setShowReadyNotifs: (val: boolean) => void;
  setShowWaiterCallNotifs: (val: boolean) => void;
  setPlayNotifSound: (val: boolean) => void;
  setLanguage: (lang: "tr" | "en" | "bg" | "sq") => void;
  setAutoPrintOrder: (val: boolean) => void;
  setAutoPrintPayment: (val: boolean) => void;
  setPaymentPrinterId: (id: string | null) => void;
  setPaymentTemplateSlug: (slug: string | null) => void;
  setTableGridColumns: (val: "auto" | "1" | "2" | "3" | "4" | "5") => void;
  setThemePreference: (val: "light" | "dark" | "system") => void;
  disconnectModalVisible: boolean;
  disconnectModalMessage: string;
  setDisconnectModal: (visible: boolean, message?: string) => void;
  /** Çıkışta terminal, sepet ve bağlantı uyarısını sıfırlar (AsyncStorage persist dahil). */
  resetSessionOnLogout: () => void;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      terminalId: "",
      posTerminalUuid: null,
      activeBranchId: null,
      selectedTable: null,
      cart: [],
      ...EMPTY_CART_INDEX,
      cartTableId: null,
      stockTrackingMode: "PRODUCT",
      showReadyNotifs: true,
      showWaiterCallNotifs: true,
      playNotifSound: true,
      language: "tr",
      autoPrintOrder: true,
      autoPrintPayment: false,
      paymentPrinterId: null,
      paymentTemplateSlug: null,
      tableGridColumns: "auto",
      themePreference: "system",
      disconnectModalVisible: false,
      disconnectModalMessage: "",

      setLanguage: (lang) => set({ language: lang }),
      setShowReadyNotifs: (val) => {
        set({ showReadyNotifs: val });
        void patchWaiterPreferences({ show_ready_notifs: val });
      },
      setShowWaiterCallNotifs: (val) => {
        set({ showWaiterCallNotifs: val });
        void patchWaiterPreferences({ show_waiter_call_notifs: val });
      },
      setPlayNotifSound: (val) => {
        set({ playNotifSound: val });
        void patchWaiterPreferences({ play_notif_sound: val });
      },
      setAutoPrintOrder: (val) => {
        set({ autoPrintOrder: val });
        void patchWaiterPreferences({ auto_print_order: val });
      },
      setAutoPrintPayment: (val) => {
        set({ autoPrintPayment: val });
        void patchWaiterPreferences({ auto_print_payment: val });
      },
      setPaymentPrinterId: (id) => {
        set({ paymentPrinterId: id });
        void patchWaiterPaymentPrefs(get());
      },
      setPaymentTemplateSlug: (slug) => {
        set({ paymentTemplateSlug: slug });
        void patchWaiterPaymentPrefs(get());
      },
      setTableGridColumns: (val) => set({ tableGridColumns: val }),
      setThemePreference: (val) => set({ themePreference: val }),
      setDisconnectModal: (visible, message = "") =>
        set({ disconnectModalVisible: visible, disconnectModalMessage: message }),

      resetSessionOnLogout: () =>
        set({
          terminalId: "",
          posTerminalUuid: null,
          activeBranchId: null,
          selectedTable: null,
          cart: [],
          ...EMPTY_CART_INDEX,
          cartTableId: null,
          disconnectModalVisible: false,
          disconnectModalMessage: "",
        }),

      setTerminal: (code, uuid) => {
        set({ terminalId: code, posTerminalUuid: uuid });
        if (!uuid) {
          set({ stockTrackingMode: "PRODUCT" });
        }
      },

      setActiveBranchId: (id) => {
        const currentId = get().activeBranchId;
        if (currentId === id) return;
        set({
          activeBranchId: id,
          selectedTable: null,
          cart: [],
          ...EMPTY_CART_INDEX,
          cartTableId: null,
          terminalId: "",
          posTerminalUuid: null,
          stockTrackingMode: "PRODUCT",
        });
      },

      setSelectedTable: (table) =>
        set({ selectedTable: table, cart: [], ...EMPTY_CART_INDEX, cartTableId: null }),

      setCartTableId: (tableId) => set({ cartTableId: tableId }),

      addToCart: (product, unit, qty = 1, selectedModifiers) => {
        const currentCart = get().cart;
        // "Ürün kısıtına göre" modunda sepete hâlâ kaç adet eklenebileceğini
        // hesapla. Sınırı aşan miktar kırpılır; UI tarafı dialog gösterir.
        const constraint = computeAddToCartConstraint(product, currentCart, qty);
        if (constraint.added === 0) {
          // Hiç eklenemiyor — tüm kalan miktar sepette zaten var.
          return {
            added: 0,
            requested: qty,
            capped: true,
            maxAddable: constraint.maxAddable,
          };
        }
        set((state) => {
          const discountRate = product.has_discount ? parseFloat(product.discount_rate || "0") : 0;
          const discountFactor = 1 - discountRate / 100;

          let finalPrice = parseFloat(String(product.base_price ?? ""));
          if (product.has_discount && product.discounted_price) {
            finalPrice = parseFloat(String(product.discounted_price));
          }

          if (unit) {
            if (unit.price_override) {
              const overrideVal = parseFloat(String(unit.price_override));
              finalPrice = product.has_discount ? overrideVal * discountFactor : overrideVal;
            } else {
              const mult = parseFloat(String(unit.multiplier ?? "1"));
              finalPrice = finalPrice * mult;
            }
          }

          const mods = (selectedModifiers ?? []).map((m) => ({
            id: m.id,
            name: m.name,
            price_adjustment: Number(m.price_adjustment ?? 0),
          }));
          const modSum = mods.reduce(
            (sum: number, m: { price_adjustment: number }) => sum + m.price_adjustment,
            0
          );
          finalPrice += modSum;

          const modKey = mods
            .map((m: { id: string }) => m.id)
            .sort()
            .join(",");
          const cartId = `${product.id}-${unit?.id || "base"}-${modKey}`;
          const existing = state.cart.find((item) => item.cartId === cartId);

          let nextCart: CartItem[];
          if (existing) {
            nextCart = state.cart.map((item) =>
              item.cartId === cartId
                ? { ...item, quantity: item.quantity + constraint.added }
                : item
            );
          } else {
            nextCart = [
              ...state.cart,
              {
                cartId,
                product,
                quantity: constraint.added,
                unitPrice: finalPrice,
                selectedUnit: unit,
                selectedModifiers: mods,
              },
            ];
          }
          return { cart: nextCart, ...rebuildCartProductIndex(nextCart) };
        });
        return {
          added: constraint.added,
          requested: qty,
          capped: constraint.capped,
          maxAddable: constraint.maxAddable,
        };
      },

      updateQuantity: (cartId, delta) => {
        // Sınır kontrolü: delta>0 ise LIMITED ürünlerde remaining_portions'ı
        // aşamayız. effectiveDelta, sepete uygulanacak gerçek delta olur.
        const state = get();
        const item = state.cart.find((i) => i.cartId === cartId);

        let effectiveDelta = delta;
        let capped = false;
        let maxAddable: number | null = null;

        if (delta > 0 && item) {
          const constraint = computeAddToCartConstraint(item.product, state.cart, delta);
          maxAddable = constraint.maxAddable;
          if (constraint.added === 0) {
            // Sepet zaten dolu
            return { added: 0, requested: delta, capped: true, maxAddable };
          }
          if (constraint.capped) {
            capped = true;
            effectiveDelta = constraint.added;
          }
        }

        set((s) => {
          const nextCart = s.cart
            .map((ci) =>
              ci.cartId === cartId
                ? { ...ci, quantity: Math.max(0, ci.quantity + effectiveDelta) }
                : ci
            )
            .filter((ci) => ci.quantity > 0);
          return { cart: nextCart, ...rebuildCartProductIndex(nextCart) };
        });

        return {
          added: effectiveDelta,
          requested: delta,
          capped,
          maxAddable,
        };
      },

      updateCartItemNotes: (cartId, notes) =>
        set((state) => {
          const nextCart = state.cart.map((item) =>
            item.cartId === cartId ? { ...item, notes: notes.trim() || undefined } : item
          );
          return { cart: nextCart, ...rebuildCartProductIndex(nextCart) };
        }),

      clearCart: () => set({ cart: [], ...EMPTY_CART_INDEX, cartTableId: null }),

      syncStockTrackingModeFromTerminal: async (terminalUuid) => {
        if (!terminalUuid) {
          set({ stockTrackingMode: "PRODUCT" });
          return;
        }
        try {
          const mode = await fetchTerminalStockTrackingMode(terminalUuid);
          set({ stockTrackingMode: mode });
        } catch (err) {
          console.warn("Failed to sync stock tracking mode from terminal:", err);
        }
      },

      persistTerminalSelection: async (code, uuid) => {
        set({ terminalId: code, posTerminalUuid: uuid });
        try {
          await apiClient.patch(
            "/auth/me/pos-screen-preferences/",
            {
              assigned_pos_terminal_uuid: uuid,
              assigned_terminal_code: code,
            },
            { params: { context: "waiter" } }
          );
        } catch (err) {
          console.error("Failed to persist terminal selection:", err);
        }
        await get().syncStockTrackingModeFromTerminal(uuid);
      },
    }),
    {
      name: "ramis-pos-storage-v2",
      storage: createJSONStorage(() => customStorage),
      /**
       * Yalnızca kalıcı olması gereken alanları depola.
       * cart, selectedTable, disconnectModal → oturum arası anlamsız; resetlenmeli.
       */
      partialize: (s) => ({
        terminalId: s.terminalId,
        posTerminalUuid: s.posTerminalUuid,
        activeBranchId: s.activeBranchId,
        stockTrackingMode: s.stockTrackingMode,
        showReadyNotifs: s.showReadyNotifs,
        showWaiterCallNotifs: s.showWaiterCallNotifs,
        playNotifSound: s.playNotifSound,
        language: s.language,
        autoPrintOrder: s.autoPrintOrder,
        autoPrintPayment: s.autoPrintPayment,
        paymentPrinterId: s.paymentPrinterId,
        paymentTemplateSlug: s.paymentTemplateSlug,
        tableGridColumns: s.tableGridColumns,
        themePreference: s.themePreference,
      }),
    }
  )
);

export const selectCartQtyForProduct = (productId: string) => (s: PosState) =>
  s.cartProductQty[productId] ?? 0;

export const selectCartFirstItemForProduct = (productId: string) => (s: PosState) =>
  s.cartFirstItemByProductId[productId] ?? null;

export const selectCartItemCount = (s: PosState) => s.cart.length;

async function patchWaiterPreferences(patch: Record<string, boolean>) {
  try {
    await apiClient.patch("/auth/me/pos-screen-preferences/", patch, {
      params: { context: "waiter" },
    });
  } catch (err) {
    console.warn("Failed to sync waiter preferences:", err);
  }
}

function patchWaiterPaymentPrefs(state: PosState) {
  const payment_printers =
    state.paymentPrinterId && state.paymentTemplateSlug
      ? [{ printerId: state.paymentPrinterId, templateSlug: state.paymentTemplateSlug }]
      : [];
  void apiClient
    .patch(
      "/auth/me/pos-screen-preferences/",
      { payment_printers },
      { params: { context: "waiter" } }
    )
    .catch((err) => console.warn("Failed to sync payment printer prefs:", err));
}

export function applyWaiterScreenPreferences(prefs: Record<string, unknown> | null | undefined) {
  if (!prefs || typeof prefs !== "object") return;
  const next: Partial<PosState> = {};
  if (prefs.show_ready_notifs !== undefined) {
    next.showReadyNotifs = Boolean(prefs.show_ready_notifs);
  }
  if (prefs.show_waiter_call_notifs !== undefined) {
    next.showWaiterCallNotifs = Boolean(prefs.show_waiter_call_notifs);
  }
  if (prefs.play_notif_sound !== undefined) {
    next.playNotifSound = Boolean(prefs.play_notif_sound);
  }
  if (prefs.auto_print_order !== undefined) {
    next.autoPrintOrder = Boolean(prefs.auto_print_order);
  }
  if (prefs.auto_print_payment !== undefined) {
    next.autoPrintPayment = Boolean(prefs.auto_print_payment);
  }
  const paymentPrinters = prefs.payment_printers;
  if (Array.isArray(paymentPrinters) && paymentPrinters.length > 0) {
    const first = paymentPrinters[0] as {
      printerId?: string;
      templateSlug?: string;
      printer_id?: string;
      template_slug?: string;
    };
    const printerId = first?.printerId ?? first?.printer_id;
    const templateSlug = first?.templateSlug ?? first?.template_slug;
    if (printerId) next.paymentPrinterId = String(printerId);
    if (templateSlug) next.paymentTemplateSlug = String(templateSlug);
  }
  if (Object.keys(next).length > 0) {
    usePosStore.setState(next);
  }
}
