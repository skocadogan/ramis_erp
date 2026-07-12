"use client";

import dynamic from "next/dynamic";
import { PosWaiterShell } from "@/components/shell/PosWaiterShell";

const OrderModalSwitch = dynamic(
  () => import("@/features/pos/components/OrderModalSwitch").then((m) => m.OrderModalSwitch),
  { ssr: false }
);

export default function PosPage() {
  return <PosWaiterShell variant="pos" OrderModalComponent={OrderModalSwitch} />;
}
