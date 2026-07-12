import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { Hash, X } from "lucide-react-native";

/** FlashList generic type mismatch — keep as any for Expo compatibility */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FlashListAny = FlashList as any;

interface TransferTableModalProps {
  visible: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allTables: any[];
  onClose: () => void;
  onTransfer: (targetTableId: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const TransferTableModal: React.FC<TransferTableModalProps> = ({
  visible,
  allTables,
  onClose,
  onTransfer,
  t,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/55 justify-end">
        <View
          className="bg-card rounded-t-[44px] p-6 h-[76%] shadow-2xl flex-col border-t border-border"
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
              {t("tableDetail.transferTable")}
            </Text>
            <View className="w-10" />
          </View>

          {allTables.length === 0 ? (
            <View className="flex-1 py-20 items-center justify-center">
              <Text className="text-muted-foreground font-medium">
                {t("terminalSelect.noTerminal")}
              </Text>
            </View>
          ) : (
            <FlashListAny
              data={allTables}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              keyExtractor={(item: any) => item.id}
              estimatedItemSize={55}
              showsVerticalScrollIndicator={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              renderItem={({ item }: { item: any }) => (
                <Pressable
                  onPress={() => onTransfer(item.id)}
                  className="active:scale-[0.98] transition-all flex-row items-center p-4.5 mb-3.5 bg-secondary/40 rounded-[28px] border border-border/60"
                  style={{ borderCurve: "continuous" }}
                >
                  <View className="w-11 h-11 bg-white rounded-full items-center justify-center mr-4 shadow-sm border border-border">
                    <Hash size={18} color="#1E2A4A" strokeWidth={2.5} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-foreground font-black text-sm tracking-tight">
                      {item.name}
                    </Text>
                    <Text className="text-muted-foreground text-[10px] uppercase font-bold mt-0.5">
                      {item.zone_name}
                    </Text>
                  </View>
                </Pressable>
              )}
              style={{ flex: 1 }}
              contentInsetAdjustmentBehavior="automatic"
            />
          )}
        </View>
      </View>
    </Modal>
  );
};
