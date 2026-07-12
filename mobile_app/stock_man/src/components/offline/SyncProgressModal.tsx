// ============================================================
// Stock Man — SyncProgressModal
//
// Surfaces the state of the offline mutation queue to the
// user. Reads `useOfflineQueue()` (owned by the data-layer
// agent) and renders:
//
//   - "X işlem kuyrukta" header with the pending count
//   - A "Şimdi Senkronla" button that fires the imperative
//     `sync()` and shows a spinner while `syncing === true`
//   - A "Son senkronizasyon …" footer with the lastSyncAt
//     timestamp (formatted via `useFormatters`).
//
// The modal auto-closes itself when the queue drains to zero
// (and the user hasn't explicitly kept it open). This keeps
// the dashboard tidy — the modal only shows when there's
// actual work pending or the last sync is recent.
// ============================================================

import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  CheckCircle2,
  CloudOff,
  RefreshCw,
  X,
} from "lucide-react-native";
import { useI18n } from "@/i18n";
import { useFormatters } from "@/hooks/useFormatters";
import { useOfflineQueue } from "@/data/p5";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/utils/cn";

export interface SyncProgressModalProps {
  /** Controls visibility. The modal also auto-closes when the
   *  queue drains — the prop just sets the *initial* state. */
  visible: boolean;
  onClose?: () => void;
  /** When true, the modal can't be dismissed by tapping the
   *  backdrop or the close button. Used during the initial
   *  "first sync" onboarding flow. */
  blocking?: boolean;
}

export function SyncProgressModal({
  visible,
  onClose,
  blocking = false,
}: SyncProgressModalProps) {
  const { t } = useI18n();
  const { dateTime } = useFormatters();
  const { pendingCount, syncing, lastSyncAt, sync, refreshCount } =
    useOfflineQueue();

  // Auto-close when the queue drains — but only if we weren't
  // opened in `blocking` mode.
  const autoCloseRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    if (blocking) return;
    if (pendingCount > 0) {
      autoCloseRef.current = false;
      return;
    }
    if (!autoCloseRef.current) {
      // We just hit zero — wait one frame so the success
      // message can render for the user, then close.
      autoCloseRef.current = true;
      const t = setTimeout(() => {
        onClose?.();
      }, 900);
      return () => clearTimeout(t);
    }
    return;
  }, [visible, blocking, pendingCount, onClose]);

  const hasPending = pendingCount > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!blocking) onClose?.();
      }}
    >
      <Pressable
        onPress={() => {
          if (!blocking) onClose?.();
        }}
        accessibilityLabel="sync-modal-dismiss"
        className="flex-1 items-center justify-center bg-black/60 px-6"
      >
        <View
          accessibilityLabel="sync-modal-content"
          className="w-full max-w-md rounded-2xl bg-card border border-border p-6"
        >
          <View className="flex-row items-start mb-4">
            <View
              className={cn(
                "h-10 w-10 items-center justify-center rounded-full mr-3",
                hasPending ? "bg-warning/15" : "bg-success/15"
              )}
            >
              {hasPending ? (
                <CloudOff size={22} color="#F59E0B" />
              ) : (
                <CheckCircle2 size={22} color="#059669" />
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-lg font-bold text-foreground">
                {hasPending
                  ? t("settings.sync")
                  : t("settings.lastSync")}
              </Text>
              <View className="flex-row items-center mt-1">
                {hasPending ? (
                  <Badge
                    variant="warning"
                    size="sm"
                    label={`${pendingCount} ${t("common.quantity")}`}
                  />
                ) : (
                  <Badge
                    variant="success"
                    size="sm"
                    icon={CheckCircle2}
                    label={t("common.ok")}
                  />
                )}
              </View>
            </View>
            {!blocking ? (
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="sync-modal-close"
                hitSlop={8}
                className="w-8 h-8 -mr-2 items-center justify-center rounded-full active:opacity-70"
              >
                <X size={18} color="#64748B" />
              </Pressable>
            ) : null}
          </View>

          {syncing ? (
            <View className="flex-row items-center py-3">
              <ActivityIndicator size="small" color="#1E40AF" />
              <Text className="ml-2 text-sm text-muted-foreground">
                {t("settings.syncing")}
              </Text>
            </View>
          ) : null}

          {hasPending ? (
            <View className="mb-2">
              <Text className="text-sm text-muted-foreground leading-5">
                {t("settings.pendingQueueDesc")}
              </Text>
            </View>
          ) : (
            <View className="mb-2">
              <Text className="text-sm text-muted-foreground leading-5">
                {t("settings.queueEmptyDesc")}
              </Text>
            </View>
          )}

          <Card variant="flat" className="mt-3 bg-muted/40">
            <View className="flex-row items-center justify-between">
              <Text className="text-caption text-muted-foreground">
                {t("settings.lastSync")}
              </Text>
              <Text className="text-caption text-foreground font-semibold">
                {lastSyncAt ? dateTime(new Date(lastSyncAt)) : "—"}
              </Text>
            </View>
          </Card>

          <View className="mt-5 flex-row gap-3">
            {hasPending ? (
              <Button
                variant="primary"
                fullWidth
                loading={syncing}
                leftIcon={RefreshCw}
                onPress={() => {
                  void sync();
                }}
              >
                {t("settings.sync")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                fullWidth
                leftIcon={RefreshCw}
                onPress={() => {
                  refreshCount();
                }}
              >
                {t("common.refresh")}
              </Button>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

