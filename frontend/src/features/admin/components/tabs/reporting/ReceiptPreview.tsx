"use client"

import { useMemo, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { Printer, Image as ImageIcon, ZoomIn, ZoomOut } from "lucide-react"
import type { ReceiptTemplate } from "../../../services/adminApi"
import { renderReceiptToText, SAMPLE_CONTEXTS } from "@/lib/receiptRenderer"
import api from "@/lib/api"

interface Props {
  template: ReceiptTemplate | null
}

export function ReceiptPreview({ template }: Props) {
  const t = useTranslations("admin")

  // branch_logo bloklarında seçili şubeleri bul
  const logoBlockIds = useMemo(() => {
    if (!template) return [] as string[]
    return template.layout_json
      .filter(b => b.type === "branch_logo" && b.branch_id)
      .map(b => b.branch_id!)
      .filter((id, i, arr) => arr.indexOf(id) === i) // unique
  }, [template])

  // Seçili şubelerin logolarını çek
  const { data: branchLogos = {} } = useQuery({
    queryKey: ["branch-logos", logoBlockIds],
    queryFn: async () => {
      const logos: Record<string, string> = {}
      for (const id of logoBlockIds) {
        try {
          const res = await api.get(`/branches/${id}/`)
          const branch = res.data as { logo?: string | null; name?: string }
          if (branch?.logo) logos[id] = branch.logo
        } catch { /* branch silinmiş olabilir */ }
      }
      return logos
    },
    enabled: logoBlockIds.length > 0,
    staleTime: 300_000,
  })

  // Text preview — branch_logo bloklarını placeholder ile değiştir
  const text = useMemo(() => {
    if (!template) return ""
    if (template.layout_json.length === 0) return t("reporting.receiptPreview.emptyLayout")
    const ctx = SAMPLE_CONTEXTS[template.category] ?? {}

    // branch_logo bloğu için logo URL'sini context'e ekle (önizleme için placeholder)
    const logosInLayout = template.layout_json.filter(b => b.type === "branch_logo")
    if (logosInLayout.length > 0) {
      const firstLogo = logosInLayout[0]
      if (firstLogo.branch_id && branchLogos[firstLogo.branch_id]) {
        (ctx as Record<string, unknown>).branch_logo_url = branchLogos[firstLogo.branch_id]
      }
    }

    return renderReceiptToText(template.layout_json, ctx, template.paper_width)
  }, [template, t, branchLogos])

  const paperWidth = template?.paper_width ?? 48
  const paperLabel =
    paperWidth >= 48 ? t("reporting.paperWidth80") : t("reporting.paperWidth58")

  // branch_logo bloklarını bul
  const logoBlocks = useMemo(
    () => template?.layout_json.filter(b => b.type === "branch_logo") ?? [],
    [template]
  )

  // ── Zoom state ─────────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1)
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 3
  const ZOOM_STEP = 0.1

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP)), [])
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP)), [])
  const handleZoomReset = useCallback(() => setZoom(1), [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2
        border-b border-border bg-slate-50
        border-border bg-muted/60">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Printer size={13} />
          <span>{t("reporting.editor.preview")}</span>
          <span className="px-1.5 py-0.5 rounded
            bg-slate-200 text-slate-600 font-mono text-2xs
            bg-accent text-muted-foreground">
            {paperLabel} · {paperWidth}ch
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition"
            title={t("reporting.editor.zoomOut")}
          >
            <ZoomOut size={13} />
          </button>
          <button
            onClick={handleZoomReset}
            className="px-1.5 py-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-2xs font-mono transition min-w-[36px] text-center"
            title={t("reporting.editor.zoomReset")}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition"
            title={t("reporting.editor.zoomIn")}
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex justify-center
        bg-slate-100 bg-card">
        {template ? (
          <div
            className="relative"
            style={{
              width: paperWidth >= 48 ? "320px" : "220px",
              transform: `scale(${zoom})`,
              transformOrigin: zoom >= 1 ? "top center" : "top center",
              transition: "transform 0.15s ease",
            }}
          >
            <div className="h-3 bg-gradient-to-b from-slate-400 to-slate-500
              dark:from-slate-600 dark:to-slate-700 rounded-t-sm opacity-60" />

            {/* Logo önizlemesi */}
            {logoBlocks.map((block, i) => {
              const logoUrl = block.branch_id ? branchLogos[block.branch_id] : null
              if (block.hide_if_empty && !logoUrl) return null

              if (logoUrl) {
                return (
                  <div
                    key={i}
                    className={`flex ${block.align === "center" ? "justify-center" : block.align === "right" ? "justify-end" : "justify-start"} px-3 pt-3`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl}
                      alt={t("reporting.blockEditor.blockTypes.branchLogo")}
                      style={{
                        maxWidth: `${(block.width_px ?? 384) / 4}px`,
                        imageRendering: "pixelated",
                      }}
                      className="h-auto object-contain"
                    />
                  </div>
                )
              }
              return (
                <div key={i} className="px-3 pt-2 flex items-center gap-1.5 justify-center text-xs text-muted-foreground">
                  <ImageIcon size={14} />
                  <span>{t("reporting.blockEditor.blockTypes.branchLogo")}</span>
                </div>
              )
            })}

            <pre
              className="text-slate-900 px-3 py-3
                text-sub leading-[1.55] font-mono whitespace-pre overflow-x-hidden shadow-md"
              style={{ fontFamily: "'Courier New', Courier, monospace" }}
            >
              {text}
            </pre>

            <div
              className="h-4 bg-white"
              style={{
                maskImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='16'%3E%3Cpath d='M0 0 Q5 16 10 0 Q15 16 20 0 L20 16 L0 16Z' fill='white'/%3E%3C/svg%3E\")",
                maskRepeat: "repeat-x",
                maskSize: "20px 16px",
                WebkitMaskImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='16'%3E%3Cpath d='M0 0 Q5 16 10 0 Q15 16 20 0 L20 16 L0 16Z' fill='white'/%3E%3C/svg%3E\")",
                WebkitMaskRepeat: "repeat-x",
                WebkitMaskSize: "20px 16px",
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 h-full
            text-muted-foreground">
            <Printer size={36} />
            <p className="text-sm">{t("reporting.receiptPreview.selectTemplate")}</p>
          </div>
        )}
      </div>
    </div>
  )
}
