"use client"

import { useMemo, useState } from "react"
import { Upload } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import { toast } from "sonner"

type Row = { sku: string; minimum_quantity: string }

export function BulkMinimumImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations("inventory")
  const [csvText, setCsvText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      if (line.toLowerCase().startsWith("sku")) continue
      const [sku, minq] = line.split(",").map((s) => (s ?? "").trim())
      if (!sku || !minq) continue
      out.push({ sku, minimum_quantity: minq })
    }
    return out
  }, [csvText])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="2xl" className="max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{t("bulkMinimum.title")}</DialogTitle>
          <DialogDescription>{t("bulkMinimum.subtitle")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={10}
            placeholder={t("bulkMinimum.csvPlaceholder")}
            className="w-full rounded-lg border border-border bg-background p-3 text-sm font-mono outline-none"
          />

          <div className="text-xs text-muted-foreground">
            {t("bulkMinimum.preview")}{" "}
            <span className="font-semibold">{t("bulkMinimum.previewRows", { count: rows.length })}</span>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t("bulkMinimum.cancel")}
          </Button>
          <Button
            type="button"
            disabled={rows.length === 0 || isSubmitting}
            onClick={async () => {
              setIsSubmitting(true)
              try {
                const res = await inventoryApi.bulkUpdateMinimums(rows)
                toast.success(t("bulkMinimum.success", { updated: res.updated, skipped: res.skipped }))
                onDone()
                onClose()
              } catch {
                toast.error(t("bulkMinimum.fail"))
              } finally {
                setIsSubmitting(false)
              }
            }}
          >
            <Upload size={16} />
            {t("bulkMinimum.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
