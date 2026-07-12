// ============================================================
// Stock Man — Stock Counting Status Badge
//
// Maps a StockCountingStatus enum value to a Badge variant
// + the localised label from `counting.statusLabels.*`.
// Follows the conventional status → colour ladder:
//   DRAFT        → default (neutral)
//   IN_PROGRESS  → warning  (active work)
//   COMPLETED    → info     (done, awaiting approval)
//   APPROVED     → success  (terminal, locked)
// ============================================================

import React, { useMemo } from "react";
import { Badge, type BadgeVariant, type BadgeSize } from "@/components/ui/Badge";
import { useI18n } from "@/i18n";
import type { StockCountingStatus } from "@/types";

export interface CountingStatusBadgeProps {
  status: StockCountingStatus;
  size?: BadgeSize;
  className?: string;
}

const STATUS_LABEL_KEY: Record<StockCountingStatus, string> = {
  DRAFT: "draft",
  IN_PROGRESS: "inProgress",
  COMPLETED: "completed",
  APPROVED: "approved",
};

const STATUS_VARIANT: Record<StockCountingStatus, BadgeVariant> = {
  DRAFT: "default",
  IN_PROGRESS: "warning",
  COMPLETED: "info",
  APPROVED: "success",
};

export function CountingStatusBadge({
  status,
  size = "sm",
  className,
}: CountingStatusBadgeProps) {
  const { t } = useI18n();
  const variant = STATUS_VARIANT[status];
  const labelKey = useMemo(
    () => `counting.statusLabels.${STATUS_LABEL_KEY[status]}`,
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

