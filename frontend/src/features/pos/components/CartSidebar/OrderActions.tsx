"use client";

import { Loader2 } from "lucide-react";
import type { CartItem, Table } from "@/types/pos";

interface OrderActionsProps {
  selectedTable: Table | null;
  cart: CartItem[];
  isSubmitting: boolean;
  shiftGateOk: boolean;
  isKitchenBusy: boolean;
  expectedBuffer: number;
  submitOrder: (opts?: { skipStationStockCheck?: boolean }) => void;
  tCart: (key: string, values?: Record<string, string | number>) => string;
}

export function OrderActions({
  selectedTable,
  cart,
  isSubmitting,
  shiftGateOk,
  isKitchenBusy,
  expectedBuffer,
  submitOrder,
  tCart,
}: OrderActionsProps) {
  const disabled = !selectedTable || cart.length === 0 || isSubmitting || !shiftGateOk;

  return (
    <div className="shrink-0">
      {!shiftGateOk && (
        <p className="mb-3 text-center text-xs font-medium text-amber-700 dark:text-amber-400">
          {tCart("shiftRequired")}
        </p>
      )}
      <button
        disabled={disabled}
        onClick={() => submitOrder()}
        className={`relative w-full rounded-xl py-4 font-bold transition-all duration-300
 ${disabled
 ? "cursor-not-allowed text-muted-foreground bg-muted dark:text-muted-foreground"
 : isKitchenBusy
 ? "bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/20 ring-2 ring-amber-500/30" 
 : "bg-blue-600 text-white hover:bg-blue-700"}`}
      >
        {isSubmitting ? (
          <div className="flex space-x-2 items-center justify-center">
            <Loader2 size={20} className="animate-spin" />
            <span>{tCart("sending")}</span>
          </div>
        ) : isKitchenBusy ? (
          <div className="flex flex-col items-center leading-tight">
            <span>{tCart("sendOrderBusy")}</span>
            <span className="text-2xs font-bold text-amber-100 uppercase">{tCart("kitchenBusy", { minutes: expectedBuffer })}</span>
          </div>
        ) : tCart("sendOrder")}
      </button>
    </div>
  );
}
