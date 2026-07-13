"use client"

import { AlertTriangle, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ForceDeleteConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  itemName: string
  modelName: string
  dependencies: string[]
  isLoading?: boolean
  isLoadingPreview?: boolean
}

export function ForceDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  modelName,
  dependencies,
  isLoading = false,
  isLoadingPreview = false,
}: ForceDeleteConfirmModalProps) {
  const t = useTranslations("recycle_bin")

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="md" className="overflow-hidden rounded-2xl border-none p-0 shadow-2xl max-w-lg">
        <div className="h-2 w-full bg-red-700" />

        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-full shrink-0 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <Trash2 size={24} />
            </div>

            <div className="flex-1 min-w-0">
              <DialogHeader className="text-left space-y-1">
                <DialogTitle className="text-xl font-bold text-foreground">
                  {t("modal.forceDelete.title")}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
                  {t("modal.forceDelete.description", { name: itemName, model: modelName })}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg dark:bg-red-900/10 dark:border-red-900/20">
                <p className="text-sub font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5 dark:text-red-400">
                  <AlertTriangle size={12} />
                  {t("modal.forceDelete.warning")}
                </p>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {t("modal.forceDelete.dependenciesTitle")}
                </p>
                {isLoadingPreview ? (
                  <p className="text-sm text-muted-foreground">{t("modal.forceDelete.loadingDeps")}</p>
                ) : dependencies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("modal.forceDelete.noDeps")}</p>
                ) : (
                  <ul className="max-h-40 overflow-y-auto space-y-1.5 text-sm text-foreground list-disc pl-4">
                    {dependencies.map((dep) => (
                      <li key={dep} className="leading-snug">
                        {dep}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-8 flex gap-3 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 h-11 rounded-xl font-medium"
            >
              {t("modal.cancel")}
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onConfirm()
              }}
              disabled={isLoading || isLoadingPreview}
              className="flex-1 h-11 rounded-xl font-bold bg-red-700 hover:bg-red-800 text-white shadow-lg shadow-red-500/20"
            >
              {isLoading ? t("modal.forceDelete.confirming") : t("modal.forceDelete.confirm")}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
