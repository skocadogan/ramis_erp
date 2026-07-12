// ============================================================
// Smart Table — Garson çağrı (tab + modal ortak içerik)
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  Bell,
  Droplets,
  Receipt,
  HelpCircle,
  UtensilsCrossed,
  Send,
  CheckCircle2,
  Info,
  X,
  MapPin,
} from "lucide-react-native";
import { useUIStore } from "@/store/ui-store";
import { useOrderStore } from "@/store/order-store";
import { useTableStore } from "@/store/table-store";
import { useDialogStore } from "@/store/dialog-store";
import { useSurveyStore } from "@/store/survey-store";
import { useTheme } from "@/hooks/useTheme";
import type { WaiterCallFeedback } from "@/utils/waiterCallFeedback";
import type { WaiterCallType } from "@/types";

const CALL_TYPES: Array<{
  type: WaiterCallType;
  icon: typeof Bell;
  color: string;
  label_tr: string;
  label_en: string;
}> = [
  {
    type: "SERVICE",
    icon: Bell,
    color: "#D94A3D",
    label_tr: "Servis",
    label_en: "Service",
  },
  {
    type: "WATER",
    icon: Droplets,
    color: "#3B82F6",
    label_tr: "Su",
    label_en: "Water",
  },
  {
    type: "BILL",
    icon: Receipt,
    color: "#F59E0B",
    label_tr: "Hesap",
    label_en: "Bill",
  },
  {
    type: "HELP",
    icon: HelpCircle,
    color: "#6B7280",
    label_tr: "Yardım",
    label_en: "Help",
  },
  {
    type: "ORDER",
    icon: UtensilsCrossed,
    color: "#8B5CF6",
    label_tr: "Sipariş",
    label_en: "Order",
  },
];

export interface WaiterCallScreenProps {
  /** Modal modunda üst kapatma butonu */
  variant?: "tab" | "modal";
  onClose?: () => void;
  /** Tab modunda masa yokken profile yönlendirme */
  onGoToProfile?: () => void;
}

export function WaiterCallScreen({
  variant = "tab",
  onClose,
  onGoToProfile,
}: WaiterCallScreenProps) {
  const language = useUIStore((s) => s.language);
  const callWaiter = useOrderStore((s) => s.callWaiter);
  const isCallingWaiter = useOrderStore((s) => s.isCallingWaiter);
  const requestConsentFlow = useSurveyStore((s) => s.requestConsentFlow);
  const selectedTable = useTableStore((s) => s.selectedTable);
  const { colors } = useTheme();

  const tableId = selectedTable?.id ?? null;
  const tableName = selectedTable?.name ?? "";

  const [selectedType, setSelectedType] = useState<WaiterCallType | null>(null);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [feedback, setFeedback] = useState<WaiterCallFeedback | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surveyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = useCallback(() => {
    setSelectedType(null);
    setNote("");
  }, []);

  const clearPendingTimers = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (surveyTimerRef.current) {
      clearTimeout(surveyTimerRef.current);
      surveyTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearPendingTimers, [clearPendingTimers]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        clearPendingTimers();
      };
    }, [clearPendingTimers]),
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedType || !tableId || isSubmitting || isCallingWaiter) return;
    const callType = selectedType;
    setIsSubmitting(true);
    try {
      clearPendingTimers();
      const result = await callWaiter(
        tableId,
        tableName,
        callType,
        note || undefined,
      );
      setFeedback(result);
      setShowSuccess(true);
      resetForm();
      const dismissMs = result.variant === "info" ? 5000 : 2500;
      dismissTimerRef.current = setTimeout(() => {
        setShowSuccess(false);
        setFeedback(null);
        dismissTimerRef.current = null;
      }, dismissMs);
      if (callType === "BILL" && result.shouldTrackCall) {
        surveyTimerRef.current = setTimeout(() => {
          surveyTimerRef.current = null;
          void requestConsentFlow("BILL");
        }, dismissMs);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : language === "tr"
            ? "Garson çağrısı iletilemedi. Lütfen tekrar deneyin."
            : "Could not reach the waiter. Please try again.";
      useDialogStore
        .getState()
        .alert(
          language === "tr" ? "Çağrı gönderilemedi" : "Call failed",
          message,
        );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    selectedType,
    note,
    tableId,
    tableName,
    isSubmitting,
    isCallingWaiter,
    clearPendingTimers,
    callWaiter,
    resetForm,
    language,
    requestConsentFlow,
  ]);

  const iconBg = (hex: string) => `${hex}26`;
  const isBusy = isSubmitting || isCallingWaiter;

  if (!tableId) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: `${colors.primary}26` }}
        >
          <Bell size={40} color={colors.primary} />
        </View>
        <Text
          className="text-lg font-bold text-center mb-3"
          style={{ color: colors.foreground }}
        >
          {language === "tr" ? "Masa seçilmedi" : "No table selected"}
        </Text>
        <Text
          className="text-base text-center mb-6 leading-6"
          style={{ color: colors.mutedForeground }}
        >
          {variant === "modal"
            ? language === "tr"
              ? "Garson çağırmak için önce giriş yapın ve profilinizden bir masa seçin."
              : "Please log in and select a table from your profile to call the waiter."
            : language === "tr"
              ? "Garson çağırmak için profilden masa seçin."
              : "Select a table from your profile to call the waiter."}
        </Text>
        <Pressable
          onPress={variant === "modal" ? onClose : onGoToProfile}
          className="h-12 px-6 rounded-2xl items-center justify-center"
          style={{ backgroundColor: colors.primary }}
        >
          <Text
            className="text-base font-bold"
            style={{ color: colors.primaryForeground }}
          >
            {variant === "modal"
              ? language === "tr"
                ? "Kapat"
                : "Close"
              : language === "tr"
                ? "Profile'a Git"
                : "Go to Profile"}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (showSuccess && feedback) {
    const isInfo = feedback.variant === "info";
    return (
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-24 h-24 rounded-full items-center justify-center mb-5"
          style={{
            backgroundColor: isInfo
              ? `${colors.warning}33`
              : `${colors.success}33`,
          }}
        >
          {isInfo ? (
            <Info size={56} color={colors.warning} />
          ) : (
            <CheckCircle2 size={56} color={colors.success} />
          )}
        </View>
        <Text
          className="text-2xl font-bold mb-3 text-center"
          style={{ color: isInfo ? colors.warning : colors.success }}
        >
          {feedback.title}
        </Text>
        <Text
          className="text-base text-center leading-6"
          style={{ color: colors.mutedForeground }}
        >
          {feedback.message}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 py-4 border-b"
        style={{ borderBottomColor: colors.border }}
      >
        <View className="flex-row items-center gap-3">
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: `${colors.primary}26` }}
          >
            <Bell size={22} color={colors.primary} />
          </View>
          <View>
            <Text
              className="text-2xl font-extrabold"
              style={{ color: colors.foreground }}
            >
              {language === "tr" ? "Garson Çağır" : "Call Waiter"}
            </Text>
            <Text className="text-xs" style={{ color: colors.mutedForeground }}>
              {tableName}
            </Text>
          </View>
        </View>
        {variant === "modal" && onClose ? (
          <Pressable
            onPress={onClose}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.muted }}
            accessibilityRole="button"
            accessibilityLabel={language === "tr" ? "Kapat" : "Close"}
          >
            <X size={22} color={colors.icon} strokeWidth={1.8} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {variant === "modal" ? (
          <View
            className="mx-5 mt-4 flex-row items-center gap-2 px-4 py-2.5 rounded-2xl"
            style={{ backgroundColor: colors.muted }}
          >
            <MapPin size={16} color={colors.icon} strokeWidth={1.5} />
            <Text
              className="text-sm font-medium flex-1"
              style={{ color: colors.mutedForeground }}
            >
              {language === "tr" ? "Masa" : "Table"}: {tableName}
            </Text>
          </View>
        ) : null}

        <View className="px-5 pt-6 pb-4">
          <Text
            className="text-base font-semibold mb-4"
            style={{ color: colors.foreground }}
          >
            {language === "tr" ? "Çağrı Türü" : "Call Type"}
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {CALL_TYPES.map((callType) => {
              const isSelected = selectedType === callType.type;
              const Icon = callType.icon;
              return (
                <Pressable
                  key={callType.type}
                  onPress={() => setSelectedType(callType.type)}
                  disabled={isBusy}
                  className="flex-1 min-w-[45%] rounded-2xl p-5 items-center border-2"
                  style={{
                    backgroundColor: colors.card,
                    borderColor: isSelected ? callType.color : "transparent",
                  }}
                >
                  <View
                    className="w-14 h-14 rounded-full items-center justify-center mb-3"
                    style={{ backgroundColor: iconBg(callType.color) }}
                  >
                    <Icon size={28} color={callType.color} />
                  </View>
                  <Text
                    className="text-sm font-semibold text-center"
                    style={{ color: colors.foreground }}
                  >
                    {language === "tr" ? callType.label_tr : callType.label_en}
                  </Text>
                  {isSelected ? (
                    <View
                      className="absolute top-2 right-2 w-6 h-6 rounded-full items-center justify-center"
                      style={{ backgroundColor: callType.color }}
                    >
                      <CheckCircle2
                        size={14}
                        color={colors.primaryForeground}
                      />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-5 pb-4">
          <Text
            className="text-base font-semibold mb-3"
            style={{ color: colors.foreground }}
          >
            {language === "tr" ? "Not (İsteğe Bağlı)" : "Note (Optional)"}
          </Text>
          <View
            className="rounded-2xl border px-4 py-3"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <TextInput
              className="text-base min-h-[48px]"
              style={{ color: colors.foreground }}
              placeholder={
                language === "tr"
                  ? "Personelimize iletmek istediğiniz bir mesaj varsa yazın..."
                  : "Write a message for our staff if needed..."
              }
              placeholderTextColor={colors.placeholder}
              value={note}
              onChangeText={setNote}
              editable={!isBusy}
              multiline
              maxLength={200}
              textAlignVertical="top"
            />
          </View>
        </View>

        <View className="px-5 pb-6">
          <Pressable
            onPress={handleSubmit}
            disabled={!selectedType || isBusy}
            className={`w-full h-14 rounded-2xl items-center justify-center flex-row gap-2 ${isBusy ? "opacity-70" : ""}`}
            style={{
              backgroundColor:
                selectedType && !isBusy ? colors.primary : colors.muted,
            }}
          >
            {isBusy ? (
              <ActivityIndicator
                size="small"
                color={colors.primaryForeground}
              />
            ) : (
              <>
                <Send
                  size={20}
                  color={selectedType ? colors.primaryForeground : colors.icon}
                />
                <Text
                  className="text-lg font-bold"
                  style={{
                    color: selectedType
                      ? colors.primaryForeground
                      : colors.mutedForeground,
                  }}
                >
                  {language === "tr" ? "Çağrı Gönder" : "Send Call"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
