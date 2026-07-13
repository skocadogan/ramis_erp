"use client";

import { RotateCcw, X, Ban, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { KdsRecallGroup } from "../services/kdsApi";

type Props = {
  open: boolean;
  onClose: () => void;
  groups: KdsRecallGroup[];
  recallWindowMinutes: number;
  isLoading: boolean;
  busyId: string | null;
  onRecallItem: (itemId: string) => void;
  onCancelItem: (itemId: string, name: string) => void;
  onCancelOrder: (orderId: string, tableName: string) => void;
};

function formatSentAgo(sentAt: string): string {
  const diffMs = Date.now() - new Date(sentAt).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return "<1";
  return String(mins);
}

export function KdsRecallDrawer({
  open,
  onClose,
  groups,
  recallWindowMinutes,
  isLoading,
  busyId,
  onRecallItem,
  onCancelItem,
  onCancelOrder,
}: Props) {
  const t = useTranslations("kds.recall");

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[3.75rem] z-40 mx-auto flex max-h-[min(52vh,420px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-lg"
      role="dialog"
      aria-label={t("title")}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
            {t("title")}
          </h2>
          <p className="text-sub text-muted-foreground">
            {t("windowHint", { minutes: recallWindowMinutes })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t("close")}
        >
          <X size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {isLoading && groups.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{t("loading")}</span>
          </div>
        ) : groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="space-y-3">
            {groups.map((group) => (
              <li
                key={group.order_id}
                className="rounded-xl border border-border bg-card/80 p-3 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-foreground">{group.table_name}</p>
                    {group.order_number ? (
                      <p className="text-sub text-muted-foreground">
                        #{group.order_number}
                      </p>
                    ) : null}
                    <p className="text-2xs text-muted-foreground">
                      {t("sentAgo", { minutes: formatSentAgo(group.sent_at) })}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === group.order_id}
                    onClick={() => onCancelOrder(group.order_id, group.table_name)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-2xs font-bold uppercase text-red-700 transition-colors hover:bg-red-500/20 disabled:opacity-50 dark:text-red-300"
                  >
                    <Ban size={12} />
                    {t("cancelOrder")}
                  </button>
                </div>
                <ul className="space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-2 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ui-sm font-semibold text-foreground">
                          {item.quantity}x {item.product_name}
                        </p>
                        {item.unit_name ? (
                          <p className="text-2xs uppercase text-muted-foreground">
                            {item.unit_name}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => onRecallItem(item.id)}
                          className={cn(
                            "flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-2xs font-black uppercase text-white shadow-sm transition-colors hover:bg-amber-600 disabled:opacity-50",
                          )}
                        >
                          {busyId === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw size={12} />
                          )}
                          {t("recallItem")}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => onCancelItem(item.id, item.product_name)}
                          className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50"
                          title={t("cancelItem")}
                        >
                          <Ban size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
