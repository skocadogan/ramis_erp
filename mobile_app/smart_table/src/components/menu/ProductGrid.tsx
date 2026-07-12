// ============================================================
// Smart Table — ProductGrid Component
//
// A responsive 2-column grid of ProductCards powered by
// FlatList. Includes empty and loading states with
// delightful placeholder art. Tablet-optimised.
// ============================================================

import React, { useCallback, useEffect, useMemo } from "react";
import {
  FlatList,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItem,
  type ViewStyle,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { UtensilsCrossed, Soup } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";
import { ProductCard } from "./ProductCard";
import type { Product, Language } from "@/types";

// ─── Constants ──────────────────────────────────────────────

const COLUMN_GAP = 14;
const SCREEN_PADDING = 24;
const CARD_ASPECT_RATIO = 4 / 3;
const CARD_CONTENT_HEIGHT = 130; // alt içerik (isim, fiyat, buton vs)

// ─── Props ──────────────────────────────────────────────────

export interface ProductGridProps {
  /** Array of products to display */
  products: Product[];
  /** Called when a product card is pressed */
  onProductPress?: (product: Product) => void;
  /** Called when the add-to-cart button is pressed */
  onAddToCart?: (product: Product) => void;
  /** Whether data is still loading */
  isLoading?: boolean;
  /** Active language for bilingual content */
  language?: Language;
  /** Alt FAB + tab bar için ek scroll padding */
  contentBottomInset?: number;
}

// ─── Empty State ────────────────────────────────────────────

function EmptyState({ language }: { language: Language }) {
  const { isDark, colors } = useTheme();
  const title =
    language === "tr"
      ? "Bu kategoride ürün bulunamadı"
      : "No products in this category";
  const subtitle =
    language === "tr"
      ? "Farklı bir kategori seçmeyi deneyin."
      : "Try selecting a different category.";

  return (
    <View
      className="flex-1 items-center justify-center py-24 px-8"
      style={{ backgroundColor: colors.background }}
    >
      <View
        className="w-24 h-24 rounded-full items-center justify-center mb-6"
        style={{ backgroundColor: colors.accent }}
      >
        <UtensilsCrossed size={44} color={colors.primary} strokeWidth={1.5} />
      </View>
      <Text
        className="text-xl font-bold text-center mb-2"
        style={{ color: colors.foreground }}
      >
        {title}
      </Text>
      <Text
        className="text-base text-center leading-relaxed max-w-xs"
        style={{ color: colors.mutedForeground }}
      >
        {subtitle}
      </Text>

      {/* Decorative food icons */}
      <View className="flex-row gap-6 mt-8 opacity-30">
        <Soup size={32} color={colors.primary} strokeWidth={1} />
        <UtensilsCrossed size={32} color={colors.primary} strokeWidth={1} />
        <Soup
          size={32}
          color={isDark ? "#4ADE80" : "#22C55E"}
          strokeWidth={1}
        />
      </View>
    </View>
  );
}

// ─── Skeleton pulse ─────────────────────────────────────────

function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const opacity = useSharedValue(0.35);
  const { colors } = useTheme();

  useEffect(() => {
    opacity.value = withRepeat(withTiming(0.85, { duration: 900 }), -1, true);
  }, [opacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{ backgroundColor: colors.muted }, style, pulseStyle]}
    />
  );
}

// ─── Loading State ──────────────────────────────────────────

function LoadingState({ cardWidth }: { cardWidth: number }) {
  const skeletons = useMemo(() => Array.from({ length: 4 }), []);
  const { colors } = useTheme();

  return (
    <View
      className="flex-row flex-wrap px-6 pt-2"
      style={{ gap: COLUMN_GAP, backgroundColor: colors.background }}
    >
      {skeletons.map((_, index) => (
        <View
          key={`skeleton-${index}`}
          className="rounded-[20px] overflow-hidden border"
          style={{
            width: cardWidth,
            backgroundColor: colors.card,
            borderColor: colors.border,
          }}
        >
          <SkeletonBlock style={{ width: "100%", aspectRatio: 4 / 3 }} />
          <View className="p-3.5 gap-3">
            <SkeletonBlock
              style={{ height: 16, borderRadius: 6, width: "75%" }}
            />
            <SkeletonBlock
              style={{ height: 12, borderRadius: 6, width: "50%" }}
            />
            <View className="flex-row items-center justify-between pt-1">
              <SkeletonBlock
                style={{ height: 20, borderRadius: 6, width: "33%" }}
              />
              <SkeletonBlock
                style={{ height: 44, width: 44, borderRadius: 22 }}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Component ──────────────────────────────────────────────

/**
 * Responsive 2-column product grid using FlatList.
 * Handles loading, empty, and populated states.
 *
 * @example
 *   <ProductGrid
 *     products={filteredProducts}
 *     onProductPress={(p) => router.push(`/product/${p.id}`)}
 *     onAddToCart={(p) => addToCart(p)}
 *     isLoading={isFetching}
 *     language="tr"
 *   />
 */
export const ProductGrid = React.memo(function ProductGrid({
  products,
  onProductPress,
  onAddToCart,
  isLoading = false,
  language = "tr",
  contentBottomInset = 32,
}: ProductGridProps) {
  const { width } = useWindowDimensions();

  const numColumns = useMemo(() => {
    if (width >= 850) return 5;
    if (width >= 600) return 4;
    if (width >= 440) return 3;
    return 2;
  }, [width]);

  const cardWidth = useMemo(() => {
    return (
      (width - SCREEN_PADDING * 2 - COLUMN_GAP * (numColumns - 1)) / numColumns
    );
  }, [width, numColumns]);

  const cardHeight = useMemo(() => {
    return cardWidth / CARD_ASPECT_RATIO + CARD_CONTENT_HEIGHT;
  }, [cardWidth]);

  // getItemLayout: sabit item yüksekliği ile O(1) scroll konumlama
  const getItemLayout = useCallback(
    (
      _data: ArrayLike<Product> | null | undefined,
      index: number,
    ) => {
      const row = Math.floor(index / numColumns);
      const itemHeight = cardHeight + COLUMN_GAP;
      return {
        length: itemHeight,
        offset: itemHeight * row,
        index,
      };
    },
    [cardHeight, numColumns],
  );

  // ── render item ──
  const renderItem: ListRenderItem<Product> = useCallback(
    ({ item }) => (
      <View style={{ width: cardWidth }}>
        <ProductCard
          product={item}
          language={language}
          onPress={onProductPress}
          onAddToCart={onAddToCart}
        />
      </View>
    ),
    [language, onProductPress, onAddToCart, cardWidth],
  );

  // ── key extractor ──
  const keyExtractor = useCallback((item: Product) => item.id, []);

  // ── Loading ──
  if (isLoading) {
    return <LoadingState cardWidth={cardWidth} />;
  }

  // ── Empty ──
  if (!products || products.length === 0) {
    return <EmptyState language={language} />;
  }

  // ── Render ──
  return (
    <FlatList
      key="products-grid"
      data={products}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={numColumns}
      getItemLayout={getItemLayout}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: SCREEN_PADDING,
        paddingTop: 8,
        paddingBottom: contentBottomInset,
      }}
      columnWrapperStyle={{
        gap: COLUMN_GAP,
        marginBottom: COLUMN_GAP,
      }}
      removeClippedSubviews
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={6}
    />
  );
});
