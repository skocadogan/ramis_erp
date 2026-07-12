"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Download, RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { fetchAsyncPdf, downloadBlob } from "@/lib/pdfExport"

interface AsyncPdfExportButtonProps {
  reportSlug: string
  params?: Record<string, unknown>
  filename?: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
}

type ExportState = "idle" | "processing" | "completed" | "failed"

export function AsyncPdfExportButton({
  reportSlug,
  params,
  filename,
  variant = "outline",
  size = "sm",
  className,
}: AsyncPdfExportButtonProps) {
  const t = useTranslations("common")
  const [state, setState] = useState<ExportState>("idle")
  const [error, setError] = useState<string | null>(null)

  const handleExport = useCallback(async () => {
    setState("processing")
    setError(null)

    try {
      const result = await fetchAsyncPdf({
        reportSlug,
        params,
        format: "pdf",
        onProgress: () => setState("processing"),
      })

      if (result.status === "completed" && result.download_url) {
        downloadBlob(result.download_url, result.filename || filename || `${reportSlug}.pdf`)
        setState("completed")
      } else {
        setState("failed")
        setError(result.error || t("export.failed") || "PDF dışa aktarılamadı")
      }
    } catch {
      setState("failed")
      setError(t("export.failed") || "PDF dışa aktarılamadı")
    }
  }, [reportSlug, params, filename, t])

  if (state === "processing") {
    return (
      <Button disabled variant={variant} size={size} className={className}>
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("export.preparing") || "PDF hazırlanıyor..."}
      </Button>
    )
  }

  if (state === "failed") {
    return (
      <Button
        variant="destructive"
        size={size}
        className={className}
        onClick={handleExport}
        title={error || undefined}
      >
        <RefreshCw className="mr-2 h-4 w-4" />
        {t("export.retry") || "Tekrar dene"}
      </Button>
    )
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      {t("export.pdf") || "PDF Dışa Aktar"}
    </Button>
  )
}
