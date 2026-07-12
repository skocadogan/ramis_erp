"use client";

import React, { useEffect, useRef, useState } from "react";
import { Bell, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

function usePulseOnChange(value: number) {
  const [pulse, setPulse] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (value > 0 && value > prev.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 2200);
      prev.current = value;
      return () => clearTimeout(timer);
    }
    prev.current = value;
  }, [value]);

  return pulse;
}

interface NotificationButtonsProps {
  kitchenBadgeCount: number;
  waiterCallBadgeCount: number;
  onKitchenToggle?: () => void;
  onWaiterCallToggle?: () => void;
}

const NotificationButtons = React.memo(function NotificationButtons({
  kitchenBadgeCount,
  waiterCallBadgeCount,
  onKitchenToggle,
  onWaiterCallToggle,
}: NotificationButtonsProps) {
  const kitchenPulse = usePulseOnChange(kitchenBadgeCount);
  const waiterPulse = usePulseOnChange(waiterCallBadgeCount);

  return (
    <>
      {onWaiterCallToggle && (
        <button
          onClick={onWaiterCallToggle}
          type="button"
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-colors",
            waiterCallBadgeCount > 0
              ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
              : "bg-card text-muted-foreground border-border hover:border-amber-300 hover:bg-amber-500/10 hover:text-amber-600"
          )}
          title="Çağrı Bildirimleri"
        >
          <Radio size={20} />
          {waiterCallBadgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[11px] font-ui-bold text-white shadow-lg ring-2 ring-background">
              {waiterPulse && (
                <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping" />
              )}
              <span className="relative z-10">{waiterCallBadgeCount}</span>
            </span>
          )}
        </button>
      )}
      {onKitchenToggle && (
        <button
          onClick={onKitchenToggle}
          type="button"
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition-colors",
            kitchenBadgeCount > 0
              ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
              : "bg-card text-muted-foreground border-border hover:border-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-600"
          )}
          title="Mutfak Bildirimleri"
        >
          <Bell size={20} />
          {kitchenBadgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[11px] font-ui-bold text-white shadow-lg ring-2 ring-background">
              {kitchenPulse && (
                <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping" />
              )}
              <span className="relative z-10">{kitchenBadgeCount}</span>
            </span>
          )}
        </button>
      )}
    </>
  );
});

export default NotificationButtons;
