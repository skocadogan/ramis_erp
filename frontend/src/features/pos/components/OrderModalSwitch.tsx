"use client";

import { lazy, Suspense } from "react";
import { usePosStore } from "@/store/usePosStore";
import { usePosZones } from "@/features/pos/hooks/usePosTables";
import type { Table } from "@/types/pos";

const TableOrderModal = lazy(() =>
  import("@/features/tables/components/TableOrderModal").then((m) => ({
    default: m.TableOrderModal,
  }))
);
const TakeawayOrderModal = lazy(() =>
  import("@/features/tables/components/TakeawayOrderModal").then((m) => ({
    default: m.TakeawayOrderModal,
  }))
);

interface OrderModalSwitchProps {
  orderModalTable: Table;
  onClose: () => void;
  onActiveOrdersChanged: () => Promise<void> | void;
  onPaymentComplete: () => Promise<void>;
  onNewOrder: () => void;
  hideDeliveredQuantityControls?: boolean;
}

export function OrderModalSwitch({
  orderModalTable,
  onClose,
  onActiveOrdersChanged,
  onPaymentComplete,
  onNewOrder,
  hideDeliveredQuantityControls,
}: OrderModalSwitchProps) {
  const bid = usePosStore((s) => s.activeBranchId) || undefined;
  const { data: zones = [] } = usePosZones({ branchId: bid });
  const zone = zones.find((z) => z.id === orderModalTable.zone);
  const isTakeaway = zone?.is_takeaway ?? false;
  const linkedOrderId = orderModalTable.linked_order_id ?? undefined;

  if (isTakeaway) {
    return (
      <Suspense fallback={null}>
        <TakeawayOrderModal
          tableId={linkedOrderId ? undefined : orderModalTable.id}
          orderId={linkedOrderId}
          tableName={orderModalTable.name}
          onClose={onClose}
          onActiveOrdersChanged={onActiveOrdersChanged}
          onPaymentComplete={onPaymentComplete}
          onNewOrder={onNewOrder}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <TableOrderModal
        tableId={orderModalTable.id}
        tableName={orderModalTable.name}
        onClose={onClose}
        onActiveOrdersChanged={onActiveOrdersChanged}
        onPaymentComplete={onPaymentComplete}
        onNewOrder={onNewOrder}
        hideDeliveredQuantityControls={hideDeliveredQuantityControls}
      />
    </Suspense>
  );
}
