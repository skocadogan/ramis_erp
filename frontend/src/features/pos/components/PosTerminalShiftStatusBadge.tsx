"use client";

import { memo } from "react";
import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type PosTerminalShiftStatusBadgeProps = {
  hasOpenShift: boolean;
  openLabel: string;
  closedLabel: string;
  openTitle?: string;
  closedTitle?: string;
  className?: string;
};

export const PosTerminalShiftStatusBadge = memo(function PosTerminalShiftStatusBadge({
  hasOpenShift,
  openLabel,
  closedLabel,
  openTitle,
  closedTitle,
  className,
}: PosTerminalShiftStatusBadgeProps) {
  if (hasOpenShift) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-2xs font-ui-bold uppercase tracking-wide text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
          className,
        )}
        title={openTitle}
      >
        <Circle className="size-2 fill-emerald-500 text-emerald-500" aria-hidden />
        {openLabel}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-2xs font-ui-bold uppercase tracking-wide text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
        className,
      )}
      title={closedTitle}
    >
      <Circle className="size-2 fill-amber-500 text-amber-500" aria-hidden />
      {closedLabel}
    </span>
  );
});
