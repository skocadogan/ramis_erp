import { create } from "zustand";
import {
  CartItem,
  Product,
  ProductUnitInfo,
  ProductVariant,
  CartItemModifier,
} from "@/types";
import { getUnitSalePrice, getProductSalePrice } from "@/utils/pricing";
import { cartModifiersKey } from "@/utils/cartModifiers";

interface CartState {
  items: CartItem[];
  tableId: string | null;
  note: string;
  /** Derived: sum of item.totalPrice */
  totalAmount: number;
  /** Derived: sum of item.quantity */
  itemCount: number;

  // Actions
  setTable: (tableId: string) => void;
  addItem: (
    product: Product,
    unit: ProductUnitInfo,
    variant?: ProductVariant,
    modifiers?: CartItemModifier[],
    quantity?: number,
    note?: string,
  ) => void;
  setLineQuantity: (
    product: Product,
    unit: ProductUnitInfo,
    variant: ProductVariant | undefined,
    modifiers: CartItemModifier[],
    quantity: number,
  ) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  setNote: (note: string) => void;
}

/** O(1) cart line lookup key: productId + unitId + variantId + modifiersKey */
function lineKey(
  productId: string,
  unitId: string,
  variantId: string | undefined,
  modifiers: CartItemModifier[],
): string {
  return `${productId}|${unitId}|${variantId ?? ""}|${cartModifiersKey(modifiers)}`;
}

function buildLineMap(items: CartItem[]): Map<string, CartItem> {
  const map = new Map<string, CartItem>();
  for (const item of items) {
    map.set(
      lineKey(item.productId, item.unit.id, item.variant?.id, item.modifiers),
      item,
    );
  }
  return map;
}

function buildCartLine(
  product: Product,
  unit: ProductUnitInfo,
  variant: ProductVariant | undefined,
  modifiers: CartItemModifier[],
  quantity: number,
  note?: string,
  existingId?: string,
): CartItem {
  const variantPrice = variant?.priceAdjustment || 0;
  const modifierPrice = modifiers.reduce((sum, m) => sum + m.price, 0);
  const productSalePrice = getProductSalePrice(product);
  const unitPrice =
    getUnitSalePrice(unit, product) + variantPrice + modifierPrice;

  return {
    id:
      existingId ||
      `cart-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    productId: product.id,
    productName: product.name,
    productNameEn: product.nameEn,
    imageUrl: product.imageUrl,
    variant,
    unit,
    quantity,
    modifiers,
    productSalePrice,
    unitPrice,
    totalPrice: unitPrice * quantity,
    note,
  };
}

/** Compute derived totals from a CartItem array. */
function calcTotalAmount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.totalPrice, 0);
}

function calcItemCount(items: CartItem[]): number {
  return items.reduce((count, item) => count + item.quantity, 0);
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tableId: null,
  note: "",
  totalAmount: 0,
  itemCount: 0,

  setTable: (tableId) => set({ tableId }),

  addItem: (product, unit, variant, modifiers = [], quantity = 1, note) => {
    const key = lineKey(product.id, unit.id, variant?.id, modifiers);
    const lineMap = buildLineMap(get().items);
    const existing = lineMap.get(key);

    if (existing) {
      const newQty = existing.quantity + quantity;
      set((state) => {
        const newItems = state.items.map((item) =>
          item.id === existing.id
            ? { ...item, quantity: newQty, totalPrice: newQty * item.unitPrice }
            : item,
        );
        return {
          items: newItems,
          totalAmount: calcTotalAmount(newItems),
          itemCount: calcItemCount(newItems),
        };
      });
    } else {
      const newItem = buildCartLine(
        product,
        unit,
        variant,
        modifiers,
        quantity,
        note,
      );
      set((state) => {
        const newItems = [...state.items, newItem];
        return {
          items: newItems,
          totalAmount: calcTotalAmount(newItems),
          itemCount: calcItemCount(newItems),
        };
      });
    }
  },

  setLineQuantity: (product, unit, variant, modifiers = [], quantity) => {
    const key = lineKey(product.id, unit.id, variant?.id, modifiers);
    const lineMap = buildLineMap(get().items);
    const existing = lineMap.get(key);

    if (quantity <= 0) {
      if (existing) {
        set((state) => {
          const newItems = state.items.filter((item) => item.id !== existing.id);
          return {
            items: newItems,
            totalAmount: calcTotalAmount(newItems),
            itemCount: calcItemCount(newItems),
          };
        });
      }
      return;
    }

    if (existing) {
      set((state) => {
        const newItems = state.items.map((item) =>
          item.id === existing.id
            ? { ...item, quantity, totalPrice: item.unitPrice * quantity }
            : item,
        );
        return {
          items: newItems,
          totalAmount: calcTotalAmount(newItems),
          itemCount: calcItemCount(newItems),
        };
      });
      return;
    }

    const newItem = buildCartLine(product, unit, variant, modifiers, quantity);
    set((state) => {
      const newItems = [...state.items, newItem];
      return {
        items: newItems,
        totalAmount: calcTotalAmount(newItems),
        itemCount: calcItemCount(newItems),
      };
    });
  },

  removeItem: (itemId) => {
    set((state) => {
      const newItems = state.items.filter((item) => item.id !== itemId);
      return {
        items: newItems,
        totalAmount: calcTotalAmount(newItems),
        itemCount: calcItemCount(newItems),
      };
    });
  },

  updateQuantity: (itemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }
    set((state) => {
      const newItems = state.items.map((item) =>
        item.id === itemId
          ? { ...item, quantity, totalPrice: item.unitPrice * quantity }
          : item,
      );
      return {
        items: newItems,
        totalAmount: calcTotalAmount(newItems),
        itemCount: calcItemCount(newItems),
      };
    });
  },

  clearCart: () => set({ items: [], note: "", totalAmount: 0, itemCount: 0 }),

  setNote: (note) => set({ note }),
}));

// ─── Selectors (now read from derived state) ──────────────────
export const selectCartTotal = (s: CartState) => s.totalAmount;
export const selectCartItemCount = (s: CartState) => s.itemCount;
