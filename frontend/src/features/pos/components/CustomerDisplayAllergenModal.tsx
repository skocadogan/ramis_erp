"use client";

import React from "react";
import { ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DisplayAllergenModalSync } from "@/types/pos";

interface Props {
  modal: DisplayAllergenModalSync;
}

export function CustomerDisplayAllergenModal({ modal }: Props) {
  const t = useTranslations("pos.display");

  return (
    <div className="fixed inset-0 z-[100] flex animate-in items-center justify-center bg-cfd-overlay/90 p-8 fade-in duration-300">
      <div className="w-full max-w-2xl overflow-hidden rounded-5xl border border-cfd-warning/30 bg-card shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="border-b border-cfd-warning/20 bg-cfd-warning/10 px-10 py-8">
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-cfd-warning text-white shadow-lg ring-4 ring-cfd-warning/20">
              <ShieldAlert className="h-9 w-9" strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-foreground">{t("allergenModalTitle")}</h2>
              <p className="mt-1 text-lg font-medium text-cfd-warning">{modal.productName}</p>
            </div>
          </div>
        </div>

        <div className="space-y-8 px-10 py-8">
          <div className="space-y-4 text-lg leading-relaxed text-muted-foreground">
            <p>{t("allergenModalIntro")}</p>
            <p>{t("allergenModalWarning")}</p>
          </div>

          <ul className="space-y-3">
            {modal.allergens.map((allergen) => (
              <li
                key={allergen.id}
                className="rounded-2xl border border-cfd-warning/25 bg-cfd-warning/10 px-6 py-4 text-xl font-semibold text-foreground"
              >
                {allergen.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
