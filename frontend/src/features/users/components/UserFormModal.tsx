"use client"

import { useState, useMemo, useCallback } from "react"
import { useTranslations } from "next-intl"
import { isAxiosError } from "axios"
import { toast } from "sonner"
import { adminApi } from "@/features/admin/services/adminApi"
import type { User, Branch, Role, UserCreatePayload, UserUpdatePayload } from "@/types/user.types"
import { Eye, EyeOff, Loader2, KeyRound } from "lucide-react"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { useModulePermissions } from "@/hooks/useModulePermissions"

interface UserFormModalProps {
  user: User | null
  branches: Branch[]
  roles: Role[]
  onClose: () => void
  onSuccess: () => void
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

export function UserFormModal({ user, branches, roles, onClose, onSuccess }: UserFormModalProps) {
  const t = useTranslations("users")
  const tAdmin = useTranslations("admin")
  const isEdit = !!user
  const { canManage, isSuperuser } = useModulePermissions()
  const canResetOtherUserPassword = isSuperuser || canManage("users.manage_user")

  const initialRoleIds = useMemo(() => {
    if (!user?.role_names?.length) return []
    return roles.filter((r) => user.role_names.includes(r.name)).map((r) => r.id)
  }, [user, roles])

  const [form, setForm] = useState({
    username: user?.username || "",
    email: user?.email || "",
    password: "",
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    branch_id: user?.branch || "",
    role_ids: initialRoleIds,
    is_active: user?.is_active ?? true,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showResetPasswordFields, setShowResetPasswordFields] = useState(false)
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetPassword, setResetPassword] = useState("")
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("")
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fieldErrorClass = (field: string) =>
    cn(errors[field] && "border-destructive focus-visible:ring-destructive/20")
  const resetFieldErrorClass = (field: string) =>
    cn(resetErrors[field] && "border-destructive focus-visible:ring-destructive/20")

  const parseApiFieldErrors = useCallback((e: unknown): Record<string, string> => {
    if (!isAxiosError(e)) return { general: t("form.operationFailed") }
    const data = e.response?.data
    if (!data || typeof data !== "object") return { general: t("form.operationFailed") }
    const fieldErrors: Record<string, string> = {}
    Object.entries(data).forEach(([key, value]) => {
      if (key === "non_field_errors" || key === "detail") {
        fieldErrors.general = Array.isArray(value) ? String(value[0]) : String(value)
      } else if (key === "error") {
        fieldErrors.general = Array.isArray(value) ? value.join(" ") : String(value)
      } else if (key === "errors" && Array.isArray(value)) {
        value.forEach((err: { attr?: string; detail?: string }) => {
          if (err.attr && err.detail) fieldErrors[err.attr] = err.detail
        })
      } else {
        fieldErrors[key] = Array.isArray(value)
          ? value.length > 1
            ? value.join(" ")
            : String(value[0])
          : String(value)
      }
    })
    return fieldErrors
  }, [t])

  const handleSubmit = async () => {
    setErrors({})
    setIsSubmitting(true)
    try {
      if (isEdit && user) {
        const payload: UserUpdatePayload = {
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          branch_id: form.branch_id || null,
          is_active: form.is_active,
          role_ids: form.role_ids,
        }
        await adminApi.updateUser(user.id, payload)
      } else {
        const payload: UserCreatePayload = {
          username: form.username,
          email: form.email,
          password: form.password,
          first_name: form.first_name || undefined,
          last_name: form.last_name || undefined,
          branch_id: form.branch_id || null,
          role_ids: form.role_ids,
        }
        await adminApi.createUser(payload)
      }
      onSuccess()
    } catch (e: unknown) {
      if (!isAxiosError(e)) {
        setErrors({ general: t("form.operationFailed") })
        return
      }
      const data = e.response?.data
      if (data && typeof data === "object") {
        const fieldErrors: Record<string, string> = {}
        Object.entries(data).forEach(([key, value]) => {
          if (key === "non_field_errors" || key === "detail" || key === "error") {
            fieldErrors.general = Array.isArray(value) ? value[0] : String(value)
          } else if (key === "errors" && Array.isArray(value)) {
            value.forEach((err: { attr?: string; detail?: string }) => {
              if (err.attr && err.detail) fieldErrors[err.attr] = err.detail
            })
          } else {
            fieldErrors[key] = Array.isArray(value) ? value[0] : String(value)
          }
        })
        setErrors(fieldErrors)
      } else {
        setErrors({ general: t("form.operationFailed") })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleRole = (roleId: number) => {
    if (form.role_ids.includes(roleId)) {
      setForm({ ...form, role_ids: form.role_ids.filter((id) => id !== roleId) })
    } else {
      setForm({ ...form, role_ids: [...form.role_ids, roleId] })
    }
  }

  const handleResetPassword = async () => {
    if (!user) return
    setResetErrors({})
    const p = resetPassword.trim()
    const c = resetPasswordConfirm.trim()
    const local: Record<string, string> = {}
    if (p.length < 8) {
      local.reset_password = t("form.passwordMin8")
      setResetErrors(local)
      return
    }
    if (p !== c) {
      local.reset_password_confirm = t("form.passwordsMismatch")
      setResetErrors(local)
      return
    }

    setIsResettingPassword(true)
    try {
      await adminApi.resetPassword(user.id, p)
      toast.success(t("form.passwordUpdatedToast"))
      setResetPassword("")
      setResetPasswordConfirm("")
    } catch (e: unknown) {
      const fe = parseApiFieldErrors(e)
      setResetErrors(fe)
      if (fe.general) toast.error(fe.general)
    } finally {
      setIsResettingPassword(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent layout="scroll" size="5xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("form.editTitle") : t("addNew")}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("form.editDescription", { username: user?.username ?? "" })
              : t("form.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {errors.general && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.general}
            </div>
          )}

          <div className="mt-1 grid grid-cols-5 gap-6">
            <div className="col-span-3 space-y-5">
              {!isEdit && (
                <section>
                  <SectionTitle>{t("form.sectionAccount")}</SectionTitle>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <FieldLabel required>{t("username")}</FieldLabel>
                      <Input
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                        className={fieldErrorClass("username")}
                        placeholder={t("form.usernamePlaceholder")}
                        autoFocus
                      />
                      {errors.username && <FieldError>{errors.username}</FieldError>}
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel required>{t("form.password")}</FieldLabel>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                          className={cn("pr-10", fieldErrorClass("password"))}
                          placeholder={t("form.passwordPlaceholder")}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="absolute top-1/2 right-1 -translate-y-1/2"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? t("form.hidePasswordAria") : t("form.showPasswordAria")}
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </Button>
                      </div>
                      {errors.password && <FieldError>{errors.password}</FieldError>}
                    </div>
                  </div>
                </section>
              )}

              <section>
                <SectionTitle>{t("form.sectionPersonal")}</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <FieldLabel>{t("form.firstName")}</FieldLabel>
                    <Input
                      value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      className={fieldErrorClass("first_name")}
                      placeholder={t("form.firstNamePlaceholder")}
                      autoFocus={isEdit}
                    />
                    {errors.first_name && <FieldError>{errors.first_name}</FieldError>}
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel>{t("form.lastName")}</FieldLabel>
                    <Input
                      value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      className={fieldErrorClass("last_name")}
                      placeholder={t("form.lastNamePlaceholder")}
                    />
                    {errors.last_name && <FieldError>{errors.last_name}</FieldError>}
                  </div>
                </div>
                <div className="mt-3 grid gap-2">
                  <FieldLabel required>{t("email")}</FieldLabel>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={fieldErrorClass("email")}
                    placeholder={t("form.emailPlaceholder")}
                  />
                  {errors.email && <FieldError>{errors.email}</FieldError>}
                </div>
              </section>

              <section>
                <SectionTitle>{t("form.sectionAssignment")}</SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <FieldLabel>{t("branch")}</FieldLabel>
                    <select
                      value={form.branch_id}
                      onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                      className={cn(selectClass, fieldErrorClass("branch_id"))}
                    >
                      <option value="">{t("form.selectBranch")}</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    {errors.branch_id && <FieldError>{errors.branch_id}</FieldError>}
                  </div>
                  {isEdit && (
                    <div className="grid gap-2">
                      <FieldLabel>{tAdmin("common.status")}</FieldLabel>
                      <select
                        value={String(form.is_active)}
                        onChange={(e) =>
                          setForm({ ...form, is_active: e.target.value === "true" })
                        }
                        className={cn(selectClass, fieldErrorClass("is_active"))}
                      >
                        <option value="true">{tAdmin("common.active")}</option>
                        <option value="false">{tAdmin("common.passive")}</option>
                      </select>
                    </div>
                  )}
                </div>
              </section>

              {isEdit && canResetOtherUserPassword && (
                <section className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SectionTitle className="mb-1 flex items-center gap-2">
                        <KeyRound size={14} aria-hidden />
                        {t("form.resetPasswordSection")}
                      </SectionTitle>
                      <p className="text-sub leading-snug text-muted-foreground">
                        {t("form.resetPasswordHint")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto shrink-0 px-0"
                      onClick={() => {
                        setShowResetPasswordFields((v) => !v)
                        setResetErrors({})
                      }}
                    >
                      {showResetPasswordFields ? t("form.hideResetFields") : t("form.showResetFields")}
                    </Button>
                  </div>

                  {showResetPasswordFields && (
                    <>
                      {resetErrors.general && (
                        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                          {resetErrors.general}
                        </div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                          <FieldLabel required>{t("form.newPasswordLabel")}</FieldLabel>
                          <div className="relative">
                            <Input
                              type={showResetPw ? "text" : "password"}
                              autoComplete="new-password"
                              value={resetPassword}
                              onChange={(e) => setResetPassword(e.target.value)}
                              className={cn("pr-10", resetFieldErrorClass("reset_password"))}
                              placeholder={t("form.passwordPlaceholder")}
                              disabled={isResettingPassword}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="absolute top-1/2 right-1 -translate-y-1/2"
                              onClick={() => setShowResetPw(!showResetPw)}
                              aria-label={
                                showResetPw ? t("form.hidePasswordAria") : t("form.showPasswordAria")
                              }
                              disabled={isResettingPassword}
                            >
                              {showResetPw ? <EyeOff size={15} /> : <Eye size={15} />}
                            </Button>
                          </div>
                          {resetErrors.reset_password && (
                            <FieldError>{resetErrors.reset_password}</FieldError>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <FieldLabel required>{t("form.newPasswordRepeatLabel")}</FieldLabel>
                          <Input
                            type={showResetPw ? "text" : "password"}
                            autoComplete="new-password"
                            value={resetPasswordConfirm}
                            onChange={(e) => setResetPasswordConfirm(e.target.value)}
                            className={resetFieldErrorClass("reset_password_confirm")}
                            placeholder={t("form.placeholderRepeat")}
                            disabled={isResettingPassword}
                          />
                          {resetErrors.reset_password_confirm && (
                            <FieldError>{resetErrors.reset_password_confirm}</FieldError>
                          )}
                        </div>
                      </div>
                      <div className="mt-3">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleResetPassword()}
                          disabled={
                            isResettingPassword ||
                            resetPassword.trim().length < 8 ||
                            resetPassword !== resetPasswordConfirm
                          }
                        >
                          {isResettingPassword && (
                            <Loader2 size={14} className="animate-spin" aria-hidden />
                          )}
                          {isResettingPassword ? t("form.resetting") : t("form.resetPasswordSubmit")}
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              )}
            </div>

            <div className="col-span-2">
              <section>
                <div className="mb-2.5 flex items-center justify-between">
                  <SectionTitle className="mb-0">{t("form.sectionRoles")}</SectionTitle>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-sub font-medium text-muted-foreground">
                    {t("form.rolesSelectedCount", { count: form.role_ids.length })}
                  </span>
                </div>
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {roles.map((role) => {
                    const isSelected = form.role_ids.includes(role.id)
                    const roleFieldId = `role-${role.id}`
                    return (
                      <label
                        key={role.id}
                        htmlFor={roleFieldId}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:bg-accent"
                        )}
                      >
                        <Checkbox
                          id={roleFieldId}
                          checked={isSelected}
                          onCheckedChange={() => toggleRole(role.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block text-sm font-medium leading-tight text-foreground">
                            {role.name}
                          </span>
                          {role.description && (
                            <span className="mt-0.5 block text-sub leading-snug text-muted-foreground">
                              {role.description}
                            </span>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              </section>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tAdmin("common.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting
              ? tAdmin("common.saving")
              : isEdit
                ? tAdmin("common.update")
                : tAdmin("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h4
      className={cn(
        "mb-3 text-sub font-semibold tracking-widertext-muted-foreground",
        className
      )}
    >
      {children}
    </h4>
  )
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <Label className="text-xs font-medium text-muted-foreground">
      {children}
      {required && <span className="text-destructive">*</span>}
    </Label>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-sub text-destructive">{children}</p>
}
