"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useTranslations } from "next-intl"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function BulkStockEntryFinalizeDialog({ open, onOpenChange, onConfirm }: Props) {
  const t = useTranslations("inventory")
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("bulkFinalize.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("bulkFinalize.description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("bulkFinalize.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>
            {t("bulkFinalize.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
