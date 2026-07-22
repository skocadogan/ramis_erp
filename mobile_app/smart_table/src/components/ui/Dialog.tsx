// ============================================================
// Smart Table — Dialog Component
//
// Replaces native Alert.alert() with a themed Modal dialog
// that respects the app's dark/light mode. Supports alert,
// confirm, and custom action patterns.
// ============================================================

import React from "react";
import { Modal, View, Text, Pressable } from "react-native";
import { useDialogStore } from "@/store/dialog-store";
import { useTheme } from "@/hooks/useTheme";

export function Dialog() {
  const { visible, title, message, actions, hide } = useDialogStore();
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={hide}
    >
      <View className="flex-1 justify-center items-center bg-black/50 px-8">
        <View
          className="w-full max-w-sm rounded-3xl p-6 shadow-2xl border"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          {/* Title */}
          {title ? (
            <Text
              className="text-lg font-extrabold mb-2"
              style={{ color: colors.foreground }}
            >
              {title}
            </Text>
          ) : null}

          {/* Message */}
          {message ? (
            <Text
              className="text-sm leading-5 mb-6"
              style={{ color: colors.mutedForeground }}
            >
              {message}
            </Text>
          ) : null}

          {/* Actions */}
          <View className={actions.length > 2 ? "gap-3" : "flex-row gap-3"}>
            {actions.map((action, index) => {
              const isCancel = action.style === "cancel";
              const isDestructive = action.style === "destructive";

              let bgColor = colors.primary;
              let textColor = colors.primaryForeground;
              if (isCancel) {
                bgColor = colors.muted;
                textColor = colors.mutedForeground;
              } else if (isDestructive) {
                bgColor = colors.destructive;
                textColor = colors.destructiveForeground;
              }

              return (
                <Pressable
                  key={index}
                  onPress={() => {
                    hide();
                    action.onPress?.();
                  }}
                  className={`h-11 rounded-2xl items-center justify-center ${
                    actions.length > 2 ? "w-full" : "flex-1"
                  }`}
                  style={{ backgroundColor: bgColor }}
                >
                  <Text
                    className="text-sm font-bold"
                    style={{ color: textColor }}
                  >
                    {action.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
