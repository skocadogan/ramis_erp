"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

type Props = {
  draftId: string | null
  status: "DRAFT" | "POSTED" | null
  validLineCount: number
  onClose: () => void
  onSaveDraft: () => void
  onRequestFinalize: () => void
  onDeleteDraft: () => void
  canSave: boolean
  canFinalize: boolean
  manualSaving: boolean
  finalizing: boolean
  deletingDraft: boolean
}

export function BulkStockEntryFooter({
  draftId,
  status,
  validLineCount,
  onClose,
  onSaveDraft,
  onRequestFinalize,
  onDeleteDraft,
  canSave,
  canFinalize,
  manualSaving,
  finalizing,
  deletingDraft,
}: Props) {
  const t = useTranslations("inventory")
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6 sm:py-4">
      <div className="text-xs text-muted-foreground">
        {draftId ? (
          <span>
            {t("bulkStockEntry.footerDraftId", { id: draftId.slice(0, 8) })}
            {status === "POSTED" ? t("bulkStockEntry.footerPosted") : t("bulkStockEntry.footerDraft")}
          </span>
        ) : (
          <span>{t("bulkStockEntry.footerNewDraft")}</span>
        )}
        {validLineCount > 0 && <span className="ml-2">{t("bulkStockEntry.validLines", { count: validLineCount })}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t("bulkStockEntry.footerClose")}
        </Button>
        {draftId && (
          <Button
            type="button"
            variant="destructive"
            disabled={deletingDraft || manualSaving || finalizing}
            onClick={onDeleteDraft}
          >
            {deletingDraft
              ? t("bulkStockEntry.deleting")
              : status === "POSTED"
                ? t("bulkStockEntry.deletePosted")
                : t("bulkStockEntry.deleteDraft")}
          </Button>
        )}
        {status !== "POSTED" && (
          <>
            <Button
              type="button"
              disabled={!canSave || manualSaving || finalizing || deletingDraft}
              onClick={onSaveDraft}
            >
              {manualSaving ? t("bulkStockEntry.savingDraft") : t("bulkStockEntry.saveDraft")}
            </Button>
            <Button
              type="button"
              disabled={!canFinalize || finalizing || deletingDraft}
              onClick={onRequestFinalize}
            >
              {finalizing ? t("bulkStockEntry.finalizing") : t("bulkStockEntry.finalize")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
