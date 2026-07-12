import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Timer } from "lucide-react";
import { type PrepTask } from "@/features/prep/types";
import { cn } from "@/lib/utils";
import { formatDeadline } from "../utils/formatDeadline";

interface CompletedTaskStripProps {
  tasks: PrepTask[];
}

/**
 * CompletedTaskStrip shows a horizontal strip of completed/cancelled tasks
 * at the bottom of the station display. Compact, wrap-friendly layout.
 */
export function CompletedTaskStrip({ tasks }: CompletedTaskStripProps) {
  // Deadline etiketlerinin periyodik güncellenmesi için (sadece bu strip render olur)
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (tasks.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-800" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
          Tamamlanan / İptal ({tasks.length})
        </span>
        <div className="h-px flex-1 bg-slate-800" />
      </div>

      <div className="flex flex-wrap gap-2">
        {tasks.slice(0, 10).map((task) => (
          <CompletedTaskChip key={task.id} task={task} />
        ))}
        {tasks.length > 10 && (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700/30 bg-slate-800/40 px-3 py-1.5 text-xs font-medium text-slate-500">
            +{tasks.length - 10} daha
          </span>
        )}
      </div>
    </section>
  );
}

function CompletedTaskChip({ task }: { task: PrepTask }) {
  const deadline = formatDeadline(task.deadline);
  const isCancelled = task.status === "CANCELLED";
  const label = task.completed_quantity > 0
    ? `${task.title} (${task.completed_quantity}${task.unit ? ` ${task.unit}` : ""})`
    : task.title;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
        isCancelled
          ? "border-slate-700/20 bg-slate-800/30 text-slate-500 opacity-60"
          : "border-emerald-900/30 bg-emerald-950/30 text-emerald-300/80"
      )}
    >
      {isCancelled ? (
        <Circle size={10} className="text-slate-500" />
      ) : (
        <CheckCircle2 size={10} className="text-emerald-400" />
      )}
      <span className="truncate max-w-[200px]">{label}</span>
      {deadline.label && (
        <span
          className={cn(
            "ml-1 tabular-nums",
            deadline.isOverdue ? "text-red-400/60" : "text-slate-500"
          )}
        >
          <Timer size={9} className="inline-block mr-0.5" />
          {deadline.label}
        </span>
      )}
    </span>
  );
}
