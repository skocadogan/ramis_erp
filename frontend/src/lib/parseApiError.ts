import { isAxiosError } from "axios"

/** Axios/DRF hata gövdesinden kullanıcıya gösterilecek metin (detail, error, alan hataları). */
export function parseApiError(e: unknown): string {
  if (isAxiosError(e)) {
    const d = e.response?.data
    if (d && typeof d === "object") {
      const rec = d as Record<string, unknown>
      if (typeof rec.error === "string" && rec.error.trim()) return rec.error
      if (rec.detail !== undefined) {
        const det = rec.detail
        if (typeof det === "string") return det
        if (Array.isArray(det)) return det.map((x) => String(x)).join(" ")
      }
      const parts: string[] = []
      for (const [k, v] of Object.entries(rec)) {
        if (k === "detail" || k === "error") continue
        if (Array.isArray(v)) parts.push(`${k}: ${v.map((x) => String(x)).join(", ")}`)
        else if (typeof v === "object" && v !== null) parts.push(`${k}: ${JSON.stringify(v)}`)
        else parts.push(`${k}: ${String(v)}`)
      }
      if (parts.length) return parts.join(" · ")
    }
    if (e.response?.status) return `İstek başarısız (${e.response.status})`
  }
  return e instanceof Error ? e.message : "İşlem başarısız."
}
