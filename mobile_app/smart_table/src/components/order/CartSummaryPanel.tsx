// ============================================================
// Smart Table — Cart Summary Panel Component
// Order note input, total amount, place order button.
// ============================================================

import React, { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { ClipboardList, Plus, ShoppingBag } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";
import { formatPrice } from "@/utils/format";

interface CartSummaryPanelProps {
  language: "tr" | "en";
  note: string;
  setNote: (note: string) => void;
  totalAmount: number;
  isPlacingOrder: boolean;
  onAddProduct: () => void;
  onPlaceOrder: () => void;
  useSplitLayout?: boolean;
}

export const CartSummaryPanel = React.memo(function CartSummaryPanel({
  language,
  note,
  setNote,
  totalAmount,
  isPlacingOrder,
  onAddProduct,
  onPlaceOrder,
  useSplitLayout,
}: CartSummaryPanelProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(20, insets.bottom + 16);
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const handleAddProduct = useCallback(() => {
    onAddProduct();
  }, [onAddProduct]);

  const handlePlaceOrder = useCallback(() => {
    if (!isPlacingOrder) onPlaceOrder();
  }, [isPlacingOrder, onPlaceOrder]);

  const noteBorderColor = isNoteFocused ? colors.primary : colors.border;
  const noteBgColor = isNoteFocused ? colors.accent : colors.muted;

  return (
    <View
      className={useSplitLayout ? "flex-1 px-5 pt-5 pb-5" : "border-t px-5 pt-3"}
      style={{
        borderTopColor: useSplitLayout ? "transparent" : colors.border,
        backgroundColor: colors.card,
        paddingBottom: bottomPadding,
      }}
    >
      <Pressable
        onPress={() => setIsNoteFocused(true)}
        className="flex-row items-center rounded-2xl border px-4 py-3 mb-3"
        style={{
          borderColor: noteBorderColor,
          backgroundColor: noteBgColor,
        }}
      >
        <ClipboardList size={18} color={colors.icon} />
        <TextInput
          className="flex-1 ml-3 text-[15px]"
          style={{ color: colors.foreground }}
          placeholder={
            language === "tr" ? "Sipariş notu..." : "Order note..."
          }
          placeholderTextColor={colors.placeholder}
          value={note}
          onChangeText={setNote}
          onFocus={() => setIsNoteFocused(true)}
          onBlur={() => setIsNoteFocused(false)}
          multiline
          maxLength={200}
        />
      </Pressable>

      <View className="flex-row items-center justify-between mb-3">
        <Text
          className="text-[15px]"
          style={{ color: colors.mutedForeground }}
        >
          {language === "tr" ? "Toplam Tutar" : "Total Amount"}
        </Text>
        <Text
          className="text-[24px] font-bold"
          style={{ color: colors.foreground }}
        >
          {formatPrice(totalAmount)}
        </Text>
      </View>

      <Pressable
        onPress={handleAddProduct}
        className="w-full h-12 rounded-2xl items-center justify-center flex-row mb-3 border-2 active:opacity-80"
        style={{
          borderColor: colors.border,
          backgroundColor: colors.background,
        }}
      >
        <Plus size={18} color={colors.foreground} />
        <Text
          className="text-[16px] font-semibold ml-2"
          style={{ color: colors.foreground }}
        >
          {language === "tr" ? "Ürün Ekle" : "Add Product"}
        </Text>
      </Pressable>

      <Pressable
        onPress={handlePlaceOrder}
        disabled={isPlacingOrder}
        className="w-full h-14 rounded-2xl items-center justify-center flex-row active:opacity-80 shadow-lg"
        style={{
          backgroundColor: colors.primary,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isPlacingOrder ? 0.15 : 0.3,
          shadowRadius: 12,
          elevation: 8,
          opacity: isPlacingOrder ? 0.7 : 1,
        }}
      >
        {isPlacingOrder ? (
          <ActivityIndicator
            size="small"
            color={colors.primaryForeground}
          />
        ) : (
          <ShoppingBag size={20} color="white" />
        )}
        <Text
          className="text-[17px] font-bold ml-2"
          style={{ color: colors.primaryForeground }}
        >
          {isPlacingOrder
            ? language === "tr"
              ? "Gönderiliyor…"
              : "Placing…"
            : language === "tr"
              ? "Sipariş Ver"
              : "Place Order"}
        </Text>
      </Pressable>
    </View>
  );
});
