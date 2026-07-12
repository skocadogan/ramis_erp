import React, { memo } from "react";
import { View, Text, Pressable } from "react-native";
import { Users, ShoppingCart } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import type { Table } from "../types/models";
import { ElapsedBadge } from "./ElapsedBadge";
import type { UseI18n } from "../i18n";

export interface TableCardProps {
  table: Table;
  t: UseI18n["t"];
  hasCart: boolean;
  cartItemCount: number;
  isInactive: boolean;
  itemStyle: { flex: number; margin: number; maxWidth: number };
  onPress: (table: Table) => void;
}

export const TableCard = memo(function TableCard({
  table,
  t,
  hasCart,
  cartItemCount,
  isInactive,
  itemStyle,
  onPress,
}: TableCardProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const statusLabel = getStatusLabel(table, t);
  const cardStyle = getTableCardStyle(table, isDark);

  return (
    <View style={itemStyle}>
      <Pressable
        onPress={() => onPress(table)}
        disabled={isInactive}
        className={isInactive ? "opacity-50" : "active:opacity-80"}
        style={[
          {
            borderRadius: 16,
            borderWidth: 1.5,
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 2,
            shadowOffset: { width: 0, height: 2 },
          },
          cardStyle,
        ]}
      >
        {hasCart ? (
          <View
            className="absolute top-2 right-2 z-10 bg-amber-500 rounded-full w-7 h-7 items-center justify-center"
            style={{ elevation: 4 }}
          >
            <ShoppingCart size={14} color="#ffffff" strokeWidth={2.5} />
            <View
              className="absolute -top-1 -right-1 bg-destructive rounded-full w-4 h-4 items-center justify-center"
              style={{ elevation: 3 }}
            >
              <Text className="text-white text-[8px] font-black">
                {cartItemCount > 9 ? "9+" : cartItemCount}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="items-start p-4">
          <Text className="text-foreground text-lg font-bold" numberOfLines={2}>
            {table.virtual_kind === "new_slot" ? `${t("tables.takeaway") || "Paket"}` : table.name}
          </Text>
          <View className="flex-row items-center mt-2 justify-start">
            <View className={`w-2.5 h-2.5 rounded-full mr-2 ${getStatusColor(table)}`} />
            <Text className="text-muted-foreground text-[10px] font-bold">{statusLabel}</Text>
          </View>

          <View className="mt-1.5 justify-start">
            {table.capacity ? (
              <View className="flex-row items-center">
                <Users
                  size={11}
                  color={isDark ? "#A1A1AA" : "#64748B"}
                  style={{ marginRight: 3 }}
                />
                <Text className="text-[10px] text-muted-foreground font-bold">
                  {table.capacity} Kişi
                </Text>
              </View>
            ) : null}
            {table.status === "OCCUPIED" &&
            table.active_order?.created_at &&
            (table.active_order.status === "PENDING" || table.active_order.status === "READY") ? (
              <ElapsedBadge createdAt={table.active_order.created_at} isDark={isDark} />
            ) : null}
          </View>
        </View>

        {table.status === "OCCUPIED" || table.virtual_kind === "new_slot" ? (
          <View className="mt-2 pt-3 border-t border-border/40 flex-row justify-center pb-3">
            <Text className="text-primary font-bold text-xs">{t("tables.details")}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
});

function getStatusColor(table: Table): string {
  if (table.virtual_kind === "new_slot") return "bg-primary/100";
  if (table.status === "OCCUPIED") {
    const activeOrder = table.active_order;
    if (activeOrder?.status === "PENDING") return "bg-blue-500";
    if (activeOrder?.status === "PREPARING") return "bg-orange-500";
    if (activeOrder?.status === "READY") return "bg-amber-500";
    return "bg-destructive";
  }
  switch (table.status) {
    case "RESERVED":
      return "bg-violet-500";
    case "CLEANING":
      return "bg-sky-500";
    case "FREE":
      return "bg-primary/100";
    case "OUT_OF_SERVICE":
      return "bg-slate-400";
    default:
      return "bg-slate-400";
  }
}

function getTableCardStyle(table: Table, isDark: boolean) {
  let color = isDark ? "#475569" : "#94A3B8";
  let bgColor = isDark ? "#121214" : "#F8FAFC";

  if (table.virtual_kind === "new_slot") {
    color = "#10B981";
    bgColor = isDark ? "#064e3b" : "#ECFDF5";
  } else if (table.status === "OCCUPIED") {
    const activeOrder = table.active_order;
    if (activeOrder?.status === "PENDING") {
      color = "#3B82F6";
      bgColor = isDark ? "#172554" : "#EFF6FF";
    } else if (activeOrder?.status === "PREPARING") {
      color = "#F97316";
      bgColor = isDark ? "#431407" : "#FFF7ED";
    } else if (activeOrder?.status === "READY") {
      color = "#F59E0B";
      bgColor = isDark ? "#451a03" : "#FFFBEB";
    } else {
      color = "#F43F5E";
      bgColor = isDark ? "#4c0519" : "#FFF1F2";
    }
  } else {
    switch (table.status) {
      case "RESERVED":
        color = "#8B5CF6";
        bgColor = isDark ? "#2e1065" : "#F5F3FF";
        break;
      case "CLEANING":
        color = "#0EA5E9";
        bgColor = isDark ? "#082f49" : "#F0F9FF";
        break;
      case "OUT_OF_SERVICE":
        color = isDark ? "#6B7280" : "#9CA3AF";
        bgColor = isDark ? "#1F2937" : "#F9FAFB";
        break;
      case "FREE":
        color = "#10B981";
        bgColor = isDark ? "#064e3b" : "#ECFDF5";
        break;
    }
  }

  return { borderColor: color, backgroundColor: bgColor };
}

function getStatusLabel(table: Table, t: UseI18n["t"]): string {
  if (table.virtual_kind === "new_slot") return t("tables.free");
  if (table.status === "OCCUPIED") {
    const activeOrder = table.active_order;
    if (activeOrder?.status === "PENDING") return t("tables.pending");
    if (activeOrder?.status === "PREPARING") return t("tables.preparing");
    if (activeOrder?.status === "READY") return t("tables.ready");
    return t("tables.occupied");
  }
  switch (table.status) {
    case "RESERVED":
      return t("tables.reserved");
    case "CLEANING":
      return t("tables.cleaning");
    case "FREE":
      return t("tables.free");
    case "OUT_OF_SERVICE":
      return t("tables.passive");
    default:
      return t("tables.passive");
  }
}
