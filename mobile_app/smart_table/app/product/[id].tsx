// ============================================================
// Smart Table — Product Detail Screen (Modal)
//
// Full-screen modal that presents a premium restaurant menu
// item detail view. Receives product id from route params,
// fetches the product from RAMIS API,
// and provides full add-to-cart functionality.
// ============================================================

import React, { useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Star,
  AlertTriangle,
  ShoppingCart,
  ChevronLeft,
  WifiOff,
  ChefHat,
} from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";
import { useCartStore } from "@/store/cart-store";
import { useProductDetailCartLine } from "@/hooks/useProductDetailCartLine";
import { useProductDetailModifierToggle } from "@/hooks/useProductDetailModifierToggle";
import { useProductDetail, useMenuNormalized as useMenu } from "@/services/useMenuNormalized";
import { useTheme } from "@/hooks/useTheme";
import { useProductDetailLayout } from "@/hooks/useProductDetailLayout";
import { useProductDetailForm } from "@/hooks/useProductDetailForm";
import { useDebouncedCartQuantityToast } from "@/hooks/useDebouncedCartQuantityToast";
import { formatPrice } from "@/utils/format";
import {
  getSelectableProductUnits,
  hasSelectableProductUnits,
  productHasDiscount,
} from "@/utils/pricing";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProductDetailHero } from "@/components/menu/product-detail/ProductDetailHero";
import { CombinedProductItemsTable } from "@/components/menu/product-detail/CombinedProductItemsTable";
import { RecommendedProductsSection } from "@/components/menu/product-detail/RecommendedProductsSection";
import { productHasRecommendations } from "@/utils/recommendedProducts";
import {
  SegmentedControl,
  ModifierGroupSection,
  AllergenChip,
  ProductCaloriesLabel,
  ProductDetailQuantityRow,
} from "@/components/menu/product-detail/shared";
import type { Product, ProductUnitInfo, ProductVariant } from "@/types";

// ─── Constants ──────────────────────────────────────────────

const MAX_RATING = 5;

// ─── Star Rating ────────────────────────────────────────────

const Stars = React.memo(function Stars({
  rating,
  size = 16,
}: {
  rating: number;
  size?: number;
}) {
  const { colors } = useTheme();
  const stars: React.ReactNode[] = [];
  const activeColor = colors.warning;
  const inactiveColor = colors.muted;

  for (let i = 1; i <= MAX_RATING; i++) {
    const filled = i <= Math.floor(rating);
    const half =
      !filled &&
      i === Math.floor(rating) + 1 &&
      rating - Math.floor(rating) >= 0.3;
    stars.push(
      <Star
        key={i}
        size={size}
        fill={filled || half ? activeColor : "transparent"}
        color={filled || half ? activeColor : inactiveColor}
        strokeWidth={1.5}
      />,
    );
  }
  return <View className="flex-row items-center gap-0.5">{stars}</View>;
});

// ─── Nutrition Pill ─────────────────────────────────────────

function NutritionPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View className="items-center gap-1 py-2.5 px-3 bg-muted rounded-2xl flex-1">
      <View
        className="w-8 h-8 rounded-full items-center justify-center"
        style={{ backgroundColor: `${color}20` }}
      >
        <Text className="text-sm font-bold" style={{ color }}>
          {value.replace(/[^0-9]/g, "")}
        </Text>
      </View>
      <Text className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Text>
      <Text className="text-[10px] text-muted-foreground">
        {value.replace(/[0-9]/g, "").trim() || ""}
      </Text>
    </View>
  );
}

// ─── Product Detail Screen ──────────────────────────────────

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const language = useUIStore((s) => s.language);
  const { isDark, colors } = useTheme();
  const layout = useProductDetailLayout();
  const { enqueueCartToast, flushCartToast } = useDebouncedCartQuantityToast();

  const { product, isLoading, error, refresh } = useProductDetail(id ?? "");
  const { products: catalogProducts } = useMenu();

  const {
    selectedUnitId,
    setSelectedUnitId,
    selectedVariantId,
    setSelectedVariantId,
    selectedModifiers,
    computeDisplayTotals,
    applyModifierToggle,
    buildCartModifiers,
    resetModifiers,
    resolvedUnit,
    resolvedVariant,
  } = useProductDetailForm(product);

  const cartModifiers = useMemo(
    () => buildCartModifiers(),
    [buildCartModifiers],
  );

  const { quantity, sourceQuantity, onIncrease, onDecrease, commitDraft } =
    useProductDetailCartLine(
      product,
      resolvedUnit,
      resolvedVariant,
      cartModifiers,
    );

  const onModifierToggle = useProductDetailModifierToggle(applyModifierToggle);

  const prevSourceQuantity = useRef(sourceQuantity);

  useEffect(() => {
    if (prevSourceQuantity.current > 0 && sourceQuantity <= 0) {
      resetModifiers();
    }
    prevSourceQuantity.current = sourceQuantity;
  }, [sourceQuantity, resetModifiers]);

  const { totalPrice, listPrice } = useMemo(
    () => computeDisplayTotals(Math.max(quantity, 1)),
    [computeDisplayTotals, quantity, selectedUnitId, selectedVariantId],
  );

  // ── Handlers ──
  const handleGoBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleCommitAndGoBack = useCallback(() => {
    commitDraft();
    flushCartToast();
    router.back();
  }, [commitDraft, flushCartToast, router]);

  const handleIncreaseWithToast = useCallback(() => {
    onIncrease();
    if (!product || !resolvedUnit) return;
    enqueueCartToast({
      productName: product.name,
      productNameEn: product.nameEn,
      unit: resolvedUnit,
      quantityDelta: 1,
      language,
    });
  }, [enqueueCartToast, language, onIncrease, product, resolvedUnit]);

  const handleDecreaseWithToast = useCallback(() => {
    if (quantity <= 0) return;
    onDecrease();
    if (!product || !resolvedUnit) return;
    enqueueCartToast({
      productName: product.name,
      productNameEn: product.nameEn,
      unit: resolvedUnit,
      quantityDelta: -1,
      language,
    });
  }, [enqueueCartToast, language, onDecrease, product, quantity, resolvedUnit]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          className="text-sm font-medium mt-4"
          style={{ color: colors.mutedForeground }}
        >
          {language === "tr" ? "Yükleniyor..." : "Loading..."}
        </Text>
      </SafeAreaView>
    );
  }

  // ── Error / Not found state ──
  if (!product) {
    const isNotFound = error === "Ürün bulunamadı";
    const title = isNotFound
      ? language === "tr"
        ? "Ürün bulunamadı"
        : "Product not found"
      : language === "tr"
        ? "Ürün yüklenemedi"
        : "Failed to load product";
    const subtitle = isNotFound
      ? language === "tr"
        ? "Ürün bilgilerine erişilemiyor."
        : "Product information is not available."
      : (error ??
        (language === "tr"
          ? "Bağlantı hatası. Lütfen tekrar deneyin."
          : "Connection error. Please try again."));

    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: colors.background }}
      >
        <View
          className="w-24 h-24 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: colors.muted }}
        >
          {isNotFound ? (
            <AlertTriangle
              size={44}
              color={colors.destructive}
              strokeWidth={1.5}
            />
          ) : (
            <WifiOff size={44} color={colors.warning} strokeWidth={1.5} />
          )}
        </View>
        <Text
          className="text-xl font-bold text-center mb-2"
          style={{ color: colors.foreground }}
        >
          {title}
        </Text>
        <Text
          className="text-base text-center mb-8"
          style={{ color: colors.mutedForeground }}
        >
          {subtitle}
        </Text>
        {!isNotFound ? (
          <Button
            variant="outline"
            size="lg"
            onPress={refresh}
            className="mb-3"
          >
            {language === "tr" ? "Tekrar Dene" : "Retry"}
          </Button>
        ) : null}
        <Button variant="primary" size="lg" onPress={handleGoBack}>
          {language === "tr" ? "Geri Dön" : "Go Back"}
        </Button>
      </SafeAreaView>
    );
  }

  // ── Texts ──
  const t = {
    rating: language === "tr" ? "Değerlendirme" : "Rating",
    description: language === "tr" ? "Açıklama" : "Description",
    ingredients: language === "tr" ? "İçindekiler" : "Ingredients",
    allergens: language === "tr" ? "Alerjen Uyarıları" : "Allergen Warnings",
    nutrition: language === "tr" ? "Besin Değerleri" : "Nutrition Facts",
    calories: language === "tr" ? "Kalori" : "Calories",
    protein: language === "tr" ? "Protein" : "Protein",
    carbs: language === "tr" ? "Karbonhidrat" : "Carbs",
    fat: language === "tr" ? "Yağ" : "Fat",
    fiber: language === "tr" ? "Lif" : "Fiber",
    unit: language === "tr" ? "Birim Seçimi" : "Select Unit",
    variant: language === "tr" ? "Varyant" : "Variant",
    extras: language === "tr" ? "Ekstralar" : "Extras",
    addToCart: language === "tr" ? "Menüye Dön" : "Back to Menu",
    close: language === "tr" ? "Kapat" : "Close",
    quantity: language === "tr" ? "Adet" : "Quantity",
    soldOut: language === "tr" ? "Tükendi" : "Sold Out",
    soldOutDesc:
      language === "tr"
        ? "Bu ürünün günlük stoğu tükenmiştir."
        : "This product is out of stock for today.",
    remainingLow:
      language === "tr" ? "Son {count} porsiyon" : "Only {count} left",
  };

  // ── Stock Status (kalan porsiyon) ──
  // "Ürün kısıtına göre" modunda kalan porsiyon hesabı.
  // useMemo gerekmez (pahalı hesap değil) ve hooks sıralamasını bozmamak
  // için burada IIFE ile hesaplanır.
  const remainingAfterCart: number | null = (() => {
    if (product.availabilityMode === "SOLD_OUT") return 0;
    if (product.availabilityMode !== "LIMITED") return null;
    return Math.max(0, product.remainingPortions ?? 0);
  })();
  const isSoldOut = product.availabilityMode === "SOLD_OUT";

  const displayName = language === "tr" ? product.name : product.nameEn;
  const displayDescription =
    language === "tr" ? product.description : product.descriptionEn;
  const displayIngredients =
    language === "tr" ? product.ingredients : product.ingredientsEn;
  const selectableUnits = getSelectableProductUnits(product);

  const stockBanner = isSoldOut ? (
    <View
      className="flex-row items-center gap-2 rounded-2xl px-4 py-3"
      style={{ backgroundColor: isDark ? "#450A0A" : "#FEE2E2" }}
    >
      <AlertTriangle size={18} color={colors.destructive} strokeWidth={2.2} />
      <View className="flex-1">
        <Text
          className="text-sm font-bold"
          style={{ color: colors.destructive }}
        >
          {t.soldOut}
        </Text>
        <Text className="text-xs mt-0.5" style={{ color: colors.destructive }}>
          {t.soldOutDesc}
        </Text>
      </View>
    </View>
  ) : remainingAfterCart != null &&
    remainingAfterCart > 0 &&
    remainingAfterCart <= 3 ? (
    <View
      className="flex-row items-center gap-2 rounded-2xl px-4 py-3"
      style={{ backgroundColor: isDark ? "#451A03" : "#FEF3C7" }}
    >
      <AlertTriangle size={18} color={colors.warning} strokeWidth={2.2} />
      <Text
        className="text-sm font-bold flex-1"
        style={{ color: isDark ? "#FCD34D" : "#92400E" }}
      >
        {t.remainingLow.replace("{count}", String(remainingAfterCart))}
      </Text>
    </View>
  ) : null;

  const addToCartButton = (
    <Button
      variant="primary"
      size="lg"
      fullWidth
      onPress={handleCommitAndGoBack}
      className="shadow-xl"
      style={{
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
      }}
    >
      <View className="flex-row items-center justify-center gap-2">
        <ShoppingCart size={22} color="#FFFFFF" strokeWidth={2} />
        <Text className="text-lg font-bold text-white">{t.addToCart}</Text>
      </View>
    </Button>
  );

  const unitSection = hasSelectableProductUnits(product) ? (
    <View>
      <Text
        className="text-base font-bold mb-3"
        style={{ color: colors.foreground }}
      >
        {t.unit}
      </Text>
      <SegmentedControl
        options={selectableUnits}
        selectedId={selectedUnitId}
        onSelect={(unit) => setSelectedUnitId(unit.id)}
        language={language}
      />
    </View>
  ) : null;

  const variantSection =
    product.variants.length > 0 ? (
      <View>
        <Text
          className="text-base font-bold mb-3"
          style={{ color: colors.foreground }}
        >
          {t.variant}
        </Text>
        <SegmentedControl
          options={product.variants}
          selectedId={selectedVariantId}
          onSelect={(variant) => setSelectedVariantId(variant.id)}
          showPrice
          language={language}
        />
      </View>
    ) : null;

  const quantitySection = (
    <ProductDetailQuantityRow
      quantity={quantity}
      onDecrease={handleDecreaseWithToast}
      onIncrease={handleIncreaseWithToast}
      language={language}
    />
  );

  const combinedItemsSection =
    product.isCombined && product.combinedItems.length > 0 ? (
      <CombinedProductItemsTable
        items={product.combinedItems}
        catalogProducts={catalogProducts}
        language={language}
      />
    ) : null;

  const scrollableDetailSections = (
    <View style={{ gap: layout.sectionGap }}>
      {combinedItemsSection}
      <View>
        <Text
          className="text-base font-bold mb-2"
          style={{ color: colors.foreground }}
        >
          {t.description}
        </Text>
        <Text
          className="text-sm leading-relaxed"
          style={{ color: colors.mutedForeground }}
        >
          {displayDescription}
        </Text>
      </View>

      {!layout.useSplitLayout ? (
        <RecommendedProductsSection
          product={product}
          catalogProducts={catalogProducts}
          language={language}
          sourceProductQuantity={quantity}
        />
      ) : null}

      {displayIngredients ? (
        <View>
          <Text
            className="text-base font-bold mb-2"
            style={{ color: colors.foreground }}
          >
            {t.ingredients}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {displayIngredients.split(",").map((item, index) => (
              <View
                key={`ing-${index}`}
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: colors.accent }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: colors.accentForeground }}
                >
                  {item.trim()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {product.isAllergenic && product.allergens.length > 0 ? (
        <View>
          <View className="flex-row items-center gap-2 mb-3">
            <AlertTriangle
              size={18}
              color={colors.destructive}
              strokeWidth={2}
            />
            <Text
              className="text-base font-bold"
              style={{ color: colors.foreground }}
            >
              {t.allergens}
            </Text>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {product.allergens.map((allergen) => (
              <AllergenChip key={allergen.id} allergen={allergen} />
            ))}
          </View>
        </View>
      ) : null}

      {product.modifierGroups.length > 0 ? (
        <View>
          <View
            className="h-px mb-5"
            style={{ backgroundColor: colors.border }}
          />
          <Text
            className="text-lg font-bold mb-4"
            style={{ color: colors.foreground }}
          >
            {t.extras}
          </Text>
          <View className="gap-5">
            {product.modifierGroups.map((group) => (
              <ModifierGroupSection
                key={group.id}
                group={group}
                selectedIds={selectedModifiers[group.id] ?? []}
                onToggle={(modId) => onModifierToggle(group.id, modId)}
                language={language}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const splitBadges = (
    <View className="flex-row items-center gap-2 flex-wrap">
      {product.isPopular ? (
        <Badge variant="warning" size="md" icon={Star}>
          {language === "tr" ? "Popüler" : "Popular"}
        </Badge>
      ) : null}
      {product.isChefRecommendation ? (
        <Badge variant="info" size="md" icon={ChefHat}>
          {language === "tr" ? "Şef'in Önerisi" : "Chef's Pick"}
        </Badge>
      ) : null}
    </View>
  );

  const priceRow = (
    <View
      className={`flex-row items-baseline gap-x-3 gap-y-1 ${
        layout.useSplitLayout ? "justify-between" : "justify-end"
      }`}
    >
      {layout.useSplitLayout ? (
        <View className="flex-1 flex-shrink pr-3" style={{ gap: 2 }}>
          <Text
            className="text-2xl font-extrabold leading-tight"
            style={{ color: colors.foreground, flexShrink: 1 }}
            numberOfLines={2}
          >
            {displayName}
          </Text>
          <ProductCaloriesLabel product={product} />
        </View>
      ) : null}
      <View className="flex-row items-baseline flex-wrap gap-x-3 gap-y-1 justify-end">
        <Text
          className="text-3xl font-extrabold"
          style={{ color: colors.primary }}
        >
          {formatPrice(totalPrice)}
        </Text>
        {productHasDiscount(product) && totalPrice < listPrice && (
          <Text
            className="text-base font-bold line-through"
            style={{ color: colors.mutedForeground }}
          >
            {formatPrice(listPrice)}
          </Text>
        )}
        {productHasDiscount(product) && (
          <View
            className="rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: isDark ? "#451A03" : "#FEF3C7" }}
          >
            <Text
              className="text-sm font-bold"
              style={{ color: isDark ? "#FCD34D" : "#92400E" }}
            >
              %{Math.round(product.discountRate)}{" "}
              {language === "tr" ? "İndirim" : "Off"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.background }}
      edges={["top"]}
    >
      {/* ── Header ── */}
      <View
        className="flex-row items-center gap-3 border-b"
        style={{
          paddingHorizontal: layout.horizontalPadding,
          paddingVertical: 10,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Pressable
          onPress={handleGoBack}
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.muted }}
          accessibilityRole="button"
          accessibilityLabel={t.close}
        >
          <ChevronLeft size={22} color={colors.foreground} strokeWidth={2.5} />
        </Pressable>
        <View className="flex-1">
          <Text
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: colors.mutedForeground }}
            numberOfLines={1}
          >
            {product.categoryName}
          </Text>
          <Text
            className="text-base font-bold"
            style={{ color: colors.foreground }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
        </View>
        {product.rating ? (
          <View
            className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
            style={{ backgroundColor: colors.muted }}
          >
            <Stars rating={product.rating} size={11} />
            <Text
              className="text-xs font-bold"
              style={{ color: colors.foreground }}
            >
              {product.rating.toFixed(1)}
            </Text>
          </View>
        ) : null}
      </View>

      <View
        className="flex-1"
        style={{
          flexDirection: layout.useSplitLayout ? "row" : "column",
          minHeight: 0,
        }}
      >
        {layout.useSplitLayout ? (
          <View
            style={{
              width: layout.heroColumnWidth,
              flexShrink: 0,
              flex: 1,
              minHeight: 0,
              flexDirection: "column",
              paddingHorizontal: layout.horizontalPadding,
              paddingTop: 16,
              paddingBottom: 16,
              borderRightWidth: 1,
              borderRightColor: colors.border,
            }}
          >
            <View
              style={{
                marginBottom: layout.sectionGap,
                flexShrink: 0,
                alignItems: "center",
              }}
            >
              <ProductDetailHero
                imageUrl={product.imageUrl}
                width={layout.heroImageWidth}
                height={layout.heroImageHeight}
              />
            </View>
            {productHasRecommendations(product) ? (
              <View style={{ flex: 1, minHeight: 0 }}>
                <RecommendedProductsSection
                  product={product}
                  catalogProducts={catalogProducts}
                  language={language}
                  compact
                  scrollable
                  sourceProductQuantity={quantity}
                />
              </View>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <View style={{ flexShrink: 0, paddingTop: 12, gap: 8 }}>
              {stockBanner}
              {addToCartButton}
            </View>
          </View>
        ) : null}

        {layout.useSplitLayout ? (
          <View style={{ flex: 1, minHeight: 0 }}>
            <View
              style={{
                paddingHorizontal: layout.horizontalPadding,
                paddingTop: 16,
                paddingBottom: 8,
                gap: layout.sectionGap,
              }}
            >
              {splitBadges}
              {priceRow}
              {unitSection}
              {variantSection}
              {quantitySection}
            </View>
            <ScrollView
              showsVerticalScrollIndicator
              bounces={false}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: layout.horizontalPadding,
                paddingBottom: 28,
              }}
            >
              {scrollableDetailSections}
            </ScrollView>
          </View>
        ) : (
          <View style={{ flex: 1, minHeight: 0 }}>
            <View
              style={{
                paddingHorizontal: layout.horizontalPadding,
                paddingTop: 12,
                gap: layout.sectionGap,
              }}
            >
              <View style={{ alignItems: "center" }}>
                <ProductDetailHero
                  imageUrl={product.imageUrl}
                  width={layout.heroImageWidth}
                  height={layout.heroImageHeight}
                />
              </View>
              <View>
                <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
                  {product.isPopular ? (
                    <Badge variant="warning" size="md" icon={Star}>
                      {language === "tr" ? "Popüler" : "Popular"}
                    </Badge>
                  ) : null}
                  {product.isChefRecommendation ? (
                    <Badge variant="info" size="md" icon={ChefHat}>
                      {language === "tr" ? "Şef'in Önerisi" : "Chef's Pick"}
                    </Badge>
                  ) : null}
                </View>
                <Text
                  className="text-2xl font-extrabold leading-tight"
                  style={{ color: colors.foreground }}
                >
                  {displayName}
                </Text>
                <ProductCaloriesLabel product={product} className="mt-0.5" />
              </View>
              {priceRow}
              {product.rating ? (
                <View className="flex-row items-center gap-2">
                  <Stars rating={product.rating} size={14} />
                  <Text
                    className="text-sm font-bold"
                    style={{ color: colors.foreground }}
                  >
                    {product.rating.toFixed(1)}
                  </Text>
                  {product.ratingCount ? (
                    <Text
                      className="text-sm"
                      style={{ color: colors.mutedForeground }}
                    >
                      ({product.ratingCount})
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {unitSection}
              {variantSection}
              {quantitySection}
            </View>
            <ScrollView
              showsVerticalScrollIndicator
              bounces={false}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: layout.horizontalPadding,
                paddingTop: 8,
                paddingBottom: 16,
              }}
            >
              {scrollableDetailSections}
            </ScrollView>
            <View
              style={{
                paddingHorizontal: layout.horizontalPadding,
                paddingTop: 12,
                paddingBottom: 16,
                gap: 8,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                backgroundColor: colors.background,
              }}
            >
              {stockBanner}
              {addToCartButton}
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
