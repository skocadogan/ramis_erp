"use client";

import { AlertCircle, Inbox, Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AsyncStateVariant = "loading" | "empty" | "error";

interface AsyncStatePanelProps {
  variant: AsyncStateVariant;
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function AsyncStatePanel({
  variant,
  title,
  description,
  onRetry,
  className,
}: AsyncStatePanelProps) {
  const t = useTranslations("common.asyncState");

  const Icon =
    variant === "loading" ? Loader2 : variant === "empty" ? Inbox : AlertCircle;

  const resolvedTitle =
    title ??
    (variant === "loading"
      ? t("loading")
      : variant === "empty"
        ? t("empty")
        : t("error"));

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center",
        className,
      )}
    >
      <Icon
        className={cn(
          "h-10 w-10",
          variant === "loading" && "animate-spin text-primary",
          variant === "empty" && "text-muted-foreground",
          variant === "error" && "text-destructive",
        )}
        aria-hidden
      />
      <div className="space-y-1">
        <p className="text-sm font-ui-bold text-foreground">{resolvedTitle}</p>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {variant === "error" && onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} className="gap-2">
          <RotateCcw className="h-3.5 w-3.5" />
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}

interface PageLoadingStateProps {
  label?: string;
  className?: string;
}

export function PageLoadingState({ label, className }: PageLoadingStateProps) {
  const t = useTranslations("common.asyncState");
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-24", className)}>
      <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{label ?? t("loading")}</p>
    </div>
  );
}
