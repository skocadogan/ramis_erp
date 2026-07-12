"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { OrderDetail } from "@/features/tables/components/TableOrderModal/types";

import { ACTIVE_ORDER_STATUS_QUERY } from "@/features/orders/constants/activeOrderStatuses";

function aggregateProductQtys(orders: OrderDetail[]): Record<string, number> {
  const qty: Record<string, number> = {};
  for (const o of orders) {
    for (const it of o.items) {
      if (it.status === "CANCELLED") continue;
      const pid = it.product;
      if (!pid) continue;
      qty[pid] = (qty[pid] ?? 0) + it.quantity;
    }
  }
  return qty;
}

/**
 * Garson menüsünde: masadaki aktif siparişlerde her ürün için toplam adet (ürün kartında gösterim).
 */
export function useWaiterTableOrderedQtys(
  enabled: boolean,
  tableId: string | null | undefined,
  /** `active_order` güncellenince (ör. yeni sipariş, tutar değişimi) yeniden çek */
  activeOrderFingerprint: string | null | undefined
): { qtyByProductId: Record<string, number>; isLoading: boolean } {
  const [qtyByProductId, setQtyByProductId] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !tableId || !activeOrderFingerprint) {
      setQtyByProductId({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    api
      .get<{ results?: OrderDetail[] } | OrderDetail[]>(`/orders/main/`, {
        params: {
          table_id: tableId,
          ordering: "created_at",
          status: ACTIVE_ORDER_STATUS_QUERY,
        },
      })
      .then((res) => {
        const raw = res.data;
        const all = (Array.isArray(raw) ? raw : raw.results ?? []) as OrderDetail[];
        if (!cancelled) setQtyByProductId(aggregateProductQtys(all));
      })
      .catch(() => {
        if (!cancelled) setQtyByProductId({});
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, tableId, activeOrderFingerprint]);

  return { qtyByProductId, isLoading };
}
