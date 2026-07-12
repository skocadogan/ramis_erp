import type {
  DisplayOptionsModalSync,
  Product,
  ProductModifier,
  ProductUnit,
} from "@/types/pos";
import { productHasAllergens } from "@/features/pos/utils/displayAllergenModal";

function productBaseUnitPrice(product: Product): number {
  if (product.has_discount && product.discounted_price != null) {
    return product.discounted_price;
  }
  return product.base_price;
}

export interface DisplayOptionsModalSelection {
  selectedUnit?: ProductUnit | null | undefined;
  pickedModifiers?: ProductModifier[];
}

/** Kasiyer seçenek modalı → müşteri ekranı WS payload. */
export function buildDisplayOptionsModalPayload(
  product: Product,
  step: "unit" | "modifiers",
  selection?: DisplayOptionsModalSelection
): DisplayOptionsModalSync {
  const hasUnits = (product.units?.length ?? 0) > 0;
  const groups = product.modifier_groups ?? [];
  const base = productBaseUnitPrice(product);
  const picked = selection?.pickedModifiers ?? [];
  const selectedUnit = selection?.selectedUnit;

  let selectedUnitName: string | null | undefined;
  if (selectedUnit !== undefined) {
    selectedUnitName = selectedUnit?.name ?? null;
  }

  return {
    productName: product.name,
    step: hasUnits && step === "unit" ? "unit" : "modifiers",
    standardUnitPrice: base,
    units: hasUnits
      ? (product.units ?? []).map((unit) => ({
          name: unit.name,
          price:
            unit.price_override != null
              ? unit.price_override
              : base * unit.multiplier,
        }))
      : undefined,
    modifiers: groups.flatMap((group) =>
      group.modifiers.map((mod) => ({
        id: mod.id,
        name: mod.name,
        price_adjustment: mod.price_adjustment,
      }))
    ),
    selectedUnitName,
    selectedModifierIds: picked.map((m) => m.id),
    hasAllergens: productHasAllergens(product),
    calories: product.calories ?? null,
  };
}
