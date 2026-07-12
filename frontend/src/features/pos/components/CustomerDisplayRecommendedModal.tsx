"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/formatters";
import type { DisplayRecommendedModalSync } from "@/types/pos";

interface Props {
  modal: DisplayRecommendedModalSync;
}

export function CustomerDisplayRecommendedModal({ modal }: Props) {
  const t = useTranslations("pos.display");

  return (
    <div className="fixed inset-0 z-[100] flex animate-in items-center justify-center bg-slate-950/90 p-8 fade-in duration-300">
      <div className="w-full max-w-3xl overflow-hidden rounded-[32px] border border-violet-500/30 bg-[#0f172a] shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="border-b border-violet-500/20 bg-violet-500/10 px-10 py-8">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white shadow-lg ring-4 ring-violet-500/20">
              <Sparkles className="h-9 w-9" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-3xl font-ui-bold text-white">{t("recommendedModalTitle")}</h2>
              <p className="mt-1 text-lg font-ui-medium text-violet-200/90">{modal.sourceProductName}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-10 py-8">
          <div className="space-y-3 text-lg leading-relaxed text-slate-200">
            <p>{t("recommendedModalIntro")}</p>
            <p className="text-base text-slate-400">{t("recommendedModalHint")}</p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-violet-500/20">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-violet-500/10 text-sm uppercase tracking-wide text-violet-200/80">
                  <th className="px-6 py-4">{t("recommendedColProduct")}</th>
                  <th className="px-6 py-4">{t("recommendedColUnit")}</th>
                  <th className="px-6 py-4 text-right">{t("recommendedColPrice")}</th>
                  <th className="px-6 py-4 text-right">{t("recommendedColQty")}</th>
                </tr>
              </thead>
              <tbody>
                {modal.items.map((item) => (
                  <tr
                    key={item.productId}
                    className="border-t border-violet-500/15 text-xl text-violet-50"
                  >
                    <td className="px-6 py-4 font-ui-semibold">{item.name}</td>
                    <td className="px-6 py-4 text-violet-200/90">
                      {item.unitName ?? t("recommendedStandardUnit")}
                    </td>
                    <td className="px-6 py-4 text-right font-mono tabular-nums">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="px-6 py-4 text-right font-ui-bold tabular-nums">
                      {item.quantityInCart > 0 ? t("recommendedQty", { qty: item.quantityInCart }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
