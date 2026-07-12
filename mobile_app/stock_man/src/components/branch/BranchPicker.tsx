// ============================================================
// Stock Man — Branch Picker (modal)
//
// Bottom-sheet style modal that lists every branch the active
// user has access to. Tapping a row sets that branch as active
// (via `useBranchStore.setActiveBranch`) and immediately fetches
// the warehouses that belong to the new branch so downstream
// hooks (useWarehouses, useStockItems, …) can pick them up.
//
// The sheet auto-closes on selection; the parent decides what
// happens next (typically just rendering the new data).
// ============================================================

import React, { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building2, Check, ChevronRight, RefreshCw, X } from "lucide-react-native";
import { Button } from "@/components/ui/Button";
import { useBranchStore } from "@/store/useBranchStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { Branch } from "@/types";

export interface BranchPickerProps {
  visible: boolean;
  onClose: () => void;
}

interface BranchRowProps {
  branch: Branch;
  selected: boolean;
  onPress: () => void;
}

function BranchRow({ branch, selected, onPress }: BranchRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={branch.name}
      accessibilityState={{ selected }}
      className={cn(
        "flex-row items-center px-4 py-3.5 border-b border-border active:opacity-80",
        selected && "bg-primary/10"
      )}
    >
      <View
        className={cn(
          "h-10 w-10 items-center justify-center rounded-full mr-3",
          selected ? "bg-primary" : "bg-muted"
        )}
      >
        <Building2
          size={20}
          color={selected ? "#FFFFFF" : "#64748B"}
        />
      </View>
      <View className="flex-1">
        <Text
          className={cn(
            "text-body font-semibold",
            selected ? "text-primary" : "text-foreground"
          )}
          numberOfLines={1}
        >
          {branch.name}
        </Text>
        {branch.code ? (
          <Text
            className="text-caption text-muted-foreground"
            numberOfLines={1}
          >
            {branch.code}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Check size={20} color="#1E40AF" />
      ) : (
        <ChevronRight size={18} color="#94A3B8" />
      )}
    </Pressable>
  );
}

export function BranchPicker({ visible, onClose }: BranchPickerProps) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);

  const availableBranches = useBranchStore((s) => s.availableBranches);
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const isLoadingBranches = useBranchStore((s) => s.isLoadingBranches);
  const branchesError = useBranchStore((s) => s.branchesError);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const setActiveBranch = useBranchStore((s) => s.setActiveBranch);
  const fetchWarehouses = useBranchStore((s) => s.fetchWarehouses);

  useEffect(() => {
    if (visible && availableBranches.length === 0 && !isLoadingBranches) {
      void fetchBranches();
    }
  }, [visible, availableBranches.length, isLoadingBranches, fetchBranches]);

  const effectiveList = useMemo<Branch[]>(() => {
    if (availableBranches.length > 0) return availableBranches;
    const fromUser = user?.available_branches;
    if (fromUser && fromUser.length > 0) {
      return fromUser.map((b) => ({
        id: b.id,
        name: b.name,
        code: "",
      }));
    }
    return [];
  }, [availableBranches, user]);

  const onSelect = useCallback(
    async (branch: Branch) => {
      try {
        await setActiveBranch(branch.id);
        const current = useBranchStore.getState().availableBranches;
        if (!current.some((b) => b.id === branch.id)) {
          useBranchStore.setState({
            availableBranches: [...current, branch],
          });
        }
        void fetchWarehouses(branch.id);
      } finally {
        onClose();
      }
    },
    [setActiveBranch, fetchWarehouses, onClose]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          className="absolute inset-0 bg-black/60"
          accessibilityLabel="branch-picker-dismiss"
        />
        <View
          className="bg-card border-t border-border rounded-t-2xl"
          style={{ paddingBottom: Math.max(insets.bottom, 12), maxHeight: "80%" }}
        >
          <View className="flex-row items-center px-4 py-3 border-b border-border">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/10 mr-3">
              <Building2 size={20} color="#1E40AF" />
            </View>
            <View className="flex-1">
              <Text className="text-h3 text-foreground">
                {t("branches.title")}
              </Text>
              <Text className="text-caption text-muted-foreground mt-0.5">
                {t("branches.selectHelper")}
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

          {isLoadingBranches && effectiveList.length === 0 && !branchesError ? (
            <View className="py-10 items-center">
              <ActivityIndicator size="large" color="#1E40AF" />
              <Text className="mt-3 text-caption text-muted-foreground">
                {t("common.loading")}
              </Text>
            </View>
          ) : branchesError && effectiveList.length === 0 ? (
            <View className="py-12 px-6 items-center">
              <Text className="text-body text-foreground text-center mb-4">
                {t("branches.fetchError")}
              </Text>
              <Button
                variant="outline"
                onPress={() => void fetchBranches()}
                leftIcon={RefreshCw}
              >
                {t("common.retry")}
              </Button>
            </View>
          ) : effectiveList.length === 0 ? (
            <View className="py-12 px-6 items-center">
              <Text className="text-body text-foreground text-center">
                {t("branches.noBranch")}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 360 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              {effectiveList.map((item) => (
                <BranchRow
                  key={item.id}
                  branch={item}
                  selected={activeBranchId === item.id}
                  onPress={() => void onSelect(item)}
                />
              ))}
            </ScrollView>
          )}

          <View className="px-4 py-3 border-t border-border">
            <Text className="text-caption text-muted-foreground text-center">
              {t("branches.scopeInfo")}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

