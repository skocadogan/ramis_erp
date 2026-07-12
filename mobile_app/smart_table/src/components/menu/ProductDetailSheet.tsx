// ============================================================
// Smart Table — ProductDetailSheet Component
//
// Sepete ekle overlay — tam ekran detay (product/[id]) ile aynı layout.
// ============================================================

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  Text,
  View,
  Pressable,
  ScrollView,
  Modal,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
  type WithSpringConfig,
} from "react-native-reanimated";
import { X, Star, ChefHat } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { productHasDiscount } from "@/utils/pricing";
import { formatPrice } from "@/utils/format";
import { useTheme } from "@/hooks/useTheme";
import { useProductDetailForm } from "@/hooks/useProductDetailForm";
import { useProductDetailLayout } from "@/hooks/useProductDetailLayout";
import { useDebouncedCartQuantityToast } from "@/hooks/useDebouncedCartQuantityToast";
import {
  ProductCaloriesLabel,
  ProductDetailFormSections,
  ProductDetailQuantityRow,
} from "@/components/menu/product-detail/shared";
import { useProductDisplayName } from "@/hooks/useProductDisplayName";
import { ProductDetailHero } from "@/components/menu/product-detail/ProductDetailHero";
import { RecommendedProductsSection } from "@/components/menu/product-detail/RecommendedProductsSection";
import { productHasRecommendations } from "@/utils/recommendedProducts";
import { useProductDetailCartLine } from "@/hooks/useProductDetailCartLine";
import { useProductDetailModifierToggle } from "@/hooks/useProductDetailModifierToggle";

import type { Product, Language } from "@/types";
import { useProductDetail } from "@/services/useMenuNormalized";

const MODAL_ANIMATION_DURATION = 350;

const SPRING_CONFIG: WithSpringConfig = {
  damping: 24,
  stiffness: 220,
  mass: 0.9,
};

export interface ProductDetailSheetProps {
  product: Product;
  visible: boolean;
  onClose: () => void;
  language?: Language;
  catalogProducts?: Product[];
}

export function ProductDetailSheet({
  product,
  visible,
  onClose,
  language = "tr",
  catalogProducts = [],
}: ProductDetailSheetProps) {
  const { isDark, colors } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const layout = useProductDetailLayout();
  const { enqueueCartToast, flushCartToast } = useDebouncedCartQuantityToast();
  const { product: fetchedProduct } = useProductDetail(
    visible && product ? product.id : "",
  );
  const activeProduct = fetchedProduct ?? product;
  const sheetMaxHeight = screenHeight * 0.88;
  const sheetHeight = layout.useSplitLayout
    ? Math.min(sheetMaxHeight, screenHeight * 0.82)
    : sheetMaxHeight;

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
  } = useProductDetailForm(visible ? activeProduct : null);

  const cartModifiers = useMemo(
    () => buildCartModifiers(),
    [buildCartModifiers],
  );

  const {
    quantity,
    sourceQuantity,
    onIncrease,
    onDecrease,
    commitDraft,
    resetDraft,
  } = useProductDetailCartLine(
    activeProduct,
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

  useEffect(() => {
    if (visible) {
      resetDraft();
    }
  }, [visible, resetDraft]);

  const { totalPrice, listPrice } = useMemo(
    () => computeDisplayTotals(Math.max(quantity, 1)),
    [computeDisplayTotals, quantity],
  );

  const [sheetVisible, setSheetVisible] = useState(false);

  // Render sırasında visible/product değişikliklerini yakala
  // (effect yerine — React docs önerisi: setState'i effect içinde senkron çağırma)
  if (visible && product && !sheetVisible) {
    setSheetVisible(true);
  }

  const backdropOpacity = useSharedValue(0);
  const slideOffset = useSharedValue(sheetHeight);

  useEffect(() => {
    if (visible && product) {
      backdropOpacity.value = withTiming(1, {
        duration: MODAL_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
      });
      slideOffset.value = withSpring(0, SPRING_CONFIG);
    } else if (!visible) {
      backdropOpacity.value = withTiming(0, {
        duration: MODAL_ANIMATION_DURATION - 50,
        easing: Easing.in(Easing.cubic),
      });
      slideOffset.value = withTiming(
        sheetHeight,
        {
          duration: MODAL_ANIMATION_DURATION - 50,
          easing: Easing.in(Easing.cubic),
        },
        (finished) => {
          if (finished) runOnJS(setSheetVisible)(false);
        },
      );
    }
  }, [visible, product, sheetHeight, backdropOpacity, slideOffset]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideOffset.value }],
  }));

  const handleDonePress = useCallback(() => {
    commitDraft();
    flushCartToast();
    onClose();
  }, [commitDraft, flushCartToast, onClose]);

  const handleIncreaseWithToast = useCallback(() => {
    onIncrease();
    if (!resolvedUnit) return;
    enqueueCartToast({
      productName: activeProduct.name,
      productNameEn: activeProduct.nameEn,
      unit: resolvedUnit,
      quantityDelta: 1,
      language,
    });
  }, [
    activeProduct.name,
    activeProduct.nameEn,
    enqueueCartToast,
    language,
    onIncrease,
    resolvedUnit,
  ]);

  const handleDecreaseWithToast = useCallback(() => {
    if (quantity <= 0) return;
    onDecrease();
    if (!resolvedUnit) return;
    enqueueCartToast({
      productName: activeProduct.name,
      productNameEn: activeProduct.nameEn,
      unit: resolvedUnit,
      quantityDelta: -1,
      language,
    });
  }, [
    activeProduct.name,
    activeProduct.nameEn,
    enqueueCartToast,
    language,
    onDecrease,
    quantity,
    resolvedUnit,
  ]);

  const displayName = useProductDisplayName(activeProduct, language);

  const t = {
    addToCart: language === "tr" ? "Tamam" : "Done",
    close: language === "tr" ? "Kapat" : "Close",
  };

  const priceBlock = useMemo(
    () => (
      <View
        className={`flex-row items-baseline gap-x-3 gap-y-1 ${
          layout.useSplitLayout ? "justify-between" : "justify-end"
        }`}
      >
        {layout.useSplitLayout ? (
          <View className="flex-1 flex-shrink pr-3" style={{ gap: 2 }}>
            <Text
              className="text-xl font-extrabold leading-tight"
              style={{ color: colors.foreground, flexShrink: 1 }}
              numberOfLines={2}
            >
              {displayName}
            </Text>
            <ProductCaloriesLabel product={activeProduct} />
          </View>
        ) : null}
        <View className="flex-row items-baseline flex-wrap gap-x-3 gap-y-1 justify-end">
          <Text
            className="text-2xl font-extrabold"
            style={{ color: colors.primary }}
          >
            {formatPrice(totalPrice)}
          </Text>
          {productHasDiscount(activeProduct) && totalPrice < listPrice && (
            <Text
              className="text-base font-bold line-through"
              style={{ color: colors.mutedForeground }}
            >
              {formatPrice(listPrice)}
            </Text>
          )}
          {productHasDiscount(activeProduct) && (
            <View
              className="rounded-full px-2.5 py-0.5"
              style={{ backgroundColor: isDark ? "#451A03" : "#FEF3C7" }}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: isDark ? "#FCD34D" : "#92400E" }}
              >
                %{Math.round(activeProduct.discountRate)}{" "}
                {language === "tr" ? "İndirim" : "Off"}
              </Text>
            </View>
          )}
        </View>
      </View>
    ),
    [
      activeProduct,
      displayName,
      totalPrice,
      listPrice,
      language,
      layout.useSplitLayout,
      colors.foreground,
      colors.primary,
      colors.mutedForeground,
      isDark,
    ],
  );

  const recommendedBlock = useMemo(
    () => (
      <RecommendedProductsSection
        product={activeProduct}
        catalogProducts={catalogProducts}
        language={language}
        compact={layout.useSplitLayout}
        scrollable={layout.useSplitLayout}
        sourceProductQuantity={quantity}
      />
    ),
    [activeProduct, catalogProducts, language, layout.useSplitLayout, quantity],
  );

  const addToCartButton = useMemo(
    () => (
      <Button
        variant="primary"
        size="xl"
        fullWidth
        onPress={handleDonePress}
        className="shadow-xl"
        accessibilityLabel={t.addToCart}
        style={{
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.6 : 0.4,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        <View className="flex-row items-center justify-center gap-2">
          <Text className="text-lg font-bold text-primary-foreground">
            {t.addToCart}
          </Text>
        </View>
      </Button>
    ),
    [colors.primary, isDark, handleDonePress, t.addToCart],
  );

  const scrollableFormBlock = useMemo(
    () => (
      <ProductDetailFormSections
        product={activeProduct}
        language={language}
        selectedUnitId={selectedUnitId}
        setSelectedUnitId={setSelectedUnitId}
        selectedVariantId={selectedVariantId}
        setSelectedVariantId={setSelectedVariantId}
        selectedModifiers={selectedModifiers}
        handleModifierToggle={onModifierToggle}
        showUnitSelection={false}
        showCartSection={false}
        afterDescription={!layout.useSplitLayout ? recommendedBlock : undefined}
      />
    ),
    [
      activeProduct,
      language,
      selectedUnitId,
      setSelectedUnitId,
      selectedVariantId,
      setSelectedVariantId,
      selectedModifiers,
      onModifierToggle,
      layout.useSplitLayout,
      recommendedBlock,
    ],
  );

  const splitBadges = useMemo(
    () => (
      <View className="flex-row items-center gap-2 flex-wrap">
        {activeProduct.isPopular ? (
          <Badge variant="warning" size="md" icon={Star}>
            {language === "tr" ? "Popüler" : "Popular"}
          </Badge>
        ) : null}
        {activeProduct.isChefRecommendation ? (
          <Badge variant="info" size="md" icon={ChefHat}>
            {language === "tr" ? "Şef'in Önerisi" : "Chef's Pick"}
          </Badge>
        ) : null}
      </View>
    ),
    [activeProduct.isPopular, activeProduct.isChefRecommendation, language],
  );

  const fixedOptionsBlock = useMemo(
    () => (
      <ProductDetailFormSections
        product={activeProduct}
        language={language}
        selectedUnitId={selectedUnitId}
        setSelectedUnitId={setSelectedUnitId}
        selectedVariantId={selectedVariantId}
        setSelectedVariantId={setSelectedVariantId}
        selectedModifiers={selectedModifiers}
        handleModifierToggle={onModifierToggle}
        showDescription={false}
        showCartSection={false}
        showAllergensSection={false}
        showModifiersSection={false}
      />
    ),
    [
      activeProduct,
      language,
      selectedUnitId,
      setSelectedUnitId,
      selectedVariantId,
      setSelectedVariantId,
      selectedModifiers,
      onModifierToggle,
    ],
  );

  const quantityBlock = useMemo(
    () => (
      <ProductDetailQuantityRow
        quantity={quantity}
        onDecrease={handleDecreaseWithToast}
        onIncrease={handleIncreaseWithToast}
        language={language}
      />
    ),
    [quantity, handleDecreaseWithToast, handleIncreaseWithToast, language],
  );

  return activeProduct && sheetVisible ? (
    <Modal
      visible={sheetVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end">
        <Animated.View
          style={[backdropStyle, { flex: 1 }]}
          className="absolute inset-0"
        >
          <Pressable
            onPress={onClose}
            className="flex-1"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
        </Animated.View>

        <Animated.View
          style={[
            sheetStyle,
            {
              height: sheetHeight,
              maxHeight: sheetMaxHeight,
              backgroundColor: colors.background,
            },
          ]}
          className="rounded-t-[24px] overflow-hidden shadow-xl"
        >
          {/* ── Header (product/[id] ile aynı) ── */}
          <View
            className="flex-row items-center gap-3 border-b"
            style={{
              paddingHorizontal: layout.horizontalPadding,
              paddingVertical: 10,
              borderBottomColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <View className="flex-1">
              <Text
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: colors.mutedForeground }}
                numberOfLines={1}
              >
                {activeProduct.categoryName}
              </Text>
              <Text
                className="text-base font-bold"
                style={{ color: colors.foreground }}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <ProductCaloriesLabel product={activeProduct} />
            </View>
            {activeProduct.rating ? (
              <View
                className="flex-row items-center gap-1 px-2.5 py-1 rounded-full"
                style={{ backgroundColor: colors.muted }}
              >
                <Star
                  size={11}
                  fill={colors.warning}
                  color={colors.warning}
                  strokeWidth={1.5}
                />
                <Text
                  className="text-xs font-bold"
                  style={{ color: colors.foreground }}
                >
                  {activeProduct.rating.toFixed(1)}
                </Text>
              </View>
            ) : null}
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.muted }}
              accessibilityRole="button"
              accessibilityLabel={t.close}
            >
              <X size={20} color={colors.foreground} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* ── Body: split veya tek sütun ── */}
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
                    imageUrl={activeProduct.imageUrl || undefined}
                    width={layout.heroImageWidth}
                    height={layout.heroImageHeight}
                  />
                </View>
                {productHasRecommendations(activeProduct) ? (
                  <View style={{ flex: 1, minHeight: 0 }}>
                    {recommendedBlock}
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
                <View style={{ flexShrink: 0, paddingTop: 12 }}>
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
                  {priceBlock}
                  {fixedOptionsBlock}
                  {quantityBlock}
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
                  {scrollableFormBlock}
                </ScrollView>
              </View>
            ) : (
              <View style={{ flex: 1, minHeight: 0 }}>
                <View
                  style={{
                    paddingHorizontal: layout.horizontalPadding,
                    paddingTop: 12,
                    gap: layout.sectionGap,
                    maxWidth: layout.contentMaxWidth,
                    alignSelf: "center",
                    width: "100%",
                  }}
                >
                  <View style={{ alignItems: "center" }}>
                    <ProductDetailHero
                      imageUrl={activeProduct.imageUrl || undefined}
                      width={layout.heroImageWidth}
                      height={layout.heroImageHeight}
                    />
                  </View>
                  <View>
                    <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
                      {activeProduct.isPopular ? (
                        <Badge variant="warning" size="md" icon={Star}>
                          {language === "tr" ? "Popüler" : "Popular"}
                        </Badge>
                      ) : null}
                      {activeProduct.isChefRecommendation ? (
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
                    <ProductCaloriesLabel
                      product={activeProduct}
                      className="mt-0.5"
                    />
                  </View>
                  {priceBlock}
                  {fixedOptionsBlock}
                  {quantityBlock}
                </View>
                <ScrollView
                  showsVerticalScrollIndicator
                  bounces={false}
                  style={{ flex: 1 }}
                  contentContainerStyle={{
                    paddingHorizontal: layout.horizontalPadding,
                    paddingTop: 8,
                    paddingBottom: 16,
                    maxWidth: layout.contentMaxWidth,
                    alignSelf: "center",
                    width: "100%",
                  }}
                >
                  {scrollableFormBlock}
                </ScrollView>
                <View
                  style={{
                    paddingHorizontal: layout.horizontalPadding,
                    paddingTop: 12,
                    paddingBottom: 16,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    backgroundColor: colors.background,
                    maxWidth: layout.contentMaxWidth,
                    alignSelf: "center",
                    width: "100%",
                  }}
                >
                  {addToCartButton}
                </View>
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  ) : null;
}
