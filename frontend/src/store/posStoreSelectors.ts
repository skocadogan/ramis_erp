import type { CartItem } from "@/types/pos";

export const selectCartTotal = (state: { cart: CartItem[] }): number =>
  state.cart.reduce((t, i) => {
    const modSum = (i.selectedModifiers ?? []).reduce((s, m) => s + m.price_adjustment, 0);
    return t + ((i.unitPrice ?? 0) + modSum) * i.quantity;
  }, 0);
