"use client";

import React from "react";
import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DisplayOptionsModalSync } from "@/types/pos";
import { formatCurrency } from "@/lib/formatters";
import { formatProductCalories } from "@/features/pos/utils/formatProductCalories";
import { cn } from "@/lib/utils";

interface Props {
  modal: DisplayOptionsModalSync;
}

function formatOptionPrice(
  price: number | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  if (price == null || price === 0) {
    return t("optionsFree");
  }
  const sign = price > 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(price))}`;
}

function isUnitSelected(
  modal: DisplayOptionsModalSync,
  unitName: string | null
): boolean {
  if (modal.selectedUnitName === undefined) return false;
  if (unitName === null) return modal.selectedUnitName === null;
  return modal.selectedUnitName === unitName;
}

export function CustomerDisplayOptionsModal({ modal }: Props) {
  const t = useTranslations("pos.display");

  const isUnitStep = modal.step === "unit" && (modal.units?.length ?? 0) > 0;
  const selectedModifierIds = new Set(modal.selectedModifierIds ?? []);
  const caloriesLabel = formatProductCalories(modal.calories, t);

  return (
    <div className="fixed inset-0 z-[90] flex animate-in items-center justify-center bg-slate-950/85 p-8 fade-in duration-300">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-5xl border border-white/10 bg-card shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="border-b border-white/10 px-10 py-8">
          <div className="flex items-center gap-5">
            <div className="rounded-2xl bg-blue-500/20 p-4">
              <SlidersHorizontal className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-blue-400">
                {isUnitStep ? t("unitSelectionTitle") : t("optionsModalTitle")}
              </p>
              <h2 className="mt-1 text-3xl font-bold text-white">{modal.productName}</h2>
              {caloriesLabel && (
                <p className="mt-1 text-lg font-semibold tabular-nums text-amber-300">
                  {caloriesLabel}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-10 py-8">
          {isUnitStep ? (
            <ul className="space-y-4">
              {modal.standardUnitPrice != null && (
                <li
                  className={cn(
                    "flex items-center justify-between gap-6 rounded-2xl border px-6 py-5 transition-all duration-300 ease-out",
                    isUnitSelected(modal, null)
                      ? "scale-[1.02] border-emerald-400/70 bg-emerald-500/15 shadow-glow-emerald ring-2 ring-emerald-400/40"
                      : "border-white/10 bg-white/5"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-4">
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                        isUnitSelected(modal, null)
                          ? "scale-100 border-emerald-400 bg-emerald-500 opacity-100"
                          : "scale-75 border-white/20 bg-transparent opacity-0"
                      )}
                      aria-hidden
                    >
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </span>
                    <span className="text-xl font-medium text-white">{t("standardUnit")}</span>
                  </div>
                  <span className="shrink-0 text-xl font-bold text-blue-300">
                    {formatCurrency(modal.standardUnitPrice)}
                  </span>
                </li>
              )}
              {(modal.units ?? []).map((unit) => {
                const selected = isUnitSelected(modal, unit.name);
                return (
                  <li
                    key={unit.name}
                    className={cn(
                      "flex items-center justify-between gap-6 rounded-2xl border px-6 py-5 transition-all duration-300 ease-out",
                      selected
                        ? "scale-[1.02] border-emerald-400/70 bg-emerald-500/15 shadow-glow-emerald ring-2 ring-emerald-400/40"
                        : "border-white/10 bg-white/5"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                          selected
                            ? "scale-100 border-emerald-400 bg-emerald-500 opacity-100"
                            : "scale-75 border-white/20 bg-transparent opacity-0"
                        )}
                        aria-hidden
                      >
                        <CheckCircle2 className="h-5 w-5 text-white" />
                      </span>
                      <span className="text-xl font-medium text-white">{unit.name}</span>
                    </div>
                    <span className="shrink-0 text-xl font-bold text-blue-300">
                      {formatCurrency(unit.price)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-4">
              {modal.modifiers.map((mod) => {
                const selected = selectedModifierIds.has(mod.id);
                return (
                  <li
                    key={mod.id}
                    className={cn(
                      "flex items-center justify-between gap-6 rounded-2xl border px-6 py-5 transition-all duration-300 ease-out",
                      selected
                        ? "scale-[1.02] border-blue-400/70 bg-blue-500/15 shadow-[0_0_24px_rgba(59,130,246,0.25)] ring-2 ring-blue-400/40"
                        : "border-white/10 bg-white/5"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300",
                          selected
                            ? "scale-100 border-blue-400 bg-blue-500 opacity-100"
                            : "scale-75 border-white/20 bg-transparent opacity-0"
                        )}
                        aria-hidden
                      >
                        <CheckCircle2 className="h-5 w-5 text-white" />
                      </span>
                      <span
                        className={cn(
                          "text-xl font-medium transition-colors duration-300",
                          selected ? "text-white" : "text-slate-200"
                        )}
                      >
                        {mod.name}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xl font-bold transition-colors duration-300",
                        selected
                          ? "text-blue-200"
                          : !mod.price_adjustment
                            ? "text-emerald-400"
                            : "text-blue-300"
                      )}
                    >
                      {formatOptionPrice(mod.price_adjustment, t)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-white/10 px-10 py-6">
          <p className="text-center text-base font-medium text-slate-400">{t("optionsModalHint")}</p>
        </div>
      </div>
    </div>
  );
}
