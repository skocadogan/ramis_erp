import type { Language, Product } from "@/types";

export function useProductDisplayName(
  product: Product | null,
  language: Language,
) {
  if (!product) return "";
  return language === "en" && product.nameEn ? product.nameEn : product.name;
}
