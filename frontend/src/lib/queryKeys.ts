export const queryKeys = {
  /** Auth: GET /auth/me/ — kullanıcı profili + izinler (AuthGuard cache) */
  authMeBase: ["auth-me"] as const,
  authMe: ["auth-me"] as const,

  warehousesBase: ["warehouses"] as const,
  warehouses: (branchId?: string) => ["warehouses", branchId ?? "ALL"] as const,

  warehouseSummaryBase: ["warehouse-summary"] as const,
  warehouseSummary: (branchId?: string) => ["warehouse-summary", branchId ?? "ALL"] as const,

  purchaseOrdersBase: ["purchase-orders"] as const,
  purchaseOrders: (filters?: Record<string, unknown>) => ["purchase-orders", filters ?? {}] as const,

  purchaseRecommendationsBase: ["purchase-recommendations"] as const,
  purchaseRecommendations: (filters?: Record<string, unknown>) =>
    ["purchase-recommendations", filters ?? {}] as const,

  goodsReceivingsBase: ["goods-receivings"] as const,
  goodsReceivings: (filters?: Record<string, unknown>) => ["goods-receivings", filters ?? {}] as const,

  transfersBase: ["transfers"] as const,
  transfers: (filters?: Record<string, unknown>) => ["transfers", filters ?? {}] as const,

  stockCountingsBase: ["stock-countings"] as const,
  stockCountings: (filters?: Record<string, unknown>) => ["stock-countings", filters ?? {}] as const,

  stockItemsSimpleBase: ["stock-items-simple"] as const,
  stockItemsSimple: (branchId?: string) => ["stock-items-simple", branchId ?? "ALL"] as const,

  deficiencyReportsBase: ["deficiency-reports"] as const,
  deficiencyReports: (filters?: Record<string, unknown>) => ["deficiency-reports", filters ?? {}] as const,

  /** KDS: mutfağa bağlı depo stokları (`GET /stations/:id/linked-stock-levels/`) */
  kdsLinkedStock: (stationId: string) => ["kds-linked-stock", stationId] as const,

  kitchenClosingItemsBase: ["kitchen-closing-items"] as const,
  kitchenClosingItems: (warehouseId?: string) => ["kitchen-closing-items", warehouseId ?? "NONE"] as const,

  expiringLotsBase: ["expiring-lots"] as const,
  expiringLots: (params?: Record<string, unknown>) => ["expiring-lots", params ?? {}] as const,

  expiryWarningsBase: ["expiry-warnings"] as const,
  expiryWarnings: (filters?: Record<string, unknown>) => ["expiry-warnings", filters ?? {}] as const,

  expirySummaryBase: ["expiry-summary"] as const,
  expirySummary: (params?: Record<string, unknown>) => ["expiry-summary", params ?? {}] as const,

  expiryActionsHistoryBase: ["expiry-actions-history"] as const,
  expiryActionsHistory: (params?: Record<string, unknown>) =>
    ["expiry-actions-history", params ?? {}] as const,

  // Inventory module
  stockItemsBase: ["stock-items"] as const,
  stockItems: (filters?: Record<string, unknown>) => ["stock-items", filters ?? {}] as const,

  stockSummaryBase: ["stock-summary"] as const,
  stockSummary: (filters?: Record<string, unknown>) => ["stock-summary", filters ?? {}] as const,

  stockMovementsBase: ["stock-movements"] as const,
  stockMovements: (filters?: Record<string, unknown>) => ["stock-movements", filters ?? {}] as const,

  suppliersBase: ["suppliers"] as const,
  categoriesBase: ["categories"] as const,
  stockUnitsBase: ["stock-units"] as const,
  branchesBase: ["branches"] as const,

  // KDS
  kdsOrdersBase: ["kds-orders"] as const,
  kdsOrders: (stationId?: string) => ["kds-orders", stationId ?? "ALL"] as const,
  kdsStationsBase: ["kds-stations"] as const,
  kdsStations: (branchId?: string) => ["kds-stations", branchId ?? "ALL"] as const,

  // Tables
  tablesBase: ["tables"] as const,
  tables: (branchId?: string) => ["tables", branchId ?? "ALL"] as const,
  zonesBase: ["zones"] as const,
  zones: (branchId?: string) => ["zones", branchId ?? "ALL"] as const,

  // Sales
  salesBase: ["sales"] as const,
  sales: (filters?: Record<string, unknown>) => ["sales", filters ?? {}] as const,
  salesSummaryBase: ["sales-summary"] as const,
  salesSummary: (filters?: Record<string, unknown>) => ["sales-summary", filters ?? {}] as const,

  // Admin / Panel
  usersBase: ["users"] as const,
  rolesBase: ["roles"] as const,
  auditLogsBase: ["audit-logs"] as const,
  auditLogs: (filters?: Record<string, unknown>) => ["audit-logs", filters ?? {}] as const,
  printersBase: ["printers"] as const,

  // Reservations
  reservationsBase: ["reservations"] as const,
  reservations: (filters?: Record<string, unknown>) => ["reservations", filters ?? {}] as const,

  // Dashboard
  dashboardSummaryBase: ["dashboard-summary"] as const,
  dashboardSummary: (branchId?: string) => ["dashboard-summary", branchId ?? "ALL"] as const,
  dashboardRevenueBase: ["dashboard-revenue"] as const,
  dashboardRevenue: (branchId?: string) => ["dashboard-revenue", branchId ?? "ALL"] as const,

  // Performances
  performancesBase: ["performances"] as const,
  performances: (filters?: Record<string, unknown>) => ["performances", filters ?? {}] as const,

  // Menu Management
  menuCategoriesBase: ["menu-categories"] as const,
  menuCategories: (params?: { apply_tag_filter?: boolean }) =>
    ["menu-categories", params ?? {}] as const,
  menuProductsBase: ["menu-products"] as const,
  menuProducts: (params?: { apply_tag_filter?: boolean }) =>
    ["menu-products", params ?? {}] as const,
  menuStationsBase: ["menu-stations"] as const,
  menuBranchesBase: ["menu-branches"] as const,
  menuTagsBase: ["menu-tags"] as const,
  menuTags: (branchId?: string) => ["menu-tags", branchId ?? "ALL"] as const,
  menuCatalogSettingsBase: ["menu-catalog-settings"] as const,
  menuCatalogSettings: (branchId?: string) => ["menu-catalog-settings", branchId ?? "ALL"] as const,

  // POS
  posBranchesBase: ["pos-branches"] as const,
  posBranches: (branchId?: string) => ["pos-branches", branchId ?? "ALL"] as const,
  posZonesBase: ["pos-zones"] as const,
  posZones: (branchId?: string) => ["pos-zones", branchId ?? "ALL"] as const,
  posCategoriesBase: ["pos-categories"] as const,
  posCategories: (branchId?: string) => ["pos-categories", branchId ?? "ALL"] as const,
  posProductsBase: ["pos-products"] as const,
  posProducts: (branchId?: string) => ["pos-products", branchId ?? "ALL"] as const,
  posTablesBase: ["pos-tables"] as const,
  posTables: (branchId?: string, variant?: string) =>
    ["pos-tables", branchId ?? "ALL", variant ?? "pos"] as const,
  posTablesTakeawayVirtualBase: ["pos-tables-takeaway-virtual"] as const,
  posTablesTakeawayVirtual: (branchId?: string, variant?: string) =>
    ["pos-tables-takeaway-virtual", branchId ?? "ALL", variant ?? "pos"] as const,
} as const

