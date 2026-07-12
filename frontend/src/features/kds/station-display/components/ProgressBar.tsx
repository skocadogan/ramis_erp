import { cn } from "@/lib/utils";

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-slate-700/60">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          pct >= 100
            ? "bg-emerald-500"
            : pct > 50
              ? "bg-blue-500"
              : "bg-amber-500"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
