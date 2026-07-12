// ============================================================
// Stock Man — NumberStepper
//
// - / + buttons with a centred numeric readout. Used for
// receiving/transfer/counting line quantities.
//
//   value            current value
//   onChange         callback with the new value (clamped)
//   min / max        optional bounds (inclusive)
//   step             increment per press (default 1)
//   disabled         greys out the controls
//   label            optional caption rendered above the stepper
//   allowManualEntry tapping the number opens decimal-pad
//                     TextInput for manual entry (default true)
//
// Both buttons have 48px touch targets.
// ============================================================

import React, { useCallback, useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

export interface NumberStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
  /** Override the +/- button accessibility labels. */
  decrementLabel?: string;
  incrementLabel?: string;
  /** Allow manual text entry with decimal-pad keyboard. Default: true. */
  allowManualEntry?: boolean;
}

const clamp = (n: number, min?: number, max?: number) => {
  if (typeof min === "number" && n < min) return min;
  if (typeof max === "number" && n > max) return max;
  return n;
};

/** Format a number for display: drop trailing zeros after decimal. */
const formatForDisplay = (n: number): string => {
  // If it's effectively an integer, show without decimals
  if (Number.isInteger(n)) return String(n);
  // Show up to 4 decimals, trim trailing zeros
  const fixed = n.toFixed(4);
  return fixed.replace(/\.?0+$/, "");
};

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
  label,
  className,
  decrementLabel,
  incrementLabel,
  allowManualEntry = true,
}: NumberStepperProps) {
  const { t } = useI18n();
  const decLabel = decrementLabel ?? t("common.decrease");
  const incLabel = incrementLabel ?? t("common.increase");
  const [isEditing, setIsEditing] = useState(false);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Derive display string: use local state when editing, derive from
  // prop otherwise. This avoids setState-in-effect.
  const displayText = isEditing ? inputText : formatForDisplay(value);

  const dec = useCallback(() => {
    onChange(clamp(value - step, min, max));
  }, [onChange, value, step, min, max]);

  const inc = useCallback(() => {
    onChange(clamp(value + step, min, max));
  }, [onChange, value, step, min, max]);

  const commitInput = useCallback(() => {
    setIsEditing(false);
    const raw = inputText.trim().replace(",", ".");
    if (raw === "" || raw === "." || raw === "-") {
      // Reset to current value on empty input
      setInputText(formatForDisplay(value));
      return;
    }
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) {
      setInputText(formatForDisplay(value));
      return;
    }
    const clamped = clamp(parsed, min, max);
    setInputText(formatForDisplay(clamped));
    onChange(clamped);
  }, [inputText, value, min, max, onChange]);

  const handlePress = useCallback(() => {
    if (!allowManualEntry || disabled) return;
    setInputText(formatForDisplay(value));
    setIsEditing(true);
    // Focus the TextInput after a tick (React Native needs layout pass)
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [allowManualEntry, disabled, value]);

  const decDisabled =
    disabled || (typeof min === "number" && value <= min);
  const incDisabled =
    disabled || (typeof max === "number" && value >= max);

  return (
    <View className={cn("w-full", className)}>
      {label ? (
        <Text className="mb-1.5 text-sm font-medium text-foreground">
          {label}
        </Text>
      ) : null}
      <View
        className={cn(
          "flex-row items-center justify-between rounded-xl border border-input bg-background px-2",
          disabled && "opacity-50"
        )}
      >
        <Pressable
          onPress={dec}
          disabled={decDisabled || isEditing}
          accessibilityRole="button"
          accessibilityLabel={decLabel}
          className={cn(
            "h-12 w-12 items-center justify-center rounded-lg",
            !decDisabled && !isEditing && "active:bg-muted"
          )}
        >
          <Minus size={20} color="#0F172A" />
        </Pressable>

        {isEditing ? (
          <TextInput
            ref={inputRef}
            value={inputText}
            onChangeText={setInputText}
            onBlur={commitInput}
            onSubmitEditing={commitInput}
            keyboardType="decimal-pad"
            selectTextOnFocus
            editable={!disabled}
            placeholderTextColor="#94A3B8"
            className="flex-1 text-center text-lg font-bold text-foreground py-2"
            accessibilityLabel={`edit-${label ?? "quantity"}`}
          />
        ) : allowManualEntry && !disabled ? (
          <Pressable
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`${label ?? "quantity"}-${value}. ${t("common.edit")}`}
            className="flex-1 items-center justify-center min-h-[44px] active:bg-muted/30 rounded-lg"
          >
            <Text className="text-lg font-bold text-foreground tabular-nums">
              {displayText}
            </Text>
          </Pressable>
        ) : (
          <Text
            className="flex-1 text-center text-lg font-bold text-foreground tabular-nums"
            accessibilityLabel={`value-${value}`}
          >
            {displayText}
          </Text>
        )}

        <Pressable
          onPress={inc}
          disabled={incDisabled || isEditing}
          accessibilityRole="button"
          accessibilityLabel={incLabel}
          className={cn(
            "h-12 w-12 items-center justify-center rounded-lg",
            !incDisabled && !isEditing && "active:bg-muted"
          )}
        >
          <Plus size={20} color="#0F172A" />
        </Pressable>
      </View>
    </View>
  );
}

