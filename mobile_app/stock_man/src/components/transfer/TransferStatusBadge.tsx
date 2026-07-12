// ============================================================
// Stock Man — Transfer Status Badge
//
// Maps a TransferStatus enum value to a Badge variant + the
// localised label from `transfer.statusLabels.*`:
//
// DRAFT     → default
// PENDING   → info
// IN_TRANSIT → warning
// COMPLETED  → success
// CANCELLED  → destructive
// ============================================================

import React, { useMemo } from "react";
import { Badge, type BadgeVariant, type BadgeSize } from "@/components/ui/Badge";
import { useI18n } from "@/i18n";
import { TRANSFER_STATUS_LABEL_KEY } from "@/utils/transferStatusLabel";
import type { TransferStatus } from "@/types";

export interface TransferStatusBadgeProps {
  status: TransferStatus;
  size?: BadgeSize;
  className?: string;
}

const STATUS_LABEL_KEY = TRANSFER_STATUS_LABEL_KEY;

const STATUS_VARIANT: Record<TransferStatus, BadgeVariant> = {
  DRAFT: "default",
  PENDING: "info",
  IN_TRANSIT: "warning",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

export function TransferStatusBadge({ status, size = "sm", className }: TransferStatusBadgeProps) {
  const { t } = useI18n();
  const variant = STATUS_VARIANT[status];
  const labelKey = useMemo(
    () => `transfer.statusLabels.${STATUS_LABEL_KEY[status]}`,
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

