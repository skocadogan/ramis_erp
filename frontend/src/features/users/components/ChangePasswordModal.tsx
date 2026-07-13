"use client"

import { useState } from "react"
import { isAxiosError } from "axios"
import { authApi } from "@/features/admin/services/adminApi"
import { Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react"
import { useTranslations } from "next-intl"

const input = "w-full px-3 py-2 bg-slate-50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-muted border-input text-foreground"
const label = "text-sm font-medium text-foreground"

interface ChangePasswordModalProps {
  onClose: () => void
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const t = useTranslations("users.changePasswordSelf")
  const tForm = useTranslations("users.form")
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm_password: "" })
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const handleSubmit = async () => {
    setError("")
    setSuccess("")
    if (form.new_password !== form.confirm_password) { setError(t("passwordsMismatch")); return }
    if (form.new_password.length < 8) { setError(t("passwordMin")); return }

    setIsSubmitting(true)
    try {
      await authApi.changePassword({ current_password: form.current_password, new_password: form.new_password })
      setSuccess(t("success"))
      setForm({ current_password: "", new_password: "", confirm_password: "" })
      setTimeout(() => onClose(), 1500)
    } catch (e: unknown) {
      if (!isAxiosError(e)) {
        setError(t("failed"))
        return
      }
      const data = e.response?.data as { error?: string; errors?: { detail?: string }[] } | undefined
      if (data?.error) setError(data.error)
      else if (data?.errors) setError(data.errors.map((err) => err.detail ?? "").filter(Boolean).join(", "))
      else setError(t("failed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="rounded-lg border border-border w-full max-w-md shadow-lg bg-card border-border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pb-6 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>}
          {success && <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400">{success}</div>}

          <div>
            <label className={label}>{t("currentLabel")}</label>
            <div className="relative mt-1">
              <input type={showCurrent ? "text" : "password"} value={form.current_password}
                onChange={e => setForm({ ...form, current_password: e.target.value })} className={`${input} pr-10`} />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground">
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className={label}>{t("newLabel")}</label>
            <div className="relative mt-1">
              <input type={showNew ? "text" : "password"} value={form.new_password}
                onChange={e => setForm({ ...form, new_password: e.target.value })} className={`${input} pr-10`} placeholder={tForm("passwordPlaceholder")} />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground">
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className={label}>{t("repeatLabel")}</label>
            <input type="password" value={form.confirm_password} onChange={e => setForm({ ...form, confirm_password: e.target.value })}
              className={`${input} mt-1`} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md text-muted-foreground dark:hover:bg-slate-800">{t("cancel")}</button>
            <button onClick={handleSubmit} disabled={isSubmitting || !form.current_password || !form.new_password || !form.confirm_password}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50">
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              {isSubmitting ? t("submitting") : t("submit")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
