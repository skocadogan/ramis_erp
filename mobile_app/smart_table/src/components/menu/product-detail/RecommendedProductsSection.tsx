import React, { useCallback, useMemo, useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Minus, Plus, Sparkles } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import { useDebouncedCartQuantityToast } from "@/hooks/useDebouncedCartQuantityToast";
import { useCartStore } from "@/store/cart-store";
import { formatPrice } from "@/utils/format";
import {
  getRecommendationSelectableUnits,
  productHasDisplayDescription,
  productHasRecommendations,
  recommendationProductIds,
  isRecommendationCartItem,
  recommendationDefaultUnitId,
  recommendationUnitSalePrice,
  resolveRecommendationProduct,
  resolveRecommendationUnit,
} from "@/utils/recommendedProducts";
import { ProductUnitPickerModal } from "@/components/menu/ProductUnitPickerModal";
import { RecommendedProductDetailModal } from "@/components/menu/product-detail/RecommendedProductDetailModal";
import type { Language, Product } from "@/types";

interface RecommendedProductsSectionProps {
  product: Product;
  catalogProducts?: Product[];
  language?: Language;
  /** Yatay split sütununda daha kompakt başlık */
  compact?: boolean;
  /** Tablo alanını kalan yüksekliğe uzatır ve satırları kaydırılabilir yapar */
  scrollable?: boolean;
  /** Ana ürün adedi (taslak dahil) — 0 iken önerilen ekleme kapalı, sepetten önerilenler silinir */
  sourceProductQuantity?: number;
}

function recommendationCartKey(productId: string, unitId: string): string {
  return `${productId}::${unitId}`;
}

export const RecommendedProductsSection = React.memo(
  function RecommendedProductsSection({
    product,
    catalogProducts,
    language = "tr",
    compact = false,
    scrollable = false,
    sourceProductQuantity = 0,
  }: RecommendedProductsSectionProps) {
    const { colors } = useTheme();
    const items = useCartStore((s) => s.items);
    const addItem = useCartStore((s) => s.addItem);
    const updateQuantity = useCartStore((s) => s.updateQuantity);
    const removeItem = useCartStore((s) => s.removeItem);
    const { enqueueCartItemToast, enqueueCartToast } =
      useDebouncedCartQuantityToast();

    const canAddRecommendations = sourceProductQuantity > 0;
    const recommendationIds = useMemo(
      () => recommendationProductIds(product),
      [product],
    );

    useEffect(() => {
      if (canAddRecommendations || recommendationIds.length === 0) return;

      const cartItems = useCartStore.getState().items;
      const mainProductInCart = cartItems.some(
        (item) => item.productId === product.id,
      );
      if (mainProductInCart) return;

      cartItems
        .filter((item) => isRecommendationCartItem(item, recommendationIds))
        .forEach((item) => removeItem(item.id));
    }, [canAddRecommendations, recommendationIds, removeItem, product.id]);

    const recommendations = product.recommendations;

    const recommendationsKey = useMemo(
      () =>
        (recommendations ?? [])
          .map((r) => `${r.id}:${r.productUnitId ?? ""}`)
          .join("|"),
      [recommendations],
    );

    const [unitOverrides, setUnitOverrides] = useState<Record<string, string>>(
      {},
    );
    const [overridesKey, setOverridesKey] = useState(recommendationsKey);
    const [detailProduct, setDetailProduct] = useState<Product | null>(null);
    const [detailUnitId, setDetailUnitId] = useState<string | undefined>();
    const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
    const [pickerProductId, setPickerProductId] = useState<string | null>(null);

    if (overridesKey !== recommendationsKey) {
      setOverridesKey(recommendationsKey);
      setUnitOverrides({});
    }

    const rows = useMemo(() => {
      const recommendationIdSet = new Set(recommendationIds);
      const cartQtyByKey = new Map<string, number>();
      const cartLineByKey = new Map<string, { id: string; quantity: number }>();

      for (const item of items) {
        if (item.modifiers.length > 0) continue;
        if (!recommendationIdSet.has(item.productId)) continue;

        const key = recommendationCartKey(item.productId, item.unit.id);
        const nextQty = (cartQtyByKey.get(key) ?? 0) + item.quantity;
        cartQtyByKey.set(key, nextQty);
        if (!cartLineByKey.has(key)) {
          cartLineByKey.set(key, { id: item.id, quantity: item.quantity });
        }
      }

      return (recommendations ?? []).map((rec) => {
        const catalogProduct = resolveRecommendationProduct(
          rec,
          catalogProducts ?? [],
        );
        const selectableUnits =
          getRecommendationSelectableUnits(catalogProduct);
        const unitId =
          unitOverrides[rec.productId] ??
          recommendationDefaultUnitId(catalogProduct);
        const cartKey = recommendationCartKey(rec.productId, unitId);
        const price = recommendationUnitSalePrice(catalogProduct, unitId);
        const qty = cartQtyByKey.get(cartKey) ?? 0;
        const cartLine = cartLineByKey.get(cartKey);
        const hasSelectableUnits = selectableUnits.length > 1;
        return {
          rec,
          catalogProduct,
          unitId,
          price,
          qty,
          selectableUnits,
          hasSelectableUnits,
          cartLine,
        };
      });
    }, [
      recommendations,
      catalogProducts,
      unitOverrides,
      items,
      recommendationIds,
    ]);

    const openUnitPicker = useCallback(
      (productId: string, catalogProduct: Product) => {
        if (getRecommendationSelectableUnits(catalogProduct).length <= 1) {
          return;
        }
        setPickerProductId(productId);
        setPickerProduct(catalogProduct);
      },
      [],
    );

    const closeUnitPicker = useCallback(() => {
      setPickerProduct(null);
      setPickerProductId(null);
    }, []);

    const handleUnitSelect = useCallback(
      (catalogProduct: Product, unit: Product["units"][number]) => {
        if (!pickerProductId) {
          closeUnitPicker();
          return;
        }
        const previousUnitId =
          unitOverrides[pickerProductId] ??
          recommendationDefaultUnitId(catalogProduct);
        if (unit.id !== previousUnitId) {
          // Eski birimle sepette kalan önerilen satırları temizle
          useCartStore
            .getState()
            .items.filter(
              (item) =>
                item.productId === pickerProductId &&
                item.modifiers.length === 0,
            )
            .forEach((item) => removeItem(item.id));
        }
        setUnitOverrides((prev) => ({ ...prev, [pickerProductId]: unit.id }));
        closeUnitPicker();
      },
      [closeUnitPicker, pickerProductId, removeItem, unitOverrides],
    );

    const handleAdd = useCallback(
      (catalogProduct: Product, unitId: string) => {
        if (!canAddRecommendations) return;
        const unit = resolveRecommendationUnit(catalogProduct, unitId);
        addItem(catalogProduct, unit, undefined, [], 1);
        enqueueCartToast({
          productName: catalogProduct.name,
          productNameEn: catalogProduct.nameEn,
          unit,
          quantityDelta: 1,
          language,
        });
      },
      [addItem, canAddRecommendations, enqueueCartToast, language],
    );

    const handleRemove = useCallback(
      (line: { id: string; quantity: number } | undefined) => {
        if (line) {
          const item = items.find((cartItem) => cartItem.id === line.id);
          updateQuantity(line.id, line.quantity - 1);
          if (item) {
            enqueueCartItemToast(item, -1, language);
          }
        }
      },
      [enqueueCartItemToast, items, language, updateQuantity],
    );

    const openDetail = useCallback(
      (catalogProduct: Product, unitId: string) => {
        setDetailUnitId(unitId);
        setDetailProduct(catalogProduct);
      },
      [],
    );

    const closeDetail = useCallback(() => {
      setDetailProduct(null);
      setDetailUnitId(undefined);
    }, []);

    if (!productHasRecommendations(product)) return null;

    const t = {
      title: language === "tr" ? "Yanında Önerilenler" : "Recommended With",
      product: language === "tr" ? "Ürün Adı" : "Product",
      unit: language === "tr" ? "Satış Birimi" : "Unit",
      price: language === "tr" ? "Fiyat" : "Price",
      standard: language === "tr" ? "Standart" : "Standard",
      decrease: language === "tr" ? "Azalt" : "Decrease",
      increase: language === "tr" ? "Artır" : "Increase",
      viewDetails:
        language === "tr" ? "Ürün detayını gör" : "View product details",
    };

    const unitLabel = (
      unitId: string,
      units: ReturnType<typeof getRecommendationSelectableUnits>,
    ) => {
      const unit = units.find((item) => item.id === unitId);
      if (!unit) return t.standard;
      return language === "en" && unit.nameEn ? unit.nameEn : unit.name;
    };

    const nameColStyle = compact
      ? { flex: 1 as const, minWidth: 0, paddingRight: 6 }
      : { flex: 2 as const, paddingRight: 8 };
    const unitColStyle = compact
      ? { width: 72 as const, paddingRight: 4 }
      : { flex: 1.4 as const, paddingRight: 8 };
    const priceColStyle = compact
      ? { width: 48 as const, textAlign: "right" as const, paddingRight: 6 }
      : { flex: 1 as const, textAlign: "right" as const, paddingRight: 8 };
    const actionsColStyle = compact
      ? { width: 80 as const }
      : { width: 72 as const };

    const tableBody = (
      <View
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: colors.border, backgroundColor: colors.card }}
      >
        <View
          className="flex-row items-center px-2 py-2.5 border-b"
          style={{
            borderBottomColor: colors.border,
            backgroundColor: colors.muted,
          }}
        >
          <Text
            style={[
              {
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                color: colors.mutedForeground,
              },
              nameColStyle,
            ]}
          >
            {t.product}
          </Text>
          <Text
            style={[
              {
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                color: colors.mutedForeground,
              },
              unitColStyle,
            ]}
          >
            {t.unit}
          </Text>
          <Text
            style={[
              {
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                color: colors.mutedForeground,
              },
              priceColStyle,
            ]}
          >
            {t.price}
          </Text>
          <View style={actionsColStyle} />
        </View>

        {rows.map(
          (
            {
              rec,
              catalogProduct,
              unitId,
              price,
              qty,
              selectableUnits,
              hasSelectableUnits,
              cartLine,
            },
            index,
          ) => {
            const isLast = index === rows.length - 1;
            const nameIsClickable = productHasDisplayDescription(
              catalogProduct,
              language,
            );
            return (
              <View
                key={rec.id}
                className={`flex-row items-center px-2 py-2.5 ${isLast ? "" : "border-b"}`}
                style={{ borderBottomColor: colors.border }}
              >
                {nameIsClickable ? (
                  <Pressable
                    style={nameColStyle}
                    onPress={() => openDetail(catalogProduct, unitId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${rec.name}, ${t.viewDetails}`}
                  >
                    <Text
                      className="text-sm font-semibold underline"
                      style={{ color: colors.primary }}
                      numberOfLines={2}
                    >
                      {rec.name}
                    </Text>
                  </Pressable>
                ) : (
                  <Text
                    style={[
                      {
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.foreground,
                      },
                      nameColStyle,
                    ]}
                    numberOfLines={2}
                  >
                    {rec.name}
                  </Text>
                )}

                <View style={unitColStyle}>
                  {hasSelectableUnits ? (
                    <Pressable
                      onPress={() =>
                        openUnitPicker(rec.productId, catalogProduct)
                      }
                      className="rounded-lg px-1.5 py-1 border"
                      style={{
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      }}
                    >
                      <Text
                        className="text-[10px] font-medium"
                        style={{ color: colors.foreground }}
                        numberOfLines={1}
                      >
                        {unitLabel(unitId, selectableUnits)}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text
                      className="text-[10px]"
                      style={{ color: colors.mutedForeground }}
                    >
                      —
                    </Text>
                  )}
                </View>

                <Text
                  className="text-xs font-bold"
                  style={[{ color: colors.primary }, priceColStyle]}
                >
                  {formatPrice(price)}
                </Text>

                <View
                  style={[
                    actionsColStyle,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 2,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => handleRemove(cartLine)}
                    disabled={qty <= 0}
                    className={`w-7 h-7 rounded-full items-center justify-center border ${qty <= 0 ? "opacity-30" : ""}`}
                    style={{ borderColor: colors.border }}
                    accessibilityRole="button"
                    accessibilityLabel={t.decrease}
                  >
                    <Minus
                      size={12}
                      color={colors.foreground}
                      strokeWidth={2.5}
                    />
                  </Pressable>
                  <Text
                    className="min-w-[14px] text-center text-xs font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {qty}
                  </Text>
                  <Pressable
                    onPress={() => handleAdd(catalogProduct, unitId)}
                    disabled={!canAddRecommendations}
                    className={`w-7 h-7 rounded-full items-center justify-center ${!canAddRecommendations ? "opacity-30" : ""}`}
                    style={{ backgroundColor: colors.primary }}
                    accessibilityRole="button"
                    accessibilityLabel={t.increase}
                    accessibilityState={{ disabled: !canAddRecommendations }}
                  >
                    <Plus
                      size={12}
                      color={colors.primaryForeground}
                      strokeWidth={2.5}
                    />
                  </Pressable>
                </View>
              </View>
            );
          },
        )}
      </View>
    );

    return (
      <View
        style={{
          flex: scrollable ? 1 : undefined,
          flexShrink: 0,
          minHeight: scrollable ? 0 : undefined,
        }}
      >
        <View
          className="flex-row items-start gap-1.5"
          style={{ flexShrink: 0, marginBottom: compact ? 8 : 12 }}
        >
          <View style={{ flexShrink: 0, paddingTop: 2 }}>
            <Sparkles
              size={compact ? 15 : 18}
              color={colors.primary}
              strokeWidth={2}
            />
          </View>
          <Text
            style={{
              flex: 1,
              flexShrink: 1,
              color: colors.foreground,
              fontSize: compact ? 13 : 16,
              fontWeight: "700",
              lineHeight: compact ? 18 : 22,
            }}
          >
            {t.title}
          </Text>
        </View>

        {scrollable ? (
          <ScrollView
            style={{ flex: 1 }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            bounces={false}
          >
            {tableBody}
          </ScrollView>
        ) : (
          tableBody
        )}

        <RecommendedProductDetailModal
          product={detailProduct}
          visible={detailProduct != null}
          initialUnitId={detailUnitId}
          language={language}
          onClose={closeDetail}
        />
        <ProductUnitPickerModal
          visible={pickerProduct != null}
          product={pickerProduct}
          language={language}
          selectedUnitId={
            pickerProduct && pickerProductId
              ? (unitOverrides[pickerProductId] ??
                recommendationDefaultUnitId(pickerProduct))
              : undefined
          }
          subtitle={
            language === "tr"
              ? "Bu önerilen ürün için kullanmak istediğiniz birimi seçin."
              : "Choose the unit you want to use for this recommended product."
          }
          onClose={closeUnitPicker}
          onSelect={handleUnitSelect}
        />
      </View>
    );
  },
);
