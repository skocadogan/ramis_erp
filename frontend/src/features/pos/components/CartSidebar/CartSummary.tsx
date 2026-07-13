"use client";

import { formatAmount } from "@/lib/formatters";

interface CartSummaryProps {
  notes: string;
  onNotesChange: (value: string) => void;
  cartTotal: number;
  canViewAmounts: boolean;
  tCart: (key: string, values?: Record<string, string | number>) => string;
}

export function CartSummary({
  notes,
  onNotesChange,
  cartTotal,
  canViewAmounts,
  tCart,
}: CartSummaryProps) {
  return (
    <>
      <div className="mb-4 shrink-0">
        <label className="mb-1.5 block text-2xs font-bold uppercase tracking-wider text-muted-foreground">
          {tCart("orderNote") || "Sipariş Açıklaması / Notu"}
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={tCart("orderNotePlaceholder") || "Mutfak veya garson notu yazın..."}
          rows={2}
          className="w-full resize-none rounded-xl border border-slate-200/80 /50 px-3 py-2 text-sm text-foreground outline-none focus:border-blue-500 focus:bg-background focus:ring-2 focus:ring-blue-500/15 transition-all border-border bg-muted/40 dark:focus:border-blue-400 dark:focus:ring-blue-400/15"
        />
      </div>

      <div className="mt-auto shrink-0 border-t border-slate-100 pt-5 border-border bg-card">
        <div className="mb-5 flex items-center justify-between border-b border-dashed border-border pb-4 text-2xl font-bold border-input text-foreground">
          <span>{tCart("total")}</span>
          <span className="text-blue-600 text-foreground font-mono sm:text-2xl">
            {formatAmount(cartTotal, canViewAmounts)}
          </span>
        </div>
      </div>
    </>
  );
}
