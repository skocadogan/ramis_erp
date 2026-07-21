// ============================================================
// Smart Table — Menu Browsing Screen (Main Tab)
//
// The central screen of the app: displays a horizontal
// category row at the top, a responsive product grid below
// filtered by the selected category, and a floating cart
// button with total count and price. Tablet-optimised.
//
// Categories and products fetched from RAMIS backend API.
// ============================================================

import { useCallback, useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  PanResponder,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import {
  ShoppingCart,
  Sun,
  Moon,
  Languages,
  ChevronRight,
  ClipboardList,
  WifiOff,
} from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";
import { useCartStore } from "@/store/cart-store";
import { useTableStore } from "@/store/table-store";
import { useMenuNormalized as useMenu } from "@/services/useMenuNormalized";
import { useTheme } from "@/hooks/useTheme";
import { useFabBottomOffset } from "@/hooks/useTabBarHeight";
import { useDebouncedCartQuantityToast } from "@/hooks/useDebouncedCartQuantityToast";
import { formatPrice } from "@/utils/format";
import {
  getDefaultProductUnit,
  hasSelectableProductUnits,
} from "@/utils/pricing";
import { CategoryRow } from "@/components/menu/CategoryRow";
import { ProductGrid } from "@/components/menu/ProductGrid";
import { ProductUnitPickerModal } from "@/components/menu/ProductUnitPickerModal";
import ActiveOrderStrip from "@/components/order/ActiveOrderStrip";
import React, { Suspense } from "react";
const CartSheet = React.lazy(() => import("@/components/order/CartSheet"));
import { useOrderStore } from "@/store/order-store";
import { useDialogStore } from "@/store/dialog-store";
import { useSurveyStore } from "@/store/survey-store";
import type { Product, Category } from "@/types";

export default function MenuScreen() {
  const router = useRouter();
  const { language, toggleTheme, setLanguage, showToast } = useUIStore(
    useShallow((s) => ({ language: s.language, toggleTheme: s.toggleTheme, setLanguage: s.setLanguage, showToast: s.showToast })),
  );
  const { isDark, colors } = useTheme();
  const fabBottom = useFabBottomOffset();
  const { selectedBranch, selectedTableId } = useTableStore(
    useShallow((s) => ({ selectedBranch: s.selectedBranch, selectedTableId: s.selectedTable?.id ?? null })),
  );
  const { items, clearCart, addItem, cartCount, cartTotal } = useCartStore(
    useShallow((s) => ({ items: s.items, clearCart: s.clearCart, addItem: s.addItem, cartCount: s.itemCount, cartTotal: s.totalAmount })),
  );
  const [placeOrder, activeOrderCount] = useOrderStore(
    useShallow((s) => [s.placeOrder, s.activeOrders.length] as const),
  );
  const { requestManualOpen, isSurveyLoading, isSurveySubmitting } = useSurveyStore(
    useShallow((s) => ({ requestManualOpen: s.requestManualOpen, isSurveyLoading: s.isLoading, isSurveySubmitting: s.isSubmitting })),
  );
  const { enqueueCartToast } = useDebouncedCartQuantityToast();

  const {
    categories,
    products,
    filteredProducts,
    selectedCategoryId,
    setSelectedCategoryId,
    parentCategories: _parentCategories,
    subCategories,
    selectedRootParentId,
    isLoading,
    error,
    refresh,
  } = useMenu();

  const [isCartVisible, setCartVisible] = useState(false);
  const [unitPickerProduct, setUnitPickerProduct] = useState<Product | null>(
    null,
  );

  // ── Update UI store for category selection ──
  const storeCategoryId = useUIStore((s) => s.selectedCategoryId);
  const setStoreCategoryId = useUIStore((s) => s.setSelectedCategoryId);

  // Sync API category selection with UI store
  useEffect(() => {
    if (selectedCategoryId && selectedCategoryId !== storeCategoryId) {
      setStoreCategoryId(selectedCategoryId);
    }
  }, [selectedCategoryId]);

  // ── Handlers ──
  const handleCategoryPress = useCallback(
    (categoryId: string) => {
      setSelectedCategoryId(categoryId);
      setStoreCategoryId(categoryId);
    },
    [setSelectedCategoryId, setStoreCategoryId],
  );

  const handleProductPress = useCallback(
    (product: Product) => {
      router.push(`/product/${product.id}`);
    },
    [router],
  );

  const handleAddToCartFromGrid = useCallback(
    (product: Product) => {
      if (hasSelectableProductUnits(product)) {
        setUnitPickerProduct(product);
        return;
      }
      const defaultUnit = getDefaultProductUnit(product);
      const defaultVariant =
        product.variants.find((variant) => variant.isDefault) ??
        product.variants[0];
      addItem(product, defaultUnit, defaultVariant, [], 1);
      enqueueCartToast({
        productName: product.name,
        productNameEn: product.nameEn,
        unit: defaultUnit,
        quantityDelta: 1,
        language,
      });
    },
    [addItem, enqueueCartToast, language],
  );

  const handleUnitPickerClose = useCallback(() => {
    setUnitPickerProduct(null);
  }, []);

  const handleUnitSelect = useCallback(
    (product: Product, unit: Product["units"][number]) => {
      const defaultVariant =
        product.variants.find((variant) => variant.isDefault) ??
        product.variants[0];
      addItem(product, unit, defaultVariant, [], 1);
      setUnitPickerProduct(null);
      enqueueCartToast({
        productName: product.name,
        productNameEn: product.nameEn,
        unit,
        quantityDelta: 1,
        language,
      });
    },
    [addItem, enqueueCartToast, language],
  );

  const handleCartClose = useCallback(() => {
    setCartVisible(false);
  }, []);

  const handleAddProductFromCart = useCallback(() => {
    setCartVisible(false);
  }, []);

  const handlePlaceOrder = useCallback(async () => {
    if (items.length === 0) return;
    if (useOrderStore.getState().isPlacingOrder) return;
    if (!selectedTableId) {
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Hata" : "Error",
          language === "tr"
            ? "Sipariş vermek için masa seçmelisiniz."
            : "Please select a table before ordering.",
        );
      return;
    }
    try {
      const note = useCartStore.getState().note;
      await placeOrder(items, selectedTableId, note);
      clearCart();
      setCartVisible(false);
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Başarılı" : "Success",
          language === "tr"
            ? "Siparişiniz başarıyla mutfağa iletildi."
            : "Your order has been successfully sent to the kitchen.",
        );
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.name === "OrderAlreadyInFlightError"
      ) {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : language === "tr"
            ? "Sipariş gönderilemedi"
            : "Failed to place order";
      useDialogStore
        .getState()
        .alert(language === "tr" ? "Hata" : "Error", message);
    }
  }, [items, selectedTableId, placeOrder, clearCart, language]);

  const handleCartPress = useCallback(() => {
    if (cartCount === 0) return;
    setCartVisible(true);
  }, [cartCount]);

  // ── Swipe ile kategori değiştirme (ürün grid alanında) ──
  const SWIPE_THRESHOLD = 60;
  const SWIPE_ACTIVATION_THRESHOLD = 36;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          gestureState.numberActiveTouches === 1 &&
          Math.abs(gestureState.dx) > SWIPE_ACTIVATION_THRESHOLD &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5,
        onPanResponderRelease: (_, gestureState) => {
          const { dx, dy } = gestureState;
          if (Math.abs(dx) < Math.abs(dy)) return;
          if (!selectedCategoryId || categories.length === 0) return;

          const currentIndex = categories.findIndex(
            (c) => c.id === selectedCategoryId,
          );
          if (currentIndex < 0) return;

          let nextIndex: number;
          if (dx < -SWIPE_THRESHOLD) {
            nextIndex = Math.min(currentIndex + 1, categories.length - 1);
          } else if (dx > SWIPE_THRESHOLD) {
            nextIndex = Math.max(currentIndex - 1, 0);
          } else {
            return;
          }

          if (nextIndex !== currentIndex) {
            const nextCategory = categories[nextIndex];
            if (nextCategory) {
              handleCategoryPress(nextCategory.id);
            }
          }
        },
      }),
    [selectedCategoryId, categories, handleCategoryPress],
  );

  const toggleLanguage = useCallback(() => {
    const newLang = language === "tr" ? "en" : "tr";
    setLanguage(newLang);
    showToast(
      newLang === "tr"
        ? "Dil Türkçe olarak değiştirildi"
        : "Language changed to English",
    );
  }, [language, setLanguage, showToast]);

  const branchName =
    selectedBranch?.name ?? (language === "tr" ? "RAMIS" : "RAMIS");

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={["top"]}
    >
      <View style={styles.flex}>
        {/* ── Top Bar ── */}
        <View
          style={[
            styles.topBar,
            {
              backgroundColor: colors.card,
              borderBottomColor: colors.border,
            },
          ]}
        >
          {/* Restaurant name */}
          <View style={styles.brandRow}>
            <View
              style={[
                styles.brandBadge,
                { backgroundColor: `${colors.primary}1A` },
              ]}
            >
              <Text style={[styles.brandLetter, { color: colors.primary }]}>
                R
              </Text>
            </View>
            <View>
              <Text style={[styles.brandName, { color: colors.foreground }]}>
                {branchName}
              </Text>
              <Text
                style={[styles.brandSub, { color: colors.mutedForeground }]}
              >
                Akıllı Masa
              </Text>
            </View>
          </View>

          {/* Right actions */}
          <View style={styles.actionRow}>
            {activeOrderCount > 0 ? (
              <Pressable
                onPress={() => void requestManualOpen()}
                disabled={isSurveyLoading || isSurveySubmitting}
                style={[
                  styles.iconBtn,
                  { backgroundColor: `${colors.primary}18` },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  language === "tr" ? "Anketleri aç" : "Open surveys"
                }
              >
                <ClipboardList
                  size={20}
                  color={colors.primary}
                  strokeWidth={1.8}
                />
              </Pressable>
            ) : null}

            {/* Language toggle */}
            <Pressable
              onPress={toggleLanguage}
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
              accessibilityRole="button"
              accessibilityLabel={
                language === "tr" ? "Dili değiştir" : "Toggle language"
              }
            >
              <Languages size={20} color={colors.icon} strokeWidth={1.8} />
            </Pressable>

            {/* Dark mode toggle */}
            <Pressable
              onPress={toggleTheme}
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
              accessibilityRole="button"
              accessibilityLabel={
                isDark
                  ? language === "tr"
                    ? "Açık temaya geç"
                    : "Switch to light mode"
                  : language === "tr"
                    ? "Koyu temaya geç"
                    : "Switch to dark mode"
              }
            >
              {isDark ? (
                <Sun size={20} color={colors.warning} strokeWidth={1.8} />
              ) : (
                <Moon size={20} color={colors.icon} strokeWidth={1.8} />
              )}
            </Pressable>
          </View>
        </View>

        {error && !isLoading && (
          <View
            style={[
              styles.errorBanner,
              {
                backgroundColor: isDark
                  ? `${colors.warning}26`
                  : `${colors.warning}15`,
                borderColor: isDark
                  ? `${colors.warning}66`
                  : `${colors.warning}44`,
              },
            ]}
          >
            <WifiOff size={14} color={colors.warning} />
            <Text style={[styles.errorText, { color: colors.foreground }]}>
              {error}
            </Text>
            <Pressable onPress={refresh}>
              <Text style={[styles.errorRetry, { color: colors.warning }]}>
                {language === "tr" ? "Tekrar Dene" : "Retry"}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── Category Row (parent categories) ── */}
        <CategoryRow
          categories={categories}
          activeCategoryId={selectedCategoryId}
          onCategoryPress={handleCategoryPress}
          language={language}
        />

        {/* ── Subcategory Row ── */}
        {subCategories.length > 0 && selectedRootParentId && (
          <View
            style={[
              styles.subcategoryBar,
              { borderBottomColor: colors.border },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subcategoryBarContent}
            >
              <Pressable
                onPress={() => handleCategoryPress(selectedRootParentId)}
                style={[
                  styles.subcategoryPill,
                  selectedCategoryId === selectedRootParentId && {
                    backgroundColor: colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.subcategoryPillText,
                    { color: colors.mutedForeground },
                    selectedCategoryId === selectedRootParentId && {
                      color: colors.primaryForeground,
                    },
                  ]}
                >
                  {language === "tr" ? "Tümü" : "All"}
                </Text>
              </Pressable>
              {subCategories.map((sub: Category) => {
                const isSubActive = selectedCategoryId === sub.id;
                return (
                  <Pressable
                    key={sub.id}
                    onPress={() => handleCategoryPress(sub.id)}
                    style={[
                      styles.subcategoryPill,
                      isSubActive && { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.subcategoryPillText,
                        { color: colors.mutedForeground },
                        isSubActive && { color: colors.primaryForeground },
                      ]}
                    >
                      {language === "tr" ? sub.name : sub.nameEn}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Live Order Status Strip ── */}
        <ActiveOrderStrip />

        <View style={styles.flex} {...panResponder.panHandlers}>
          <ProductGrid
            products={filteredProducts}
            onProductPress={handleProductPress}
            onAddToCart={handleAddToCartFromGrid}
            isLoading={isLoading}
            language={language}
            contentBottomInset={fabBottom + 56}
          />
        </View>

        {cartCount > 0 && (
          <View
            style={[
              styles.cartFab,
              {
                bottom: fabBottom,
                shadowColor: colors.primary,
              },
            ]}
          >
            <Pressable
              onPress={handleCartPress}
              style={[styles.cartBtn, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={
                language === "tr"
                  ? `Sepete git, ${cartCount} ürün`
                  : `Go to cart, ${cartCount} items`
              }
            >
              <View style={styles.cartIconWrap}>
                <ShoppingCart
                  size={22}
                  color={colors.primaryForeground}
                  strokeWidth={2}
                />
                <View
                  style={[
                    styles.cartBadge,
                    { backgroundColor: colors.primaryForeground },
                  ]}
                >
                  <Text
                    style={[styles.cartBadgeText, { color: colors.primary }]}
                  >
                    {cartCount}
                  </Text>
                </View>
              </View>
              <View style={styles.cartDivider} />
              <Text
                style={[styles.cartPrice, { color: colors.primaryForeground }]}
              >
                {formatPrice(cartTotal)}
              </Text>
              <ChevronRight
                size={18}
                color={colors.primaryForeground}
                strokeWidth={2.5}
              />
            </Pressable>
          </View>
        )}
      </View>

      <Suspense fallback={null}>
        {isCartVisible && (
          <CartSheet
            visible={isCartVisible}
            onClose={handleCartClose}
            onAddProduct={handleAddProductFromCart}
            onPlaceOrder={handlePlaceOrder}
            language={language}
          />
        )}
      </Suspense>
      <ProductUnitPickerModal
        visible={unitPickerProduct != null}
        product={unitPickerProduct}
        language={language}
        onClose={handleUnitPickerClose}
        onSelect={handleUnitSelect}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  brandLetter: {
    fontSize: 14,
    fontWeight: "800",
  },
  brandName: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 10,
    fontWeight: "500",
    marginTop: -2,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  errorRetry: {
    fontSize: 12,
    fontWeight: "700",
  },
  cartFab: {
    position: "absolute",
    right: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  cartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  cartIconWrap: { position: "relative" },
  cartBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  cartDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  cartPrice: {
    fontSize: 16,
    fontWeight: "700",
  },
  subcategoryBar: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  subcategoryBarContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  subcategoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  subcategoryPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
