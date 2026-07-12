/* eslint-disable react/prop-types */
import React, { memo, useMemo, useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Image } from "expo-image";
import { Minus, ShieldAlert, Sparkles } from "lucide-react-native";
import { getApiUrl } from "../api/client";
import { useI18n } from "../i18n";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { productHasRecommendations } from "../utils/recommendedProducts";
import { RecommendedProductsModal } from "./RecommendedProductsModal";
import type { StockTrackingMode } from "../api/posStockCheck";
import type { CartAddResult } from "../store/usePosStore";
import type { Product } from "../types/models";

interface ProductCardProps {
  product: Product;
  orderedQty: number;
  cartQty: number;
  productItemWidth: number;
  stockTrackingMode: StockTrackingMode;
  /** Ürünün kendisi iletilir; render içinde inline arrow oluşturma memo'yu kırmaz. */
  onPress: (product: Product) => void;
  onLongPress?: (product: Product) => void;
  cartItem: { cartId: string } | null | undefined;
  /** cartItem.cartId ve delta (-1) iletilir; render içinde closure oluşturmaktan kaçınılır. */
  onUpdateQuantity: (cartId: string, delta: number) => void;
  catalogProducts?: Product[];
  onCartLimit?: (result: CartAddResult) => void;
}

const ProductCard = memo(function ProductCard({
  product,
  orderedQty,
  cartQty,
  productItemWidth,
  stockTrackingMode,
  onPress,
  onLongPress,
  cartItem,
  onUpdateQuantity,
  catalogProducts = [],
  onCartLimit,
}: ProductCardProps) {
  const { t } = useI18n();

  let isSoldOut = false;
  let isLimited = false;
  if (stockTrackingMode === "INGREDIENT") {
    isSoldOut = !!product.is_reserved_out;
  } else {
    isSoldOut =
      product.availability_mode === "SOLD_OUT" ||
      (product.availability_mode === "LIMITED" && product.remaining_portions === 0);
    isLimited = product.availability_mode === "LIMITED";
  }
  const showRemaining =
    stockTrackingMode === "PRODUCT" &&
    isLimited &&
    product.remaining_portions != null &&
    product.remaining_portions > 0;

  const totalQty = orderedQty + cartQty;
  const [allergenModalOpen, setAllergenModalOpen] = useState(false);
  const [recommendedModalOpen, setRecommendedModalOpen] = useState(false);
  const hasAllergens = !!product.is_allergenic && (product.allergens?.length ?? 0) > 0;
  const hasRecommendations = productHasRecommendations(product);
  const cardPadding = 14;
  const imageHeight = Math.max(0, productItemWidth - 28);
  const allergenTop = cardPadding + imageHeight - 36;
  const apiUrl = getApiUrl();
  const imageUri = useMemo(() => resolveMediaUrl(product.image, apiUrl), [product.image, apiUrl]);

  const renderFormattedPrice = (
    priceStr: string,
    mainClass: string,
    decimalClass: string,
    colorClass: string = "text-emerald-600 dark:text-emerald-400",
    lineThrough: boolean = false
  ) => {
    const priceNum = parseFloat(priceStr || "0");
    const [integer, decimal] = priceNum.toFixed(2).split(".");
    return (
      <Text
        className={`${colorClass} font-black tracking-tight ${lineThrough ? "line-through font-medium" : ""}`}
      >
        <Text className={mainClass}>{integer}</Text>
        <Text className={decimalClass}>,{decimal}</Text>
      </Text>
    );
  };

  return (
    <View style={{ flex: 1, margin: 6, maxWidth: productItemWidth }} className="relative">
      <Pressable
        onPress={() => onPress(product)}
        onLongPress={onLongPress ? () => onLongPress(product) : undefined}
        delayLongPress={350}
        disabled={isSoldOut && product.pos_block_mode !== "WARN"}
        className={`active:scale-[0.98] transition-all rounded-[28px] p-3.5 relative border bg-card shadow-sm ${
          isSoldOut
            ? "border-border dark:border-border opacity-50 bg-secondary/50"
            : "border-border/80 dark:border-border/80"
        }`}
      >
        <View className="w-full aspect-square rounded-[22px] bg-secondary/60 overflow-hidden mb-3 relative shadow-inner">
          {totalQty > 0 ? (
            <View className="absolute top-2 right-2 z-10 bg-foreground dark:bg-white h-7 min-w-[28px] px-2 rounded-full items-center justify-center border-2 border-white dark:border-background shadow-md">
              <Text className="text-white dark:text-background text-[11px] font-black">
                {totalQty}
              </Text>
            </View>
          ) : null}

          {isSoldOut ? (
            <View className="absolute top-2 left-2 z-10 bg-destructive/90 px-2.5 py-1 rounded-full border border-white/20 shadow-md">
              <Text className="text-white text-[8px] font-black uppercase tracking-wider">
                {t("order.soldOutBadge")}
              </Text>
            </View>
          ) : null}

          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              recyclingKey={String(product.id)}
            />
          ) : (
            <View className="w-full h-full items-center justify-center bg-muted/50 dark:bg-foreground/30">
              {isSoldOut ? (
                <View className="bg-destructive/90 px-3 py-1 rounded-full shadow-md">
                  <Text className="text-white text-[9px] font-black uppercase tracking-wider">
                    {t("order.soldOutBadge")}
                  </Text>
                </View>
              ) : (
                <Text className="text-muted-foreground dark:text-muted-foreground text-[10px] font-black uppercase tracking-wider text-center px-2">
                  {product.category_name}
                </Text>
              )}
            </View>
          )}

          {cartItem ? (
            <View className="absolute bottom-2 right-2 bg-primary/90 px-2.5 py-0.5 rounded-full border border-white dark:border-background shadow-sm">
              <Text className="text-white text-[8px] font-black uppercase tracking-wider">
                {t("order.inCartBadge")}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          className="text-foreground text-sm font-semibold tracking-tight mb-1"
          numberOfLines={2}
        >
          {product.name}
        </Text>

        {product.has_discount && !isSoldOut ? (
          <View className="mt-1">
            <View className="mb-0.5 ml-1">
              {renderFormattedPrice(
                product.base_price ?? "0",
                "text-[11px]",
                "text-[8px]",
                "text-muted-foreground dark:text-muted-foreground",
                true
              )}
            </View>
            <View className="bg-amber-500/95 px-2.5 py-0.5 rounded-full self-start mb-1.5 shadow-sm">
              <Text className="text-white text-[8px] font-black uppercase tracking-wider">
                {t("order.discountBadge", {
                  rate: Math.round(parseFloat(product.discount_rate || "0")),
                })}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="flex-row justify-between items-center mt-1">
          <View>
            {product.has_discount
              ? renderFormattedPrice(product.discounted_price ?? "0", "text-base", "text-[10px]")
              : renderFormattedPrice(
                  product.base_price ?? String(product.price),
                  "text-base",
                  "text-[10px]"
                )}
          </View>
          {cartItem ? (
            <Pressable
              onPress={() => onUpdateQuantity(cartItem.cartId, -1)}
              className="active:scale-90 bg-secondary dark:bg-muted w-8 h-8 rounded-full items-center justify-center border border-border/60 dark:border-border/60 shadow-sm"
            >
              <Minus size={16} color="#1E2A4A" strokeWidth={3} />
            </Pressable>
          ) : null}
        </View>

        {showRemaining ? (
          <View className="mt-2.5 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1 rounded-xl border border-amber-100/60 dark:border-amber-900/30">
            <Text className="text-amber-600 dark:text-amber-400 text-[9px] font-bold text-center">
              {t("order.remaining", { count: Math.round(product.remaining_portions ?? 0) })}
            </Text>
          </View>
        ) : null}
      </Pressable>

      {hasRecommendations ? (
        <Pressable
          onPress={() => setRecommendedModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("order.recommendedIconAria")}
          className="mt-2 mx-1 flex-row h-10 items-center justify-center gap-2 rounded-xl border border-violet-300/80 bg-violet-50 active:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/50"
        >
          <Sparkles size={16} color="#6d28d9" strokeWidth={2.25} />
          <Text className="text-xs font-black uppercase tracking-wide text-violet-800 dark:text-violet-100">
            {t("order.recommendedBadge")}
          </Text>
        </Pressable>
      ) : null}

      {hasAllergens ? (
        <Pressable
          onPress={() => setAllergenModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("order.allergenIconAria")}
          style={{ position: "absolute", left: 20, top: allergenTop, zIndex: 20 }}
          className="h-8 w-8 items-center justify-center rounded-full bg-amber-500 border-2 border-white dark:border-background shadow-md"
        >
          <ShieldAlert size={14} color="#fff" strokeWidth={2.5} />
        </Pressable>
      ) : null}

      {/* Lazy render: Modal sadece açıkken DOM'a eklenir — memory optimization */}
      {recommendedModalOpen ? (
        <RecommendedProductsModal
          sourceProduct={product}
          visible={recommendedModalOpen}
          catalogProducts={catalogProducts}
          onClose={() => setRecommendedModalOpen(false)}
          onCartLimit={onCartLimit}
        />
      ) : null}

      {allergenModalOpen && (
        <Modal
          visible={allergenModalOpen}
          animationType="fade"
          transparent
          onRequestClose={() => setAllergenModalOpen(false)}
        >
          <Pressable
            className="flex-1 bg-black/50 justify-center px-6"
            onPress={() => setAllergenModalOpen(false)}
          >
            <Pressable
              className="rounded-2xl bg-white dark:bg-foreground p-5 border border-amber-100 dark:border-amber-900/40"
              onPress={() => {}}
            >
              <View className="flex-row items-center gap-2 mb-2">
                <ShieldAlert size={18} color="#d97706" />
                <Text className="text-base font-bold text-foreground">
                  {t("order.allergenDialogTitle")}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-foreground mb-3">{product.name}</Text>
              {(product.allergens?.length ?? 0) > 0 ? (
                product.allergens!.map((a) => (
                  <View
                    key={String(a.id)}
                    className="flex-row items-center justify-between py-2 border-b border-border dark:border-border"
                  >
                    <Text className="text-sm text-foreground">{a.name}</Text>
                    <Text className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      {t("order.allergenRisk", { score: a.risk_score })}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-sm text-muted-foreground">
                  {t("order.allergenDialogEmpty")}
                </Text>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </View>
  );
});

export { ProductCard };
