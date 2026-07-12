import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MessageSquareText, X } from "lucide-react-native";

const MAX_ITEM_NOTES_LENGTH = 255;

interface CartItemNoteModalProps {
  visible: boolean;
  productName: string;
  initialNotes?: string;
  onClose: () => void;
  onSave: (notes: string) => void;
  t: (key: string) => string;
}

export const CartItemNoteModal: React.FC<CartItemNoteModalProps> = ({
  visible,
  productName,
  initialNotes = "",
  onClose,
  onSave,
  t,
}) => {
  const [draft, setDraft] = useState(initialNotes);
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;

  useEffect(() => {
    if (visible) {
      setDraft(initialNotes);
    }
  }, [visible, initialNotes]);

  const handleSave = () => {
    onSave(draft.trim());
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/55 justify-end">
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityLabel={t("order.itemNoteClose")}
        />
        <View
          className="bg-card rounded-t-[32px] p-6 shadow-2xl border-t border-border"
          style={{ borderCurve: "continuous", paddingBottom: Math.max(bottomInset + 16, 24) }}
        >
          <View className="flex-row items-start justify-between mb-5">
            <View className="flex-row items-center gap-3 flex-1 pr-3">
              <View className="bg-blue-50 w-10 h-10 rounded-xl items-center justify-center">
                <MessageSquareText size={20} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground font-black text-base">
                  {t("order.itemNoteTitle")}
                </Text>
                <Text
                  className="text-muted-foreground text-xs font-semibold mt-0.5"
                  numberOfLines={2}
                >
                  {productName}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              className="active:scale-95 bg-secondary/80 w-10 h-10 rounded-full items-center justify-center border border-border"
              accessibilityLabel={t("order.itemNoteClose")}
            >
              <X size={20} color="#6B6560" />
            </Pressable>
          </View>

          <Text className="text-muted-foreground text-[10px] font-black uppercase tracking-wider mb-2">
            {t("order.itemNoteLabel")}
          </Text>
          <TextInput
            value={draft}
            onChangeText={(value) => setDraft(value.slice(0, MAX_ITEM_NOTES_LENGTH))}
            placeholder={t("order.itemNotePlaceholder")}
            placeholderTextColor="#94A3B8"
            multiline
            numberOfLines={4}
            className="bg-secondary/40 border border-border/60 rounded-[20px] p-3 text-foreground text-sm min-h-[100px]"
            style={{ borderCurve: "continuous", textAlignVertical: "top" }}
          />
          <Text className="text-muted-foreground text-[10px] font-bold text-right mt-1 tabular-nums">
            {draft.length}/{MAX_ITEM_NOTES_LENGTH}
          </Text>

          <View className="flex-row gap-2 mt-4">
            {draft.trim() ? (
              <Pressable
                onPress={() => {
                  onSave("");
                  onClose();
                }}
                className="flex-1 active:scale-[0.98] h-12 rounded-full items-center justify-center border border-border bg-white"
              >
                <Text className="text-foreground/80 font-bold text-sm">
                  {t("order.itemNoteClear")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              className="flex-1 active:scale-[0.98] h-12 rounded-full items-center justify-center border border-border bg-white"
            >
              <Text className="text-foreground/80 font-bold text-sm">
                {t("order.itemNoteCancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              className="flex-1 active:scale-[0.98] h-12 rounded-full items-center justify-center bg-primary"
            >
              <Text className="text-white font-black text-sm">{t("order.itemNoteSave")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
