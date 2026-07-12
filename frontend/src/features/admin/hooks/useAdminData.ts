"use client"

import { useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query"
import api from "@/lib/api"
import { useAuthStore } from "@/store/useAuthStore"
import { hasModuleAccess, hasPermission } from "@/lib/constants"
import type { Branch, Role, PermissionCategory, User } from "@/types/user.types"
import type { StockItem } from "@/features/inventory/types"
import type { PaginatedResponse } from "@/lib/types"
import { pageFromDrfNext } from "@/lib/pagination"
import type { Recipe } from "@/features/recipes/types"
import type { Warehouse } from "@/features/warehouse/types"
import type { Category, Product } from "../components/tabs/MenuTab"
import type { AdminOrderRow } from "../components/tabs/OrdersTab"
import type { Sale } from "@/features/sales/types"
import type { AuditLog } from "../components/tabs/AuditTab"

export type AdminTab =
  | "overview"
  | "users"
  | "branches"
  | "stations"
  | "roles"
  | "inventory"
  | "recipes"
  | "menu"
  | "orders"
  | "sales"
  | "pos_settings"
  | "waiter_assignments"
  | "cashier_pins"
  | "cook_assignments"
  | "manager_assignments"
  | "printers"
  | "reporting"
  | "surveys"
  | "audit"

import { ACTIVE_ORDER_STATUSES } from "@/features/orders/constants/activeOrderStatuses"

const ACTIVE_ORDER_STATUS_SET = new Set<string>(ACTIVE_ORDER_STATUSES)

function asTypedList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function countActiveOrders(orders: AdminOrderRow[]): number {
  return orders.filter(o => ACTIVE_ORDER_STATUS_SET.has(o.status ?? "")).length
}

/**
 * Her admin tab'ı kendi verisini yalnızca aktif olduğunda çeker.
 * React Query cache'i sayesinde tab geçişlerinde gereksiz istek yapılmaz.
 */
export function useAdminData(activeTab: AdminTab, filters?: { 
  warehouseId?: string;
  inventory?: {
    searchTerm?: string;
    warehouseId?: string;
  };
  sales?: {
    tableId?: string;
    cashierId?: string;
    paymentMethod?: string;
    startDate?: string;
    endDate?: string;
  };
  audit?: {
    branchId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  };
}) {
  const user = useAuthStore(s => s.user)
  const queryClient = useQueryClient()
  const perms = user?.permissions
  const su = user?.is_superuser
  const hasUser = Boolean(user)

  // ── Tab → ihtiyaç duyulan modüller ──────────────────────────────────────────
  const needsBranches = ["branches", "overview", "stations", "waiter_assignments", "cashier_pins", "cook_assignments", "manager_assignments", "printers"].includes(activeTab)
  const needsWarehouses = ["inventory", "overview"].includes(activeTab)
  const canManageBranches = hasPermission(perms, su, "branches.manage_branch")
  const needsDeletedBranches = activeTab === "branches" && canManageBranches
  const needsRoles = ["roles", "overview"].includes(activeTab)
  const needsPermCategories = ["roles", "overview"].includes(activeTab)
  const needsInventory = ["inventory", "overview"].includes(activeTab)
  const needsRecipes = ["recipes", "overview"].includes(activeTab)
  const needsMenu = ["menu", "overview"].includes(activeTab)
  const needsOrders = ["orders", "overview"].includes(activeTab)
  const needsOrdersOverview = activeTab === "overview"
  const needsOrdersList = activeTab === "orders"
  const needsSales = ["sales", "overview"].includes(activeTab)
  const needsUsers = ["users", "overview"].includes(activeTab)
  const needsStations = ["stations", "overview"].includes(activeTab)
  const needsPrinters = ["printers", "overview"].includes(activeTab)
  const needsReporting = ["reporting", "overview"].includes(activeTab)
  const needsAudit = ["audit", "overview"].includes(activeTab)

  // ── Queries ──────────────────────────────────────────────────────────────────

  const branchesQuery = useQuery<Branch[]>({
    queryKey: ["admin", "branches"],
    queryFn: async () => {
      const res = await api.get("/branches/")
      return asTypedList<Branch>(res.data.results || res.data)
    },
    enabled:
      hasUser &&
      needsBranches &&
      (hasModuleAccess(perms, su, "branches") ||
        hasPermission(perms, su, "branches.manage_waiter_assignment") ||
        hasPermission(perms, su, "branches.manage_cook_assignment")),
  })

  const deletedBranchesQuery = useQuery<Branch[]>({
    queryKey: ["admin", "branches-deleted"],
    queryFn: async () => {
      const res = await api.get("/branches/", { params: { deleted: true } })
      return asTypedList<Branch>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "branches") && needsDeletedBranches,
  })

  const rolesQuery = useQuery<Role[]>({
    queryKey: ["admin", "roles"],
    queryFn: async () => {
      const res = await api.get("/admin/roles/")
      return asTypedList<Role>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "roles") && needsRoles,
  })

  const permCategoriesQuery = useQuery<PermissionCategory[]>({
    queryKey: ["admin", "perm-categories"],
    queryFn: async () => {
      const res = await api.get("/admin/permission-categories/")
      return asTypedList<PermissionCategory>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "roles") && needsPermCategories,
  })

  const stockItemsQuery = useInfiniteQuery<PaginatedResponse<StockItem>>({
    queryKey: ["admin", "stock-items", filters?.inventory],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get("/inventory/stock-items/", {
        params: {
          page: pageParam,
          page_size: 50,
          search: filters?.inventory?.searchTerm || undefined,
          warehouse_id: filters?.inventory?.warehouseId || undefined,
        }
      })
      return res.data as PaginatedResponse<StockItem>
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: hasUser && hasModuleAccess(perms, su, "inventory") && needsInventory,
  })

  const warehousesQuery = useQuery<Warehouse[]>({
    queryKey: ["admin", "warehouses"],
    queryFn: async () => {
      const res = await api.get("/warehouse/warehouses/")
      return asTypedList<Warehouse>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "inventory") && needsWarehouses,
  })

  const recipesQuery = useQuery<Recipe[]>({
    queryKey: ["admin", "recipes"],
    queryFn: async () => {
      const res = await api.get("/recipes/recipes/")
      return asTypedList<Recipe>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "recipes") && needsRecipes,
  })

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["admin", "menu-categories"],
    queryFn: async () => {
      const res = await api.get("/menu/categories/")
      return asTypedList<Category>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "menu") && needsMenu,
  })

  const productsQuery = useQuery<Product[]>({
    queryKey: ["admin", "menu-products"],
    queryFn: async () => {
      const res = await api.get("/menu/products/")
      return asTypedList<Product>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "menu") && needsMenu,
  })

  const ordersQuery = useQuery<AdminOrderRow[]>({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const res = await api.get("/orders/main/")
      return asTypedList<AdminOrderRow>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "orders") && needsOrdersOverview,
  })

  const ordersInfiniteQuery = useInfiniteQuery<PaginatedResponse<AdminOrderRow>>({
    queryKey: ["admin", "orders-infinite"],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get<PaginatedResponse<AdminOrderRow>>("/orders/main/", {
        params: { page: pageParam, page_size: 50 },
      })
      return res.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: hasUser && hasModuleAccess(perms, su, "orders") && needsOrdersList,
  })

  const salesQuery = useInfiniteQuery({
    queryKey: ["admin", "sales", filters?.sales],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await api.get("/sales/", {
        params: { 
          page: pageParam,
          table_id: filters?.sales?.tableId || undefined,
          created_by_id: filters?.sales?.cashierId || undefined,
          payment_method: filters?.sales?.paymentMethod !== 'ALL' ? filters?.sales?.paymentMethod : undefined,
          start_date: filters?.sales?.startDate || undefined,
          end_date: filters?.sales?.endDate || undefined
        }
      })
      return res.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: hasUser && hasModuleAccess(perms, su, "sales") && needsSales,
  })

  const usersCountQuery = useQuery<number>({
    queryKey: ["admin", "users-count"],
    queryFn: async () => {
      const res = await api.get<{ count?: number; results?: unknown[] }>("/admin/users/", {
        params: { page: 1, page_size: 1 },
      })
      const d = res.data
      if (typeof d.count === "number") return d.count
      return asTypedList<User>(d.results ?? []).length
    },
    enabled: hasUser && hasModuleAccess(perms, su, "users") && needsUsers,
  })

  const stationsQuery = useQuery<unknown[]>({
    queryKey: ["admin", "stations"],
    queryFn: async () => {
      const res = await api.get("/stations/")
      return asTypedList<unknown>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "stations") && needsStations,
  })

  const printersQuery = useQuery<unknown[]>({
    queryKey: ["admin", "printers"],
    queryFn: async () => {
      const res = await api.get("/printing/printers/")
      return asTypedList<unknown>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "printing") && needsPrinters,
  })

  const reportingTemplatesQuery = useQuery<unknown[]>({
    queryKey: ["admin", "reporting-templates"],
    queryFn: async () => {
      const res = await api.get("/reporting/templates/")
      return asTypedList<unknown>(res.data.results || res.data)
    },
    enabled: hasUser && hasModuleAccess(perms, su, "reporting") && needsReporting,
  })

  const auditLogsInfiniteQuery = useInfiniteQuery<PaginatedResponse<AuditLog>>({
    queryKey: ["admin", "audit-logs", filters?.audit?.branchId, filters?.audit?.action, filters?.audit?.startDate, filters?.audit?.endDate],
    queryFn: async ({ pageParam = 1 }) => {
      const params: Record<string, unknown> = { page: pageParam, page_size: 100 }
      if (filters?.audit?.branchId) params.branch = filters.audit.branchId
      if (filters?.audit?.action) params.action = filters.audit.action
      if (filters?.audit?.startDate) params.start_date = filters.audit.startDate
      if (filters?.audit?.endDate) params.end_date = filters.audit.endDate
      const res = await api.get<PaginatedResponse<AuditLog>>("/audit/logs/", { params })
      return res.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: hasUser && hasPermission(perms, su, "audit.view_auditlog") && needsAudit,
  })

  const auditActionsQuery = useQuery<string[]>({
    queryKey: ["admin", "audit-actions"],
    queryFn: async () => {
      const res = await api.get<string[]>("/audit/logs/actions/")
      return Array.isArray(res.data) ? res.data : []
    },
    enabled: hasUser && hasPermission(perms, su, "audit.view_auditlog") && needsAudit,
  })

  // ── Derived data ─────────────────────────────────────────────────────────────

  const branches = branchesQuery.data ?? []
  const deletedBranches = deletedBranchesQuery.data ?? []
  const roles = rolesQuery.data ?? []
  const permCategories = permCategoriesQuery.data ?? []
  const warehouses = warehousesQuery.data ?? []
  const stockItemsPages = stockItemsQuery.data?.pages ?? []
  const stockItems = stockItemsPages.flatMap(page => asTypedList<StockItem>(page.results || page))
  const stockItemsCount = stockItemsQuery.data?.pages[0]?.count ?? 0
  const recipes = recipesQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const products = productsQuery.data ?? []
  const orders = ordersQuery.data ?? []
  const ordersListPages = ordersInfiniteQuery.data?.pages ?? []
  const ordersList = ordersListPages.flatMap(page => asTypedList<AdminOrderRow>(page.results || page))
  const ordersListCount = ordersInfiniteQuery.data?.pages[0]?.count ?? 0
  const salesPages = salesQuery.data?.pages ?? []
  const sales = salesPages.flatMap(page => asTypedList<Sale>(page.results || page))
  const salesCount = salesQuery.data?.pages[0]?.count ?? 0
  const salesTotals = salesQuery.data?.pages[0]?.totals ?? { gross_total: 0, discount_total: 0, net_total: 0 }

  const stationsList = stationsQuery.data ?? []
  const auditLogsPages = auditLogsInfiniteQuery.data?.pages ?? []
  const auditLogs = auditLogsPages.flatMap(page => asTypedList<AuditLog>(page.results || page))
  const auditLogsCount = auditLogsInfiniteQuery.data?.pages[0]?.count ?? 0

  const stats = {
    users: usersCountQuery.data ?? 0,
    stations: stationsList.length,
    branches: branches.length,
    roles: roles.length,
    stockItems: stockItems.length,
    lowStock: stockItems.filter(item => item.is_low_stock === true).length,
    recipes: recipes.length,
    categories: categories.length,
    products: products.length,
    pendingOrders: countActiveOrders(orders),
    totalOrders: orders.length,
    sales: salesCount,
    auditLogs: auditLogsCount,
  } satisfies Record<string, number>

  // isLoading: true yalnızca aktif tab'ın ilk yüklemesinde
  const isLoading =
    (needsBranches && branchesQuery.isLoading) ||
    (needsRoles && rolesQuery.isLoading) ||
    (needsOrders && ordersQuery.isLoading) ||
    (activeTab === "overview" &&
      hasModuleAccess(perms, su, "users") &&
      usersCountQuery.isLoading) ||
    (activeTab === "overview" &&
      hasModuleAccess(perms, su, "stations") &&
      stationsQuery.isLoading) ||
    (activeTab === "printers" && printersQuery.isLoading) ||
    (activeTab === "reporting" && reportingTemplatesQuery.isLoading) ||
    (activeTab === "audit" && auditLogsInfiniteQuery.isLoading) ||
    (activeTab === "orders" && ordersInfiniteQuery.isLoading)

  // ── Refetch helpers ───────────────────────────────────────────────────────────

  const refetchBranches = () => {
    void branchesQuery.refetch()
    void deletedBranchesQuery.refetch()
  }

  const refetchRoles = () => void rolesQuery.refetch()

  const refetchOrders = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders"] })
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders-infinite"] })
  }

  return {
    branches, warehouses, deletedBranches, roles, permCategories,
    stockItems, recipes, categories, products, orders, ordersList, sales,
    auditLogs,
    auditActions: auditActionsQuery.data ?? [],
    auditLogsLoading: auditLogsInfiniteQuery.isLoading,
    auditLogsError: auditLogsInfiniteQuery.isError,
    refetchAuditLogs: () => void auditLogsInfiniteQuery.refetch(),
    auditNext: {
      fetchNextPage: auditLogsInfiniteQuery.fetchNextPage,
      hasNextPage: auditLogsInfiniteQuery.hasNextPage,
      isFetchingNextPage: auditLogsInfiniteQuery.isFetchingNextPage,
      totalCount: auditLogsCount,
    },
    stats, isLoading,
    refetchBranches, refetchRoles, refetchOrders,
    ordersNext: {
      fetchNextPage: ordersInfiniteQuery.fetchNextPage,
      hasNextPage: ordersInfiniteQuery.hasNextPage,
      isFetchingNextPage: ordersInfiniteQuery.isFetchingNextPage,
      totalCount: ordersListCount,
    },
    ordersListLoading: ordersInfiniteQuery.isLoading,
    salesNext: {
      fetchNextPage: salesQuery.fetchNextPage,
      hasNextPage: salesQuery.hasNextPage,
      isFetchingNextPage: salesQuery.isFetchingNextPage,
      totals: salesTotals,
      totalCount: salesCount
    },
    stockItemsNext: {
      fetchNextPage: stockItemsQuery.fetchNextPage,
      hasNextPage: stockItemsQuery.hasNextPage,
      isFetchingNextPage: stockItemsQuery.isFetchingNextPage,
      isLoading: stockItemsQuery.isLoading,
      totalCount: stockItemsCount
    }
  }
}
