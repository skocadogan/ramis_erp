// ============================================================
// Stock Man — Amount
//
// Currency-aware, locale-aware, RBAC-aware number display.
// Para birimi sembolü aktif dilin çeviri dosyasından gelir.
// ============================================================

import React from "react";
import { Text, View } from "react-native";
import { cn } from "@/utils/cn";
import { useCanViewAmounts } from "@/hooks/usePermission";
import { formatCurrency, getCurrencySymbol } from "@/lib/format/currency";
import { useI18n, type Language } from "@/i18n";

export interface AmountProps {
  value: number;
  /** İsteğe bağlı dil geçersiz kılma; varsayılan aktif uygulama dili. */
  locale?: Language;
  className?: string;
  /** Min fraction digits. Default 2. */
  minimumFractionDigits?: number;
  /** Max fraction digits. Default 2. */
  maximumFractionDigits?: number;
  /** Render as a prefixed badge / chip. Default false. */
  inline?: boolean;
}

export function Amount({
  value,
  locale,
  className,
  inline = false,
}: AmountProps) {
  const canView = useCanViewAmounts();
  const { language, t } = useI18n();
  const effectiveLanguage = locale ?? language;
  const symbol = t("currency.symbol");

  if (!canView) {
    if (inline) {
      return (
        <Text className={cn("text-mono text-muted-foreground", className)}>
          ••• {symbol}
        </Text>
      );
    }
    return (
      <View
        className={cn("flex-row items-baseline", className)}
        accessibilityLabel="Amount hidden — insufficient permission"
      >
        <Text className="text-mono text-h3 text-muted-foreground">•••</Text>
        <Text className="ml-1 text-caption text-muted-foreground">{symbol}</Text>
      </View>
    );
  }

  const formatted = formatCurrency(value, effectiveLanguage);

  if (inline) {
    return (
      <Text className={cn("text-mono text-foreground", className)}>
        {formatted}
      </Text>
    );
  }

  return (
    <Text
      className={cn("text-mono text-h3 text-foreground", className)}
      accessibilityLabel={`${value} ${getCurrencySymbol(effectiveLanguage)}`}
    >
      {formatted}
    </Text>
  );
}

