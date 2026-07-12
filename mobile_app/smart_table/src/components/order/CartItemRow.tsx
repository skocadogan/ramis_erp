// ============================================================
// Smart Table — Cart Item Row Component
// ============================================================

import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { PRODUCT_IMAGE_CONTENT_FIT } from "@/components/menu/product-detail/ProductDetailHero";
import { ShoppingBag, Trash2, Minus, Plus } from "lucide-react-native";
import {
  formatPrice,
  formatModifierDisplayName,
  formatUnitDisplayName,
} from "@/utils/format";
import {
  cartItemDisplayBaseUnitPrice,
  cartItemUnitPremium,
  shouldShowCartUnitTag,
} from "@/utils/pricing";
import type { CartItem } from "@/types";
import { useTheme } from "@/hooks/useTheme";

interface CartItemRowProps {
  item: CartItem;
  language: "tr" | "en";
  onUpdateQuantity: (item: CartItem, qty: number) => void;
  onRemove: (item: CartItem) => void;
}

export const CartItemRow = React.memo(
  ({ item, language, onUpdateQuantity, onRemove }: CartItemRowProps) => {
    const displayBaseUnitPrice = cartItemDisplayBaseUnitPrice(item);
    const unitPremium = cartItemUnitPremium(item);
    const showUnitTag = shouldShowCartUnitTag(item);
    const lineTotal = item.unitPrice * item.quantity;
    const { colors } = useTheme();

    const cardStyle = useMemo(
      () => ({
        backgroundColor: colors.card,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 } as const,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }),
      [colors.card],
    );

    return (
      <View
        className="flex-row items-center rounded-2xl px-4 py-3 mb-3"
        style={cardStyle}
      >
        {/* Thumbnail */}
        <View
          className="w-16 h-16 rounded-xl overflow-hidden mr-3"
          style={{ backgroundColor: colors.muted }}
        >
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
              contentFit={PRODUCT_IMAGE_CONTENT_FIT}
              contentPosition="center"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <ShoppingBag size={22} color={colors.icon} />
            </View>
          )}
        </View>

        {/* Info & Controls */}
        <View className="flex-1">
          {/* Name & Variant */}
          <View className="flex-row items-start justify-between mb-1">
            <View className="flex-1 mr-2">
              <Text
                className="text-[16px] font-semibold"
                style={{ color: colors.foreground }}
                numberOfLines={1}
              >
                {language === "tr" ? item.productName : item.productNameEn}
              </Text>
              {item.variant && (
                <Text
                  className="text-[13px] mt-0.5"
                  style={{ color: colors.mutedForeground }}
                >
                  {language === "tr" ? item.variant.name : item.variant.nameEn}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => onRemove(item)}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: `${colors.destructive}26` }}
              hitSlop={8}
            >
              <Trash2 size={16} color={colors.destructive} />
            </Pressable>
          </View>

          {/* Unit & Modifier Tags */}
          {(showUnitTag || item.modifiers.length > 0) && (
            <View className="flex-row flex-wrap gap-1 mb-2">
              {showUnitTag ? (
                <View
                  className="px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: colors.accent }}
                >
                  <Text
                    className="text-[11px]"
                    style={{ color: colors.accentForeground }}
                  >
                    {formatUnitDisplayName(item.unit, language, unitPremium)}
                  </Text>
                </View>
              ) : null}
              {item.modifiers.slice(0, 3).map((mod, idx) => (
                <View
                  key={`${mod.modifierId}-${idx}`}
                  className="px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: colors.accent }}
                >
                  <Text
                    className="text-[11px]"
                    style={{ color: colors.accentForeground }}
                  >
                    {formatModifierDisplayName(mod, language)}
                  </Text>
                </View>
              ))}
              {item.modifiers.length > 3 && (
                <View
                  className="px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: colors.muted }}
                >
                  <Text
                    className="text-[11px]"
                    style={{ color: colors.mutedForeground }}
                  >
                    +{item.modifiers.length - 3}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Unit Price */}
          <Text
            className="text-[13px] mb-2"
            style={{ color: colors.mutedForeground }}
          >
            {formatPrice(displayBaseUnitPrice)} x {item.quantity}
          </Text>

          {/* Quantity Controls & Line Total */}
          <View className="flex-row items-center justify-between">
            <View
              className="flex-row items-center rounded-xl overflow-hidden"
              style={{ backgroundColor: colors.muted }}
            >
              <Pressable
                onPress={() =>
                  onUpdateQuantity(item, Math.max(0, item.quantity - 1))
                }
                className="w-10 h-10 items-center justify-center active:opacity-60"
                hitSlop={4}
              >
                <Minus size={18} color={colors.primary} />
              </Pressable>
              <View className="min-w-[40px] items-center justify-center">
                <Text
                  className="text-[17px] font-bold"
                  style={{ color: colors.foreground }}
                >
                  {item.quantity}
                </Text>
              </View>
              <Pressable
                onPress={() => onUpdateQuantity(item, item.quantity + 1)}
                className="w-10 h-10 items-center justify-center active:opacity-60"
                hitSlop={4}
              >
                <Plus size={18} color={colors.primary} />
              </Pressable>
            </View>
            <Text
              className="text-[17px] font-bold"
              style={{ color: colors.primary }}
            >
              {formatPrice(lineTotal)}
            </Text>
          </View>
        </View>
      </View>
    );
  },
);

CartItemRow.displayName = "CartItemRow";
