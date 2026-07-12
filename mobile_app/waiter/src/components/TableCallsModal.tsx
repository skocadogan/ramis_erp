import React from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Eye, Radio } from "lucide-react-native";
import { useI18n } from "../i18n";
import { useWaiterPosPushStore, type WaiterCallNotification } from "../store/useWaiterPosPushStore";
import { dismissWaiterCalls } from "../api/waiterApi";

function CallRow({
  call,
  onSeen,
  onOpenTable,
}: {
  call: WaiterCallNotification;
  onSeen: (id: string) => void;
  onOpenTable: (tableId?: string) => void;
}) {
  const { t } = useI18n();

  return (
    <View
      className="mb-3 flex-row items-center justify-between rounded-[24px] border border-amber-200 bg-amber-50 p-4"
      style={{ borderCurve: "continuous" }}
    >
      <Pressable
        onPress={() => onOpenTable(call.tableId)}
        className="mr-3 min-w-0 flex-1 active:opacity-80"
      >
        {call.source === "reservation_due" ? (
          <Text className="text-xs font-bold uppercase text-blue-600">
            {t("tables.reservationDue")}
          </Text>
        ) : null}
        {call.source === "reservation_arrived" ? (
          <Text className="text-xs font-bold uppercase text-emerald-600">
            {t("tables.reservationArrived")}
          </Text>
        ) : null}
        <Text className="text-base font-bold text-foreground" numberOfLines={2}>
          {call.message || call.tableName}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          {new Date(call.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onSeen(call.id)}
        className="flex-row items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 active:opacity-80"
      >
        <Eye size={16} color="#B45309" />
        <Text className="text-xs font-bold text-amber-800">{t("tables.markSeen")}</Text>
      </Pressable>
    </View>
  );
}

export default function TableCallsModal({
  visible,
  onClose,
  branchId,
}: {
  visible: boolean;
  onClose: () => void;
  branchId?: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? 0;
  const waiterCalls = useWaiterPosPushStore((s) => s.waiterCalls);
  const dismissWaiterCall = useWaiterPosPushStore((s) => s.dismissWaiterCall);
  const clearWaiterCalls = useWaiterPosPushStore((s) => s.clearWaiterCalls);

  const markSeen = (id: string) => {
    dismissWaiterCall(id);
    if (branchId) {
      void dismissWaiterCalls({ branchId, callId: id }).catch((e) =>
        console.error("Waiter call dismiss sync failed", e)
      );
    }
  };

  const markAllSeen = () => {
    clearWaiterCalls();
    if (branchId) {
      void dismissWaiterCalls({ branchId, dismissAll: true }).catch((e) =>
        console.error("Waiter call dismiss-all sync failed", e)
      );
    }
  };

  const openTable = (tableId?: string) => {
    if (!tableId) return;
    onClose();
    router.push(`/(main)/table/${tableId}`);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="h-[85%] overflow-hidden rounded-t-[40px] bg-card border-t border-border shadow-2xl"
          style={{ borderCurve: "continuous", paddingBottom: Math.max(bottomInset + 16, 24) }}
        >
          <View className="bg-amber-500 px-6 pb-4 pt-5">
            <View className="mb-4 flex-row items-center justify-between">
              <Pressable onPress={onClose} className="active:opacity-85">
                <Text className="text-base font-bold text-white/90">
                  {t("tables.tableCallsClose")}
                </Text>
              </Pressable>
              {waiterCalls.length > 0 ? (
                <Pressable
                  onPress={markAllSeen}
                  className="rounded-lg bg-white/20 px-3 py-1.5 active:opacity-80"
                >
                  <Text className="text-xs font-bold text-white">{t("tables.markAllSeen")}</Text>
                </Pressable>
              ) : (
                <View className="w-20" />
              )}
            </View>
            <View className="flex-row items-center gap-2">
              <Radio size={22} color="#ffffff" />
              <Text className="text-2xl font-bold text-white">{t("tables.tableCallsTitle")}</Text>
            </View>
          </View>

          {waiterCalls.length === 0 ? (
            <View className="flex-1 items-center justify-center px-6 py-20">
              <Radio size={48} color="#FCD34D" />
              <Text className="mt-4 text-center font-medium text-muted-foreground">
                {t("tables.noTableCalls")}
              </Text>
            </View>
          ) : (
            <ScrollView
              className="flex-1 px-5 pt-5"
              showsVerticalScrollIndicator={false}
              contentInsetAdjustmentBehavior="automatic"
            >
              {waiterCalls.map((call) => (
                <CallRow
                  key={`${call.id}-${call.reminderPulse ?? 0}`}
                  call={call}
                  onSeen={markSeen}
                  onOpenTable={openTable}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
