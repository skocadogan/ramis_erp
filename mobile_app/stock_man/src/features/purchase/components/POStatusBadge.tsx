// ============================================================
// Stock Man — PO Status Badge
//
// Maps a POStatus enum value to a Badge variant + the
// localised label from `purchase.statusLabels.*`. DRAFT is
// the "neutral" default; the rest follow the conventional
// status → colour ladder (pending=info, ordered=primary,
// partial=warning, done=success, cancelled=destructive).
// ============================================================

import React, { useMemo } from "react";
import { Badge, type BadgeVariant, type BadgeSize } from "@/components/ui/Badge";
import { useI18n } from "@/i18n";
import type { POStatus } from "@/types";

export interface POStatusBadgeProps {
  status: POStatus;
  size?: BadgeSize;
  className?: string;
}

const STATUS_LABEL_KEY: Record<POStatus, string> = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  ORDERED: "ordered",
  PARTIALLY_RECEIVED: "partiallyReceived",
  RECEIVED: "received",
  CANCELLED: "cancelled",
};

const STATUS_VARIANT: Record<POStatus, BadgeVariant> = {
  DRAFT: "default",
  PENDING: "info",
  APPROVED: "success",
  ORDERED: "info",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CANCELLED: "destructive",
};

export function POStatusBadge({ status, size = "sm", className }: POStatusBadgeProps) {
  const { t } = useI18n();
  const variant = STATUS_VARIANT[status];
  const labelKey = useMemo(() => `purchase.statusLabels.${STATUS_LABEL_KEY[status]}`, [status]);
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

