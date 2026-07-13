"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, HelpCircle, X } from "lucide-react";

export interface Anomaly {
  severity: string;
  title: string;
  description: string;
  type: string;
}

interface DashboardAnomaliesProps {
  anomalies: Anomaly[];
  onSelectAnomaly: (anomaly: Anomaly) => void;
}

export function DashboardAnomalies({ anomalies, onSelectAnomaly }: DashboardAnomaliesProps) {
  const t = useTranslations("dashboard");
  const [dismissedHashes, setDismissedHashes] = useState<Set<string>>(new Set());

  if (!anomalies || anomalies.length === 0) return null;

  const visibleAnomalies = anomalies.filter((anno) => {
    const hash = `${anno.type}-${anno.title}`;
    return !dismissedHashes.has(hash);
  });

  if (visibleAnomalies.length === 0) return null;

  const dismiss = (anno: Anomaly) => {
    const hash = `${anno.type}-${anno.title}`;
    setDismissedHashes((prev) => {
      const next = new Set(prev);
      next.add(hash);
      return next;
    });
  };

  return (
    <div className="mb-6 space-y-3">
      {visibleAnomalies.map((anno, idx) => (
        <div
          key={idx}
          className="group relative flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <h4 className="text-sm font-bold">{anno.title}</h4>
            <p className="text-xs opacity-90">{anno.description}</p>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSelectAnomaly(anno)}
              className="rounded-full p-1.5 transition-colors hover:bg-amber-200 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400"
              title={t("anomalies.details")}
            >
              <HelpCircle size={16} />
            </button>
            <button
              type="button"
              onClick={() => dismiss(anno)}
              className="rounded-full p-1.5 transition-colors hover:bg-amber-200 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400"
              aria-label={t("anomalies.dismissAria")}
              title={t("anomalies.dismiss")}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
