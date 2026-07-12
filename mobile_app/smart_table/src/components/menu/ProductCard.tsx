// ============================================================
// Smart Table — ProductCard Component
//
// A beautiful food product card for grid display with
// hero image, badges, rating, allergens, price, and
// an add-to-cart FAB. Tablet-optimised with 48px+ touches.
// ============================================================

import React from "react";
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import {
  Star,
  ChefHat,
  ShoppingCart,
  AlertTriangle,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import type { Product, Language } from "@/types";
import {
  getDisplayDiscountRate,
  getProductListPrice,
  getProductSalePrice,
  hasReducedPrice,
} from "@/utils/pricing";
import { formatPrice } from "@/utils/format";
import { useTheme } from "@/hooks/useTheme";
import { ProductCaloriesLabel } from "@/components/menu/product-detail/shared";
import {
  FOOD_IMAGE_ASPECT_RATIO,
  useAdaptiveProductImageFit,
} from "@/utils/productImage";

// ─── Constants ──────────────────────────────────────────────

const MAX_RATING = 5;
const BLURHASH = "L6PZfSi_.AyE_3t7t7R**0o#DgR4";

// ─── Props ──────────────────────────────────────────────────

export interface ProductCardProps {
  /** The product data to display */
  product: Product;
  /** Called when the card is pressed (to view details) */
  onPress?: (product: Product) => void;
  /** Called when the add-to-cart (+) button is pressed */
  onAddToCart?: (product: Product) => void;
  /** Active language for bilingual content */
  language?: Language;
  className?: string;
  style?: object;
}

// ─── Badge Sub-component ────────────────────────────────────

interface BadgeProps {
  label: string;
  variant: "popular" | "chef" | "new";
  icon?: LucideIcon;
  className?: string;
}

function Badge({ label, variant, icon: Icon, className }: BadgeProps) {
  const { colors } = useTheme();
  const bgMap = {
    popular: colors.warning,
    chef: colors.primary,
    new: colors.success,
  };

  return (
    <View
      className={`px-2.5 py-1 rounded-full self-start shadow-sm flex-row items-center ${className || ""}`}
      style={{ backgroundColor: bgMap[variant] }}
    >
      {Icon ? (
        <View className="mr-1">
          <Icon size={11} color="#FFFFFF" strokeWidth={2.2} />
        </View>
      ) : null}
      <Text className="text-[10px] font-bold uppercase tracking-wide text-white">
        {label}
      </Text>
    </View>
  );
}

// ─── Star Rating Sub-component ──────────────────────────────

function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  const { colors } = useTheme();
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;
  const stars: React.ReactNode[] = [];
  const activeColor = "#F59E0B";
  const inactiveColor = colors.muted;

  for (let i = 1; i <= MAX_RATING; i++) {
    const isFilled = i <= fullStars;
    const isHalfStar = !isFilled && hasHalf && i === fullStars + 1;

    stars.push(
      <Star
        key={i}
        size={size}
        fill={isFilled || isHalfStar ? activeColor : "transparent"}
        color={isFilled || isHalfStar ? activeColor : inactiveColor}
        strokeWidth={1.5}
      />,
    );
  }

  return <View className="flex-row items-center">{stars}</View>;
}

// ─── Component ──────────────────────────────────────────────

/**
 * Square-ish food product card with hero image, badges,
 * name, rating, price, allergen indicator, and add-to-cart.
 */
export const ProductCard = React.memo(function ProductCard({
  product,
  onPress,
  onAddToCart,
  language = "tr",
  className,
  style,
}: ProductCardProps) {
  const { isDark, colors } = useTheme();
  const displayName = language === "tr" ? product.name : product.nameEn;

  const listPrice = getProductListPrice(product);
  const salePrice = getProductSalePrice(product);
  const showDiscount = hasReducedPrice(listPrice, salePrice);
  const discountRate = getDisplayDiscountRate(product, listPrice, salePrice);

  const handlePress = React.useCallback(() => {
    onPress?.(product);
  }, [onPress, product]);

  const handleAddToCart = React.useCallback(() => {
    onAddToCart?.(product);
  }, [onAddToCart, product]);

  const handleAddToCartPress = React.useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      handleAddToCart();
    },
    [handleAddToCart],
  );

  // Badge tiers: show at most 2, prioritise chef > popular > new
  const badges: {
    show: boolean;
    label: string;
    variant: "popular" | "chef" | "new";
    icon?: LucideIcon;
  }[] = [
    {
      show: !!product.isChefRecommendation,
      label: language === "tr" ? "Şef'in Önerisi" : "Chef's Pick",
      variant: "chef",
      icon: ChefHat,
    },
    {
      show: !!product.isPopular,
      label: language === "tr" ? "Popüler" : "Popular",
      variant: "popular",
      icon: Star,
    },
    {
      show: !!product.isNew,
      label: language === "tr" ? "Yeni" : "New",
      variant: "new",
    },
  ];
  const visibleBadges = badges.filter((b) => b.show).slice(0, 2);
  const { contentFit, handleContainerLayout, handleImageLoad } =
    useAdaptiveProductImageFit(product.imageUrl);

  return (
    <Pressable
      onPress={handlePress}
      className={`rounded-[20px] overflow-hidden border shadow-md min-h-[48px] ${className || ""}`}
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 8,
          elevation: 4,
        },
        style as object,
      ]}
      accessibilityRole="button"
      accessibilityLabel={displayName}
    >
      {/* ── Image Section ── */}
      <View className="relative">
        {/* Accent color strip */}
        <View
          className="absolute top-0 left-0 right-0 z-10 h-1.5 rounded-t-[20px]"
          style={{ backgroundColor: colors.primary }}
        />

        {/* Hero image — 4:3 aspect */}
        <View
          onLayout={handleContainerLayout}
          className="w-full overflow-hidden items-center justify-center"
          style={{
            backgroundColor: colors.muted,
            aspectRatio: FOOD_IMAGE_ASPECT_RATIO,
          }}
        >
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              contentFit={contentFit}
              contentPosition="center"
              transition={300}
              cachePolicy="memory-disk"
              placeholder={{ blurhash: BLURHASH }}
              recyclingKey={product.id}
              style={StyleSheet.absoluteFill}
              onLoad={handleImageLoad}
            />
          ) : (
            <UtensilsCrossed
              size={40}
              color={colors.mutedForeground}
              strokeWidth={1.5}
            />
          )}
        </View>

        {/* ── Badge overlay (top-left) ── */}
        <View className="absolute top-3 left-3 z-20 gap-1.5">
          {visibleBadges.map((badge) => (
            <Badge
              key={badge.variant}
              label={badge.label}
              variant={badge.variant}
              icon={badge.icon}
            />
          ))}
        </View>

        {/* ── Allergen indicator (top-right) ── */}
        {product.isAllergenic && product.allergens.length > 0 && (
          <View className="absolute top-3 right-3 z-20">
            <View
              className="backdrop-blur rounded-full p-1.5 shadow-sm"
              style={{ backgroundColor: `${colors.background}E6` }}
            >
              <AlertTriangle
                size={16}
                color={colors.destructive}
                strokeWidth={2}
              />
            </View>
          </View>
        )}
      </View>

      {/* ── Info Section ── */}
      <View className="p-3.5 gap-2">
        {/* Product name */}
        <Text
          className="text-base font-bold leading-tight"
          style={{ color: colors.foreground }}
          numberOfLines={2}
        >
          {displayName}
        </Text>
        <ProductCaloriesLabel product={product} />

        {/* Rating row */}
        {product.rating ? (
          <View className="flex-row items-center gap-1.5">
            <StarRating rating={product.rating} size={11} />
            <Text
              className="text-[11px] font-medium"
              style={{ color: colors.mutedForeground }}
            >
              {product.rating.toFixed(1)}
            </Text>
            {product.ratingCount && (
              <Text
                className="text-[10px]"
                style={{ color: colors.mutedForeground }}
              >
                ({product.ratingCount})
              </Text>
            )}
          </View>
        ) : null}

        {/* Price + Add to Cart */}
        <View className="flex-row items-center justify-between mt-auto pt-1">
          <View className="flex-1 pr-2 gap-0.5">
            <View className="flex-row items-baseline flex-wrap gap-1.5">
              <Text
                className="text-lg font-extrabold"
                style={{
                  color: showDiscount ? colors.primary : colors.foreground,
                }}
              >
                {formatPrice(salePrice)}
              </Text>
              {showDiscount && (
                <Text
                  className="text-sm font-semibold line-through"
                  style={{ color: colors.mutedForeground }}
                >
                  {formatPrice(listPrice)}
                </Text>
              )}
              {discountRate != null && discountRate > 0 && (
                <View
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: `${colors.warning}26` }}
                >
                  <Text
                    className="text-[10px] font-bold"
                    style={{ color: colors.warning }}
                  >
                    %{discountRate} {language === "tr" ? "İndirim" : "Off"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Add to cart FAB */}
          <Pressable
            onPress={handleAddToCartPress}
            className="h-11 w-11 rounded-full items-center justify-center shadow-md"
            style={{
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: isDark ? 0.5 : 0.35,
              shadowRadius: 6,
              elevation: 6,
            }}
            accessibilityRole="button"
            accessibilityLabel={
              language === "tr" ? "Sepete ekle" : "Add to cart"
            }
          >
            <ShoppingCart size={20} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});
