"use client"

import { useEffect, useState } from "react"
import { isAxiosError } from "axios"
import { useQueryClient } from "@tanstack/react-query"
import { authApi } from "@/features/admin/services/adminApi"
import type { UserProfile } from "@/types/user.types"
import { User, Mail, MapPin, Shield, Clock, Loader2, Save, KeyRound, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ChangePasswordModal } from "./ChangePasswordModal"
import { formatDate } from "@/lib/formatters"
import { useAuthStore } from "@/store/useAuthStore"
import { useTranslations } from "next-intl"
import { queryKeys } from "@/lib/queryKeys"

const input = "w-full mt-1 px-3 py-2 bg-slate-50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-muted border-input text-foreground"
const label = "text-sm font-medium text-foreground"

interface ProfileModalProps {
  onClose: () => void
}

export function ProfileModal({ onClose }: ProfileModalProps) {
  const t = useTranslations("users")
  const tSelf = useTranslations("users.profileSelf")
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "" })
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [showChangePassword, setShowChangePassword] = useState(false)

  useEffect(() => {
    authApi.getProfile().then(p => {
      setProfile(p)
      setForm({ email: p.email, first_name: p.first_name, last_name: p.last_name })
    }).catch(() => {
      setError(tSelf("loadErrorToast"))
    }).finally(() => setIsLoading(false))
  }, [tSelf])

  const handleSave = async () => {
    setError("")
    setSuccess("")
    setIsSaving(true)
    try {
      const updated = await authApi.updateProfile(form)
      setProfile(updated)
      setIsEditing(false)
      setSuccess(tSelf("updated"))
      const st = useAuthStore.getState()
      if (st.user && st.token) {
        st.setAuth(
          {
            ...st.user,
            first_name: updated.first_name,
            last_name: updated.last_name,
          },
          st.token
        )
      }
      // AuthGuard cache'ini invalidate et — sonraki navigasyonda güncel veriyi çek
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe })
      setTimeout(() => setSuccess(""), 3000)
    } catch (e: unknown) {
      setError(isAxiosError(e) ? (e.response?.data as { error?: string } | undefined)?.error || tSelf("updateFailed") : tSelf("updateFailed"))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="rounded-lg border border-border w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto bg-card border-border" onClick={e => e.stopPropagation()}>
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : !profile ? (
            <div className="p-6 text-center text-red-500 dark:text-red-400">{tSelf("loadErrorBanner")}</div>
          ) : (
            <>
              <div className="relative bg-slate-50 px-6 py-6 text-center rounded-t-lg border-b border-border bg-muted border-border">
                <button onClick={onClose}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-slate-600 hover:bg-slate-200 transition-all dark:hover:bg-slate-700 dark:hover:text-slate-200">
                  <X size={16} />
                </button>
                <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-semibold text-blue-700 mx-auto dark:bg-blue-900 dark:text-blue-300">
                  {profile.username.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-base font-semibold text-slate-900 mt-2 text-foreground">{profile.username}</h2>
                <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap">
                  {profile.role_names.map(r => (
                    <Badge key={r} variant="outline" className="text-xs border-slate-300 text-slate-600 border-input dark:text-muted-foreground">{r}</Badge>
                  ))}
                  {profile.is_superuser && (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">{tSelf("superuserBadge")}</Badge>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-4">
                {error && <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">{error}</div>}
                {success && <div className="bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400">{success}</div>}

                {isEditing ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={label}>{t("form.firstName")}</label>
                        <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className={input} />
                      </div>
                      <div>
                        <label className={label}>{t("form.lastName")}</label>
                        <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className={input} />
                      </div>
                    </div>
                    <div>
                      <label className={label}>{t("email")}</label>
                      <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={input} />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={handleSave} disabled={isSaving}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50">
                        <Save size={14} />{isSaving ? tSelf("saving") : tSelf("save")}
                      </button>
                      <button onClick={() => { setIsEditing(false); setForm({ email: profile.email, first_name: profile.first_name, last_name: profile.last_name }) }}
                        className="px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md text-muted-foreground dark:hover:bg-slate-800">
                        {tSelf("cancel")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InfoRow icon={User} label={t("name")} value={`${profile.first_name} ${profile.last_name}`.trim() || tSelf("detailDash")} />
                      <InfoRow icon={Mail} label={t("email")} value={profile.email} />
                      <InfoRow icon={MapPin} label={t("branch")} value={profile.branch_name || tSelf("detailDash")} />
                      <InfoRow icon={Shield} label={tSelf("statusLabel")} value={profile.is_active ? t("isActive") : t("isInactive")} />
                      <InfoRow icon={Clock} label={t("detail.dateJoined")} value={formatDate(profile.date_joined, { dateStyle: "short" })} />
                      <InfoRow icon={Clock} label={t("table.lastLogin")} value={profile.last_login ? formatDate(profile.last_login) : tSelf("detailDash")} />
                    </div>
                    <div className="flex gap-2 pt-4 border-t border-slate-100 border-border">
                      <button onClick={() => setIsEditing(true)}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md">
                        <User size={14} />{tSelf("edit")}
                      </button>
                      <button onClick={() => setShowChangePassword(true)}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-md text-muted-foreground dark:hover:bg-slate-800">
                        <KeyRound size={14} />{t("changePassword")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-muted-foreground mt-0.5 shrink-0 dark:text-muted-foreground" />
      <div>
        <div className="text-xs text-muted-foreground dark:text-muted-foreground">{label}</div>
        <div className="text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  )
}
