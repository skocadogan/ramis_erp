// ============================================================
// Smart Table — Cart Empty State Component
// ============================================================

import React from "react";
import { View, Text } from "react-native";
import { ShoppingBag } from "lucide-react-native";
import { useTheme } from "@/hooks/useTheme";

export const CartEmptyState = React.memo(function CartEmptyState({
  language,
}: {
  language: "tr" | "en";
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-1 items-center justify-center py-16 px-8">
      <View
        className="w-28 h-28 rounded-full items-center justify-center mb-6"
        style={{ backgroundColor: colors.accent }}
      >
        <ShoppingBag size={48} color={colors.primary} />
      </View>
      <Text
        className="text-[20px] font-bold mb-2"
        style={{ color: colors.foreground }}
      >
        {language === "tr" ? "Sepetiniz boş" : "Your cart is empty"}
      </Text>
      <Text
        className="text-[15px] text-center leading-5"
        style={{ color: colors.mutedForeground }}
      >
        {language === "tr"
          ? "Menüden ürün ekleyerek sipariş oluşturabilirsiniz"
          : "Add items from the menu to create an order"}
      </Text>
    </View>
  );
});
