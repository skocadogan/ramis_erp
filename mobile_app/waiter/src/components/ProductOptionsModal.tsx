import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, SlidersHorizontal } from "lucide-react-native";
import type { Product } from "../types/models";

type ProductModifier = {
  id: string;
  name: string;
  price_adjustment?: number | string;
};

type ModifierGroup = {
  id: string;
  name: string;
  is_required?: boolean;
  is_multiple?: boolean;
  modifiers: ProductModifier[];
};

type ProductWithPending = Product & {
  _pendingQty?: number;
  _pendingUnit?: {
    id: string;
    name: string;
    price_override?: number | string | null;
    multiplier?: number | string;
  };
};

interface ProductOptionsModalProps {
  visible: boolean;
  product: ProductWithPending | null;
  onConfirm: (
    unit:
      | {
          id: string;
          name: string;
          price_override?: number | string | null;
          multiplier?: number | string;
        }
      | null
      | undefined,
    modifiers: ProductModifier[]
  ) => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function unitPrice(
  product: ProductWithPending | null | undefined,
  unit:
    | {
        id: string;
        name: string;
        price_override?: number | string | null;
        multiplier?: number | string;
      }
    | null
    | undefined
): number {
  if (!product) return 0;
  let price = parseFloat(String(product.base_price ?? 0));
  if (product.has_discount && product.discounted_price != null) {
    price = parseFloat(String(product.discounted_price));
  }
  if (!unit) return price;
  if (unit.price_override != null) return parseFloat(String(unit.price_override));
  return price * parseFloat(String(unit.multiplier ?? 1));
}

/** Satış birimi seçimi UnitSelectionModal'da yapılır; bu modal yalnızca modifier seçer. */
function portionUnit(product: ProductWithPending | null | undefined): {
  id: string;
  name: string;
  price_override?: number | string | null;
  multiplier?: number | string;
} | null {
  if (!product || product._pendingQty == null) return null;
  return product._pendingUnit !== undefined ? product._pendingUnit : null;
}

export const ProductOptionsModal: React.FC<ProductOptionsModalProps> = ({
  visible,
  product,
  onConfirm,
  onClose,
  t,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;
  const groups = useMemo(
    () => (product?.modifier_groups ?? []) as ModifierGroup[],
    [product?.modifier_groups]
  );
  const [selectedUnit, setSelectedUnit] = useState<{
    id: string;
    name: string;
    price_override?: number | string | null;
    multiplier?: number | string;
  } | null>(null);
  const [picked, setPicked] = useState<Record<string, ProductModifier[]>>({});

  useEffect(() => {
    if (!visible || !product) return;
    setSelectedUnit(portionUnit(product));
    setPicked({});
  }, [visible, product]);

  const baseUnitPrice = useMemo(() => {
    if (!product) return 0;
    return unitPrice(product, selectedUnit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, selectedUnit]);

  const modifierTotal = useMemo(
    () =>
      Object.values(picked)
        .flat()
        .reduce((sum, m) => sum + parseFloat(String(m.price_adjustment ?? 0)), 0),
    [picked]
  );

  const validationError = useMemo(() => {
    for (const g of groups) {
      if (g.is_required && !picked[g.id]?.length) {
        return t("order.optionsRequired", { name: g.name });
      }
    }
    return null;
  }, [groups, picked, t]);

  if (!visible || !product) return null;

  const toggleModifier = (groupId: string, mod: ProductModifier, isMultiple: boolean) => {
    setPicked((prev) => {
      const current = prev[groupId] ?? [];
      const exists = current.some((m) => m.id === mod.id);
      if (isMultiple) {
        return {
          ...prev,
          [groupId]: exists ? current.filter((m) => m.id !== mod.id) : [...current, mod],
        };
      }
      return { ...prev, [groupId]: exists ? [] : [mod] };
    });
  };

  const handleConfirm = () => {
    if (validationError) return;
    onConfirm(selectedUnit, Object.values(picked).flat());
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/55 justify-end">
        <View
          className="bg-card rounded-t-[32px] max-h-[85%] border-t border-border"
          style={{ borderCurve: "continuous", paddingBottom: Math.max(bottomInset + 12, 20) }}
        >
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border/40">
            <View className="flex-row items-center gap-3 flex-1 pr-3">
              <View className="w-10 h-10 rounded-2xl bg-blue-50 items-center justify-center">
                <SlidersHorizontal size={18} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-black text-base">{product.name}</Text>
                <Text className="text-muted-foreground text-xs font-bold mt-0.5">
                  {t("order.optionsSelect")}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 rounded-full bg-secondary/80 items-center justify-center"
            >
              <X size={20} color="#666" />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-4" contentContainerStyle={{ paddingBottom: 12 }}>
            <View className="gap-4">
              {groups.map((group) => (
                <View key={group.id}>
                  <Text className="text-foreground font-black text-sm mb-2">
                    {group.name}
                    {group.is_required ? (
                      <Text className="text-amber-600 text-[10px] uppercase">
                        {" "}
                        · {t("order.optionsRequiredBadge")}
                      </Text>
                    ) : null}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {group.modifiers.map((mod) => {
                      const active = (picked[group.id] ?? []).some((m) => m.id === mod.id);
                      const priceAdj = parseFloat(String(mod.price_adjustment ?? 0));
                      const priceLabel = priceAdj > 0 ? ` (+${priceAdj.toFixed(2)})` : "";
                      return (
                        <Pressable
                          key={mod.id}
                          onPress={() => toggleModifier(group.id, mod, !!group.is_multiple)}
                          className={`rounded-xl border px-3 py-2 ${
                            active ? "bg-blue-600 border-blue-600" : "bg-secondary/40 border-border"
                          }`}
                        >
                          <Text
                            className={`text-sm font-bold ${active ? "text-white" : "text-foreground"}`}
                          >
                            {mod.name}
                            {priceLabel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              {validationError ? (
                <Text className="text-destructive text-sm font-semibold">{validationError}</Text>
              ) : null}
            </View>
          </ScrollView>

          {groups.length > 0 && (
            <View className="flex-row items-center justify-between px-5 pt-3 border-t border-border/40">
              <Text className="text-emerald-600 font-black">
                {(baseUnitPrice + modifierTotal).toFixed(2)}
              </Text>
              <Pressable
                disabled={Boolean(validationError)}
                onPress={handleConfirm}
                className={`rounded-full px-5 py-3 ${validationError ? "bg-muted" : "bg-blue-600"}`}
              >
                <Text className="text-white font-black">{t("order.optionsAddToCart")}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};
