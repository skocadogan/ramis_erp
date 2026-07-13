import { useEffect, useState } from "react";
import { AlertTriangle, Timer } from "lucide-react";
import { type PrepTask } from "@/features/prep/types";
import { cn } from "@/lib/utils";
import { formatDeadline } from "../utils/formatDeadline";
import { ProgressBar } from "./ProgressBar";

interface UserTaskCardProps {
  userName: string;
  userId: string | null;
  tasks: PrepTask[];
  stationColor: string;
}

/**
 * UserTaskCard displays a user header with avatar and a list of their assigned tasks.
 * Designed to be clearly readable from 3–4 meters on a TV screen.
 */
export function UserTaskCard({
  userName,
  userId,
  tasks,
  stationColor,
}: UserTaskCardProps) {
  // Sadece bu kartın ve deadline etiketlerinin periyodik olarak güncellenmesi için
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const totalProgress = tasks.reduce(
    (acc, t) => acc + (t.target_quantity > 0 ? t.completed_quantity / t.target_quantity : 0),
    0
  );
  const avgProgress =
    tasks.length > 0 ? Math.round((totalProgress / tasks.length) * 100) : 0;
  const totalCompletedQty = tasks.reduce(
    (acc, t) => acc + t.completed_quantity,
    0
  );
  const totalTargetQty = tasks.reduce(
    (acc, t) => acc + t.target_quantity,
    0
  );

  const isUnassigned = userId === null;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border p-5 transition-colors duration-300",
        "hover:bg-muted/60"
      )}
    >
      {/* ─── User Header ─── */}
      <div className="flex items-center gap-3">
        {/* Avatar circle (first letter) or icon for unassigned */}
        {isUnassigned ? (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
            style={{
              backgroundColor: `${stationColor}20`,
              color: stationColor,
            }}
          >
            <Timer size={22} />
          </div>
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold uppercase"
            style={{
              backgroundColor: `${stationColor}25`,
              color: stationColor,
            }}
          >
            {userName.charAt(0)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold text-white">
            {userName}
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: stationColor }}
              />
              {tasks.length} görev
            </span>
            {totalTargetQty > 0 && (
              <span className="">
                Toplam: {totalCompletedQty}/{totalTargetQty}
              </span>
            )}
          </div>
        </div>

        {/* Average progress ring indicator */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="text-right">
            <div
              className={cn(
                "text-lg font-bold tabular-nums",
                avgProgress >= 100
                  ? "text-emerald-400"
                  : avgProgress > 50
                    ? "text-blue-400"
                    : "text-amber-400"
              )}
            >
              %{avgProgress}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Divider ─── */}
      <div className="h-px /40" />

      {/* ─── Task List ─── */}
      <div className="flex flex-col gap-3">
        {tasks.map((task) => (
          <ActiveTaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

/* ─── Individual active task item ─── */

function ActiveTaskItem({ task }: { task: PrepTask }) {
  const deadline = formatDeadline(task.deadline);
  const progress =
    task.target_quantity > 0
      ? Math.min(100, (task.completed_quantity / task.target_quantity) * 100)
      : 0;

  return (
    <div className="group rounded-xl border /40 /60 p-3.5 transition-all duration-200 hover:/50">
      {/* Row 1: Status dot + title + deadline + priority */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* Status dot */}
          <span
            className={cn(
              "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
              task.status === "IN_PROGRESS"
                ? "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]"
                : "bg-amber-500"
            )}
          />

          {/* Title */}
          <span className="truncate text-base font-bold text-white">
            {task.title}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Priority badge */}
          {task.priority > 5 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-bold uppercase text-red-400">
              <AlertTriangle size={10} />
              Acil
            </span>
          )}

          {/* Deadline label */}
          {deadline.label && (
            <span
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold tabular-nums",
                deadline.isOverdue
                  ? "text-red-400"
                  : deadline.isUrgent
                    ? "text-amber-400"
                    : ""
              )}
            >
              <Timer size={12} />
              {deadline.label}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Quantity progress */}
      {task.target_quantity > 0 && (
        <div className="mt-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">
              {task.completed_quantity}/{task.target_quantity}{" "}
              {task.unit && (
                <span className="">{task.unit}</span>
              )}
            </span>
            <span
              className={cn(
                "font-bold tabular-nums",
                progress >= 100
                  ? "text-emerald-400"
                  : progress > 50
                    ? "text-blue-400"
                    : "text-amber-400"
              )}
            >
              %{Math.round(progress)}
            </span>
          </div>
          <ProgressBar value={task.completed_quantity} max={task.target_quantity} />
        </div>
      )}

      {/* Description (compact, if present) */}
      {task.description && (
        <p className="mt-1.5 line-clamp-1 text-xs">
          {task.description}
        </p>
      )}
    </div>
  );
}
