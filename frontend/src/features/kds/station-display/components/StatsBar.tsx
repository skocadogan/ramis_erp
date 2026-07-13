import { type PrepTask } from "@/features/prep/types";
import { cn } from "@/lib/utils";

export function StatsBar({ tasks }: { tasks: PrepTask[] }) {
  const counts = tasks.reduce(
    (acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const items = [
    { label: "Bekliyor", count: counts.PENDING || 0, color: "text-amber-400" },
    {
      label: "Hazırlanıyor",
      count: counts.IN_PROGRESS || 0,
      color: "text-blue-400",
    },
    {
      label: "Tamamlandı",
      count: counts.COMPLETED || 0,
      color: "text-emerald-400",
    },
  ];

  return (
    <div className="flex items-center gap-6">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className={cn("text-2xl font-bold tabular-nums", item.color)}>
            {item.count}
          </span>
          <span className="text-xs font-medium uppercase tracking-widest">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
