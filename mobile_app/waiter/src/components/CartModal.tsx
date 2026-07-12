import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
/** FlashList generic type mismatch — keep as any for Expo compatibility */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FlashListAny = FlashList as any;
import { X, Trash2, Plus, Minus, MessageSquarePlus } from "lucide-react-native";
import { CartItemNoteModal } from "./CartItemNoteModal";
import { usePosStore } from "../store/usePosStore";
import type { CartItem } from "../store/usePosStore";
import { DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD } from "../hooks/useKitchenQueueBuffer";

interface CartModalProps {
  visible: boolean;
  cart: CartItem[];
  onClose: () => void;
  onClear: () => void;
  onUpdateQty: (cartId: string, delta: number) => void;
  onSubmit: (notes: string) => void;
  isSubmitting: boolean;
  /** Smart Firing v2 — tahmini ek mutfak buffer (dk) */
  expectedBuffer?: number;
  /** Backend `SMART_FIRING_UI_BUSY_THRESHOLD` (dk) */
  busyThreshold?: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const CartModal: React.FC<CartModalProps> = ({
  visible,
  cart,
  onClose,
  onClear,
  onUpdateQty,
  onSubmit,
  isSubmitting,
  expectedBuffer = 0,
  busyThreshold = DEFAULT_KITCHEN_BUSY_BUFFER_THRESHOLD,
  t,
}) => {
  const isKitchenBusy = expectedBuffer >= busyThreshold;
  const [notes, setNotes] = useState("");
  const [noteTarget, setNoteTarget] = useState<{
    cartId: string;
    productName: string;
    initialNotes: string;
  } | null>(null);
  const updateCartItemNotes = usePosStore((s) => s.updateCartItemNotes);
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;

  // Calculate the total order amount dynamically
  const totalPrice = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [cart]);

  // Calculate total discount applied
  const totalDiscount = useMemo(() => {
    return cart.reduce((sum, item) => {
      const product = item.product;
      const unit = item.selectedUnit;
      let originalPrice = parseFloat(product.base_price || "0");
      if (unit) {
        if (unit.price_override) {
          originalPrice = parseFloat(String(unit.price_override));
        } else {
          const mult = parseFloat(String(unit.multiplier ?? "1"));
          originalPrice = originalPrice * mult;
        }
      }
      const itemDiscount = Math.max(0, originalPrice - item.unitPrice);
      return sum + itemDiscount * item.quantity;
    }, 0);
  }, [cart]);

  const renderCartItem = useCallback(
    ({ item }: { item: CartItem }) => {
      const hasNotes = Boolean(item.notes?.trim());
      return (
        <View
          className="flex-row items-center justify-between p-4 mb-3.5 bg-secondary/30 rounded-[28px] border border-border/50"
          style={{ borderCurve: "continuous" }}
        >
          <View className="flex-1 mr-4">
            <Text className="text-foreground font-black text-sm tracking-tight">
              {item.product.name}
            </Text>
            {item.selectedUnit?.name ? (
              <Text className="text-muted-foreground text-[10px] font-bold mt-0.5">
                {item.selectedUnit.name}
              </Text>
            ) : null}
            {(item.selectedModifiers ?? []).length > 0 ? (
              <Text className="text-emerald-700 text-[10px] font-semibold mt-0.5">
                * {(item.selectedModifiers ?? []).map((m: { name: string }) => m.name).join(", ")}
              </Text>
            ) : null}
            <Pressable
              onPress={() =>
                setNoteTarget({
                  cartId: item.cartId,
                  productName: item.product.name,
                  initialNotes: item.notes ?? "",
                })
              }
              className={`self-start mt-2 flex-row items-center gap-1 rounded-lg px-2 py-1 active:scale-95 ${
                hasNotes ? "bg-amber-50" : "bg-blue-50"
              }`}
            >
              <MessageSquarePlus
                size={14}
                color={hasNotes ? "#B45309" : "#2563EB"}
                strokeWidth={2.25}
              />
              <Text
                className={`text-[10px] font-bold ${hasNotes ? "text-amber-800" : "text-blue-600"}`}
              >
                {hasNotes ? t("order.itemNoteEdit") : t("order.itemNoteAdd")}
              </Text>
            </Pressable>
            {hasNotes ? (
              <Text className="text-amber-800/90 text-[10px] font-semibold mt-1" numberOfLines={2}>
                {item.notes}
              </Text>
            ) : null}
            <Text className="text-emerald-600 dark:text-emerald-400 font-black text-xs mt-1">
              {(item.unitPrice * item.quantity).toFixed(2)}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Pressable
              onPress={() => onUpdateQty(item.cartId, -1)}
              className="active:scale-90 bg-white w-9 h-9 rounded-full items-center justify-center border border-border/60 shadow-sm"
            >
              <Minus size={16} color="#1E2A4A" strokeWidth={3} />
            </Pressable>
            <Text className="text-foreground font-black text-base mx-3.5">{item.quantity}</Text>
            <Pressable
              onPress={() => onUpdateQty(item.cartId, 1)}
              className="active:scale-90 w-9 h-9 rounded-full bg-primary items-center justify-center shadow-sm"
            >
              <Plus size={16} color="#ffffff" strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      );
    },
    [onUpdateQty, t]
  );

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
          <View className="flex-row justify-between items-center mb-8 shrink-0">
            <Pressable
              onPress={onClose}
              className="active:scale-95 bg-secondary/80 w-10 h-10 rounded-full items-center justify-center border border-border"
            >
              <X size={20} color="#6B6560" />
            </Pressable>
            <Text className="text-foreground text-lg font-black tracking-tight">
              {t("order.cartTitle")}
            </Text>
            <Pressable
              onPress={onClear}
              className="active:scale-95 bg-destructive/10 dark:bg-destructive/20 w-10 h-10 rounded-full items-center justify-center border border-destructive/20"
            >
              <Trash2 size={18} color="#C53030" />
            </Pressable>
          </View>

          <FlashListAny
            data={cart}
            keyExtractor={(item: CartItem) => item.cartId}
            estimatedItemSize={80}
            renderItem={renderCartItem}
            style={{ flex: 1 }}
            contentInsetAdjustmentBehavior="automatic"
          />

          <View className="mt-4 pt-4 border-t border-border/10 shrink-0">
            {/* Notes Section */}
            <View className="mb-4 shrink-0 px-2">
              <Text className="text-muted-foreground text-[10px] font-black uppercase tracking-wider mb-2">
                {t("order.notesLabel") || "Sipariş Açıklaması / Notu"}
              </Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t("order.notesPlaceholder") || "Açıklama veya mutfak notu..."}
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={2}
                className="bg-secondary/40 border border-border/60 rounded-[20px] p-3 text-foreground text-sm min-h-[60px]"
                style={{ borderCurve: "continuous", textAlignVertical: "top" }}
              />
            </View>

            {/* Dynamic Order Total Section */}
            {totalDiscount > 0 ? (
              <View className="flex-row justify-between items-center mb-3 px-2">
                <Text className="text-amber-600 dark:text-amber-400 font-bold text-sm">
                  {t("order.totalDiscount")}
                </Text>
                <Text className="text-amber-600 dark:text-amber-400 font-black text-base">
                  -{totalDiscount.toFixed(2)}
                </Text>
              </View>
            ) : null}

            <View className="flex-row justify-between items-center mb-5 px-2">
              <Text className="text-muted-foreground dark:text-muted-foreground font-bold text-sm">
                {t("order.total")}
              </Text>
              <Text className="text-emerald-600 dark:text-emerald-400 font-black text-lg">
                {totalPrice.toFixed(2)}
              </Text>
            </View>

            <Pressable
              disabled={isSubmitting}
              onPress={() => onSubmit(notes)}
              className={`active:scale-[0.98] transition-all h-16 rounded-full items-center justify-center shadow-md ${
                isKitchenBusy
                  ? "bg-amber-600 shadow-amber-600/25 border-2 border-amber-500/40"
                  : "bg-primary shadow-primary/20"
              }`}
            >
              {isKitchenBusy ? (
                <View className="items-center">
                  <Text className="text-white font-black text-base">
                    {t("order.submitBusy", { count: cart.length })}
                  </Text>
                  <Text className="text-amber-100 text-[10px] font-bold uppercase tracking-wide mt-0.5">
                    {t("order.kitchenBusy", { minutes: expectedBuffer })}
                  </Text>
                </View>
              ) : (
                <Text className="text-white font-black text-base">
                  {t("order.submit", { count: cart.length })}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <CartItemNoteModal
        visible={noteTarget !== null}
        productName={noteTarget?.productName ?? ""}
        initialNotes={noteTarget?.initialNotes ?? ""}
        onClose={() => setNoteTarget(null)}
        onSave={(value) => {
          if (noteTarget) {
            updateCartItemNotes(noteTarget.cartId, value);
          }
        }}
        t={t}
      />
    </Modal>
  );
};
