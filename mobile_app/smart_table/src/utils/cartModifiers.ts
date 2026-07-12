import type { CartItemModifier } from "@/types";

/**
 * Modifier dizisini sıra-bağımsız, belirleyici bir string key'e dönüştürür.
 * Cart store'da O(1) lookup için kullanılır.
 */
export function cartModifiersKey(modifiers: CartItemModifier[] = []): string {
  if (modifiers.length === 0) return "";
  return modifiers
    .map((m) => m.modifierId)
    .sort()
    .join(",");
}
