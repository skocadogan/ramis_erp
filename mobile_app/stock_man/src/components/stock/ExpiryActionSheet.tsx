// ============================================================
// Stock Man — Expiry Action Sheet
//
// Bottom-sheet modal that lets the user record a remediation
// action against an expiring lot. Three action types are
// supported (priority_consume / transfer_suggest / plan_note);
// the list is loaded from `useExpiryActionTypes` and the
// mutation runs via `useRecordExpiryAction`.
//
// UX notes:
//   - The action type is a radio list (single-select).
//   - Notes are optional but always visible — encouraging the
//     user to leave a short rationale speeds up downstream
//     audit reports.
//   - The submit button is disabled until a type is picked
//     AND the mutation isn't already in flight.
//   - On success we close the sheet and fire a success toast.
// ============================================================

import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n";
import { useToast } from "@/components/ui/Toast";
import {
  useExpiryActionTypes,
  useRecordExpiryAction,
} from "@/hooks/useExpiry";
import { cn } from "@/utils/cn";
import { extractApiError } from "@/utils/apiError";
import type { ExpiryActionType, ExpiryWarning } from "@/types";

export interface ExpiryActionSheetProps {
  warning: ExpiryWarning;
  onClose: () => void;
}

const DEFAULT_TYPES: { value: ExpiryActionType; label: string }[] = [
  { value: "PRIORITY_CONSUME", label: "expiry.actions.priorityConsume" },
  { value: "TRANSFER_SUGGEST", label: "expiry.actions.transferSuggest" },
  { value: "PLAN_NOTE", label: "expiry.actions.planNote" },
];

const typeI18n: Record<ExpiryActionType, string> = {
  PRIORITY_CONSUME: "expiry.actions.priorityConsume",
  TRANSFER_SUGGEST: "expiry.actions.transferSuggest",
  PLAN_NOTE: "expiry.actions.planNote",
};

export function ExpiryActionSheet({
  warning,
  onClose,
}: ExpiryActionSheetProps) {
  const { t } = useI18n();
  const toast = useToast();

  // Form state — the parent unmounts this component on every
  // new warning (the modal is rendered conditionally), so we
  // don't need a manual reset effect.
  const [selected, setSelected] = useState<ExpiryActionType | null>(null);
  const [notes, setNotes] = useState("");

  const actionTypesQuery = useExpiryActionTypes();
  const recordAction = useRecordExpiryAction();

  const types = useMemo(() => {
    const list = actionTypesQuery.data;
    if (list && list.length > 0) return list;
    return DEFAULT_TYPES;
  }, [actionTypesQuery.data]);

  const submit = () => {
    if (!selected) return;
    // Backend ExpiringLotSerializer returns the lot UUID in `id`, not `lot_id`.
    recordAction.mutate(
      {
        lot_id: warning.id,
        action_type: selected,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("common.success"));
          onClose();
        },
        onError: (err: unknown) => {
          toast.error(extractApiError(err, t("errors.serverError")));
        },
      }
    );
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 justify-end bg-black/60"
        accessibilityLabel="expiry-action-dismiss"
      >
        <Pressable
          onPress={() => {}}
          className="bg-card border-t border-border rounded-t-2xl"
        >
          {/* Header */}
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="flex-1 min-w-0">
              <Text className="text-h3 text-foreground" numberOfLines={1}>
                {warning.stock_item_name}
              </Text>
              <Text className="text-caption text-muted-foreground mt-0.5" numberOfLines={1}>
                {warning.lot_number} · {warning.warehouse_name}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
              hitSlop={8}
            >
              <X size={20} color="#64748B" />
            </Pressable>
          </View>

          {/* Body */}
          <View className="px-4 py-3">
            <Text className="text-caption text-muted-foreground mb-2">
              {t("common.actions")}
            </Text>

            <View className="mb-3">
              {types.map((opt) => {
                const isSelected = selected === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setSelected(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    className={cn(
                      "flex-row items-center px-3 py-3 rounded-xl border mb-2 active:opacity-80",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    )}
                  >
                    <View
                      className={cn(
                        "h-5 w-5 items-center justify-center rounded-full mr-3",
                        isSelected ? "bg-primary" : "border border-input"
                      )}
                    >
                      {isSelected ? (
                        <Check size={14} color="#FFFFFF" />
                      ) : null}
                    </View>
                    <Text className="flex-1 text-body text-foreground">
                      {t(typeI18n[opt.value])}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-caption text-muted-foreground mb-1">
              {t("common.notes")} · {t("common.optional")}
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder={t("common.notes")}
              placeholderTextColor="#94A3B8"
              className="min-h-[88px] rounded-xl border border-input bg-background px-3 py-2 text-body text-foreground"
              textAlignVertical="top"
            />
          </View>

          {/* Footer */}
          <View className="flex-row gap-3 px-4 pt-2 pb-4 border-t border-border">
            <View className="flex-1">
              <Button
                variant="outline"
                fullWidth
                onPress={onClose}
                disabled={recordAction.isPending}
              >
                {t("common.cancel")}
              </Button>
            </View>
            <View className="flex-1">
              <Button
                variant="primary"
                fullWidth
                loading={recordAction.isPending}
                disabled={!selected}
                onPress={submit}
                leftIcon={recordAction.isPending ? undefined : Check}
                accessibilityLabel={t("expiry.recordAction")}
              >
                {recordAction.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  t("expiry.recordAction")
                )}
              </Button>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

