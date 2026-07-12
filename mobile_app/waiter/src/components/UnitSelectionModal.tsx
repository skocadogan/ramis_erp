import React, { useState, useEffect } from "react";
import { View, Text, Pressable, ScrollView, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Scale } from "lucide-react-native";
import type { Product, ProductUnit } from "../types/models";

interface UnitSelectionModalProps {
  visible: boolean;
  product: Product | null;
  onSelect: (selections: { unit?: ProductUnit; quantity: number }[]) => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const UnitSelectionModal: React.FC<UnitSelectionModalProps> = ({
  visible,
  product,
  onSelect,
  onClose,
  t,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;

  // Her bir porsiyon biriminin lokal sipariş adedi state'i
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // Modal her açıldığında ve ürün değiştiğinde adetleri sıfırla, varsayılan olarak standarta 1 ver
  useEffect(() => {
    if (visible && product) {
      setQuantities({ base: 1 });
    }
  }, [visible, product]);

  if (!product) return null;

  const updateQty = (key: string, delta: number) => {
    setQuantities((prev) => {
      const current = prev[key] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [key]: next };
    });
  };

  const hasSelections = Object.values(quantities).some((qty) => qty > 0);

  const handleAddPress = () => {
    const selections: { unit?: import("../types/models").ProductUnit; quantity: number }[] = [];

    // Standart porsiyon kontrolü
    if ((quantities["base"] || 0) > 0) {
      selections.push({ unit: undefined, quantity: quantities["base"] });
    }

    // Diğer porsiyon birimleri kontrolü
    if (Array.isArray(product.units)) {
      for (const unit of product.units) {
        const uKey = String(unit.id || unit.name);
        if ((quantities[uKey] || 0) > 0) {
          selections.push({ unit, quantity: quantities[uKey] });
        }
      }
    }

    if (selections.length > 0) {
      onSelect(selections);
    }
  };

  const renderQtySelector = (key: string) => {
    const qty = quantities[key] || 0;
    return (
      <View className="flex-row items-center bg-secondary/80 rounded-full p-1 border border-border/80">
        <Pressable
          onPress={() => updateQty(key, -1)}
          className="w-8 h-8 rounded-full bg-white items-center justify-center active:scale-95 shadow-sm border border-border"
        >
          <Text className="text-foreground/80 font-extrabold text-sm leading-none">-</Text>
        </Pressable>
        <Text className="text-foreground font-black text-xs px-3 min-w-[32px] text-center">
          {qty}
        </Text>
        <Pressable
          onPress={() => updateQty(key, 1)}
          className="w-8 h-8 rounded-full bg-white items-center justify-center active:scale-95 shadow-sm border border-border"
        >
          <Text className="text-foreground/80 font-extrabold text-sm leading-none">+</Text>
        </Pressable>
      </View>
    );
  };

  const baseQty = quantities["base"] || 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/55 justify-end">
        <View
          className="bg-card rounded-t-[44px] p-6 h-[72%] shadow-2xl flex-col border-t border-border"
          style={{
            borderCurve: "continuous",
            paddingBottom: Math.max(bottomInset + 16, 24),
          }}
        >
          {/* Header */}
          <View className="flex-row justify-between items-center mb-7 shrink-0">
            <Pressable
              onPress={onClose}
              className="active:scale-95 bg-secondary/80 w-10 h-10 rounded-full items-center justify-center border border-border"
            >
              <X size={20} color="#6B6560" />
            </Pressable>
            <View className="items-center">
              <Text className="text-foreground text-lg font-black tracking-tight">
                {product.name}
              </Text>
              <Text className="text-primary text-[10px] font-black uppercase tracking-wider mt-0.5">
                Satış Birimi & Adet Seçin
              </Text>
            </View>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View className="gap-3.5 mb-6">
              {/* Standart Porsiyon Satırı */}
              <View
                className={`transition-all p-5 rounded-[26px] flex-row justify-between items-center border ${
                  baseQty > 0
                    ? "bg-primary/10/20 border-primary/30"
                    : "bg-secondary/40 border-border/60"
                }`}
                style={{ borderCurve: "continuous" }}
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <View
                    className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${
                      baseQty > 0 ? "bg-primary/20" : "bg-primary/10"
                    }`}
                  >
                    <Scale size={20} color="#1E2A4A" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-black text-sm tracking-tight">
                      Standart
                    </Text>
                    <Text className="text-muted-foreground text-[10px] font-bold mt-0.5">
                      {product.has_discount ? (
                        <Text className="text-emerald-600 dark:text-emerald-400 font-bold">
                          {parseFloat(product.discounted_price || "0").toFixed(2)}
                        </Text>
                      ) : (
                        <Text className="text-muted-foreground font-bold">
                          {parseFloat(product.base_price || "0").toFixed(2)}
                        </Text>
                      )}
                    </Text>
                  </View>
                </View>
                {/* Adet Seçici */}
                {renderQtySelector("base")}
              </View>

              {/* Özel Porsiyon Birimleri Listesi */}
              {Array.isArray(product.units) &&
                product.units.map((unit: import("../types/models").ProductUnit) => {
                  const uKey = String(unit.id || unit.name);
                  const qty = quantities[uKey] || 0;

                  const discountRate = product.has_discount
                    ? parseFloat(product.discount_rate || "0")
                    : 0;
                  const discountFactor = 1 - discountRate / 100;

                  const originalPrice = unit.price_override
                    ? parseFloat(String(unit.price_override))
                    : parseFloat(String(product.base_price || "0")) *
                      parseFloat(String(unit.multiplier ?? "1"));

                  const price = product.has_discount
                    ? unit.price_override
                      ? originalPrice * discountFactor
                      : parseFloat(String(product.discounted_price || "0")) *
                        parseFloat(String(unit.multiplier ?? "1"))
                    : originalPrice;

                  return (
                    <View
                      key={unit.id || unit.name}
                      className={`transition-all p-5 rounded-[26px] flex-row justify-between items-center border ${
                        qty > 0
                          ? "bg-primary/10/20 border-primary/30"
                          : "bg-secondary/40 border-border/60"
                      }`}
                      style={{ borderCurve: "continuous" }}
                    >
                      <View className="flex-row items-center flex-1 mr-2">
                        <View
                          className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${
                            qty > 0 ? "bg-primary/20" : "bg-primary/10"
                          }`}
                        >
                          <Scale size={20} color="#1E2A4A" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-foreground font-black text-sm tracking-tight">
                            {unit.name}
                          </Text>
                          <Text className="text-muted-foreground text-[10px] font-bold mt-0.5">
                            <Text
                              className={
                                qty > 0
                                  ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                  : "text-muted-foreground font-bold"
                              }
                            >
                              {price.toFixed(2)}
                            </Text>
                            {parseFloat(String(unit.multiplier ?? "1")) !== 1.0 &&
                              !unit.price_override && (
                                <Text className="text-muted-foreground text-[9px] font-medium">
                                  {" "}
                                  (x{unit.multiplier})
                                </Text>
                              )}
                          </Text>
                        </View>
                      </View>
                      {/* Adet Seçici */}
                      {renderQtySelector(uKey)}
                    </View>
                  );
                })}
            </View>
          </ScrollView>

          {/* Aksiyon Butonları */}
          <View className="pt-4 gap-2.5 shrink-0">
            <Pressable
              onPress={handleAddPress}
              disabled={!hasSelections}
              className={`active:scale-[0.98] transition-all h-16 rounded-full items-center justify-center shadow-md ${
                hasSelections ? "bg-primary shadow-primary/15" : "bg-muted"
              }`}
            >
              <Text
                className={`font-black text-base ${hasSelections ? "text-white" : "text-muted-foreground"}`}
              >
                Siparişe Ekle
              </Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              className="active:scale-[0.98] transition-all bg-secondary h-16 rounded-full items-center justify-center border border-border/80"
            >
              <Text className="text-foreground/80 font-black text-base">{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
