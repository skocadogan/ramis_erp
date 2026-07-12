import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// FlashList v2 type uyumluluğu için any cast (estimatedItemSize runtime'da var, tiplerde yok)
import { FlashList as FlashListBase } from "@shopify/flash-list";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FlashList = FlashListBase as any;
import { useRouter } from "expo-router";
import { Search, ChevronLeft, Home } from "lucide-react-native";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { usePosStore } from "../../src/store/usePosStore";
import { useAuthStore } from "../../src/store/useAuthStore";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "../../src/i18n";
import { effectiveBranchId } from "../../src/utils/branchScope";
import { fetchZones, fetchTables, fetchTakeawayVirtualTables } from "../../src/api/waiterApi";
import type { Table, Zone } from "../../src/types/models";
import {
  ReservationDetailDialog,
  type ReservationDetailData,
} from "../../src/components/ReservationDetailDialog";
import { TableCard } from "../../src/components/TableCard";

const ROW_PADDING = 32;
const GAP = 12;

/** Sepette bekleyen ürünü olan masa mı? (henüz mutfağa gönderilmemiş) */
const hasPendingCart = (table: Table, cartTableId: string | null, cartLength: number): boolean => {
  return cartLength > 0 && cartTableId !== null && String(table.id) === String(cartTableId);
};

export default function TablesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const { activeBranchId, tableGridColumns, cartTableId, cartItemCount } = usePosStore(
    useShallow((s) => ({
      activeBranchId: s.activeBranchId,
      tableGridColumns: s.tableGridColumns,
      cartTableId: s.cartTableId,
      cartItemCount: s.cart.length,
    }))
  );
  const queryClient = useQueryClient();
  const branchId = effectiveBranchId(user?.branchId, activeBranchId);

  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [reservationDialog, setReservationDialog] = useState<ReservationDetailData | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Zone ScrollView ref (otomatik kaydırma için) ──
  const zoneScrollRef = useRef<ScrollView>(null);
  const zonePositions = useRef<{ x: number }[]>([]);

  const [zonesQuery, tablesQuery, takeawayVirtualQuery] = useQueries({
    queries: [
      {
        queryKey: ["zones", branchId] as const,
        queryFn: () => fetchZones(branchId!),
        enabled: !!branchId,
      },
      {
        queryKey: ["tables", branchId] as const,
        queryFn: () => fetchTables(branchId!),
        enabled: !!branchId,
      },
      {
        queryKey: ["tables-takeaway-virtual", branchId] as const,
        queryFn: () => fetchTakeawayVirtualTables(branchId!),
        enabled: !!branchId,
      },
    ],
  });

  // Tek kaynak: React Query önbelleği. WS patch'leri useTableSync içinde
  // queryClient.setQueryData ile direkt önbelleğe yazılır; yerel state gerekmez.
  const tables = useMemo<Table[]>(() => {
    const rawTables = tablesQuery.data ?? [];
    const virtTables = takeawayVirtualQuery.data ?? [];
    const zoneMap = new Map((zonesQuery.data ?? []).map((z) => [String(z.id), z]));
    const processedVirtTables = virtTables.map((vt) => {
      const zId = String(vt.zone);
      const zoneObj = zoneMap.get(zId);
      return {
        ...vt,
        zone: zoneObj
          ? { id: zoneObj.id, name: zoneObj.name, is_takeaway: zoneObj.is_takeaway }
          : vt.zone,
      };
    });
    return [...rawTables, ...processedVirtTables];
  }, [tablesQuery.data, takeawayVirtualQuery.data, zonesQuery.data]);

  const zones = useMemo<Zone[]>(() => {
    const rawZones = zonesQuery.data ?? [];
    if (tables.length === 0) return [];
    const activeZoneIds = new Set(
      tables.map((t) => String(t.zone && typeof t.zone === "object" ? t.zone.id : t.zone))
    );
    return rawZones
      .filter((z) => z.is_active !== false)
      .filter((z) => activeZoneIds.has(String(z.id)));
  }, [zonesQuery.data, tables]);

  // Şube değişince zone sıfırla
  useEffect(() => {
    setSelectedZone(null);
  }, [branchId]);

  // Geçerli zone listesinden seçili zone çıktıysa ilkini seç (selectedZone bağımlılıktan çıkarıldı — O-18)
  useEffect(() => {
    if (zones.length === 0) {
      setSelectedZone(null);
      return;
    }
    setSelectedZone((prev) => {
      const exists = zones.some((z) => String(z.id) === String(prev));
      return exists ? prev : String(zones[0].id);
    });
  }, [zones]);

  // ── Seçili zone değişince zone listesini otomatik kaydır ──
  useEffect(() => {
    if (!selectedZone || zones.length === 0) return;
    const idx = zones.findIndex((z) => String(z.id) === String(selectedZone));
    if (idx < 0) return;
    const pos = zonePositions.current[idx];
    if (!pos) return;
    zoneScrollRef.current?.scrollTo({ x: Math.max(0, pos.x - 16), animated: true });
  }, [selectedZone, zones]);

  // ── Swipe ile zone değiştirme (PanResponder) ──
  const SWIPE_THRESHOLD = 60;
  const handleSwipeZone = useCallback(
    (dx: number) => {
      if (!selectedZone || zones.length === 0) return;
      const currentIndex = zones.findIndex((z) => String(z.id) === String(selectedZone));
      if (currentIndex < 0) return;

      let nextIndex: number;
      if (dx < -SWIPE_THRESHOLD) {
        nextIndex = Math.min(currentIndex + 1, zones.length - 1);
      } else if (dx > SWIPE_THRESHOLD) {
        nextIndex = Math.max(currentIndex - 1, 0);
      } else {
        return;
      }

      if (nextIndex !== currentIndex) {
        const nextZone = zones[nextIndex];
        if (nextZone) setSelectedZone(String(nextZone.id));
      }
    },
    [selectedZone, zones]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) =>
          Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 10,
        onPanResponderRelease: (_, gs) => {
          if (Math.abs(gs.dx) < Math.abs(gs.dy)) return;
          handleSwipeZone(gs.dx);
        },
      }),
    [handleSwipeZone]
  );

  const onRefresh = useCallback(async () => {
    if (!branchId) return;
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["zones", branchId] }),
        queryClient.refetchQueries({ queryKey: ["tables", branchId] }),
        queryClient.refetchQueries({ queryKey: ["tables-takeaway-virtual", branchId] }),
      ]);
    } catch (err) {
      console.warn("Manual refresh failed:", err);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [branchId, queryClient]);

  const filteredTables = useMemo(() => {
    let result = tables;
    if (selectedZone) {
      result = result.filter((tbl) => {
        const zoneId = tbl.zone && typeof tbl.zone === "object" ? tbl.zone.id : tbl.zone;
        return String(zoneId) === String(selectedZone);
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (tbl) =>
          String(tbl.name ?? "")
            .toLowerCase()
            .includes(q) || String(tbl.id).includes(q)
      );
    }
    return result;
  }, [tables, selectedZone, searchQuery]);

  // listRefreshing has been replaced by isManualRefreshing for premium background refetching

  const initialLoading =
    !!branchId &&
    (zonesQuery.isPending || tablesQuery.isPending || takeawayVirtualQuery.isPending) &&
    tables.length === 0;

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const columnCount = useMemo(() => {
    if (tableGridColumns && tableGridColumns !== "auto") {
      return parseInt(tableGridColumns, 10);
    }
    return isLandscape ? 5 : 3;
  }, [tableGridColumns, isLandscape]);

  const itemWidth = useMemo(() => {
    return (width - ROW_PADDING - (columnCount - 1) * GAP) / columnCount;
  }, [width, columnCount]);

  const tableItemStyle = useMemo(
    () => ({ flex: 1, margin: GAP / 2, maxWidth: itemWidth }),
    [itemWidth]
  );

  const isTableInactive = useCallback((table: Table): boolean => {
    return table.status === "OUT_OF_SERVICE" || table.is_active === false;
  }, []);

  const handleTablePress = useCallback(
    (table: Table) => {
      // Pasif / hizmet dışı masalara sipariş açılamaz
      if (isTableInactive(table)) {
        return;
      }
      // Sepette bekleyen ürünü olan masa → direkt sepet sayfasına git
      if (hasPendingCart(table, cartTableId, cartItemCount)) {
        router.push(`/(main)/table-order/${table.id}`);
        return;
      }
      if (table.status === "RESERVED") {
        setReservationDialog({
          tableId: String(table.id),
          tableName: table.name,
          info: table.reservation_info,
          scheduledAt: table.reservation_scheduled_at,
          partySize: table.reservation_party_size,
        });
      } else if (table.virtual_kind === "new_slot") {
        router.push(`/(main)/table-order/${table.id}`);
      } else {
        router.push(`/(main)/table/${table.id}`);
      }
    },
    [router, cartTableId, cartItemCount, isTableInactive]
  );

  const renderTable = useCallback(
    ({ item }: { item: Table }) => (
      <TableCard
        table={item}
        t={t}
        hasCart={hasPendingCart(item, cartTableId, cartItemCount)}
        cartItemCount={cartItemCount}
        isInactive={isTableInactive(item)}
        itemStyle={tableItemStyle}
        onPress={handleTablePress}
      />
    ),
    [t, cartTableId, cartItemCount, tableItemStyle, handleTablePress, isTableInactive]
  );

  if (!branchId) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-6">
        <Text className="text-muted-foreground text-center">{t("common.noData")}</Text>
      </View>
    );
  }

  if (initialLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#1E2A4A" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="px-4 py-3 flex-row justify-between items-center border-b border-border/40">
        <View className="flex-row items-center">
          <Pressable onPress={() => router.back()} className="active:opacity-80 p-2 mr-1">
            <ChevronLeft size={26} color="#1E2A4A" />
          </Pressable>
          <Pressable onPress={() => router.replace("/(main)")} className="active:opacity-80 p-2">
            <Home size={22} color="#1E2A4A" />
          </Pressable>
        </View>
        <Text className="text-foreground text-xl font-bold">{t("tables.title")}</Text>
        <View className="flex-row items-center gap-2">
          <Pressable className="active:opacity-80 p-2">
            <Text className="text-primary font-semibold text-base">{t("tables.filter")}</Text>
          </Pressable>
        </View>
      </View>

      <View className="px-4 mb-3 mt-3">
        <View className="flex-row items-center bg-secondary border border-border rounded-xl px-4 h-12">
          <Search size={18} className="text-muted-foreground" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("tables.searchPlaceholder")}
            placeholderTextColor="#8A8480"
            className="ml-2 flex-1 text-foreground text-sm"
            returnKeyType="search"
            clearButtonMode="while-editing"
            accessibilityLabel="Masa ara"
          />
        </View>
      </View>

      <View className="mb-3">
        <ScrollView
          ref={zoneScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-row px-4"
          contentInsetAdjustmentBehavior="automatic"
        >
          {zones.map((zone, idx) => (
            <Pressable
              key={zone.id}
              onPress={() => setSelectedZone(String(zone.id))}
              onLayout={(e) => {
                zonePositions.current[idx] = { x: e.nativeEvent.layout.x };
              }}
              className={`active:opacity-80 px-5 py-2 rounded-full mr-2 ${
                selectedZone === zone.id ? "bg-primary" : "bg-secondary border border-border"
              }`}
            >
              <Text
                className={`font-semibold text-sm ${
                  selectedZone === zone.id ? "text-white" : "text-muted-foreground"
                }`}
              >
                {zone.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <FlashList
          data={filteredTables}
          keyExtractor={(t: Table) => String(t.id)}
          numColumns={columnCount}
          estimatedItemSize={125}
          contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16 - GAP / 2 }}
          refreshControl={
            <RefreshControl
              refreshing={isManualRefreshing}
              onRefresh={onRefresh}
              tintColor="#1E2A4A"
            />
          }
          renderItem={renderTable}
          style={{ flex: 1 }}
          contentInsetAdjustmentBehavior="automatic"
        />
      </View>

      <ReservationDetailDialog
        visible={reservationDialog !== null}
        reservation={reservationDialog}
        onClose={() => setReservationDialog(null)}
        onStartOrder={(tableId) => {
          setReservationDialog(null);
          router.push(`/(main)/table/${tableId}`);
        }}
      />
    </SafeAreaView>
  );
}
