import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, TouchableOpacity } from "react-native";
import { Minus, Plus, Sparkles, X } from "lucide-react-native";
import { useI18n } from "../i18n";
import { usePosStore, type CartAddResult } from "../store/usePosStore";
import {
  STANDARD_UNIT,
  cartQtyForRecommendation,
  findCartItemForRecommendation,
  formatDisplayPrice,
  productHasDisplayDescription,
  recommendationDefaultUnitId,
  resolveRecommendationProduct,
  unitDisplayPrice,
  unitIdToCartUnit,
} from "../utils/recommendedProducts";
import { RecommendedProductDetailModal } from "./RecommendedProductDetailModal";
import type { Product, ProductRecommendation } from "../types/models";

interface RecommendedProductsModalProps {
  sourceProduct: Product;
  visible: boolean;
  catalogProducts: Product[];
  onClose: () => void;
  onCartLimit?: (result: CartAddResult) => void;
}

function buildDefaultUnitSelections(
  recommendations: ProductRecommendation[] | undefined
): Record<string, string> {
  const initial: Record<string, string> = {};
  for (const rec of recommendations ?? []) {
    initial[String(rec.product_id)] = recommendationDefaultUnitId(rec);
  }
  return initial;
}

export const RecommendedProductsModal: React.FC<RecommendedProductsModalProps> = ({
  sourceProduct,
  visible,
  catalogProducts,
  onClose,
  onCartLimit,
}) => {
  const { t } = useI18n();
  const cart = usePosStore((s) => s.cart);
  const addToCart = usePosStore((s) => s.addToCart);
  const updateQuantity = usePosStore((s) => s.updateQuantity);

  const recommendations = useMemo(
    () => sourceProduct.recommendations ?? [],
    [sourceProduct.recommendations]
  );
  const recommendationsKey = useMemo(
    () => recommendations.map((r) => `${r.id}:${r.product_unit_id ?? ""}`).join("|"),
    [recommendations]
  );

  const defaultUnitSelections = useMemo(
    () => buildDefaultUnitSelections(recommendations),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recommendationsKey]
  );

  const [unitOverrides, setUnitOverrides] = useState<Record<string, string>>({});
  const [overridesKey, setOverridesKey] = useState(recommendationsKey);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailUnitId, setDetailUnitId] = useState<string | undefined>();

  useEffect(() => {
    if (!visible) return;
    setUnitOverrides({});
    setOverridesKey(recommendationsKey);
    setDetailProduct(null);
    setDetailUnitId(undefined);
  }, [visible, recommendationsKey]);

  if (overridesKey !== recommendationsKey) {
    setOverridesKey(recommendationsKey);
    setUnitOverrides({});
  }

  const unitSelections = useMemo(
    () => ({ ...defaultUnitSelections, ...unitOverrides }),
    [defaultUnitSelections, unitOverrides]
  );

  const rows = useMemo(() => {
    return recommendations.map((rec) => {
      const catalogProduct = resolveRecommendationProduct(rec, catalogProducts);
      const unitId = unitSelections[String(rec.product_id)] ?? recommendationDefaultUnitId(rec);
      const price = unitDisplayPrice(catalogProduct, unitId);
      const qty = cartQtyForRecommendation(cart, String(rec.product_id), unitId);
      const units = catalogProduct.units?.length ? catalogProduct.units : (rec.units ?? []);
      return { rec, catalogProduct, unitId, price, qty, units };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations, catalogProducts, unitSelections, cart]);

  const cycleUnit = useCallback(
    (rec: ProductRecommendation, units: ProductRecommendation["units"]) => {
      if (!units || units.length === 0) return;
      const productId = String(rec.product_id);
      const current = unitSelections[productId] ?? recommendationDefaultUnitId(rec);
      const options = [STANDARD_UNIT, ...units.map((u) => String(u.id))];
      const idx = options.indexOf(current);
      const next = options[(idx + 1) % options.length];
      setUnitOverrides((prev) => ({ ...prev, [productId]: next }));
    },
    [unitSelections]
  );

  const handleAdd = useCallback(
    (catalogProduct: Product, unitId: string) => {
      const unit = unitIdToCartUnit(catalogProduct, unitId);
      const result = addToCart(catalogProduct, unit ?? undefined, 1, []);
      onCartLimit?.(result);
    },
    [addToCart, onCartLimit]
  );

  const handleRemove = useCallback(
    (productId: string, unitId: string) => {
      const match = findCartItemForRecommendation(cart, productId, unitId);
      if (match) {
        updateQuantity(match.cartId, -1);
      }
    },
    [cart, updateQuantity]
  );

  const openDetail = useCallback((catalogProduct: Product, unitId: string) => {
    setDetailUnitId(unitId);
    setDetailProduct(catalogProduct);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailProduct(null);
    setDetailUnitId(undefined);
  }, []);

  const unitLabel = (unitId: string, units: ProductRecommendation["units"]) => {
    if (unitId === STANDARD_UNIT) return t("order.unitStandard");
    const unit = units?.find((u) => String(u.id) === unitId);
    return unit?.name ?? t("order.unitStandard");
  };

  if (!visible) return null;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <View className="flex-1 justify-center px-5 bg-black/55">
          <Pressable className="absolute inset-0" onPress={onClose} />

          <View className="rounded-3xl border border-border bg-card shadow-2xl max-h-[88%] overflow-hidden">
            <View className="flex-row items-start justify-between px-5 pt-5 pb-3 border-b border-border">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center gap-2 mb-1">
                  <Sparkles size={18} color="#7c3aed" strokeWidth={2.25} />
                  <Text className="text-lg font-extrabold text-foreground">
                    {t("order.recommendedDialogTitle")}
                  </Text>
                </View>
                <Text className="text-sm text-muted-foreground">{sourceProduct.name}</Text>
              </View>
              <Pressable
                onPress={onClose}
                className="w-9 h-9 rounded-full items-center justify-center bg-secondary"
                accessibilityRole="button"
                accessibilityLabel={t("common.cancel")}
              >
                <X size={20} color="#1E2A4A" strokeWidth={2.5} />
              </Pressable>
            </View>

            <ScrollView className="px-3 py-3" showsVerticalScrollIndicator={false} bounces={false}>
              <View className="rounded-2xl border border-border overflow-hidden bg-card">
                <View className="flex-row items-center px-2 py-2.5 bg-secondary/60 border-b border-border">
                  <Text className="flex-[2] text-[10px] font-bold uppercase text-muted-foreground pr-2">
                    {t("order.recommendedColProduct")}
                  </Text>
                  <Text className="flex-[1.2] text-[10px] font-bold uppercase text-muted-foreground pr-2">
                    {t("order.recommendedColUnit")}
                  </Text>
                  <Text className="flex-1 text-[10px] font-bold uppercase text-muted-foreground text-right pr-2">
                    {t("order.recommendedColPrice")}
                  </Text>
                  <View className="w-[76px]" />
                </View>

                {rows.map(({ rec, catalogProduct, unitId, price, qty, units }, index) => {
                  const hasUnits = (units?.length ?? 0) > 0;
                  const isLast = index === rows.length - 1;
                  const nameIsClickable = productHasDisplayDescription(catalogProduct);

                  return (
                    <View
                      key={rec.id}
                      className={`flex-row items-center px-2 py-2.5 ${isLast ? "" : "border-b border-border"}`}
                    >
                      {nameIsClickable ? (
                        <TouchableOpacity
                          style={{ flex: 2, paddingRight: 8 }}
                          onPress={() => openDetail(catalogProduct, unitId)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={t("order.recommendedViewDetails")}
                        >
                          <Text
                            className="text-sm font-semibold text-primary underline"
                            numberOfLines={2}
                          >
                            {rec.name}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text
                          className="flex-[2] text-sm font-semibold text-foreground pr-2"
                          numberOfLines={2}
                        >
                          {rec.name}
                        </Text>
                      )}

                      <View style={{ flex: 1.2, paddingRight: 8 }}>
                        {hasUnits ? (
                          <TouchableOpacity
                            onPress={() => cycleUnit(rec, units)}
                            activeOpacity={0.7}
                            className="rounded-lg px-1.5 py-1 border border-border bg-background"
                          >
                            <Text
                              className="text-[10px] font-medium text-foreground"
                              numberOfLines={1}
                            >
                              {unitLabel(unitId, units)}
                            </Text>
                          </TouchableOpacity>
                        ) : (
                          <Text className="text-[10px] text-muted-foreground">—</Text>
                        )}
                      </View>

                      <Text className="flex-1 text-xs font-bold text-primary text-right pr-2">
                        {formatDisplayPrice(price)}
                      </Text>

                      <View className="w-[76px] flex-row items-center justify-end gap-0.5">
                        <TouchableOpacity
                          onPress={() => handleRemove(String(rec.product_id), unitId)}
                          disabled={qty <= 0}
                          activeOpacity={0.7}
                          className={`w-7 h-7 rounded-full items-center justify-center border border-border ${qty <= 0 ? "opacity-30" : ""}`}
                          accessibilityRole="button"
                          accessibilityLabel={t("order.recommendedDecrease")}
                        >
                          <Minus size={12} color="#1E2A4A" strokeWidth={2.5} />
                        </TouchableOpacity>
                        <Text className="min-w-[14px] text-center text-xs font-bold text-foreground">
                          {qty}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleAdd(catalogProduct, unitId)}
                          activeOpacity={0.7}
                          className="w-7 h-7 rounded-full items-center justify-center bg-primary"
                          accessibilityRole="button"
                          accessibilityLabel={t("order.recommendedIncrease")}
                        >
                          <Plus size={12} color="#fff" strokeWidth={2.5} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <RecommendedProductDetailModal
        product={detailProduct}
        visible={detailProduct != null}
        initialUnitId={detailUnitId}
        onClose={closeDetail}
      />
    </>
  );
};
