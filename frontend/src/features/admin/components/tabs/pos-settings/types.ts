export interface PosTerminal {
  id: string
  branch: string
  code: string
  name: string
  sort_order: number
  is_active: boolean
  fiscal_type: string
  fiscal_settings: Record<string, unknown>
  fiscal_webhook_url?: string | null
  created_at: string
  updated_at: string
}

export function readFiscalSettingString(
  settings: Record<string, unknown>,
  key: string,
  fallback = "",
): string {
  const value = settings[key]
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return fallback
}

export function readFiscalSettingNumber(
  settings: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = settings[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export interface DisplaySettings {
  id: number | string
  branch?: string
  /** Boş: şube varsayılanı; dolu: bu POS terminaline özel müşteri ekranı ayarı */
  pos_terminal?: string | null
  idle_timeout: number
  transition_speed: number
  show_clock: boolean
  welcome_title: string
  welcome_subtitle: string
  order_success_title: string
  order_success_subtitle: string
  payment_success_title: string
  payment_success_subtitle: string
  success_message_duration: number
}

export interface PromotionSlide {
  id: number | string
  type: "IMAGE" | "TEXT"
  title: string
  sub_title: string
  description: string
  image: string
  order: number
  is_active: boolean
  duration: number
  /** Boş: tüm kasalar; dolu: yalnızca bu terminale bağlı müşteri ekranı */
  pos_terminal?: string | null
}
