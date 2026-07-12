import type { TransferStatus } from "@/types";

export const TRANSFER_STATUS_LABEL_KEY: Record<TransferStatus, string> = {
  DRAFT: "draft",
  PENDING: "pending",
  IN_TRANSIT: "inTransit",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

export function transferStatusLabelKey(status: TransferStatus | string): string {
  return (
    TRANSFER_STATUS_LABEL_KEY[status as TransferStatus] ??
    status.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  );
}
