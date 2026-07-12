"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { AppShell } from "@/components/shell/AppShell"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { useModulePermissions } from "@/hooks/useModulePermissions"
import { useAllergens } from "@/features/allergens/hooks/useAllergens"
import { AllergensTable } from "@/features/allergens/components/AllergensTable"
import { AllergenFormModal } from "@/features/allergens/components/AllergenFormModal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

function AllergensPageContent() {
  const t = useTranslations("allergens")
  const { canManage } = useModulePermissions()
  const canManageAllergens = canManage("inventory.manage_allergen")
  const [toast, setToast] = useState<{ msg: string; type?: "success" | "error" } | null>(null)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3000)
  }

  const actions = useAllergens(showToast)

  return (
    <AppShell>
      <div className="flex h-full flex-col overflow-hidden p-6 gap-4 dark:bg-slate-950">
        

        {/* Table with search, filters, pagination, sort */}
        <div className="flex-1 min-h-0">
          <AllergensTable
            allergens={actions.allergens}
            totalCount={actions.totalCount}
            canManage={canManageAllergens}
            search={actions.search}
            onSearchChange={actions.setSearch}
            sortField={actions.sortField}
            sortDir={actions.sortDir}
            onToggleSort={actions.toggleSort}
            filterActive={actions.filterActive}
            onFilterActiveChange={actions.setFilterActive}
            isLoading={actions.isLoading}
            fetchNextPage={actions.fetchNextPage}
            hasNextPage={actions.hasNextPage}
            isFetchingNextPage={actions.isFetchingNextPage}
            onNew={canManageAllergens ? actions.openCreate : undefined}
            onEdit={canManageAllergens ? actions.openEdit : undefined}
            onDelete={canManageAllergens ? actions.setDeleteId : undefined}
          />
        </div>

        {canManageAllergens && (
          <AllergenFormModal
            open={actions.showForm}
            onClose={() => actions.setShowForm(false)}
            editingId={actions.editingId}
            formData={actions.formData}
            setFormData={actions.setFormData}
            isSubmitting={actions.isSubmitting}
            onSubmit={actions.handleSubmit}
          />
        )}

        <AlertDialog
          open={!!actions.deleteId}
          onOpenChange={(open) => { if (!open) actions.setDeleteId(null) }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("page.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("page.deleteDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actions.isSubmitting}>{t("page.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault()
                  void actions.confirmDelete()
                }}
                disabled={actions.isSubmitting}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {actions.isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {t("page.confirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {toast && (
          <div
            className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-2 text-sm font-ui-medium text-white shadow-lg ${
              toast.type === "error" ? "bg-rose-600" : "bg-emerald-600"
            }`}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </AppShell>
  )
}

export default function AllergensPage() {
  return (
    <AuthGuard module="allergens">
      <AllergensPageContent />
    </AuthGuard>
  )
}
