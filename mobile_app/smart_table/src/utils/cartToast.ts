import type { Language, ProductUnitInfo } from "@/types";

interface CartToastPayload {
  productName: string;
  productNameEn?: string;
  unit: ProductUnitInfo;
  quantityDelta: number;
  language: Language;
}

function unitNameForToast(unit: ProductUnitInfo, language: Language): string {
  return language === "en" && unit.nameEn ? unit.nameEn : unit.name;
}

export function buildCartQuantityToast({
  productName,
  productNameEn,
  unit,
  quantityDelta,
  language,
}: CartToastPayload): string | null {
  if (quantityDelta === 0) {
    return null;
  }

  const displayName =
    language === "en" && productNameEn ? productNameEn : productName;
  const unitName = unitNameForToast(unit, language);
  const absoluteDelta = Math.abs(quantityDelta);

  if (language === "tr") {
    return `${displayName} - ${unitName} - ${absoluteDelta} adet ${quantityDelta > 0 ? "eklendi" : "çıkartıldı"}`;
  }

  return `${displayName} - ${unitName} - ${absoluteDelta} item${absoluteDelta > 1 ? "s" : ""} ${quantityDelta > 0 ? "added" : "removed"}`;
}
