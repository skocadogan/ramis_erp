// ============================================================
// Stock Man — Goods Receiving Status Badge
//
// Maps a GoodsReceiving status enum value to a Badge variant
// + the localised label from `receiving.statusLabels.*`.
//
// PENDING             → info       (blue)
// INSPECTED           → warning    (amber)
// ACCEPTED            → success    (green)
// PARTIALLY_ACCEPTED  → warning    (amber)
// REJECTED            → destructive (red)
// ============================================================

import React, { useMemo } from "react";
import { Badge, type BadgeVariant, type BadgeSize } from "@/components/ui/Badge";
import { useI18n } from "@/i18n";
import type { GoodsReceiving } from "@/types";

export interface GRStatusBadgeProps {
  status: GoodsReceiving["status"];
  size?: BadgeSize;
  className?: string;
}

type GRStatusKey =
  | "PENDING"
  | "INSPECTED"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "REJECTED";

const STATUS_LABEL_KEY: Record<GRStatusKey, string> = {
  PENDING: "pending",
  INSPECTED: "inspected",
  ACCEPTED: "accepted",
  PARTIALLY_ACCEPTED: "partiallyAccepted",
  REJECTED: "rejected",
};

const STATUS_VARIANT: Record<GRStatusKey, BadgeVariant> = {
  PENDING: "info",
  INSPECTED: "warning",
  ACCEPTED: "success",
  PARTIALLY_ACCEPTED: "warning",
  REJECTED: "destructive",
};

export function GRStatusBadge({ status, size = "sm", className }: GRStatusBadgeProps) {
  const { t } = useI18n();
  const variant = STATUS_VARIANT[status] ?? "default";
  const labelKey = useMemo(
    () => `receiving.statusLabels.${STATUS_LABEL_KEY[status] ?? status.toLowerCase()}`,
    [status]
  );
  return (
    <Badge
      variant={variant}
      size={size}
      dot
      label={t(labelKey)}
      className={className}
    />
  );
}

