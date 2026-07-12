import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Calendar, Users, Info } from "lucide-react-native";
import { useI18n } from "../i18n";

export type ReservationDetailData = {
  tableId: string;
  tableName?: string;
  info?: string | null;
  scheduledAt?: string | null;
  partySize?: number | null;
};

interface ReservationDetailDialogProps {
  visible: boolean;
  reservation: ReservationDetailData | null;
  onClose: () => void;
  onStartOrder: (tableId: string) => void;
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start rounded-xl bg-secondary/50 px-4 py-3 mb-2">
      <View className="mr-3 mt-0.5">{icon}</View>
      <View className="flex-1 min-w-0">
        <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide mb-0.5">
          {label}
        </Text>
        <Text className="text-foreground font-bold text-sm" numberOfLines={3}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export function ReservationDetailDialog({
  visible,
  reservation,
  onClose,
  onStartOrder,
}: ReservationDetailDialogProps) {
  const { t } = useI18n();

  if (!reservation) return null;

  const scheduledTimeStr = reservation.scheduledAt
    ? new Date(reservation.scheduledAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const dateStr = reservation.scheduledAt
    ? new Date(reservation.scheduledAt).toLocaleDateString()
    : "";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center items-center px-6">
        <View
          className="bg-card w-full max-w-[360px] rounded-2xl p-6 shadow-2xl border border-border"
          style={{ borderCurve: "continuous" }}
        >
          <Text className="text-foreground text-xl font-bold text-center mb-1">
            {t("reservation.title")}
          </Text>
          {reservation.tableName ? (
            <Text className="text-muted-foreground text-xs text-center font-medium mb-4">
              {reservation.tableName}
            </Text>
          ) : (
            <View className="mb-4" />
          )}

          {reservation.info ? (
            <DetailRow
              icon={<Info size={18} color="#1E2A4A" />}
              label={t("reservation.title")}
              value={reservation.info}
            />
          ) : null}

          {reservation.scheduledAt ? (
            <DetailRow
              icon={<Calendar size={18} color="#1E2A4A" />}
              label={t("reservation.scheduledAt")}
              value={`${dateStr} ${scheduledTimeStr}`.trim()}
            />
          ) : null}

          {reservation.partySize ? (
            <DetailRow
              icon={<Users size={18} color="#1E2A4A" />}
              label={t("reservation.partySize")}
              value={`${reservation.partySize} ${t("reservation.pax")}`}
            />
          ) : null}

          <Text className="text-muted-foreground text-xs text-center mt-2 mb-5 leading-relaxed">
            {t("reservation.confirmationHint")}
          </Text>

          <Pressable
            onPress={() => onStartOrder(reservation.tableId)}
            className="active:opacity-85 bg-primary h-14 rounded-xl items-center justify-center mb-2.5"
          >
            <Text className="text-white font-bold text-base">{t("reservation.startOrder")}</Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            className="active:opacity-85 bg-secondary h-14 rounded-xl items-center justify-center border border-border"
          >
            <Text className="text-foreground font-bold text-base">{t("reservation.cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
