// ============================================================
// Stock Man — Input
//
// Labelled text input with:
//   - optional left/right Lucide icons (right icon can be pressable
//     for "show password" / "scan" / "clear" buttons)
//   - error state (red border + helper text)
//   - hint text
//   - 48px min height for tablet touch ergonomics
//   - multiline support
// Uses TextInput's native behaviour for keyboardType,
// autoCapitalize, secureTextEntry etc.
// ============================================================

import React, { forwardRef, useId } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { cn } from "@/utils/cn";

export interface InputProps
  extends Omit<TextInputProps, "style" | "placeholderTextColor"> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  onRightIconPress?: () => void;
  disabled?: boolean;
  /** Show a red asterisk next to the label. */
  required?: boolean;
  className?: string;
  containerClassName?: string;
  style?: TextStyle;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    label,
    error,
    hint,
    leftIcon: LeftIcon,
    rightIcon: RightIcon,
    onRightIconPress,
    disabled,
    required,
    className,
    containerClassName,
    value,
    ...props
  },
  ref
) {
  const hasError = !!error;
  const labelId = useId();
  const inputA11yLabel = label
    ? error
      ? `${label}. ${error}`
      : label
    : props.accessibilityLabel;
  return (
    <View className={cn("w-full", containerClassName)}>
      {label ? (
        <View className="flex-row items-center mb-1.5">
          <Text
            nativeID={labelId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </Text>
          {required ? (
            <Text className="ml-0.5 text-sm text-destructive">*</Text>
          ) : null}
        </View>
      ) : null}

      <View
        className={cn(
          "flex-row items-center min-h-[48px] rounded-xl border bg-background px-3",
          hasError
            ? "border-destructive"
            : "border-input focus:border-primary",
          disabled && "opacity-50"
        )}
      >
        {LeftIcon ? (
          <View className="mr-2">
            <LeftIcon size={20} color="#64748B" />
          </View>
        ) : null}

        <TextInput
          ref={ref}
          editable={!disabled}
          placeholderTextColor="#94A3B8"
          accessibilityLabel={inputA11yLabel}
          accessibilityLabelledBy={label ? labelId : undefined}
          className={cn(
            "flex-1 text-body text-foreground py-2",
            className
          )}
          value={value}
          {...props}
        />

        {RightIcon ? (
          <Pressable
            onPress={onRightIconPress}
            disabled={!onRightIconPress}
            accessibilityRole={onRightIconPress ? "button" : undefined}
            className={cn(
              "ml-2 p-1 rounded-md",
              onRightIconPress && "active:bg-muted"
            )}
            hitSlop={8}
          >
            <RightIcon size={20} color="#64748B" />
          </Pressable>
        ) : null}
      </View>

      {hasError ? (
        <Text className="mt-1 text-xs text-destructive">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
});

