"use client";

import { ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  notes: string[];
  tableName: string;
  onClose: () => void;
}

export function KdsOrderNotesModal({ open, notes, tableName, onClose }: Props) {
  const t = useTranslations("kds");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <ClipboardList size={20} />
            </span>
            {t("ticket.notes") || "Sipariş Açıklamaları"}
          </DialogTitle>
          <DialogDescription>{tableName}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Açıklama bulunmuyor.</p>
          ) : (
            notes.map((note, idx) => (
              <div
                key={idx}
                className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 text-sm font-ui-medium text-foreground"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-xs font-ui-black text-amber-600 dark:text-amber-400">
                  {idx + 1}
                </span>
                <p className="flex-1 leading-relaxed whitespace-pre-wrap select-text">{note}</p>
              </div>
            ))
          )}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("actions.close") || "Kapat"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
