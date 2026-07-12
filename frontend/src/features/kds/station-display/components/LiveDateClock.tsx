"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * LiveDateClock shows the current date (tr-TR locale, e.g. "1 Haziran 2026 Pazartesi")
 * and the current time (hh:mm:ss), updating every second.
 * Designed for large visibility on TV/monitor screens.
 */
export function LiveDateClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });

  const timeLabel = now.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-sm font-medium tracking-wide text-slate-400">
        {dateLabel}
      </span>
      <div className="flex items-center gap-2 tabular-nums text-3xl font-bold tracking-tight text-white">
        <Clock size={24} className="text-slate-400" />
        {timeLabel}
      </div>
    </div>
  );
}
