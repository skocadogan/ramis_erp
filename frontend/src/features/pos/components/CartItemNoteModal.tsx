"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const MAX_ITEM_NOTES_LENGTH = 255;

interface CartItemNoteModalProps {
  productName: string;
  initialNotes?: string;
  open: boolean;
  onClose: () => void;
  onSave: (notes: string) => void;
}

export function CartItemNoteModal({
  productName,
  initialNotes = "",
  open,
  onClose,
  onSave,
}: CartItemNoteModalProps) {
  const t = useTranslations("pos.cartItem");
  const [draft, setDraft] = useState(initialNotes);

  useEffect(() => {
    if (open) {
      setDraft(initialNotes);
    }
  }, [open, initialNotes]);

  if (!open) return null;

  const handleSave = () => {
    onSave(draft.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-item-note-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-background shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-5 dark:border-slate-800 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-2 dark:bg-blue-900/30">
              <MessageSquareText size={20} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 id="cart-item-note-title" className="font-ui-bold leading-tight text-foreground">
                {t("itemNoteTitle")}
              </h3>
              <p className="text-xs font-ui-medium text-muted-foreground">{productName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-slate-200 dark:hover:bg-slate-800"
            aria-label={t("itemNoteClose")}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-2xs font-ui-bold uppercase tracking-wider text-muted-foreground">
              {t("itemNoteLabel")}
            </label>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_ITEM_NOTES_LENGTH))}
              placeholder={t("itemNotePlaceholder")}
              rows={4}
              className="w-full resize-none rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2 text-sm text-foreground outline-none transition-all focus:border-blue-500 focus:bg-background focus:ring-2 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-800/40 dark:focus:border-blue-400 dark:focus:ring-blue-400/15"
              autoFocus
            />
            <p className="mt-1 text-right text-2xs text-muted-foreground tabular-nums">
              {draft.length}/{MAX_ITEM_NOTES_LENGTH}
            </p>
          </div>

          <div className="flex gap-2">
            {draft.trim() ? (
              <Button type="button" variant="outline" className="flex-1" onClick={() => onSave("")}>
                {t("itemNoteClear")}
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {t("itemNoteCancel")}
            </Button>
            <Button type="button" className="flex-1" onClick={handleSave}>
              {t("itemNoteSave")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
