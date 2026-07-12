import { useMemo } from "react";
import { View, Text } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import type { CombinedProductItem, Language, Product } from "@/types";

const QUANTITY_FORMATTERS = {
  tr: new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }),
  en: new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }),
};

interface CombinedProductItemsTableProps {
  items: CombinedProductItem[];
  catalogProducts?: Product[];
  language?: Language;
}

function getDefaultUnitName(
  product: Product | undefined,
  language: Language,
): string {
  const fallback = language === "tr" ? "Varsayılan" : "Default";
  if (!product) return fallback;

  const defaultUnit =
    product.units.find((unit) => unit.isDefault) ?? product.units[0];
  if (!defaultUnit) return fallback;

  return language === "en" && defaultUnit.nameEn
    ? defaultUnit.nameEn
    : defaultUnit.name;
}

function formatQuantity(quantity: number, language: Language): string {
  if (!Number.isFinite(quantity)) return "-";
  return QUANTITY_FORMATTERS[language].format(quantity);
}

export function CombinedProductItemsTable({
  items,
  catalogProducts = [],
  language = "tr",
}: CombinedProductItemsTableProps) {
  const { colors } = useTheme();
  const productMap = useMemo(
    () => new Map(catalogProducts.map((product) => [product.id, product])),
    [catalogProducts],
  );

  if (items.length === 0) return null;

  const t = {
    title: language === "tr" ? "İçerik" : "Contents",
    productName: language === "tr" ? "Ürünün Adı" : "Product Name",
    quantity: language === "tr" ? "Adedi" : "Quantity",
    salesUnit: language === "tr" ? "Satış Birimi" : "Sales Unit",
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
            className="text-[10px] font-bold uppercase pr-2"
            style={{ color: colors.mutedForeground, flex: 1.6 }}
          >
            {t.productName}
          </Text>
          <Text
            className="text-[10px] font-bold uppercase text-center px-1"
            style={{ color: colors.mutedForeground, flex: 0.7 }}
          >
            {t.quantity}
          </Text>
          <Text
            className="text-[10px] font-bold uppercase text-right pl-2"
            style={{ color: colors.mutedForeground, flex: 1 }}
          >
            {t.salesUnit}
          </Text>
        </View>

        {items.map((item, index) => {
          const catalogProduct = productMap.get(item.productId);
          const productName =
            language === "en"
              ? item.productNameEn || catalogProduct?.nameEn || item.productName
              : item.productName || catalogProduct?.name || item.productId;
          const unitName =
            language === "en"
              ? item.productUnitNameEn ||
                item.productUnitName ||
                getDefaultUnitName(catalogProduct, language)
              : item.productUnitName ||
                getDefaultUnitName(catalogProduct, language);
          const isLast = index === items.length - 1;

          return (
            <View
              key={item.id}
              className={`flex-row items-center px-3 py-3 ${isLast ? "" : "border-b"}`}
              style={{ borderBottomColor: colors.border }}
            >
              <Text
                className="text-sm font-semibold pr-2"
                style={{ color: colors.foreground, flex: 1.6 }}
                numberOfLines={2}
              >
                {productName}
              </Text>
              <Text
                className="text-sm font-semibold text-center px-1"
                style={{ color: colors.foreground, flex: 0.7 }}
              >
                {formatQuantity(item.quantity, language)}
              </Text>
              <Text
                className="text-sm text-right pl-2"
                style={{ color: colors.mutedForeground, flex: 1 }}
                numberOfLines={2}
              >
                {unitName}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
