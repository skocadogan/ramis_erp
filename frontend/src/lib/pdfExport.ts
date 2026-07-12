"use client"

import api from "@/lib/api"

export interface AsyncPdfResult {
  task_id: string
  cache_key: string
  status: "processing" | "completed" | "failed" | "not_found" | "error"
  download_url?: string
  filename?: string
  size_bytes?: number
  error?: string
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_TIME_MS = 600_000
const POLL_ENDPOINT = "/reporting/module-reports/export-status/"

export async function fetchAsyncPdf(options: {
  reportSlug: string
  params?: Record<string, unknown>
  format?: string
  onProgress?: (status: string) => void
}): Promise<AsyncPdfResult> {
  const { reportSlug, params = {}, format = "pdf", onProgress } = options

  onProgress?.("processing")
  const { data: initData } = await api.post<{
    task_id: string
    cache_key: string
    status: string
  }>(
    `/reporting/module-reports/${reportSlug}/generate/`,
    { params, format },
    { params: { async: "true" } }
  )

  if (!initData.cache_key) {
    return { task_id: "", cache_key: "", status: "error", error: "No cache key" }
  }

  const startTime = Date.now()

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    try {
      const { data: statusData } = await api.get<AsyncPdfResult>(POLL_ENDPOINT, {
        params: { cache_key: initData.cache_key },
      })

      if (statusData.status === "completed" || statusData.status === "failed") {
        return { ...statusData, task_id: initData.task_id, cache_key: initData.cache_key }
      }

      if (statusData.status === "not_found") {
        return {
          task_id: initData.task_id,
          cache_key: initData.cache_key,
          status: "error",
          error: "PDF export expired. Please try again.",
        }
      }

      onProgress?.("processing")
    } catch {
      // Network error during polling — continue
    }
  }

  return {
    task_id: initData.task_id,
    cache_key: initData.cache_key,
    status: "error",
    error: "PDF generation timed out. Please try again.",
  }
}

export function downloadBlob(url: string, filename: string) {
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
}
