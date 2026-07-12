import React from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

interface CancelOrderModalProps {
  visible: boolean;
  isCancelling: boolean;
  selectedReasonCode: string;
  reasonDescription: string;
  setSelectedReasonCode: (code: string) => void;
  setReasonDescription: (desc: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  visible,
  isCancelling,
  selectedReasonCode,
  reasonDescription,
  setSelectedReasonCode,
  setReasonDescription,
  onClose,
  onSubmit,
  t,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 bg-black/55 justify-end">
        <View
          className="bg-card rounded-t-[44px] p-6 h-[82%] shadow-2xl flex-col border-t border-border"
          style={{
            borderCurve: "continuous",
            paddingBottom: Math.max(bottomInset + 16, 24),
          }}
        >
          <View className="flex-row justify-between items-center mb-6 shrink-0">
            <Pressable
              onPress={onClose}
              className="active:scale-95 bg-secondary/80 w-10 h-10 rounded-full items-center justify-center border border-border"
            >
              <X size={20} color="#6B6560" />
            </Pressable>
            <Text className="text-foreground text-lg font-black tracking-tight">
              {t("tableDetail.cancelOrderTitle")}
            </Text>
            <View className="w-10" />
          </View>

          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            <View
              className="bg-destructive/5 dark:bg-destructive/10 p-4 rounded-[22px] border border-destructive/20 mb-6"
              style={{ borderCurve: "continuous" }}
            >
              <Text className="text-destructive text-[10px] font-black uppercase tracking-wider text-center">
                Denetim Kaydı (Audit Log) Olarak İşlenecektir
              </Text>
            </View>

            <Text className="text-muted-foreground font-black text-[10px] uppercase tracking-wider mb-3">
              {t("tableDetail.cancelOrderReason")}
            </Text>

            <View className="gap-2.5 mb-6">
              {[
                { code: "MISTAKE", label: t("tableDetail.reasons.mistake") },
                { code: "CUSTOMER_CANCEL", label: t("tableDetail.reasons.customerCancel") },
                { code: "OUT_OF_STOCK", label: t("tableDetail.reasons.outOfStock") },
                { code: "KITCHEN_ERROR", label: t("tableDetail.reasons.kitchenError") },
                { code: "QUALITY_ISSUE", label: t("tableDetail.reasons.qualityIssue") },
                { code: "OTHER", label: t("tableDetail.reasons.other") },
              ].map((reason) => {
                const isSelected = selectedReasonCode === reason.code;
                return (
                  <Pressable
                    key={reason.code}
                    onPress={() => setSelectedReasonCode(reason.code)}
                    className={`active:scale-[0.98] transition-all p-4.5 rounded-[22px] flex-row items-center border ${
                      isSelected
                        ? "bg-destructive/10 border-destructive/40"
                        : "bg-secondary/40 border-border/60"
                    }`}
                    style={{ borderCurve: "continuous" }}
                  >
                    <View
                      className={`w-5 h-5 rounded-full border items-center justify-center mr-3.5 ${
                        isSelected ? "border-destructive bg-destructive" : "border-border bg-card"
                      }`}
                    >
                      {isSelected && <View className="w-2 h-2 rounded-full bg-white" />}
                    </View>
                    <Text
                      className={`font-semibold text-sm ${isSelected ? "text-destructive" : "text-foreground"}`}
                    >
                      {reason.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-muted-foreground font-black text-[10px] uppercase tracking-wider mb-3">
              AÇIKLAMA (OPSİYONEL)
            </Text>

            <TextInput
              value={reasonDescription}
              onChangeText={setReasonDescription}
              placeholder={t("tableDetail.cancelOrderDescPlaceholder")}
              multiline
              numberOfLines={3}
              className="bg-secondary/40 border border-border/60 rounded-[24px] p-4 text-foreground text-sm min-h-[90px] text-start mb-8"
              style={{ borderCurve: "continuous" }}
              placeholderTextColor="#8A8480"
              textAlignVertical="top"
            />
          </ScrollView>

          <View className="pt-4 border-t border-border/20 shrink-0">
            <Pressable
              onPress={onSubmit}
              disabled={isCancelling}
              className="active:scale-[0.98] bg-destructive h-16 rounded-2xl items-center justify-center"
            >
              {isCancelling ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-white font-black text-base">
                  {t("tableDetail.cancelOrderSubmit")}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};
