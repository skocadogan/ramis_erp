// Satış birimleri — salt okunur tablo (birim türü | fiyat)

import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { formatPrice } from "@/utils/format";
import {
  getSelectableProductUnits,
  getUnitListPrice,
  getUnitSalePrice,
  hasReducedPrice,
  productHasDiscount,
} from "@/utils/pricing";
import type { Language, Product } from "@/types";

interface ProductUnitsTableProps {
  product: Product;
  language?: Language;
}

export function ProductUnitsTable({
  product,
  language = "tr",
}: ProductUnitsTableProps) {
  const { colors } = useTheme();
  const units = getSelectableProductUnits(product);

  const t = {
    title: language === "tr" ? "Birim Seçimi" : "Select Unit",
    unitType: language === "tr" ? "Birim Türü" : "Unit Type",
    price: language === "tr" ? "Fiyat" : "Price",
  };

  return (
    <View>
      <Text
        className="text-base font-bold mb-3"
        style={{ color: colors.foreground }}
      >
        {t.title}
      </Text>

      <View
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <View
          className="flex-row items-center px-3 py-2.5 border-b"
          style={{
            borderBottomColor: colors.border,
            backgroundColor: colors.muted,
          }}
        >
          <Text
            className="flex-1 text-[10px] font-bold uppercase"
            style={{ color: colors.mutedForeground }}
          >
            {t.unitType}
          </Text>
          <Text
            className="text-[10px] font-bold uppercase text-right"
            style={{ color: colors.mutedForeground, minWidth: 72 }}
          >
            {t.price}
          </Text>
        </View>

        {units.map((unit, index) => {
          const unitName =
            language === "en" && unit.nameEn ? unit.nameEn : unit.name;
          const salePrice = getUnitSalePrice(unit, product);
          const listPrice = getUnitListPrice(unit, product);
          const showListPrice =
            productHasDiscount(product) &&
            hasReducedPrice(listPrice, salePrice);
          const isLast = index === units.length - 1;

          return (
            <View
              key={unit.id}
              className={`flex-row items-center px-3 py-3 ${isLast ? "" : "border-b"}`}
              style={{ borderBottomColor: colors.border }}
            >
              <Text
                className="flex-1 text-sm font-semibold pr-2"
                style={{ color: colors.foreground }}
                numberOfLines={2}
              >
                {unitName}
              </Text>
              <View style={{ minWidth: 72, alignItems: "flex-end" }}>
                <Text
                  className="text-sm font-bold"
                  style={{ color: colors.primary }}
                >
                  {formatPrice(salePrice)}
                </Text>
                {showListPrice ? (
                  <Text
                    className="text-xs font-semibold line-through mt-0.5"
                    style={{ color: colors.mutedForeground }}
                  >
                    {formatPrice(listPrice)}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
