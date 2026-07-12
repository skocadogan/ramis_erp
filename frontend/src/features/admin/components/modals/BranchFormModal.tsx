"use client"

import type { Dispatch, ReactNode, SetStateAction } from "react"
import { useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
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

export type BranchFormState = {
  name: string
  code: string
  phone: string
  email: string
  website: string
  address: string
  tax_office: string
  tax_number: string
  registry_no: string
  mersis_no: string
}

export const initialBranchForm: BranchFormState = {
  name: "",
  code: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  tax_office: "",
  tax_number: "",
  registry_no: "",
  mersis_no: "",
}

interface BranchFormModalProps {
  branchForm: BranchFormState
  setBranchForm: Dispatch<SetStateAction<BranchFormState>>
  isSubmitting: boolean
  onSubmit: () => void
  onClose: () => void
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function BranchFormModal({
  branchForm,
  setBranchForm,
  isSubmitting,
  onSubmit,
  onClose,
}: BranchFormModalProps) {
  const t = useTranslations("branches")
  const tAdmin = useTranslations("admin")

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent layout="scroll" size="4xl">
        <DialogHeader>
          <DialogTitle>{t("addNew")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            <div className="space-y-4">
              <FormField label={t("name")}>
                <Input
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  placeholder={t("formModal.namePlaceholder")}
                />
              </FormField>
              <FormField label={t("code")}>
                <Input
                  value={branchForm.code}
                  onChange={(e) =>
                    setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })
                  }
                  className="font-mono"
                  placeholder={t("formModal.codePlaceholder")}
                />
              </FormField>
              <FormField label={t("phone")}>
                <Input
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  placeholder={t("formModal.phonePlaceholder")}
                />
              </FormField>
              <FormField label={t("email")}>
                <Input
                  type="email"
                  value={branchForm.email}
                  onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                  placeholder={t("editModal.emailPlaceholder")}
                />
              </FormField>
              <FormField label={t("website")}>
                <Input
                  type="url"
                  value={branchForm.website}
                  onChange={(e) => setBranchForm({ ...branchForm, website: e.target.value })}
                  placeholder={t("editModal.websitePlaceholder")}
                />
              </FormField>
              <FormField label={t("address")}>
                <Textarea
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  rows={2}
                  placeholder={t("formModal.addressPlaceholder")}
                  className="min-h-0 resize-none"
                />
              </FormField>
            </div>
            <div className="space-y-4">
              <FormField label={t("taxOffice")}>
                <Input
                  value={branchForm.tax_office}
                  onChange={(e) => setBranchForm({ ...branchForm, tax_office: e.target.value })}
                  placeholder={t("editModal.taxOfficePlaceholder")}
                />
              </FormField>
              <FormField label={t("taxNumber")}>
                <Input
                  value={branchForm.tax_number}
                  onChange={(e) => setBranchForm({ ...branchForm, tax_number: e.target.value })}
                  placeholder={t("editModal.taxNumberPlaceholder")}
                />
              </FormField>
              <FormField label={t("registryNo")}>
                <Input
                  value={branchForm.registry_no}
                  onChange={(e) => setBranchForm({ ...branchForm, registry_no: e.target.value })}
                  placeholder={t("editModal.registryNoPlaceholder")}
                />
              </FormField>
              <FormField label={t("mersisNo")}>
                <Input
                  value={branchForm.mersis_no}
                  onChange={(e) => setBranchForm({ ...branchForm, mersis_no: e.target.value })}
                  placeholder={t("editModal.mersisNoPlaceholder")}
                />
              </FormField>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tAdmin("common.cancel")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? tAdmin("common.saving") : tAdmin("common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
