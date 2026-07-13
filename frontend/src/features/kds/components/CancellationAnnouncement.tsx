"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { KdsCancellationAnnouncement } from "../types";

interface CancellationAnnouncementProps {
  announcements: KdsCancellationAnnouncement[];
  onClear: (id: string) => void;
}

export function CancellationAnnouncement({
  announcements,
  onClear,
}: CancellationAnnouncementProps) {
  const t = useTranslations("kds");
  const current = announcements[0];
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    if (!current) {
      setTimeLeft(10);
      return;
    }

    setTimeLeft(10);

    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [current]);

  useEffect(() => {
    if (timeLeft === 0 && current) {
      onClear(current.id);
      setTimeLeft(10);
    }
  }, [timeLeft, current, onClear]);

  if (!current) return null;

  return (
    <Dialog open={!!current} onOpenChange={() => onClear(current.id)}>
      <DialogContent className="max-w-4xl bg-background border-[6px] border-destructive rounded-5xl p-0 overflow-hidden shadow-md shadow-destructive/30 ring-offset-0 focus:ring-0">
        <div className="relative p-10 flex flex-col items-center text-center">
          <div className="absolute inset-0 bg-destructive/5 pointer-events-none" />
          <div className="relative z-10 w-32 h-32 bg-destructive rounded-full flex items-center justify-center mb-8 shadow-lg shadow-destructive/40">
            <Trash2 size={64} className="text-destructive-foreground" />
          </div>

          <p className="text-destructive font-bold text-2xl uppercase tracking-[0.4em] mb-4">
            {t('cancellation.title')}
          </p>
          
          <h2 className="text-8xl font-bold text-foreground uppercase tracking-tighter mb-10 leading-none">
            {current.table_name}
          </h2>

          <div className="w-full bg-muted rounded-4xl p-8 border-2 border-border shadow-inner">
            <h3 className="text-muted-foreground text-lg font-bold uppercase tracking-widest mb-6 flex items-center justify-center gap-3">
              <span className="h-[2px] w-8 bg-border" />
              {t('cancellation.cancelledItems')}
              <span className="h-[2px] w-8 bg-border" />
            </h3>
            <ul className="grid grid-cols-1 gap-4">
              {current.items.map((item: string, idx: number) => (
                <li key={idx} className="text-4xl font-bold text-foreground flex items-center justify-center gap-4 bg-destructive/5 py-4 rounded-2xl border border-destructive/10">
                  <span className="w-3 h-3 bg-destructive rounded-full" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={() => onClear(current.id)}
            className="mt-10 px-10 py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xl rounded-2xl transition-colors flex items-center gap-3 shadow-lg"
          >
            {t('cancellation.closeButton', { seconds: timeLeft })}
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-4 bg-muted" aria-hidden>
          <div
            className="h-full bg-destructive transition-[width] duration-1000 linear"
            style={{ width: `${(timeLeft / 10) * 100}%` }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
