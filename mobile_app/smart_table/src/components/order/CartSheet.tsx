// ============================================================
// CartSheet — Full-screen / Bottom sheet cart overlay
// Tablet-optimized. Uses useCartStore for state.
// ============================================================

import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { X } from "lucide-react-native";
import { useCartStore, selectCartTotal, selectCartItemCount } from "@/store/cart-store";
import { useOrderStore } from "@/store/order-store";
import { useUIStore } from "@/store/ui-store";
import { useDebouncedCartQuantityToast } from "@/hooks/useDebouncedCartQuantityToast";
import type { CartItem } from "@/types";
import { useTheme } from "@/hooks/useTheme";
import { useCartLayout } from "./cart-layout";
import { CartItemRow } from "./CartItemRow";
import { CartList } from "./CartList";
import { CartSummaryPanel } from "./CartSummaryPanel";
import { CartEmptyState } from "./CartEmptyState";

// ─── CartSheet ──────────────────────────────────────────────

interface CartSheetProps {
  visible: boolean;
  onClose: () => void;
  onPlaceOrder: () => void | Promise<void>;
  onAddProduct: () => void;
  language?: "tr" | "en";
}

export default function CartSheet({
  visible,
  onClose,
  onPlaceOrder,
  onAddProduct,
  language: propLanguage,
}: CartSheetProps) {
  const storeLanguage = useUIStore((s) => s.language);
  const language = propLanguage ?? storeLanguage;
  const { enqueueCartItemToast } = useDebouncedCartQuantityToast();

  const items = useCartStore((s) => s.items);
  const note = useCartStore((s) => s.note);
  const setNote = useCartStore((s) => s.setNote);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const totalAmount = useCartStore(selectCartTotal);
  const itemCount = useCartStore(selectCartItemCount);
  const isPlacingOrder = useOrderStore((s) => s.isPlacingOrder);

  const { colors } = useTheme();
  const {
    useSplitLayout,
    sheetWidth,
    splitSidebarWidth,
    sheetMaxHeight,
  } = useCartLayout();

  // ── Animation ───────────────────────────────────────────
  const translateY = useSharedValue(374); // fallback
  const backdropOpacity = useSharedValue(0);
  const screenHeight = 800; // approximate; animation handles absolute positioning

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, {
        damping: 28,
        stiffness: 300,
        mass: 0.8,
      });
      backdropOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      translateY.value = withTiming(screenHeight, {
        duration: 250,
        easing: Easing.in(Easing.cubic),
      });
      backdropOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible, screenHeight, backdropOpacity, translateY]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  // ── Handlers ────────────────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    if (isPlacingOrder) return;
    await onPlaceOrder();
  }, [isPlacingOrder, onPlaceOrder]);

  const handleAddProduct = useCallback(() => {
    Keyboard.dismiss();
    onAddProduct();
  }, [onAddProduct]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleUpdateQuantity = useCallback(
    (item: CartItem, qty: number) => {
      const quantityDelta = qty - item.quantity;
      updateQuantity(item.id, qty);
      enqueueCartItemToast(item, quantityDelta, language);
    },
    [enqueueCartItemToast, language, updateQuantity],
  );

  const handleRemoveItem = useCallback(
    (item: CartItem) => {
      removeItem(item.id);
      enqueueCartItemToast(item, -item.quantity, language);
    },
    [enqueueCartItemToast, language, removeItem],
  );

  // ── Render ──────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <Animated.View
          style={[
            backdropAnimatedStyle,
            { backgroundColor: "rgba(0,0,0,0.5)" },
          ]}
          className="absolute inset-0"
        >
          <Pressable className="flex-1" onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            sheetAnimatedStyle,
            {
              backgroundColor: colors.background,
              maxHeight: sheetMaxHeight,
              width: sheetWidth,
              alignSelf: "center",
            },
          ]}
          className="absolute bottom-0 left-0 right-0 rounded-t-[24px] overflow-hidden"
        >
          <View className="items-center pt-3 pb-1">
            <View
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: colors.border }}
            />
          </View>

          <View
            className="flex-row items-center justify-between px-6 py-4 border-b"
            style={{ borderBottomColor: colors.border }}
          >
            <View className="flex-row items-center">
              <Text
                className="text-[22px] font-bold"
                style={{ color: colors.foreground }}
              >
                {language === "tr" ? "Sepetim" : "My Cart"}
              </Text>
              {itemCount > 0 && (
                <View
                  className="ml-3 px-3 py-1 rounded-full"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text
                    className="text-[13px] font-bold"
                    style={{ color: colors.primaryForeground }}
                  >
                    {itemCount} {language === "tr" ? "ürün" : "item"}
                    {itemCount > 1 ? (language === "tr" ? "" : "s") : ""}
                  </Text>
                </View>
              )}
            </View>
            <Pressable
              onPress={handleClose}
              className="w-11 h-11 rounded-full items-center justify-center active:opacity-70"
              style={{ backgroundColor: colors.muted }}
              hitSlop={8}
            >
              <X size={22} color={colors.icon} />
            </Pressable>
          </View>

          {items.length === 0 ? (
            <CartEmptyState language={language} />
          ) : useSplitLayout ? (
            <View className="flex-1 flex-row min-h-0">
              <View
                className="flex-1 min-h-0"
                style={{
                  borderRightWidth: 1,
                  borderRightColor: colors.border,
                }}
              >
                <CartList
                  items={items}
                  language={language}
                  onUpdateQuantity={handleUpdateQuantity}
                  onRemove={handleRemoveItem}
                  useSplitLayout
                />
              </View>
              <View
                style={{
                  width: splitSidebarWidth,
                  backgroundColor: colors.card,
                }}
              >
                <CartSummaryPanel
                  language={language}
                  note={note}
                  setNote={setNote}
                  totalAmount={totalAmount}
                  isPlacingOrder={isPlacingOrder}
                  onAddProduct={handleAddProduct}
                  onPlaceOrder={handlePlaceOrder}
                  useSplitLayout
                />
              </View>
            </View>
          ) : (
            <>
              <CartList
                items={items}
                language={language}
                onUpdateQuantity={handleUpdateQuantity}
                onRemove={handleRemoveItem}
              />
              <CartSummaryPanel
                language={language}
                note={note}
                setNote={setNote}
                totalAmount={totalAmount}
                isPlacingOrder={isPlacingOrder}
                onAddProduct={handleAddProduct}
                onPlaceOrder={handlePlaceOrder}
              />
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
