// ============================================================
// Ürün detay — sepet satırı ile adet senkronizasyonu
// ============================================================

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useCartStore } from "@/store/cart-store";
import type {
  CartItemModifier,
  Product,
  ProductUnitInfo,
  ProductVariant,
} from "@/types";
import { cartModifiersKey } from "@/utils/cartModifiers";

function lineKey(
  productId: string,
  unitId: string,
  variantId: string | undefined,
  modifiers: CartItemModifier[],
): string {
  return `${productId}|${unitId}|${variantId ?? ""}|${cartModifiersKey(modifiers)}`;
}

export function findCartLineItem(
  items: ReturnType<typeof useCartStore.getState>["items"],
  productId: string,
  unitId: string,
  variantId?: string,
  modifiers: CartItemModifier[] = [],
): (typeof items)[number] | undefined {
  const key = lineKey(productId, unitId, variantId, modifiers);
  return items.find(
    (item) =>
      lineKey(
        item.productId,
        item.unit.id,
        item.variant?.id,
        item.modifiers,
      ) === key,
  );
}

/** Aynı ürün + birim + varyant için tüm modifier kombinasyonlarının toplam adedi. */
export function totalLineQuantity(
  items: ReturnType<typeof useCartStore.getState>["items"],
  productId: string,
  unitId: string,
  variantId?: string,
): number {
  return items
    .filter(
      (item) =>
        item.productId === productId &&
        item.unit.id === unitId &&
        (item.variant?.id ?? undefined) === variantId,
    )
    .reduce((sum, item) => sum + item.quantity, 0);
}

function cloneModifiers(modifiers: CartItemModifier[]): CartItemModifier[] {
  return modifiers.map((modifier) => ({ ...modifier }));
}

export function useProductDetailCartLine(
  product: Product | null,
  unit: ProductUnitInfo | null,
  variant: ProductVariant | undefined,
  modifiers: CartItemModifier[],
) {
  const items = useCartStore((s) => s.items);

  const currentLineQuantity = useMemo(() => {
    if (!product || !unit) return 0;
    const line = findCartLineItem(
      items,
      product.id,
      unit.id,
      variant?.id,
      modifiers,
    );
    return line?.quantity ?? 0;
  }, [items, product, unit, variant, modifiers]);

  const sourceQuantity = useMemo(() => {
    if (!product || !unit) return 0;
    return totalLineQuantity(items, product.id, unit.id, variant?.id);
  }, [items, product, unit, variant]);

  const [draftQuantity, setDraftQuantity] = useState(0);
  const initializedProductIdRef = useRef<string | null>(null);
  const sourceSnapshotRef = useRef<{
    productId: string;
    unit: ProductUnitInfo;
    variant: ProductVariant | undefined;
    modifiers: CartItemModifier[];
    key: string;
    quantity: number;
  } | null>(null);

  const resetDraft = useCallback(() => {
    if (!product || !unit) {
      initializedProductIdRef.current = null;
      sourceSnapshotRef.current = null;
      setDraftQuantity(0);
      return;
    }

    const snapshotModifiers = cloneModifiers(modifiers);
    sourceSnapshotRef.current = {
      productId: product.id,
      unit,
      variant,
      modifiers: snapshotModifiers,
      key: lineKey(product.id, unit.id, variant?.id, snapshotModifiers),
      quantity: currentLineQuantity,
    };
    initializedProductIdRef.current = product.id;
    setDraftQuantity(currentLineQuantity);
  }, [product, unit, variant, modifiers, currentLineQuantity]);

  const [prevCartLineProductId, setPrevCartLineProductId] = useState(
    product?.id ?? null,
  );
  if (prevCartLineProductId !== (product?.id ?? null)) {
    setPrevCartLineProductId(product?.id ?? null);
    if (!product?.id) {
      setDraftQuantity(0);
    } else {
      setDraftQuantity(currentLineQuantity);
    }
  }

  // Effect-only ref updates (refs cannot be updated during render)
  useEffect(() => {
    if (!product?.id) {
      initializedProductIdRef.current = null;
      sourceSnapshotRef.current = null;
      return;
    }
    if (initializedProductIdRef.current !== product.id) {
      const snapshotModifiers = cloneModifiers(modifiers);
      sourceSnapshotRef.current = {
        productId: product.id,
        unit: unit!,
        variant,
        modifiers: snapshotModifiers,
        key: lineKey(product.id, unit!.id, variant?.id, snapshotModifiers),
        quantity: currentLineQuantity,
      };
      initializedProductIdRef.current = product.id;
    }
  }, [product?.id, unit, variant, modifiers, currentLineQuantity]);

  const onIncrease = useCallback(() => {
    if (!product || !unit) return;
    setDraftQuantity((prev) => prev + 1);
  }, [product, unit]);

  const onDecrease = useCallback(() => {
    if (!product || !unit) return;
    setDraftQuantity((prev) => Math.max(0, prev - 1));
  }, [product, unit]);

  const commitDraft = useCallback(() => {
    if (!product || !unit) return null;

    const store = useCartStore.getState();
    const sourceSnapshot = sourceSnapshotRef.current;
    const previousQuantity = sourceSnapshot?.quantity ?? 0;
    const nextModifiers = cloneModifiers(modifiers);
    const nextKey = lineKey(product.id, unit.id, variant?.id, nextModifiers);
    const nextLine = findCartLineItem(
      store.items,
      product.id,
      unit.id,
      variant?.id,
      nextModifiers,
    );

    if (
      sourceSnapshot &&
      sourceSnapshot.key !== nextKey &&
      sourceSnapshot.quantity > 0
    ) {
      store.setLineQuantity(
        product,
        sourceSnapshot.unit,
        sourceSnapshot.variant,
        sourceSnapshot.modifiers,
        0,
      );
    }

    const mergedQuantity =
      sourceSnapshot && sourceSnapshot.key !== nextKey
        ? draftQuantity + (nextLine?.quantity ?? 0)
        : draftQuantity;

    store.setLineQuantity(
      product,
      unit,
      variant,
      nextModifiers,
      mergedQuantity,
    );

    sourceSnapshotRef.current = {
      productId: product.id,
      unit,
      variant,
      modifiers: nextModifiers,
      key: nextKey,
      quantity: mergedQuantity,
    };
    initializedProductIdRef.current = product.id;
    setDraftQuantity(mergedQuantity);
    return {
      quantityDelta: draftQuantity - previousQuantity,
      finalQuantity: mergedQuantity,
    };
  }, [draftQuantity, product, unit, variant, modifiers]);

  return {
    quantity: draftQuantity,
    sourceQuantity,
    onIncrease,
    onDecrease,
    commitDraft,
    resetDraft,
  };
}
