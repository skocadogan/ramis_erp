import React, { useSyncExternalStore } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { useI18n } from "../../i18n";
import { getSyncSessionState, subscribeSyncSession } from "./syncSession";

function useSyncSession() {
  return useSyncExternalStore(subscribeSyncSession, getSyncSessionState, () =>
    getSyncSessionState()
  );
}

export function SyncProgressModal() {
  const { t } = useI18n();
  const session = useSyncSession();

  if (!session.active) return null;

  const percent = session.total > 0 ? Math.round((session.completed / session.total) * 100) : 0;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View
          className="w-full max-w-md rounded-3xl bg-white p-6"
          style={{ borderCurve: "continuous" }}
        >
          <View className="mb-4 items-center">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
          <Text className="text-center text-lg font-black text-foreground">
            {t("offline.syncProgressTitle")}
          </Text>
          <Text className="mt-2 text-center text-sm text-muted-foreground">
            {t("offline.syncProgressDesc")}
          </Text>

          <View className="mt-6 h-2 overflow-hidden rounded-full bg-muted">
            <View className="h-full rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
          </View>
          <View className="mt-3 flex-row items-center justify-between">
            <Text className="flex-1 pr-2 text-xs text-muted-foreground" numberOfLines={1}>
              {session.currentLabel || t("offline.syncProgressProcessing")}
            </Text>
            <Text className="text-xs font-bold tabular-nums text-foreground">
              {session.completed}/{session.total}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
