// ============================================================
// Stock Man — Dialog + DialogHost
//
// Standalone <Dialog> is a presentational component for the
// rare cases where a screen needs full control over visibility
// (e.g. embedded confirm-on-action flows).
//
// <DialogHost> is the application-level render-once modal that
// reads from useDialogStore. It should be mounted exactly once
// near the root of the tree (app/_layout.tsx).
//
// Variants:  info | success | error | warning | confirm
//            (drives the icon + accent colour shown in the
//            header band)
// ============================================================

import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react-native";
import { cn } from "@/utils/cn";
import { Button } from "./Button";
import { tSync } from "@/i18n";
import { useUIStore } from "@/store/useUIStore";
import { useDialogStore, type DialogAction, type DialogIconVariant } from "@/store/useDialogStore";

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconVariant?: DialogIconVariant;
  actions?: DialogAction[];
  /** Backdrop tap / Android back closes the dialog. Default true. */
  dismissible?: boolean;
}

const iconForVariant: Record<DialogIconVariant, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  confirm: ShieldAlert,
};

const accentForVariant: Record<DialogIconVariant, string> = {
  info: "text-info",
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  confirm: "text-primary",
};

const buttonVariantForAction = (
  v: DialogAction["variant"]
): "primary" | "secondary" | "destructive" =>
  v === "destructive" ? "destructive" : v === "secondary" ? "secondary" : "primary";

export function Dialog({
  visible,
  onClose,
  title,
  description,
  icon: IconOverride,
  iconVariant = "info",
  actions,
  dismissible = true,
}: DialogProps) {
  const Icon = IconOverride ?? iconForVariant[iconVariant];
  const actionList =
    actions ??
    [{ label: tSync("common.ok", useUIStore.getState().language), variant: "primary" as const }];
  const useRowLayout = actionList.length === 2;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (dismissible) onClose();
      }}
    >
      <Pressable
        onPress={() => {
          if (dismissible) onClose();
        }}
        className="flex-1 items-center justify-center bg-black/60 px-6"
        accessibilityLabel="dialog-dismiss"
      >
        <Pressable
          // Stop propagation so taps inside the dialog don't dismiss it.
          onPress={() => {}}
          className="w-full max-w-md rounded-2xl bg-card border border-border p-6"
          accessibilityLabel="dialog-content"
        >
          <View className="flex-row items-start">
            <View
              className={cn(
                "h-10 w-10 items-center justify-center rounded-full bg-muted mr-3",
                accentForVariant[iconVariant]
              )}
            >
              <Icon size={22} color="currentColor" />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-bold text-foreground">
                {title}
              </Text>
              {description ? (
                <Text className="mt-2 text-sm text-muted-foreground leading-5">
                  {description}
                </Text>
              ) : null}
            </View>
          </View>

          <View
            className={cn(
              "mt-6",
              useRowLayout ? "flex-row gap-3" : "gap-3"
            )}
          >
            {actionList.map((action, idx) => (
              <Button
                key={`${action.label}-${idx}`}
                variant={buttonVariantForAction(action.variant)}
                onPress={() => {
                  action.onPress?.();
                  onClose();
                }}
                fullWidth={!useRowLayout}
                className={useRowLayout ? "flex-1 min-w-0" : undefined}
                size="md"
              >
                {action.label}
              </Button>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Mount once near the app root. Renders the currently active
 * dialog from useDialogStore. Dismiss is handled internally.
 */
export function DialogHost() {
  const { visible, title, description, iconVariant, actions, hide } =
    useDialogStore();

  return (
    <Dialog
      visible={visible}
      onClose={hide}
      title={title}
      description={description}
      iconVariant={iconVariant}
      actions={actions}
    />
  );
}

