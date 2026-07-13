"use client"

import React, { useState, useMemo, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { AppShell } from "@/components/shell/AppShell"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Plus, Info } from "lucide-react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { BranchSelect } from "@/features/branches/components/BranchSelect"
import ProductSelect from "@/features/menu/components/ProductSelect"
import { useMenuData } from "@/features/menu/hooks/useMenuData"
import { toast } from "sonner"
import { toastApiError } from "@/lib/operationalToast"
import {
  usePlansInfinite,
  useDeletePlan,
  useApprovePlan,
  useCreatePlan,
  useUpdatePlan,
  useApplyForecast,
  useCopyPlan,
  useAvailabilitiesInfinite,
  useCreateAvailability,
  useUpdateAvailability,
  useDeleteAvailability,
} from "@/features/production-planning/hooks/useProductionPlanning"
import { PlansList } from "@/features/production-planning/components/PlansList"
import { PlanFormModal } from "@/features/production-planning/components/PlanFormModal"
import { MrpDetailModal } from "@/features/production-planning/components/MrpDetailModal"
import { ApproximateCostModal } from "@/features/production-planning/components/ApproximateCostModal"
import { ForecastModal } from "@/features/production-planning/components/ForecastModal"
import { CopyPlanModal } from "@/features/production-planning/components/CopyPlanModal"
import { AvailabilityList } from "@/features/production-planning/components/AvailabilityList"
import { AvailabilityFormModal } from "@/features/production-planning/components/AvailabilityFormModal"
import { SingleAvailabilityModal } from "@/features/production-planning/components/SingleAvailabilityModal"
import { SettingsPanel } from "@/features/production-planning/components/SettingsPanel"
import CreatePrepTasksModal from "@/features/production-planning/components/CreatePrepTasksModal"
import { useBranchStaff } from "@/features/production-planning/hooks/useBranchStaff"
import { ProductionPlan, ProductDayAvailability } from "@/features/production-planning/types"
import { PRODUCTION_TAB_META, type ProductionTabKey } from "@/config/moduleNav/productionNavConfig"

type DeleteConfirmState = {
  kind: "plan" | "availability"
  id: string
  title: string
  description: string
}

export default function ProductionPlanningPage() {
  return (
    <AuthGuard module="production_planning" mode="manage">
      <ProductionPlanningContent />
    </AuthGuard>
  )
}

function ProductionPlanningContent() {
  const t = useTranslations("production")
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<ProductionTabKey>("plans")
  const [infoModal, setInfoModal] = useState({ isOpen: false, title: "", content: "" })

  useEffect(() => {
    const tab = searchParams.get("tab")
    const valid = PRODUCTION_TAB_META.some((m) => m.key === tab)
    if (valid && tab) {
      setActiveTab(tab as ProductionTabKey)
    }
  }, [searchParams])

  // Modal states
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ProductionPlan | null>(null)
  const [showMrpModal, setShowMrpModal] = useState(false)
  const [mrpPlan, setMrpPlan] = useState<ProductionPlan | null>(null)
  const [showApproxCostModal, setShowApproxCostModal] = useState(false)
  const [approxCostPlan, setApproxCostPlan] = useState<ProductionPlan | null>(null)
  const [showForecastModal, setShowForecastModal] = useState(false)
  const [forecastPlan, setForecastPlan] = useState<ProductionPlan | null>(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copySourcePlan, setCopySourcePlan] = useState<ProductionPlan | null>(null)

  // Availability Modal states
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false)
  const [editingAvailability, setEditingAvailability] = useState<ProductDayAvailability | null>(null)
  const [availFilters, setAvailFilters] = useState({
    branch_id: "",
    date: "",
    product_id: ""
  })
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)

  // Mutfak görevi oluşturma akışı
  const [approvedPlanForTasks, setApprovedPlanForTasks] = useState<ProductionPlan | null>(null)
  const [showCreateTasksDialog, setShowCreateTasksDialog] = useState(false)
  const [showCreateTasksModal, setShowCreateTasksModal] = useState(false)
  const { data: staffList = [] } = useBranchStaff(approvedPlanForTasks?.branch)

  // Data hooks — sayfalanmış API + infinite scroll
  const {
    data: plansPages,
    isLoading: plansLoading,
    fetchNextPage: fetchNextPlans,
    hasNextPage: hasNextPlans,
    isFetchingNextPage: isFetchingNextPlans,
  } = usePlansInfinite(undefined, { enabled: activeTab === "plans" })
  const plans = useMemo(
    () => plansPages?.pages.flatMap((p) => p.results) ?? [],
    [plansPages]
  )

  const {
    data: availPages,
    isLoading: availLoading,
    fetchNextPage: fetchNextAvails,
    hasNextPage: hasNextAvails,
    isFetchingNextPage: isFetchingNextAvails,
  } = useAvailabilitiesInfinite(availFilters, { enabled: activeTab === "availability" })
  const availabilities = useMemo(
    () => availPages?.pages.flatMap((p) => p.results) ?? [],
    [availPages]
  )
  const { products } = useMenuData()

  // Mutations
  const { mutate: deletePlan } = useDeletePlan()
  const { mutate: approvePlan } = useApprovePlan()
  const { mutate: createPlan, isPending: isCreating } = useCreatePlan()
  const { mutate: updatePlan, isPending: isUpdating } = useUpdatePlan()
  const { mutate: applyForecast, isPending: isApplyingForecast } = useApplyForecast()
  const { mutate: copyPlan, isPending: isCopyingPlan } = useCopyPlan()

  const { mutate: createAvailability, isPending: isCreatingAvail } = useCreateAvailability()
  const { isPending: isUpdatingAvail } = useUpdateAvailability()
  const { mutate: deleteAvailability } = useDeleteAvailability()

  const productionPlanTabInfo = t("page.info.plans")
  const availabilityTabInfo = t("page.info.availability")
  const productionSettingsInfo = t("page.info.settings")

  return (
    <AppShell>
      <div className="flex h-full flex-col bg-background overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProductionTabKey)} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Top Tab Navigation */}
          <div className="flex items-center justify-between border-b border-border px-4 bg-card border-border shrink-0">
            <div className="flex items-center gap-1">
              {([
                { value: 'plans' as const, label: t("page.tabs.plans"), info: productionPlanTabInfo },
                { value: 'availability' as const, label: t("page.tabs.availability"), info: availabilityTabInfo },
                { value: 'settings' as const, label: t("page.tabs.settings"), info: productionSettingsInfo },
              ]).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
 ${activeTab === tab.value
 ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
 : 'border-transparent text-muted-foreground hover: hover: dark:text-muted-foreground dark:hover:'
 }`}
                >
                  {tab.label}
                  {tab.info && (
                    <Info
                      className="h-3.5 w-3.5 opacity-50 hover:opacity-100 hover:text-blue-500 transition-all cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoModal({ isOpen: true, title: tab.label, content: tab.info || "" })
                      }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-2">
              {activeTab === 'plans' && (

                <Button size="sm" onClick={() => { setEditingPlan(null); setShowPlanForm(true) }} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="h-4 w-4" /> {t("page.newPlan")}
                </Button>
              )}
              {activeTab === 'availability' && (
                <Button size="sm" onClick={() => { setEditingAvailability(null); setShowAvailabilityForm(true) }} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
                  <Plus className="h-4 w-4" /> {t("page.addAvailability")}
                </Button>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background p-6">
            <TabsContent value="plans" className="m-0 border-none outline-none flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-card shadow-sm ring-1 rounded-lg p-0">

              <PlansList
                plans={plans}
                isLoading={plansLoading}
                hasNextPage={hasNextPlans}
                onLoadMore={fetchNextPlans}
                isFetchingNextPage={isFetchingNextPlans}
                onEdit={(plan) => { setEditingPlan(plan); setShowPlanForm(true) }}
                onApprove={(id) => approvePlan(id, {
                  onSuccess: (data: { data?: ProductionPlan }) => {
                    toast.success(t("page.toast.planApproved"))
                    // Plan detayını kaydet, dialog'u göster
                    setApprovedPlanForTasks(data.data || {
                      id,
                      branch: "",
                      plan_date: "",
                      status: "APPROVED",
                      source: "MANUAL",
                      notes: "",
                      created_at: "",
                      updated_at: "",
                      lines: []
                    })
                    setShowCreateTasksDialog(true)
                  },
                  onError: (err) => toastApiError(err, t("page.toast.planApproveError"))
                })}
                onDelete={(plan) => {
                  const dateLabel = plan.plan_date
                    ? format(new Date(plan.plan_date), "dd.MM.yyyy")
                    : t("page.emDash")
                  setDeleteConfirm({
                    kind: "plan",
                    id: plan.id,
                    title: t("page.deletePlan.title"),
                    description: t("page.deletePlan.description", {
                      date: dateLabel,
                      branch: plan.branch_name || t("page.defaultBranch"),
                    }),
                  })
                }}
                onViewMrp={(plan) => { setMrpPlan(plan); setShowMrpModal(true) }}
                onViewApproximateCost={(plan) => { setApproxCostPlan(plan); setShowApproxCostModal(true) }}
                onApplyForecast={(plan) => { setForecastPlan(plan); setShowForecastModal(true) }}
                onCopy={(plan) => { setCopySourcePlan(plan); setShowCopyModal(true) }}
              />
            </TabsContent>

            <TabsContent value="availability" className="m-0 border-none outline-none flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-card shadow-sm ring-1 rounded-lg p-0">
              <div className="shrink-0 p-4 border-b border-border flex flex-wrap items-center gap-4 /50 bg-muted/20">
                <div className="w-48">
                  <Label className="text-2xs tracking-widertext-muted-foreground mb-1 block">{t("page.filters.branch")}</Label>
                  <BranchSelect
                    value={availFilters.branch_id}
                    onChange={(val) => setAvailFilters(prev => ({ ...prev, branch_id: val }))}
                  />
                </div>
                <div className="w-40">
                  <Label className="text-2xs tracking-widertext-muted-foreground mb-1 block">{t("page.filters.date")}</Label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={availFilters.date}
                    onChange={(e) => setAvailFilters(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div className="w-64">
                  <Label className="text-2xs tracking-widertext-muted-foreground mb-1 block">{t("page.filters.product")}</Label>
                  <ProductSelect
                    value={availFilters.product_id}
                    allProducts={products}
                    onSelect={(val) => setAvailFilters(prev => ({ ...prev, product_id: val }))}
                    triggerClassName="h-9 text-xs"
                  />
                </div>
                <div className="flex items-end self-stretch pb-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 text-xs text-muted-foreground hover:"
                    onClick={() => setAvailFilters({ branch_id: "", date: "", product_id: "" })}
                  >
                    {t("page.filters.clear")}
                  </Button>
                </div>
              </div>

              <AvailabilityList
                availabilities={availabilities}
                isLoading={availLoading}
                hasNextPage={hasNextAvails}
                onLoadMore={fetchNextAvails}
                isFetchingNextPage={isFetchingNextAvails}
                onEdit={(item) => { setEditingAvailability(item); setShowAvailabilityForm(true) }}
                onDelete={(item) => {
                  const dateLabel = item.effective_date
                    ? format(new Date(item.effective_date), "dd.MM.yyyy")
                    : t("page.emDash")
                  setDeleteConfirm({
                    kind: "availability",
                    id: item.id,
                    title: t("page.deleteAvailability.title"),
                    description: t("page.deleteAvailability.description", {
                      product: item.product_name || t("page.productFallback"),
                      date: dateLabel,
                    }),
                  })
                }}
              />
            </TabsContent>

            <TabsContent value="settings" className="m-0 border-none outline-none flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden bg-card shadow-sm ring-1 rounded-lg p-0">
              <SettingsPanel />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <PlanFormModal
        isOpen={showPlanForm}
        onClose={() => setShowPlanForm(false)}
        initialData={editingPlan}
        isSubmitting={isCreating || isUpdating}
        onSave={(data) => {
          if (editingPlan) {
            updatePlan(
              { id: editingPlan.id, data },
              {
                onSuccess: () => {
                  toast.success(t("page.toast.planUpdated"))
                  setShowPlanForm(false)
                },
                onError: (err) => toastApiError(err, t("page.toast.planUpdateError"))
              }
            )
          } else {
            createPlan(data, {
              onSuccess: (response: { data?: ProductionPlan & { upsert_action?: string } } & { upsert_action?: string }) => {
                const planData = (response?.data || response) as unknown as ProductionPlan
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const action = (planData as any)?.upsert_action

                setShowPlanForm(false)

                if (action === 'updated') {
                  // Çakışma → mevcut plan güncellendi + availability sync yapıldı
                  toast.success(t("page.toast.planUpdated"))
                  // Mutfak görevi oluşturma akışını başlat
                  setApprovedPlanForTasks(planData)
                  setShowCreateTasksDialog(true)
                } else {
                  toast.success(t("page.toast.planCreated"))
                }
              },
              onError: (err) => toastApiError(err, t("page.toast.planCreateError"))
            })
          }
        }}
      />

      <MrpDetailModal
        isOpen={showMrpModal}
        onClose={() => setShowMrpModal(false)}
        plan={mrpPlan}
      />

      <ApproximateCostModal
        isOpen={showApproxCostModal}
        onClose={() => setShowApproxCostModal(false)}
        plan={approxCostPlan}
      />

      <ForecastModal
        isOpen={showForecastModal}
        onClose={() => setShowForecastModal(false)}
        defaultTargetDate={forecastPlan?.plan_date || new Date().toISOString().split('T')[0]}
        isSubmitting={isApplyingForecast}
        planId={forecastPlan?.id}
        onApply={(data) => {
          if (forecastPlan) {
            applyForecast(
              { id: forecastPlan.id, data },
              {
                onSuccess: () => {
                  toast.success(t("page.toast.forecastApplied"))
                  setShowForecastModal(false)
                },
                onError: (err) => toastApiError(err, t("page.toast.forecastApplyError"))
              }
            )
          }
        }}
      />

      <CopyPlanModal
        isOpen={showCopyModal}
        onClose={() => {
          setShowCopyModal(false)
          setCopySourcePlan(null)
        }}
        plan={copySourcePlan}
        isSubmitting={isCopyingPlan}
        onCopy={(targetDate) => {
          if (!copySourcePlan?.id) return
          copyPlan(
            { id: copySourcePlan.id, target_date: targetDate },
            {
              onSuccess: () => {
                toast.success(t("page.toast.planCopied"))
                setShowCopyModal(false)
                setCopySourcePlan(null)
              },
              onError: (err) => toastApiError(err, t("page.toast.planCopyError")),
            }
          )
        }}
      />

      <AvailabilityFormModal
        isOpen={showAvailabilityForm && !editingAvailability}
        onClose={() => setShowAvailabilityForm(false)}
        isSubmitting={isCreatingAvail}
        onSave={(data) => {
          createAvailability(data, {
            onSuccess: () => {
              toast.success(t("page.toast.constraintsSaved"))
              setShowAvailabilityForm(false)
            },
            onError: (err) => toastApiError(err, t("page.toast.constraintsSaveError"))
          })
        }}
      />

      <SingleAvailabilityModal
        isOpen={showAvailabilityForm && !!editingAvailability}
        onClose={() => { setShowAvailabilityForm(false); setEditingAvailability(null); }}
        initialData={editingAvailability}
        isSubmitting={isUpdatingAvail}
        onSave={(data) => {
          // Backend upsert logic handles this via createAvailability (bulk-create)
          createAvailability(data, {
            onSuccess: () => {
              toast.success(t("page.toast.constraintUpdated"))
              setShowAvailabilityForm(false)
              setEditingAvailability(null)
            },
            onError: (err) => toastApiError(err, t("page.toast.constraintUpdateError"))
          })
        }}
      />

      {/* Genel Bilgilendirme Modalı */}
      <Dialog open={infoModal.isOpen} onOpenChange={(open) => setInfoModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              {infoModal.title} {t("page.infoModalSuffix")}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {infoModal.content}
          </div>
          <DialogFooter>
            <Button onClick={() => setInfoModal(prev => ({ ...prev, isOpen: false }))}>
              {t("page.gotIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{deleteConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("page.confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleteConfirm) return
                const { kind, id } = deleteConfirm
                setDeleteConfirm(null)
                if (kind === "plan") {
                  deletePlan(id, {
                    onSuccess: () => toast.success(t("page.toast.planDeleted")),
                    onError: (err) => toastApiError(err, t("page.toast.planDeleteError")),
                  })
                } else {
                  deleteAvailability(id, {
                    onSuccess: () => toast.success(t("page.toast.constraintRemoved")),
                    onError: (err) => toastApiError(err, t("page.toast.constraintRemoveError")),
                  })
                }
              }}
            >
              {deleteConfirm?.kind === "availability" ? t("page.confirm.remove") : t("page.confirm.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Onay sonrası → Mutfak Görevi Oluşturma Dialog */}
      <AlertDialog
        open={showCreateTasksDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateTasksDialog(false)
            setApprovedPlanForTasks(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("page.createTasks.dialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("page.createTasks.dialogDescription", {
                date: approvedPlanForTasks?.plan_date
                  ? format(new Date(approvedPlanForTasks.plan_date), "dd.MM.yyyy")
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowCreateTasksDialog(false)
                setApprovedPlanForTasks(null)
              }}
            >
              {t("page.confirm.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCreateTasksDialog(false)
                // Modal'ı aç (bir sonraki render'da)
                setTimeout(() => setShowCreateTasksModal(true), 100)
              }}
            >
              {t("page.createTasks.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mutfak Görevi Oluşturma Modal */}
      <CreatePrepTasksModal
        isOpen={showCreateTasksModal}
        onClose={() => {
          setShowCreateTasksModal(false)
          setApprovedPlanForTasks(null)
        }}
        planId={approvedPlanForTasks?.id || ""}
        planDate={approvedPlanForTasks?.plan_date || ""}
        planLines={(approvedPlanForTasks?.lines || []).map((line) => ({
          id: line.id || "",
          product_name: line.product_name,
          target_quantity: line.target_quantity,
          station_name: line.station_name,
        }))}
        staffList={staffList}
      />
    </AppShell>
  )
}
