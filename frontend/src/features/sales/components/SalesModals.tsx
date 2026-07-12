"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/ui/number-input";
import { cn } from "@/lib/utils";
import type { Sale, PaymentMethod } from "../types";
import { Banknote, CreditCard, Loader2, MoreHorizontal } from "lucide-react";

interface EditSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  editForm: { payment_method: PaymentMethod; notes: string; total_amount: string };
  setEditForm: React.Dispatch<
    React.SetStateAction<{ payment_method: PaymentMethod; notes: string; total_amount: string }>
  >;
  onSubmit: () => Promise<void>;
  isSubmitting: boolean;
}

export function EditSaleModal({
  isOpen,
  onClose,
  editForm,
  setEditForm,
  onSubmit,
  isSubmitting,
}: EditSaleModalProps) {
  const t = useTranslations("sales");
  const PAYMENT_OPTIONS: {
    value: PaymentMethod;
    labelKey: "payment.cashFull" | "payment.cardFull" | "payment.other";
    icon: React.ElementType;
  }[] = [
    { value: "CASH", labelKey: "payment.cashFull", icon: Banknote },
    { value: "CARD", labelKey: "payment.cardFull", icon: CreditCard },
    { value: "OTHER", labelKey: "payment.other", icon: MoreHorizontal },
  ];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next && !isSubmitting) onClose();
      }}
    >
      <DialogContent layout="scroll" size="md">
        <DialogHeader>
          <DialogTitle>{t("editModal.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-2">
            <Label>{t("editModal.paymentMethod")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, payment_method: opt.value }))}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-ui-medium transition-colors",
                    editForm.payment_method === opt.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <opt.icon size={18} />
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-sale-total">{t("editModal.totalAmount")}</Label>
            <NumberInput
              id="edit-sale-total"
              value={editForm.total_amount}
              onChange={(v) => setEditForm((prev) => ({ ...prev, total_amount: v }))}
              suffix=""
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-sale-notes">{t("editModal.notes")}</Label>
            <Textarea
              id="edit-sale-notes"
              value={editForm.notes}
              onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder={t("editModal.notesPlaceholder")}
              rows={3}
              className="min-h-0 resize-none"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("editModal.cancel")}
          </Button>
          <Button type="button" onClick={() => void onSubmit()} disabled={isSubmitting} className="gap-2">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {t("editModal.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmModalsProps {
  deleteSale: Sale | null;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export function ConfirmModals({
  deleteSale,
  onDeleteCancel,
  onDeleteConfirm,
  isDeleting,
}: ConfirmModalsProps) {
  const t = useTranslations("sales");

  return (
    <AlertDialog
      open={!!deleteSale}
      onOpenChange={(open) => {
        if (!open && !isDeleting) onDeleteCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteModal.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteModal.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>{t("deleteModal.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void onDeleteConfirm();
            }}
            disabled={isDeleting}
            className="gap-2 bg-destructive text-white hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 size={14} className="animate-spin" />}
            {t("deleteModal.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
