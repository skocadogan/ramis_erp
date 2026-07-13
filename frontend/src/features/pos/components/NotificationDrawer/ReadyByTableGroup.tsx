"use client";

import { Clock, CheckCheck } from "lucide-react";
import type { ReadyItem } from "@/types/pos";

interface ReadyByTableGroupProps {
  group: { key: string; tableLabel: string; items: ReadyItem[] };
  deliverItem: (itemId: string) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function ReadyByTableGroup({ group, deliverItem, t }: ReadyByTableGroupProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-2 bg-muted/80">
        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
          {group.tableLabel}
        </span>
        <span className="text-2xs font-medium text-muted-foreground">
          {t("itemCount", { count: group.items.length })}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {group.items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center justify-between gap-2 p-3 transition-colors hover:/80 dark:hover:/50"
          >
            <div className="flex min-w-0 max-w-[70%] flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="truncate text-sub font-semibold text-muted-foreground dark:text-muted-foreground">
                  {item.station_name}
                </span>
              </div>
              <span className="text-sm font-bold leading-tight text-foreground">
                {item.quantity}x {item.product_name}
                {item.unit_name && (
                  <span className="ml-1.5 text-xs text-blue-600 dark:text-blue-400">
                    {item.unit_name}
                  </span>
                )}
              </span>
              <div className="mt-0.5 flex items-center gap-1 text-2xs font-medium text-muted-foreground dark:text-muted-foreground">
                <Clock size={10} />
                {t("readyAt", {
                  time: new Date(item.updated_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => deliverItem(item.id)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 shadow-sm transition-[color,background-color,border-color,box-shadow,transform] hover:bg-emerald-600 hover:text-white active:scale-95 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-600 dark:hover:text-white"
              title={t("delivered")}
            >
              <CheckCheck size={20} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
