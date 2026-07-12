// ============================================================
// Stock Man — Deficiency Status Badge
//
// Maps a DeficiencyStatus enum value to a Badge variant +
// the localised label from `deficiency.statusLabels.*`.
// Follows the conventional status → colour ladder:
//   DRAFT               → default
//   PENDING             → info     (awaiting approval)
//   APPROVED            → success
//   ORDERED             → primary  (a PO has been spawned)
//   PARTIALLY_COMMITTED → warning
//   COMMITTED           → success
//   CANCELLED           → destructive
// ============================================================

import React, { useMemo } from "react";
import { Badge, type BadgeVariant, type BadgeSize } from "@/components/ui/Badge";
import { useI18n } from "@/i18n";
import type { DeficiencyStatus } from "@/types";

export interface DeficiencyStatusBadgeProps {
  status: DeficiencyStatus;
  size?: BadgeSize;
  className?: string;
}

const STATUS_LABEL_KEY: Record<DeficiencyStatus, string> = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  ORDERED: "ordered",
  PARTIALLY_COMMITTED: "partiallyCommitted",
  COMMITTED: "committed",
  CANCELLED: "cancelled",
};

const STATUS_VARIANT: Record<DeficiencyStatus, BadgeVariant> = {
  DRAFT: "default",
  PENDING: "info",
  APPROVED: "success",
  ORDERED: "info",
  PARTIALLY_COMMITTED: "warning",
  COMMITTED: "success",
  CANCELLED: "destructive",
};

export function DeficiencyStatusBadge({
  status,
  size = "sm",
  className,
}: DeficiencyStatusBadgeProps) {
  const { t } = useI18n();
  const variant = STATUS_VARIANT[status];
  const labelKey = useMemo(
    () => `deficiency.statusLabels.${STATUS_LABEL_KEY[status]}`,
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

