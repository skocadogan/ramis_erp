import React, { useMemo, useState } from "react";
import { View, Pressable, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";
import { Bell, Radio } from "lucide-react-native";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "../store/useAuthStore";
import { usePosStore } from "../store/usePosStore";
import { useWaiterPosPushStore } from "../store/useWaiterPosPushStore";
import { effectiveBranchId } from "../utils/branchScope";
import TableCallsModal from "./TableCallsModal";
import ReadyItemsModal from "./ReadyItemsModal";

const HIDDEN_ROUTES = new Set(["terminal-select", "settings", "button-setup"]);

function FabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

/**
 * Garson uygulaması — mutfak hazır ürünleri ve masa çağrıları için ayrı FAB + modal katmanı.
 */
export default function WaiterNotificationOverlay() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { showReadyNotifs, showWaiterCallNotifs, activeBranchId, posTerminalUuid } = usePosStore(
    useShallow((s) => ({
      showReadyNotifs: s.showReadyNotifs,
      showWaiterCallNotifs: s.showWaiterCallNotifs,
      activeBranchId: s.activeBranchId,
      posTerminalUuid: s.posTerminalUuid,
    }))
  );
  const { readyItemsCount, waiterCalls } = useWaiterPosPushStore(
    useShallow((s) => ({
      readyItemsCount: s.readyItemsCount,
      waiterCalls: s.waiterCalls,
    }))
  );

  const [tableCallsOpen, setTableCallsOpen] = useState(false);
  const [readyOpen, setReadyOpen] = useState(false);

  const branchId = effectiveBranchId(user?.branchId, activeBranchId);

  const hiddenRoute = useMemo(
    () => segments.some((seg) => HIDDEN_ROUTES.has(String(seg))),
    [segments]
  );

  const enabled = !!branchId && !!posTerminalUuid && !hiddenRoute;
  const showTableCallsFab = enabled && showWaiterCallNotifs;
  const showReadyFab = enabled && showReadyNotifs;

  if (!showTableCallsFab && !showReadyFab) return null;

  const bottom = Math.max(insets.bottom + 16, 24);
  const tableCallCount = waiterCalls.length;
  const readyCount = readyItemsCount;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.container, { bottom }]}>
        {showTableCallsFab ? (
          <Pressable
            onPress={() => setTableCallsOpen(true)}
            style={[styles.fab, tableCallCount > 0 ? styles.fabAmberActive : styles.fabIdle]}
            className="active:opacity-85"
            accessibilityRole="button"
            accessibilityLabel={
              tableCallCount > 0 ? `${tableCallCount} masa çağrısı var` : "Masa çağrıları"
            }
            accessibilityHint="Masa çağrılarını görüntülemek için dokunun"
          >
            <Radio size={26} color={tableCallCount > 0 ? "#ffffff" : "#94A3B8"} />
            <FabBadge count={tableCallCount} />
          </Pressable>
        ) : null}

        {showReadyFab ? (
          <Pressable
            onPress={() => setReadyOpen(true)}
            style={[
              styles.fab,
              styles.fabSpacing,
              readyCount > 0 ? styles.fabGreenActive : styles.fabIdle,
            ]}
            className="active:opacity-85"
            accessibilityRole="button"
            accessibilityLabel={readyCount > 0 ? `${readyCount} hazır ürün var` : "Hazır ürünler"}
            accessibilityHint="Hazır ürünleri görüntülemek için dokunun"
          >
            <Bell size={26} color={readyCount > 0 ? "#ffffff" : "#94A3B8"} />
            <FabBadge count={readyCount} />
          </Pressable>
        ) : null}
      </View>

      <TableCallsModal
        visible={tableCallsOpen}
        onClose={() => setTableCallsOpen(false)}
        branchId={branchId}
      />

      <ReadyItemsModal
        visible={readyOpen}
        onClose={() => setReadyOpen(false)}
        branchId={branchId}
        onRefresh={() => useWaiterPosPushStore.getState().refreshReadyItems()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 20,
    zIndex: 40,
    alignItems: "flex-end",
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  fabSpacing: {
    marginTop: 12,
  },
  fabAmberActive: {
    backgroundColor: "#F59E0B",
  },
  fabGreenActive: {
    backgroundColor: "#1E2A4A",
  },
  fabIdle: {
    backgroundColor: "#1E293B",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
});
