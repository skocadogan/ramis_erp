"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Loader2 } from "lucide-react"

const REASON_CODES = ["MISTAKE", "CUSTOMER_CANCEL", "OUT_OF_STOCK", "KITCHEN_ERROR", "QUALITY_ISSUE", "OTHER"] as const

interface CancellationReasonModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reasonCode: string, reasonText: string) => Promise<void>
  title?: string
  description?: string
}

export function CancellationReasonModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}: CancellationReasonModalProps) {
  const t = useTranslations("admin.cancellationReason")
  const resolvedTitle = title ?? t("defaultTitle")
  const resolvedDescription = description ?? t("defaultDescription")
  const [reasonCode, setReasonCode] = useState("")
  const [reasonText, setReasonText] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (!reasonCode) return
    setIsSubmitting(true)
    try {
      await onConfirm(reasonCode, reasonText)
      onClose()
      setReasonCode("")
      setReasonText("")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <AlertCircle className="h-5 w-5" />
            {resolvedTitle}
          </DialogTitle>
          <DialogDescription>
            {resolvedDescription}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label className="text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider">{t("categoryLabel")}</label>
            <Select onValueChange={(val) => setReasonCode(val || "")} value={reasonCode}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {REASON_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`reasons.${code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-ui-semibold text-muted-foreground uppercase tracking-wider">{t("detailLabel")}</label>
            <Textarea 
              placeholder={t("detailPlaceholder")}
              value={reasonText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReasonText(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>{t("dismiss")}</Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirm} 
            disabled={!reasonCode || isSubmitting}
            className="gap-2"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
