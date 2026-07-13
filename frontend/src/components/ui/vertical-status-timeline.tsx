"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type VerticalStatusTimelineStepState = "completed" | "pending";

/** Beş aşamalı iş akışı rengi; `cancelled` = iptal. Verilmezse varsayılan yeşil / gri simgeler kullanılır. */
type VerticalStatusTimelinePhase = 1 | 2 | 3 | 4 | 5 | "cancelled";

export interface VerticalStatusTimelineStep {
  /** Benzersiz anahtar (liste render için) */
  id: string;
  /** Tamamlanan: onay işareti; Bekleyen: nokta */
  state: VerticalStatusTimelineStepState;
  /** Ana açıklama (ör. "Siparişiniz alındı") */
  label: string;
  /** İkinci satır — genelde tarih */
  date?: string | null;
  /** Sağ üst — genelde saat */
  time?: string | null;
  /** Simgenin rengi — 1–5 (5 = yeşil), iptal için "cancelled" */
  phase?: VerticalStatusTimelinePhase;
}

// --- Helpers ---

function phaseIconRingClasses(phase: VerticalStatusTimelinePhase | undefined, isCompleted: boolean): string {
  if (phase === "cancelled") {
    return isCompleted
      ? "border-destructive bg-destructive text-destructive-foreground"
      : "border-destructive bg-background dark:border-destructive/50 dark:bg-muted/20";
  }
  if (!phase) {
    return isCompleted
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-background dark:bg-muted/20";
  }

  const filled: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: "border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500",
    2: "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500",
    3: "border-amber-500 bg-amber-500 text-white dark:border-amber-400 dark:bg-amber-500",
    4: "border-orange-500 bg-orange-500 text-white dark:border-orange-400 dark:bg-orange-500",
    5: "border-primary bg-primary text-primary-foreground",
  };
  const hollow: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: "border-sky-500 bg-background dark:border-sky-500/50 dark:bg-muted/20",
    2: "border-violet-500 bg-background dark:border-violet-500/50 dark:bg-muted/20",
    3: "border-amber-500 bg-background dark:border-amber-500/50 dark:bg-muted/20",
    4: "border-orange-500 bg-background dark:border-orange-500/50 dark:bg-muted/20",
    5: "border-primary bg-background dark:border-primary/50 dark:bg-muted/20",
  };
  return isCompleted ? filled[phase] : hollow[phase];
}

function phasePendingDotClass(phase: VerticalStatusTimelinePhase | undefined): string {
  if (phase === "cancelled") return "bg-destructive";
  if (!phase) return "bg-primary";
  const dots: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: "bg-sky-600 dark:bg-sky-500",
    2: "bg-violet-600 dark:bg-violet-500",
    3: "bg-amber-600 dark:bg-amber-500",
    4: "bg-orange-600 dark:bg-orange-500",
    5: "bg-primary",
  };
  return dots[phase];
}

// --- Sub-components ---

const TimelineStep = memo(function TimelineStep({
  step,
  isLast,
  isMutedCompleted
}: {
  step: VerticalStatusTimelineStep;
  isLast: boolean;
  isMutedCompleted: boolean;
}) {
  const isCompleted = step.state === "completed";

  return (
    <li className={cn("flex min-w-0 gap-4", isMutedCompleted && "opacity-85")}>
      <div className="flex w-8 shrink-0 flex-col items-center self-stretch">
        <span
          className={cn(
            "z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 shadow-sm",
            phaseIconRingClasses(step.phase, isCompleted)
          )}
          aria-hidden
        >
          {isCompleted ? (
            <Check className="size-4 stroke-[3]" />
          ) : (
            <span className={cn("size-2.5 rounded-full", phasePendingDotClass(step.phase))} />
          )}
        </span>
        {!isLast ? (
          <div
            className="mt-2 min-h-[2.5rem] w-px flex-1 bg-gradient-to-b from-border to-transparent"
            aria-hidden
          />
        ) : null}
      </div>

      <div className={cn("min-w-0 flex-1 pt-0.5", !isLast ? "pb-8" : "pb-0")}>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
          <p
            className={cn(
              "min-w-0 flex-1 text-sm leading-snug break-words",
              isLast
                ? step.state === "completed"
                  ? "font-normal text-foreground"
                  : "font-normal text-muted-foreground"
                : isCompleted
                  ? "font-semibold text-foreground"
                  : "font-normal text-muted-foreground"
            )}
          >
            {step.label}
          </p>
          {step.time ? (
            <span
              className={cn(
                "shrink-0 self-start tabular-nums text-xs font-semibold text-muted-foreground",
                isLast && "text-foreground"
              )}
            >
              {step.time}
            </span>
          ) : null}
        </div>
        {step.date ? (
          <p
            className={cn(
              "mt-1 text-xs text-muted-foreground font-medium",
              isLast && "text-muted-foreground"
            )}
          >
            {step.date}
          </p>
        ) : null}
      </div>
    </li>
  );
});

export interface VerticalStatusTimelineProps {
  /** Kart üst başlığı */
  title: string;
  steps: VerticalStatusTimelineStep[];
  className?: string;
}

/**
 * Dikey durum / ilerleme zaman çizelgesi (sipariş veya eksik listesi yaşam döngüsü için).
 * KDS eksik listesi detayında sağ sütunda kullanıma uygundur.
 */
export function VerticalStatusTimeline({ title, steps, className }: VerticalStatusTimelineProps) {
  const t = useTranslations("common.timeline");

  if (steps.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border  /20 p-4",
          className
        )}
      >
        <h3 className="text-base font-bold uppercase tracking-wider">{title}</h3>
        <p className="mt-3 text-sm text-muted-foreground italic">{t("emptySteps")}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/20 p-4",
        className
      )}
    >
      <h3 className="text-base font-bold uppercase tracking-wider leading-snug text-foreground">
        {title}
      </h3>

      <ul className="mt-5">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isCompleted = step.state === "completed";
          /** Geçmişte kalan tamamlanan adımlar soluk; son adım her zaman tam opak ve normal vurgu. */
          const isMutedCompleted = isCompleted && !isLast;

          return (
            <TimelineStep
              key={step.id}
              step={step}
              isLast={isLast}
              isMutedCompleted={isMutedCompleted}
            />
          );
        })}
      </ul>
    </div>
  );
}
