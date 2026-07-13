"use client"

import { useCallback, useEffect, useMemo, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useShallow } from "zustand/react/shallow"
import { useAuthStore } from "@/store/useAuthStore"
import api, { skipInterceptorToast } from "@/lib/api"
import { isAxiosError } from "axios"
import { toast } from "sonner"
import { adminApi } from "@/features/admin/services/adminApi"
import { toastApiError } from "@/lib/operationalToast"
import { Loader2 } from "lucide-react"
import dynamic from "next/dynamic"
import { AppShell } from "@/components/shell/AppShell"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { UserList } from "@/features/users/components/UserList"
import { useModulePermissions } from "@/hooks/useModulePermissions"

const OverviewTab = dynamic(() => import("@/features/admin/components/tabs/OverviewTab").then(m => m.OverviewTab), { ssr: false });
const BranchesTab = dynamic(() => import("@/features/admin/components/tabs/BranchesTab").then(m => m.BranchesTab), { ssr: false });
const RolesTab = dynamic(() => import("@/features/admin/components/tabs/RolesTab").then(m => m.RolesTab), { ssr: false });
const InventoryTab = dynamic(() => import("@/features/admin/components/tabs/InventoryTab").then(m => m.InventoryTab), { ssr: false });
const RecipesTab = dynamic(() => import("@/features/admin/components/tabs/RecipesTab").then(m => m.RecipesTab), { ssr: false });
const MenuTab = dynamic(() => import("@/features/admin/components/tabs/MenuTab").then(m => m.MenuTab), { ssr: false });
const OrdersTab = dynamic(() => import("@/features/admin/components/tabs/OrdersTab").then(m => m.OrdersTab), { ssr: false });
const SalesTab = dynamic(() => import("@/features/admin/components/tabs/SalesTab").then(m => m.SalesTab), { ssr: false });
const KitchenStationsTab = dynamic(() => import("@/features/admin/components/tabs/KitchenStationsTab").then(m => m.KitchenStationsTab), { ssr: false });
const PosSettingsTab = dynamic(() => import("@/features/admin/components/tabs/PosSettingsTab").then(m => m.PosSettingsTab), { ssr: false });
const WaiterAssignmentsTab = dynamic(() => import("@/features/admin/components/tabs/WaiterAssignmentsTab").then(m => m.WaiterAssignmentsTab), { ssr: false });
const CashierPinsTab = dynamic(() => import("@/features/admin/components/tabs/CashierPinsTab").then(m => m.CashierPinsTab), { ssr: false });
const CookAssignmentsTab = dynamic(() => import("@/features/admin/components/tabs/CookAssignmentsTab").then(m => m.CookAssignmentsTab), { ssr: false });
const ManagerAssignmentsTab = dynamic(() => import("@/features/admin/components/tabs/ManagerAssignmentsTab").then(m => m.ManagerAssignmentsTab), { ssr: false });
const PrintersTab = dynamic(() => import("@/features/admin/components/tabs/PrintersTab").then(m => m.PrintersTab), { ssr: false });
const ReportingTab = dynamic(() => import("@/features/admin/components/tabs/ReportingTab").then(m => m.ReportingTab), { ssr: false });
const SurveysTab = dynamic(() => import("@/features/admin/components/tabs/SurveysTab").then(m => m.SurveysTab), { ssr: false });
const AuditTab = dynamic(() => import("@/features/admin/components/tabs/AuditTab").then(m => m.AuditTab), { ssr: false });
const BranchFormModal = dynamic(() => import("@/features/admin/components/modals/BranchFormModal").then(m => m.BranchFormModal), { ssr: false });
const RoleModal = dynamic(() => import("@/features/admin/components/modals/RoleModal").then(m => m.RoleModal), { ssr: false });
import { useAdminData, type AdminTab } from "@/features/admin/hooks/useAdminData"

import type { Role } from "@/types/user.types"
import type { BranchFormState } from "@/features/admin/components/modals/BranchFormModal"
import { initialBranchForm } from "@/features/admin/components/modals/BranchFormModal"
import {
  hasModuleAccess,
  hasOperationalManageAccess,
  type ModuleKey,
  type OperationalShortcutKey
} from "@/lib/constants"
import { WS_HTTP_FALLBACK_INTERVAL_MS } from "@/lib/wsBackendHost"
import { getKitchenNotificationsWsUrl, kitchenNotificationsHubKey, subscribeSharedWebSocket } from "@/lib/ws"
import { useTranslations } from "next-intl"
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

function AdminPageInner() {
  const tAdmin = useTranslations("admin")
  const { user, token } = useAuthStore(
    useShallow((s) => ({ user: s.user, token: s.token })),
  )
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = (searchParams.get("tab") ?? "overview") as AdminTab

  const [activeTab, setActiveTabState] = useState<AdminTab>(tabParam)
  const { canManage } = useModulePermissions()
  const canManageBranches = canManage("branches.manage_branch")
  const canManageWaiterAssignment = canManage("branches.manage_waiter_assignment")
  const canManageCashierPin = canManage("shifts.manage_cashier_pin")
  const canManageCookAssignment = canManage("branches.manage_cook_assignment")
  const canManageManagerAssignment = canManage("branches.manage_manager_assignment")

  const isTabAccessible = useCallback((tab: AdminTab) => {
    if (!user) return false
    if (tab === "overview") return true

    // Roller ve İzinler gibi kritik yerleri yönetici olmayanlara tamamen kapatalım
    const strictManageTabs = [
      "roles",
      "users",
      "waiter_assignments",
      "cashier_pins",
      "cook_assignments",
      "manager_assignments",
    ];
    if (strictManageTabs.includes(tab)) {
      return hasOperationalManageAccess(user.permissions, user.is_superuser, tab as OperationalShortcutKey);
    }

    if (tab === "printers") {
      return hasOperationalManageAccess(user.permissions, user.is_superuser, "printing");
    }

    if (tab === "surveys") {
      return canManage("surveys.manage_survey");
    }

    // Geri kalan sekmeler için modül erişimi (görüntüleme) yeterli
    // Veri kısıtlaması zaten backend (scoping) tarafından yapılıyor.
    return hasModuleAccess(user.permissions, user.is_superuser, tab as ModuleKey);
  }, [canManage, user]);

  const setActiveTab = (tab: AdminTab) => {
    if (isTabAccessible(tab)) {
      router.push(`/panel?tab=${tab}`)
    } else {
      router.push("/panel?tab=overview")
    }
  }

  useEffect(() => {
    setActiveTabState(tabParam)
  }, [tabParam])

  useEffect(() => {
    if (!user) return
    if (!isTabAccessible(activeTab)) {
      router.push("/panel?tab=overview")
    }
  }, [user, activeTab, isTabAccessible, router])

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>("")
  const [searchTerm, setSearchTerm] = useState("")
  const [salesPaymentFilter, setSalesPaymentFilter] = useState("ALL")
  const [salesTableId, setSalesTableId] = useState<string>("")
  const [salesCashierId, setSalesCashierId] = useState<string>("")
  const [salesStartDate, setSalesStartDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [salesEndDate, setSalesEndDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [auditBranchId, setAuditBranchId] = useState("")
  const [auditAction, setAuditAction] = useState("")
  const [auditStartDate, setAuditStartDate] = useState("")
  const [auditEndDate, setAuditEndDate] = useState("")

  // ── Tab-bazlı lazy data fetching ─────────────────────────────────────────────
  const data = useAdminData(activeTab, { 
    inventory: activeTab === "inventory" ? {
      searchTerm: searchTerm,
      warehouseId: selectedWarehouseId,
    } : undefined,
    sales: activeTab === "sales" ? {
      tableId: salesTableId,
      cashierId: salesCashierId,
      paymentMethod: salesPaymentFilter,
      startDate: salesStartDate,
      endDate: salesEndDate
    } : undefined,
    audit: activeTab === "audit" ? {
      branchId: auditBranchId || undefined,
      action: auditAction || undefined,
      startDate: auditStartDate || undefined,
      endDate: auditEndDate || undefined,
    } : undefined
  })

  const branchesForTab = useMemo(() => {
    if (!user) return data.branches
    if (user.is_superuser || canManageBranches) return data.branches
    const allowed = new Set<string>()
    if (user.branch_id) allowed.add(user.branch_id)
    user.available_branches?.forEach((b) => allowed.add(b.id))
    if (allowed.size === 0) return []
    return data.branches.filter((b) => allowed.has(b.id))
  }, [user, data.branches, canManageBranches])

  const auditBranches = useMemo(() => {
    if (!user) return []
    return user.available_branches ?? []
  }, [user])

  /** Çok şubeli kullanıcıda WS için şube zorunlu; yoksa ilk erişilebilir şube. */
  const kitchenWsBranchId = useMemo(() => {
    if (!user) return undefined
    if (user.is_superuser) return undefined
    if (user.branch_id) return user.branch_id
    if (user.available_branches?.length === 1) return user.available_branches[0].id
    return branchesForTab[0]?.id
  }, [user, branchesForTab])

  const deletedBranchesForTab = useMemo(() => {
    if (!canManageBranches) return []
    return data.deletedBranches
  }, [canManageBranches, data.deletedBranches])

  // ── Mutasyon form state'leri ─────────────────────────────────────────────────
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [showRoleForm, setShowRoleForm] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingRole, setDeletingRole] = useState<Role | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [branchForm, setBranchForm] = useState<BranchFormState>(initialBranchForm)
  const [roleForm, setRoleForm] = useState({
    name: "", description: "", parent_role: null as number | null,
    permission_ids: [] as number[],
  })

  // ── WS + HTTP polling: siparişleri güncelle ──────────────────────────────────
  // WS bağlıyken HTTP polling durdur — gereksiz istekleri önle
  const syncOrders = useCallback(() => {
    data.refetchOrders()
  }, [data])

  useEffect(() => {
    let httpPoll: ReturnType<typeof setInterval> | null = null

    const startHttpPolling = () => {
      if (httpPoll) return // Zaten çalışıyor
      httpPoll = setInterval(() => {
        syncOrders()
      }, WS_HTTP_FALLBACK_INTERVAL_MS)
    }

    const stopHttpPolling = () => {
      if (httpPoll) {
        clearInterval(httpPoll)
        httpPoll = null
      }
    }

    const cleanupWs = subscribeSharedWebSocket(kitchenNotificationsHubKey(kitchenWsBranchId), {
      tag: "admin-kitchen",
      enabled: !!token,
      getUrl: () => getKitchenNotificationsWsUrl(kitchenWsBranchId),
      onOpen: () => {
        stopHttpPolling() // WS bağlandı → HTTP polling durdur
      },
      onClose: () => {
        startHttpPolling() // WS kapandı → HTTP polling başlat (fallback)
      },
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (
            payload.type === "kds_refresh" ||
            payload.type === "orders_updated" ||
            payload.type === "order_status_changed"
          ) {
            syncOrders()
          }
        } catch {
          /* geçersiz WS mesajı */
        }
      },
    })

    // Başlangıçta WS henüz bağlanmamış → HTTP polling ile başla
    startHttpPolling()

    return () => {
      stopHttpPolling()
      cleanupWs()
    }
  }, [syncOrders, token, kitchenWsBranchId])

  const handleCreateBranch = async () => {
    setIsSubmitting(true)
    try {
      await api.post("/branches/", branchForm, { ...skipInterceptorToast })
      setShowBranchForm(false)
      setBranchForm(initialBranchForm)
      data.refetchBranches()
    } catch (e: unknown) {
      toastApiError(e, tAdmin("panelPage.branchCreateFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteBranch = async (id: string, name: string, force = false) => {
    try {
      await adminApi.deleteBranch(id, force)
      data.refetchBranches()
    } catch (e: unknown) {
      toastApiError(e, tAdmin("panelPage.branchDeleteFailed", { name }))
    }
  }

  const handleRestoreBranch = async (id: string, name: string) => {
    try {
      await adminApi.restoreBranch(id)
      data.refetchBranches()
    } catch (e: unknown) {
      toastApiError(e, tAdmin("panelPage.branchRestoreFailed", { name }))
    }
  }

  const handleSaveRole = async () => {
    setIsSubmitting(true)
    try {
      if (editingRole) {
        await api.patch(`/admin/roles/${editingRole.id}/`, {
          name: roleForm.name, description: roleForm.description, parent_role: roleForm.parent_role,
        }, { ...skipInterceptorToast })
        await api.post(`/admin/roles/${editingRole.id}/set_permissions/`, {
          permission_ids: roleForm.permission_ids,
        }, { ...skipInterceptorToast })
      } else {
        const res = await api.post("/admin/roles/", {
          name: roleForm.name, description: roleForm.description, parent_role: roleForm.parent_role,
        }, { ...skipInterceptorToast })
        if (roleForm.permission_ids.length > 0) {
          await api.post(`/admin/roles/${res.data.id}/set_permissions/`, {
            permission_ids: roleForm.permission_ids,
          }, { ...skipInterceptorToast })
        }
      }
      setShowRoleForm(false)
      setEditingRole(null)
      setRoleForm({ name: "", description: "", parent_role: null, permission_ids: [] })
      data.refetchRoles()
    } catch (e: unknown) {
      if (isAxiosError(e) && e.response?.status === 404 && editingRole) {
        data.refetchRoles()
        toast.info(tAdmin("panelPage.roleStaleToast"))
        setShowRoleForm(false); setEditingRole(null); return
      }
      toastApiError(e, tAdmin("panelPage.roleSaveFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRole = (role: Role) => {
    setDeletingRole(role)
  }

  const confirmDeleteRole = async () => {
    if (!deletingRole) return
    setIsDeleting(true)
    try {
      await api.delete(`/admin/roles/${deletingRole.id}/`, { ...skipInterceptorToast })
      data.refetchRoles()
      setDeletingRole(null)
    } catch (e: unknown) {
      toastApiError(e, tAdmin("panelPage.roleDeleteFailed"))
    } finally {
      setIsDeleting(false)
    }
  }

  const openEditRole = (r: Role) => {
    setEditingRole(r)
    setRoleForm({ name: r.name, description: r.description || "", parent_role: r.parent_role, permission_ids: r.permissions })
    setShowRoleForm(true)
  }

  if (data.isLoading) {
    return (
      <AppShell lowStockCount={0}>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm text-muted-foreground">{tAdmin("common.loading")}</span>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell lowStockCount={data.stats.lowStock}>
      <div className="p-6 lg:p-8 h-full overflow-auto bg-card">
        {activeTab === "overview" && (
          <OverviewTab
            stats={data.stats}
            stockItems={data.stockItems}
            setActiveTab={setActiveTab}
            userPermissions={user?.permissions}
            is_superuser={user?.is_superuser}
          />
        )}
        {activeTab === "users" && <UserList />}
        {activeTab === "branches" && (
          <BranchesTab
            branches={branchesForTab}
            deletedBranches={deletedBranchesForTab}
            canManageBranches={canManageBranches}
            isAdmin={!!user?.is_superuser}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAdd={() => setShowBranchForm(true)}
            onDelete={handleDeleteBranch}
            onRestore={handleRestoreBranch}
            onRefresh={data.refetchBranches}
          />
        )}
        {activeTab === "roles" && (
          <RolesTab
            roles={data.roles}
            permCategories={data.permCategories}
            onAddRole={() => { setEditingRole(null); setRoleForm({ name: "", description: "", parent_role: null, permission_ids: [] }); setShowRoleForm(true) }}
            onEditRole={openEditRole}
            onDeleteRole={(roleId) => {
              const r = data.roles.find(x => x.id === roleId)
              if (r) handleDeleteRole(r)
            }}
          />
        )}
        {activeTab === "inventory" && (
          <InventoryTab
            stockItems={data.stockItems}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            warehouses={data.warehouses}
            selectedWarehouseId={selectedWarehouseId}
            onWarehouseChange={setSelectedWarehouseId}
            fetchNextPage={data.stockItemsNext.fetchNextPage}
            hasNextPage={data.stockItemsNext.hasNextPage}
            isFetchingNextPage={data.stockItemsNext.isFetchingNextPage}
            isLoading={data.stockItemsNext.isLoading}
          />
        )}
        {activeTab === "recipes" && (
          <RecipesTab
            recipes={data.recipes}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            canManageRecipes={canManage("recipes.manage_recipe")}
          />
        )}
        {activeTab === "menu" && (
          <MenuTab
            categories={data.categories}
            products={data.products}
            canManageProducts={canManage("menu.manage_product")}
          />
        )}
        {activeTab === "orders" && (
          <OrdersTab
            orders={data.ordersList}
            isLoading={data.ordersListLoading}
            fetchNextPage={data.ordersNext.fetchNextPage}
            hasNextPage={data.ordersNext.hasNextPage}
            isFetchingNextPage={data.ordersNext.isFetchingNextPage}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onRefresh={data.refetchOrders}
          />
        )}
        {activeTab === "sales" && (
          <SalesTab
            sales={data.sales}
            tableId={salesTableId}
            setTableId={setSalesTableId}
            cashierId={salesCashierId}
            setCashierId={setSalesCashierId}
            paymentFilter={salesPaymentFilter}
            setPaymentFilter={setSalesPaymentFilter}
            startDate={salesStartDate}
            setStartDate={setSalesStartDate}
            endDate={salesEndDate}
            setEndDate={setSalesEndDate}
            infiniteControls={data.salesNext}
          />
        )}
        {activeTab === "stations" && (
          <KitchenStationsTab
            branches={branchesForTab.map(b => ({ id: b.id, name: b.name }))}
            canManage={canManage("branches.manage_station")}
          />
        )}
        {activeTab === "waiter_assignments" && canManageWaiterAssignment && (
          <WaiterAssignmentsTab branches={branchesForTab} />
        )}
        {activeTab === "cashier_pins" && canManageCashierPin && (
          <CashierPinsTab branches={branchesForTab} />
        )}
        {activeTab === "cook_assignments" && canManageCookAssignment && (
          <CookAssignmentsTab branches={branchesForTab} />
        )}
        {activeTab === "manager_assignments" && canManageManagerAssignment && (
          <ManagerAssignmentsTab />
        )}
        {activeTab === "pos_settings" && (
          <PosSettingsTab />
        )}
        {activeTab === "printers" && (
          <PrintersTab
            branches={branchesForTab.map(b => ({ id: b.id, name: b.name }))}
            canManage={canManage("printing.manage_printer")}
          />
        )}
        {activeTab === "reporting" && (
          <ReportingTab
            canManage={canManage("reporting.manage_report_template")}
          />
        )}
        {activeTab === "surveys" && (
          <SurveysTab />
        )}
        {activeTab === "audit" && (
          <AuditTab
            auditLogs={data.auditLogs}
            isLoading={data.auditLogsLoading}
            isError={data.auditLogsError}
            onRetry={data.refetchAuditLogs}
            canExport={canManage("audit.export_auditlog")}
            branches={auditBranches}
            selectedBranchId={auditBranches.length === 1 ? auditBranches[0].id : auditBranchId}
            onBranchChange={setAuditBranchId}
            actions={data.auditActions}
            selectedAction={auditAction}
            onActionChange={setAuditAction}
            startDate={auditStartDate}
            endDate={auditEndDate}
            onStartDateChange={setAuditStartDate}
            onEndDateChange={setAuditEndDate}
            fetchNextPage={data.auditNext.fetchNextPage}
            hasNextPage={data.auditNext.hasNextPage}
            isFetchingNextPage={data.auditNext.isFetchingNextPage}
          />
        )}
      </div>

      {showBranchForm && (
        <BranchFormModal
          branchForm={branchForm}
          setBranchForm={setBranchForm}
          isSubmitting={isSubmitting}
          onSubmit={handleCreateBranch}
          onClose={() => setShowBranchForm(false)}
        />
      )}
      {showRoleForm && (
        <RoleModal
          editingRole={editingRole}
          roleForm={roleForm}
          setRoleForm={setRoleForm}
          roles={data.roles}
          permCategories={data.permCategories}
          isSubmitting={isSubmitting}
          onSubmit={handleSaveRole}
          onClose={() => { setShowRoleForm(false); setEditingRole(null) }}
        />
      )}

      <AlertDialog open={!!deletingRole} onOpenChange={(open) => !open && setDeletingRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAdmin("panelPage.roleDeleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingRole?.name} — {tAdmin("common.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tAdmin("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteRole()
              }}
              disabled={isDeleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isDeleting && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {tAdmin("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

export default function AdminPage() {
  return (
    <AuthGuard module="auth_only">
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }>
        <AdminPageInner />
      </Suspense>
    </AuthGuard>
  )
}
