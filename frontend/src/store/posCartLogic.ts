import { v4 as uuidv4 } from "uuid";
import type { Product, ProductUnit, ProductModifier, CartItem } from "@/types/pos";

function cartMergeSignature(
  productId: string,
  unit: ProductUnit | null | undefined,
  notes?: string,
  modifierIds?: string[]
): string {
  const unitKey = unit ? String(unit.id ?? unit.name) : "base";
  const notesKey = notes?.trim() ?? "";
  const modKey = (modifierIds ?? []).slice().sort().join(",");
  return `${productId}|${unitKey}|${notesKey}|${modKey}`;
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

/**
 * "Ürün kısıtına göre" modunda (`availability_mode === "LIMITED"`) sepete
 * eklenebilecek maksimum adedi hesaplar. Aksi halde sınır yoktur.
 *
 * - Aynı ürünün sepette farklı varyasyonları (unit, modifier, notes) olabilir;
 *   bunların toplam miktarı `remaining_portions` ile sınırlanır.
 * - Bu fonksiyon sadece hesap yapar; state'i değiştirmez.
 */
function computeAddToCartConstraint(
  product: Product,
  cart: CartItem[],
  requested: number,
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

export function addToCartLogic(
  state: { cart: CartItem[] },
  product: Product,
  unit?: ProductUnit,
  selectedModifiers?: ProductModifier[],
): { cart: CartItem[]; result: CartAddResult } | null {
  if (product.show_on_pos === false || product.is_active === false) {
    return null;
  }

  const mods = selectedModifiers ?? [];
  const modIds = mods.map((m) => m.id);

  // "Ürün kısıtına göre" modunda sepete hâlâ kaç adet eklenebileceğini
  // hesapla. Sınırı aşan miktar kırpılır; UI tarafı dialog gösterir.
  const constraint = computeAddToCartConstraint(product, state.cart, 1);
  if (constraint.added === 0) {
    return {
      cart: state.cart,
      result: {
        added: 0,
        requested: 1,
        capped: true,
        maxAddable: constraint.maxAddable,
      },
    };
  }

  let finalPrice = product.base_price;
  if (unit) {
    if (unit.price_override !== undefined && unit.price_override !== null) {
      finalPrice = unit.price_override;
    } else {
      finalPrice = finalPrice * unit.multiplier;
    }
  } else if (product.has_discount && product.discounted_price !== undefined && product.discounted_price !== null) {
    finalPrice = product.discounted_price;
  }

  const mergeSignature = cartMergeSignature(product.id, unit, "", modIds);
  const existing = state.cart.find(
    (item) =>
      cartMergeSignature(
        item.product.id,
        item.selectedUnit,
        item.notes,
        (item.selectedModifiers ?? []).map((m) => m.id)
      ) === mergeSignature
  );

  if (existing) {
    return {
      cart: state.cart.map((item) =>
        item.cartId === existing.cartId
          ? { ...item, quantity: item.quantity + constraint.added }
          : item
      ),
      result: {
        added: constraint.added,
        requested: 1,
        capped: constraint.capped,
        maxAddable: constraint.maxAddable,
      },
    };
  }

  return {
    cart: [
      ...state.cart,
      {
        cartId: uuidv4(),
        product,
        quantity: constraint.added,
        selectedUnit: unit,
        unitPrice: finalPrice,
        selectedModifiers: mods,
      },
    ],
    result: {
      added: constraint.added,
      requested: 1,
      capped: constraint.capped,
      maxAddable: constraint.maxAddable,
    },
  };
}

export function updateQuantityLogic(
  cart: CartItem[],
  cartId: string,
  delta: number
): { cart: CartItem[]; result: CartAddResult } {
  const item = cart.find((ci) => ci.cartId === cartId);

  let effectiveDelta = delta;
  let capped = false;
  let maxAddable: number | null = null;

  if (delta > 0 && item) {
    const product = item.product as Product;
    // computeAddToCartConstraint delta=delta ile çağrılır
    const inCart = cart
      .filter((ci) => {
        const pid = ci.product?.id;
        return pid != null && String(pid) === String(product.id);
      })
      .reduce((sum, ci) => sum + ci.quantity, 0);
    if (product?.availability_mode === "LIMITED" && product.remaining_portions != null) {
      const remaining = Number(product.remaining_portions) - inCart;
      maxAddable = Math.max(0, remaining);
      if (maxAddable === 0) {
        capped = true;
        effectiveDelta = 0;
      } else if (delta > maxAddable) {
        capped = true;
        effectiveDelta = maxAddable;
      }
    }
  }

  const nextCart = cart
    .map((item) => {
      if (item.cartId === cartId) {
        return { ...item, quantity: Math.max(0, item.quantity + effectiveDelta) };
      }
      return item;
    })
    .filter((item) => item.quantity > 0);

  return {
    cart: nextCart,
    result: {
      added: effectiveDelta,
      requested: delta,
      capped,
      maxAddable,
    },
  };
}

export function updateCartItemNotesLogic(
  cart: CartItem[],
  cartId: string,
  notes: string
): CartItem[] {
  return cart.map((item) =>
    item.cartId === cartId ? { ...item, notes: notes.trim() || undefined } : item
  );
}
