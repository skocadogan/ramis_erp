import type { Table, Product, CartItem, ProductUnit, ProductModifier } from "@/types/pos";
import {
  type CartAddResult,
  addToCartLogic,
  updateQuantityLogic,
  updateCartItemNotesLogic,
} from "../posCartLogic";

export interface PosCartState {
  cart: CartItem[];
  selectedTable: Table | null;
  selectedZone: string;
  selectedCategory: string | null;
  reservationConfirmTable: Table | null;
  orderModalTable: Table | null;

  setSelectedZone: (zoneId: string) => void;
  setSelectedCategory: (categoryId: string | null) => void;
  setReservationConfirmTable: (table: Table | null) => void;
  setOrderModalTable: (table: Table | null) => void;

  addToCart: (
    product: Product,
    unit?: ProductUnit,
    selectedModifiers?: ProductModifier[],
  ) => CartAddResult;
  updateQuantity: (cartId: string, delta: number) => CartAddResult;
  updateCartItemNotes: (cartId: string, notes: string) => void;
  clearCart: () => void;
}

export function createPosCartSlice(
  set: (partial: Partial<PosCartState> | ((state: PosCartState) => Partial<PosCartState>)) => void,
  get: () => PosCartState,
): PosCartState {
  return {
    cart: [],
    selectedTable: null,
    selectedZone: "ALL",
    selectedCategory: null,
    reservationConfirmTable: null,
    orderModalTable: null,

    setSelectedZone: (zoneId) => set({ selectedZone: zoneId }),
    setSelectedCategory: (categoryId) => set({ selectedCategory: categoryId }),
    setReservationConfirmTable: (table) => set({ reservationConfirmTable: table }),
    setOrderModalTable: (table) => set({ orderModalTable: table }),

    addToCart: (product, unit, selectedModifiers) => {
      const state = get();
      const result = addToCartLogic(state, product, unit, selectedModifiers);
      if (!result) {
        return { added: 0, requested: 1, capped: false, maxAddable: null };
      }
      set({ cart: result.cart });
      return result.result;
    },

    updateQuantity: (cartId, delta) => {
      const state = get();
      const result = updateQuantityLogic(state.cart, cartId, delta);
      set({ cart: result.cart });
      return result.result;
    },

    updateCartItemNotes: (cartId, notes) =>
      set((state) => ({
        cart: updateCartItemNotesLogic(state.cart, cartId, notes),
      })),

    clearCart: () => set({ cart: [] }),
  };
}
