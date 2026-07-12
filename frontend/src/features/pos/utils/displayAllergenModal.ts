import type { DisplayAllergenModalSync, Product } from "@/types/pos";

export function productHasAllergens(product: Product): boolean {
  return !!product.is_allergenic && (product.allergens?.length ?? 0) > 0;
}

/** Kasiyer allerjen diyaloğu → müşteri ekranı WS payload. */
export function buildDisplayAllergenModalPayload(
  product: Product
): DisplayAllergenModalSync | null {
  if (!productHasAllergens(product)) return null;
  return {
    productName: product.name,
    allergens: (product.allergens ?? []).map((a) => ({
      id: a.id,
      name: a.name,
    })),
  };
}
