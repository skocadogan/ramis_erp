"use client"

import { useState, useMemo, useRef, type ChangeEvent, type ReactNode } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Loader2, Upload, Image as ImageIcon, X } from "lucide-react"
import { isAxiosError } from "axios"
import api from "@/lib/api"
import type { Branch } from "@/types/user.types"
import { useDirtyFormWarning } from "@/hooks/useDirtyFormWarning"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

interface BranchEditModalProps {
  branch: Branch
  onClose: () => void
  onSuccess: () => void
}

function FormField({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function BranchEditModal({ branch, onClose, onSuccess }: BranchEditModalProps) {
  const t = useTranslations("branches")
  const tAdmin = useTranslations("admin")
  const [form, setForm] = useState({
    name: branch.name,
    code: branch.code,
    phone: branch.phone || "",
    email: branch.email || "",
    website: branch.website || "",
    address: branch.address || "",
    tax_office: branch.tax_office || "",
    tax_number: branch.tax_number || "",
    registry_no: branch.registry_no || "",
    mersis_no: branch.mersis_no || "",
    current_month_target: branch.current_month_target || 0,
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDirty = useMemo(
    () =>
      form.name !== branch.name ||
      form.code !== branch.code ||
      form.phone !== (branch.phone || "") ||
      form.email !== (branch.email || "") ||
      form.website !== (branch.website || "") ||
      form.address !== (branch.address || "") ||
      form.tax_office !== (branch.tax_office || "") ||
      form.tax_number !== (branch.tax_number || "") ||
      form.registry_no !== (branch.registry_no || "") ||
      form.mersis_no !== (branch.mersis_no || "") ||
      form.current_month_target !== (branch.current_month_target || 0) ||
      !!logoFile,
    [form, branch, logoFile]
  )

  useDirtyFormWarning(isDirty)

  const fieldErrorClass = (field: string) =>
    cn(errors[field] && "border-destructive focus-visible:ring-destructive/20")

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveLogo = () => {
    setLogoFile(null)
    setLogoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSubmit = async () => {
    setErrors({})
    if (!form.name.trim()) {
      setErrors({ name: t("editModal.validationNameRequired") })
      return
    }
    if (!form.code.trim()) {
      setErrors({ code: t("editModal.validationCodeRequired") })
      return
    }
    setIsSubmitting(true)
    try {
      const hasFile = !!logoFile
      let payload: FormData | Record<string, unknown>

      if (hasFile) {
        const fd = new FormData()
        fd.append("name", form.name.trim())
        fd.append("code", form.code.trim().toUpperCase())
        fd.append("phone", form.phone.trim() || "")
        fd.append("email", form.email.trim() || "")
        fd.append("website", form.website.trim() || "")
        fd.append("address", form.address.trim() || "")
        fd.append("tax_office", form.tax_office.trim() || "")
        fd.append("tax_number", form.tax_number.trim() || "")
        fd.append("registry_no", form.registry_no.trim() || "")
        fd.append("mersis_no", form.mersis_no.trim() || "")
        fd.append("current_month_target", String(Number(form.current_month_target) || 0))
        fd.append("logo", logoFile)
        payload = fd
      } else {
        payload = {
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          website: form.website.trim() || null,
          address: form.address.trim() || null,
          tax_office: form.tax_office.trim() || null,
          tax_number: form.tax_number.trim() || null,
          registry_no: form.registry_no.trim() || null,
          mersis_no: form.mersis_no.trim() || null,
          current_month_target: Number(form.current_month_target) || 0,
        }
      }

      await api.patch(`/branches/${branch.id}/`, payload, {
        headers: hasFile ? { "Content-Type": "multipart/form-data" } : undefined,
      })
      onSuccess()
    } catch (e: unknown) {
      if (!isAxiosError(e)) {
        setErrors({ general: t("editModal.updateFailed") })
        return
      }
      const data = e.response?.data
      if (data && typeof data === "object") {
        const fe: Record<string, string> = {}
        for (const [key, val] of Object.entries(data))
          fe[key] = Array.isArray(val) ? val.join(", ") : String(val)
        setErrors(fe)
      } else {
        setErrors({ general: t("editModal.updateFailed") })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      disablePointerDismissal={isDirty}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent layout="scroll" size="6xl">
        <DialogHeader>
          <DialogTitle>{t("editModal.title")}</DialogTitle>
          <DialogDescription>
            {t("editModal.subtitle", { branchName: branch.name })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {errors.general && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.general}
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>{t("logo")}</Label>
                <div className="flex items-start gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted">
                    {logoPreview || branch.logo ? (
                      <Image
                        src={logoPreview || branch.logo || ""}
                        alt={t("logo")}
                        width={96}
                        height={96}
                        unoptimized
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <ImageIcon size={28} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      {logoFile ? t("editModal.changeLogo") : t("editModal.uploadLogo")}
                    </Button>
                    {(logoPreview || branch.logo) && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveLogo}
                        className="text-destructive hover:text-destructive"
                      >
                        <X size={14} />
                        {t("editModal.removeLogo")}
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                  </div>
                </div>
              </div>

              <FormField label={t("name")} required error={errors.name}>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={fieldErrorClass("name")}
                  placeholder={t("formModal.namePlaceholder")}
                />
              </FormField>

              <FormField label={t("code")} required error={errors.code}>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className={cn("font-mono", fieldErrorClass("code"))}
                  placeholder={t("formModal.codePlaceholder")}
                />
              </FormField>

              <FormField label={t("phone")}>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder={t("formModal.phonePlaceholder")}
                />
              </FormField>

              <FormField label={t("email")}>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder={t("editModal.emailPlaceholder")}
                />
              </FormField>

              <FormField label={t("website")}>
                <Input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder={t("editModal.websitePlaceholder")}
                />
              </FormField>

              <FormField label={t("address")}>
                <Textarea
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  rows={3}
                  placeholder={t("formModal.addressPlaceholder")}
                  className="min-h-0 resize-none"
                />
              </FormField>
            </div>

            <div className="space-y-4">
              <FormField label={t("taxOffice")}>
                <Input
                  value={form.tax_office}
                  onChange={(e) => setForm({ ...form, tax_office: e.target.value })}
                  placeholder={t("editModal.taxOfficePlaceholder")}
                />
              </FormField>

              <FormField label={t("taxNumber")}>
                <Input
                  value={form.tax_number}
                  onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                  placeholder={t("editModal.taxNumberPlaceholder")}
                />
              </FormField>

              <FormField label={t("registryNo")}>
                <Input
                  value={form.registry_no}
                  onChange={(e) => setForm({ ...form, registry_no: e.target.value })}
                  placeholder={t("editModal.registryNoPlaceholder")}
                />
              </FormField>

              <FormField label={t("mersisNo")}>
                <Input
                  value={form.mersis_no}
                  onChange={(e) => setForm({ ...form, mersis_no: e.target.value })}
                  placeholder={t("editModal.mersisNoPlaceholder")}
                />
              </FormField>

              <div className="space-y-2 border-t border-border pt-2">
                <Label className="text-primary">{t("editModal.monthlyTargetLabel")}</Label>
                <Input
                  type="number"
                  value={form.current_month_target}
                  onChange={(e) =>
                    setForm({ ...form, current_month_target: Number(e.target.value) })
                  }
                  placeholder={t("editModal.monthlyTargetPlaceholder")}
                />
                <p className="text-2xs text-muted-foreground">{t("editModal.monthlyTargetHint")}</p>
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tAdmin("common.cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? tAdmin("common.saving") : tAdmin("common.update")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
