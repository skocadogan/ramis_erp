// ============================================================
// Smart Table — Ürün detay form state (sheet + modal ortak)
// ============================================================

import { useState, useMemo, useCallback } from "react";
import {
  computeLineTotal,
  getDefaultProductUnit,
  resolveProductUnit,
} from "@/utils/pricing";
import type { Product, ProductVariant } from "@/types";

export type CartModifierSelection = {
  groupId: string;
  groupName: string;
  modifierId: string;
  modifierName: string;
  price: number;
};

export function computeModifierToggle(
  prev: Record<string, string[]>,
  groupId: string,
  modifierId: string,
  product: Product | null,
): Record<string, string[]> {
  const current = prev[groupId] ?? [];
  const group = product?.modifierGroups.find((g) => g.id === groupId);
  if (!group) return prev;

  if (group.isMultiple) {
    if (current.includes(modifierId)) {
      return {
        ...prev,
        [groupId]: current.filter((id) => id !== modifierId),
      };
    }
    if (current.length < group.maxSelection) {
      return { ...prev, [groupId]: [...current, modifierId] };
    }
    return prev;
  }

  if (current.includes(modifierId)) {
    const next = { ...prev };
    delete next[groupId];
    return next;
  }
  return { ...prev, [groupId]: [modifierId] };
}

export function buildCartModifiersFromSelection(
  product: Product,
  selection: Record<string, string[]>,
): CartModifierSelection[] {
  return Object.entries(selection).flatMap(([groupId, modIds]) => {
    const group = product.modifierGroups.find((g) => g.id === groupId);
    if (!group) return [];
    return modIds.map((modId) => {
      const mod = group.modifiers.find((m) => m.id === modId);
      return {
        groupId,
        groupName: group.name,
        modifierId: modId,
        modifierName: mod?.name ?? "",
        price: mod?.price ?? 0,
      };
    });
  });
}

export function useProductDetailForm(product: Product | null) {
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState<
    Record<string, string[]>
  >({});

  const [prevFormProductId, setPrevFormProductId] = useState(
    product?.id ?? null,
  );
  if (product?.id && product.id !== prevFormProductId) {
    setPrevFormProductId(product.id);
    const defaultUnit = getDefaultProductUnit(product);
    const defaultVariant =
      product.variants.find((v) => v.isDefault) ?? product.variants[0];
    setSelectedUnitId(defaultUnit.id);
    setSelectedVariantId(defaultVariant?.id ?? "");
    setSelectedModifiers({});
  }

  const selectedUnit = useMemo(
    () => (product ? resolveProductUnit(product, selectedUnitId) : null),
    [product, selectedUnitId],
  );

  const selectedVariant = useMemo(
    () => product?.variants.find((v) => v.id === selectedVariantId) ?? null,
    [product, selectedVariantId],
  );

  const modifierSum = useMemo(() => {
    if (!product) return 0;
    return Object.entries(selectedModifiers)
      .flatMap(([, modIds]) =>
        modIds
          .map((modId) => {
            for (const mg of product.modifierGroups) {
              const found = mg.modifiers.find((m) => m.id === modId);
              if (found) return found.price;
            }
            return 0;
          })
          .reduce((a, b) => a + b, 0),
      )
      .reduce((a, b) => a + b, 0);
  }, [product, selectedModifiers]);

  const variantAdj = selectedVariant?.priceAdjustment ?? 0;

  const computeDisplayTotals = useCallback(
    (quantity: number) => {
      if (!product || quantity <= 0) {
        return { totalPrice: 0, listPrice: 0 };
      }
      const unit = resolveProductUnit(product, selectedUnitId);
      const totalPrice = computeLineTotal({
        unit,
        product,
        variantAdjustment: variantAdj,
        modifierTotal: 0,
        quantity,
      });
      const listPrice = computeLineTotal({
        unit,
        product,
        variantAdjustment: variantAdj,
        modifierTotal: 0,
        quantity,
        useListPrice: true,
      });
      return { totalPrice, listPrice };
    },
    [product, selectedUnitId, variantAdj],
  );

  const computeTotals = useCallback(
    (quantity: number) => {
      if (!product || quantity <= 0) {
        return { totalPrice: 0, listPrice: 0 };
      }
      const unit = resolveProductUnit(product, selectedUnitId);
      const totalPrice = computeLineTotal({
        unit,
        product,
        variantAdjustment: variantAdj,
        modifierTotal: modifierSum,
        quantity,
      });
      const listPrice = computeLineTotal({
        unit,
        product,
        variantAdjustment: variantAdj,
        modifierTotal: modifierSum,
        quantity,
        useListPrice: true,
      });
      return { totalPrice, listPrice };
    },
    [product, selectedUnitId, variantAdj, modifierSum],
  );

  const handleModifierToggle = useCallback(
    (groupId: string, modifierId: string) => {
      setSelectedModifiers((prev) =>
        computeModifierToggle(prev, groupId, modifierId, product),
      );
    },
    [product],
  );

  const applyModifierToggle = useCallback(
    (groupId: string, modifierId: string): Record<string, string[]> => {
      const nextSelected = computeModifierToggle(
        selectedModifiers,
        groupId,
        modifierId,
        product,
      );
      setSelectedModifiers(nextSelected);
      return nextSelected;
    },
    [product, selectedModifiers],
  );

  const buildCartModifiers = useCallback((): CartModifierSelection[] => {
    if (!product) return [];
    return buildCartModifiersFromSelection(product, selectedModifiers);
  }, [product, selectedModifiers]);

  const resetModifiers = useCallback(() => {
    setSelectedModifiers({});
  }, []);

  const resolvedUnit = useMemo(() => {
    if (!product) return null;
    return resolveProductUnit(product, selectedUnitId);
  }, [product, selectedUnitId]);

  const resolvedVariant: ProductVariant | undefined =
    selectedVariant ?? undefined;

  return {
    selectedUnitId,
    setSelectedUnitId,
    selectedVariantId,
    setSelectedVariantId,
    selectedModifiers,
    selectedUnit,
    selectedVariant,
    modifierSum,
    computeDisplayTotals,
    computeTotals,
    handleModifierToggle,
    applyModifierToggle,
    buildCartModifiers,
    resetModifiers,
    resolvedUnit,
    resolvedVariant,
  };
}
