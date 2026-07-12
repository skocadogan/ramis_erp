export function isOrderItemCancelled(status: string | undefined | null): boolean {
  return status === "CANCELLED";
}

export function isOrderItemDelivered(status: string | undefined | null): boolean {
  return status === "DELIVERED";
}

export function getOrderItemStatusLabel(
  status: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  switch (status) {
    case "READY":
      return t("tableDetail.status.ready");
    case "PREPARING":
      return t("tableDetail.status.preparing");
    case "DELIVERED":
      return t("tableDetail.status.delivered");
    case "CANCELLED":
      return t("tableDetail.status.cancelled");
    default:
      return t("tableDetail.status.pending");
  }
}

export function getOrderItemStatusTextClass(status: string): string {
  switch (status) {
    case "READY":
      return "text-emerald-500";
    case "PREPARING":
      return "text-amber-500";
    case "DELIVERED":
      return "text-blue-500";
    case "CANCELLED":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}
