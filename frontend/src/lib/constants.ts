/**
 * Seed RBAC (seed_rbac.py) ile hizalı izin grupları.
 * Modül sidebar / sayfa guard’ları ve operasyonel tam sayfa kısayolları buradan türetilir.
 * POS ekranı: `pos.view_pos` (`/pos`).
 * KDS ekranı: `orders.view_kds` (`/kds`, `orders` modülünden ayrı — yalnızca KDS yetkisi).
 */
const RBAC_PERMISSION_GROUPS = {
  orders: {
    moduleAccess: [
      "orders.view_order",
      "orders.manage_order",
      "orders.view_kds",
    ],
    operationalManage: ["orders.manage_order"],
  },
  /** Tam sayfa mutfak ekranı — sidebar & /kds guard ile aynı */
  kds: {
    moduleAccess: ["orders.view_kds"],
    operationalManage: [],
  },
  inventory: {
    moduleAccess: [
      "inventory.view_stock_item",
      "inventory.manage_stock_item",
      "inventory.view_stock_movement",
      "inventory.manage_stock_movement",
      "inventory.view_supplier",
      "inventory.manage_supplier",
      "inventory.view_category",
      "inventory.manage_category",
      "inventory.view_stock_unit",
      "inventory.manage_stock_unit",
      "inventory.view_allergen",
      "inventory.manage_allergen",
    ],
    operationalManage: [
      "inventory.manage_stock_item",
      "inventory.manage_stock_movement",
      "inventory.manage_supplier",
      "inventory.manage_category",
      "inventory.manage_stock_unit",
      "inventory.manage_allergen",
    ],
  },
  recipes: {
    moduleAccess: ["recipes.view_recipe", "recipes.manage_recipe"],
    operationalManage: ["recipes.manage_recipe"],
  },
  menu: {
    moduleAccess: [
      "menu.view_category",
      "menu.manage_category",
      "menu.view_product",
      "menu.manage_product",
      "menu.view_product_variant",
      "menu.manage_product_variant",
      "menu.view_modifier_group",
      "menu.manage_modifier_group",
      "menu.view_modifier",
      "menu.manage_modifier",
    ],
    operationalManage: [
      "menu.manage_category",
      "menu.manage_product",
      "menu.manage_product_variant",
      "menu.manage_modifier_group",
      "menu.manage_modifier",
    ],
  },
  branches: {
    moduleAccess: [
      "branches.view_branch",
      "branches.manage_branch",
      "branches.view_zone",
      "branches.manage_zone",
      "branches.view_table",
      "branches.manage_table",
      "branches.view_station",
      "branches.manage_station",
    ],
    operationalManage: [
      "branches.manage_branch",
      "branches.manage_zone",
      "branches.manage_table",
      "branches.manage_station",
    ],
  },
  sales: {
    moduleAccess: ["sales.view_sale", "sales.manage_sale"],
    operationalManage: ["sales.manage_sale"],
  },
  pos: {
    moduleAccess: ["pos.view_pos", "pos.manage_display"],
    operationalManage: ["pos.manage_display"],
  },
  /** Garson mobil ekranı — backend sipariş yetkisi için backend tarafında hem `waiter.access` hem de `pos.view_pos` geçerlidir. */
  waiter: {
    moduleAccess: ["waiter.access"],
    operationalManage: [],
  },
  /** Admin: garson zone/masa ataması */
  waiter_assignments: {
    moduleAccess: ["branches.manage_waiter_assignment"],
    operationalManage: ["branches.manage_waiter_assignment"],
  },
  /** Admin: aşçı mutfak istasyonu ataması */
  cook_assignments: {
    moduleAccess: ["branches.manage_cook_assignment"],
    operationalManage: ["branches.manage_cook_assignment"],
  },
  /** Admin: müdür şube ataması */
  manager_assignments: {
    moduleAccess: ["branches.manage_manager_assignment"],
    operationalManage: ["branches.manage_manager_assignment"],
  },
  takeaway: {
    moduleAccess: ["takeaway.view_takeaway", "takeaway.manage_takeaway"],
    operationalManage: ["takeaway.manage_takeaway"],
  },
  shifts: {
    moduleAccess: [
      "shifts.view_shift",
      "shifts.manage_shift",
      "shifts.close_shift",
    ],
    operationalManage: ["shifts.manage_shift", "shifts.close_shift"],
  },
  dashboard: {
    moduleAccess: ["dashboard.view_dashboard"],
    operationalManage: [],
  },
  invoices: {
    moduleAccess: ["invoices.view_invoice", "invoices.manage_invoice"],
    operationalManage: ["invoices.manage_invoice"],
  },
  reservations: {
    moduleAccess: [
      "reservations.view_reservation",
      "reservations.manage_reservation",
    ],
    operationalManage: ["reservations.manage_reservation"],
  },
  credit: {
    moduleAccess: ["credit.view_account", "credit.manage_account"],
    operationalManage: ["credit.manage_account"],
  },
  warehouse: {
    moduleAccess: [
      "warehouse.view_warehouse",
      "warehouse.manage_warehouse",
      "warehouse.view_purchase_order",
      "warehouse.manage_purchase_order",
      "warehouse.view_purchase_recommendation",
      "warehouse.commit_purchase_recommendation",
      "warehouse.approve_purchase_order",
      "warehouse.place_purchase_order",
      "warehouse.edit_purchase_order_post_approval",
      "warehouse.view_goods_receiving",
      "warehouse.manage_goods_receiving",
      "warehouse.view_transfer",
      "warehouse.manage_transfer",
      "warehouse.approve_transfer",
      "warehouse.view_stock_counting",
      "warehouse.manage_stock_counting",
      "warehouse.approve_stock_counting",
      "warehouse.delete_stock_counting_final",
    ],
    operationalManage: [
      "warehouse.manage_warehouse",
      "warehouse.manage_purchase_order",
      "warehouse.manage_goods_receiving",
      "warehouse.manage_transfer",
      "warehouse.manage_stock_counting",
    ],
  },
  reporting: {
    moduleAccess: [
      "reporting.view_report_template",
      "reporting.manage_report_template",
      "reporting.generate_report",
    ],
    operationalManage: ["reporting.manage_report_template"],
  },
  printing: {
    moduleAccess: [
      "printing.view_printer",
      "printing.manage_printer",
      "printing.direct_print",
    ],
    operationalManage: ["printing.manage_printer"],
  },
  production_planning: {
    moduleAccess: [
      "production_planning.view_plan",
      "production_planning.manage_plan",
      "production_planning.view_mrp",
      "production_planning.view_86",
      "production_planning.manage_86",
      "production_planning.manage_settings"
    ],
    operationalManage: [
      "production_planning.manage_plan",
      "production_planning.manage_86",
      "production_planning.manage_settings"
    ]
  },
  prep: {
    moduleAccess: ["prep.view_preptask", "prep.add_preptask", "prep.manage_templates", "prep.manage_smart_rules"],
    operationalManage: ["prep.manage_templates", "prep.manage_smart_rules", "prep.add_preptask"],
  },
  performances: {
    moduleAccess: ["performances.view_performance", "performances.manage_performance"],
    operationalManage: ["performances.manage_performance"],
  },
  audit: {
    moduleAccess: ["audit.view_auditlog", "audit.export_auditlog"],
    operationalManage: ["audit.view_auditlog"],
  },
  customers: {
    moduleAccess: ["customers.view_customer", "customers.manage_customer"],
    operationalManage: ["customers.manage_customer"],
  },
  surveys: {
    moduleAccess: [
      "surveys.view_survey",
      "surveys.manage_survey",
      "surveys.view_response",
      "surveys.manage_response",
    ],
    operationalManage: ["surveys.manage_survey", "surveys.manage_response"],
  }
} as const;

// Modül izin haritası
const MODULE_PERMISSIONS = {
  overview: [], // Genel bakış herkese açık
  users: ["users.view_user", "users.manage_user"],
  branches: [...RBAC_PERMISSION_GROUPS.branches.moduleAccess],
  stations: ["branches.view_station", "branches.manage_station"],
  roles: ["rbac.view_role", "rbac.manage_role"],
  tables: ["branches.view_table", "branches.manage_table"],
  shifts: [...RBAC_PERMISSION_GROUPS.shifts.moduleAccess],
  dashboard: [...RBAC_PERMISSION_GROUPS.dashboard.moduleAccess],
  invoices: [...RBAC_PERMISSION_GROUPS.invoices.moduleAccess],
  reservations: [...RBAC_PERMISSION_GROUPS.reservations.moduleAccess],
  credit: [...RBAC_PERMISSION_GROUPS.credit.moduleAccess],
  inventory: [...RBAC_PERMISSION_GROUPS.inventory.moduleAccess],
  recipes: [...RBAC_PERMISSION_GROUPS.recipes.moduleAccess],
  menu: [...RBAC_PERMISSION_GROUPS.menu.moduleAccess],
  orders: [...RBAC_PERMISSION_GROUPS.orders.moduleAccess],
  sales: [...RBAC_PERMISSION_GROUPS.sales.moduleAccess],
  pos: [...RBAC_PERMISSION_GROUPS.pos.moduleAccess],
  waiter: [...RBAC_PERMISSION_GROUPS.waiter.moduleAccess],
  waiter_assignments: [...RBAC_PERMISSION_GROUPS.waiter_assignments.moduleAccess],
  cook_assignments: [...RBAC_PERMISSION_GROUPS.cook_assignments.moduleAccess],
  manager_assignments: [...RBAC_PERMISSION_GROUPS.manager_assignments.moduleAccess],
  takeaway: [...RBAC_PERMISSION_GROUPS.takeaway.moduleAccess],
  kds: [...RBAC_PERMISSION_GROUPS.kds.moduleAccess],
  warehouse: [...RBAC_PERMISSION_GROUPS.warehouse.moduleAccess],
  pos_settings: ["pos.manage_display"],
  reporting: [...RBAC_PERMISSION_GROUPS.reporting.moduleAccess],
  printing: [...RBAC_PERMISSION_GROUPS.printing.moduleAccess],
  production_planning: [...RBAC_PERMISSION_GROUPS.production_planning.moduleAccess],
  prep: [...RBAC_PERMISSION_GROUPS.prep.moduleAccess],
  performances: [...RBAC_PERMISSION_GROUPS.performances.moduleAccess],
  audit: [...RBAC_PERMISSION_GROUPS.audit.moduleAccess],
  allergens: ["inventory.view_allergen", "inventory.manage_allergen"],
  customers: [...RBAC_PERMISSION_GROUPS.customers.moduleAccess],
  surveys: [...RBAC_PERMISSION_GROUPS.surveys.moduleAccess],
} as const;

export type ModuleKey = keyof typeof MODULE_PERMISSIONS;

// Kullanıcının belirli bir modüle erişimi olup olmadığını kontrol et
export function hasModuleAccess(
  userPermissions: string[] | undefined,
  is_superuser: boolean | undefined,
  module: ModuleKey | string
): boolean {
  if (is_superuser) return true;
  if (!(module in MODULE_PERMISSIONS)) return false;
  const requiredPermissions = MODULE_PERMISSIONS[module as ModuleKey];
  if (!requiredPermissions) return false;
  if (requiredPermissions.length === 0) return true; // Genel bakış gibi
  return requiredPermissions.some((perm: string) => userPermissions?.includes(perm));
}

/**
 * POS / Stok / Reçete / Menü tam sayfa kısayolları: ilgili alanda en az bir yönetim izni.
 */
const OPERATIONAL_PAGE_MANAGE_PERMISSIONS = {
  orders: [...RBAC_PERMISSION_GROUPS.orders.operationalManage],
  inventory: [...RBAC_PERMISSION_GROUPS.inventory.operationalManage],
  recipes: [...RBAC_PERMISSION_GROUPS.recipes.operationalManage],
  menu: [...RBAC_PERMISSION_GROUPS.menu.operationalManage],
  branches: [...RBAC_PERMISSION_GROUPS.branches.operationalManage],
  sales: [...RBAC_PERMISSION_GROUPS.sales.operationalManage],
  takeaway: [...RBAC_PERMISSION_GROUPS.takeaway.operationalManage],
  warehouse: [...RBAC_PERMISSION_GROUPS.warehouse.operationalManage],
  shifts: [...RBAC_PERMISSION_GROUPS.shifts.operationalManage],
  invoices: [...RBAC_PERMISSION_GROUPS.invoices.operationalManage],
  reservations: [...RBAC_PERMISSION_GROUPS.reservations.operationalManage],
  credit: [...RBAC_PERMISSION_GROUPS.credit.operationalManage],
  users: ["users.manage_user"],
  stations: ["branches.manage_station"],
  roles: ["rbac.manage_role"],
  pos_settings: ["pos.manage_display"],
  waiter_assignments: ["branches.manage_waiter_assignment"],
  cashier_pins: ["shifts.manage_cashier_pin"],
  cook_assignments: ["branches.manage_cook_assignment"],
  manager_assignments: ["branches.manage_manager_assignment"],
  reporting: [...RBAC_PERMISSION_GROUPS.reporting.operationalManage],
  printing: [...RBAC_PERMISSION_GROUPS.printing.operationalManage],
  production_planning: [...RBAC_PERMISSION_GROUPS.production_planning.operationalManage],
  prep: [...RBAC_PERMISSION_GROUPS.prep.operationalManage],
  audit: [...RBAC_PERMISSION_GROUPS.audit.operationalManage],
  customers: [...RBAC_PERMISSION_GROUPS.customers.operationalManage],
  surveys: [...RBAC_PERMISSION_GROUPS.surveys.operationalManage],
} as const;

export type OperationalShortcutKey = keyof typeof OPERATIONAL_PAGE_MANAGE_PERMISSIONS;

export function hasOperationalManageAccess(
  userPermissions: string[] | undefined,
  is_superuser: boolean | undefined,
  key: OperationalShortcutKey
): boolean {
  if (is_superuser) return true;
  const codes = OPERATIONAL_PAGE_MANAGE_PERMISSIONS[key];
  return codes.some((perm) => userPermissions?.includes(perm));
}

export function hasKdsShortcutAccess(
  userPermissions: string[] | undefined,
  is_superuser: boolean | undefined
): boolean {
  return hasModuleAccess(userPermissions, is_superuser, "kds");
}

export function hasPermission(
  userPermissions: string[] | undefined,
  is_superuser: boolean | undefined,
  permission: string
): boolean {
  if (is_superuser) return true;
  return Boolean(userPermissions?.includes(permission));
}

/** Smart Firing v2 KDS aksiyonları (force-now / snooze) — seed_rbac: `orders.manage_smart_firing` */
export const PERMISSION_ORDERS_MANAGE_SMART_FIRING =
  "orders.manage_smart_firing" as const;

/** Tamamlanmış/onaylı sayım silme (seed_rbac: `warehouse.delete_stock_counting_final`) */
const PERMISSION_DELETE_STOCK_COUNTING_FINAL = "warehouse.delete_stock_counting_final" as const;

/** `manage_purchase_order` tek başına PO onayı vermez; arayüz/API buna göre hizalanır. */
export const PERMISSION_WAREHOUSE_VIEW_PURCHASE_RECOMMENDATION =
  "warehouse.view_purchase_recommendation" as const
export const PERMISSION_WAREHOUSE_COMMIT_PURCHASE_RECOMMENDATION =
  "warehouse.commit_purchase_recommendation" as const
export const PERMISSION_INVENTORY_VIEW_EXPIRY_RISK =
  "inventory.view_expiry_risk" as const
export const PERMISSION_INVENTORY_MANAGE_EXPIRY_ACTION =
  "inventory.manage_expiry_action" as const
export const PERMISSION_INVENTORY_VIEW_RETURN_CANCEL =
  "inventory.view_return_cancel" as const
export const PERMISSION_INVENTORY_MANAGE_RETURN_CANCEL =
  "inventory.manage_return_cancel" as const
export const PERMISSION_WAREHOUSE_APPROVE_PURCHASE_ORDER = "warehouse.approve_purchase_order" as const;
/** Onaylı satın alma siparişini tedarikçiye verme (ORDERED) — seed: "Sipariş Verme" */
export const PERMISSION_WAREHOUSE_PLACE_PURCHASE_ORDER = "warehouse.place_purchase_order" as const;
/** Onay bekleyen + onay sonrası (APPROVED/ORDERED/kısmen teslim) PO düzenleme (seed: "Sipariş Düzenleme") */
export const PERMISSION_WAREHOUSE_EDIT_PURCHASE_ORDER_POST_APPROVAL =
  "warehouse.edit_purchase_order_post_approval" as const;
export const PERMISSION_WAREHOUSE_APPROVE_TRANSFER = "warehouse.approve_transfer" as const;
export const PERMISSION_WAREHOUSE_APPROVE_STOCK_COUNTING = "warehouse.approve_stock_counting" as const;

/** Stok sayımı sil: taslak/devam → `manage_stock_counting`; tamamlanmış/onaylı → `delete_stock_counting_final` */
export function canDeleteStockCountingRecord(
  status: string,
  userPermissions: string[] | undefined,
  is_superuser: boolean | undefined
): boolean {
  const finalized = status === "COMPLETED" || status === "APPROVED";
  if (finalized) {
    return hasPermission(userPermissions, is_superuser, PERMISSION_DELETE_STOCK_COUNTING_FINAL);
  }
  return hasPermission(userPermissions, is_superuser, "warehouse.manage_stock_counting");
}

/** seed_rbac: `financial.view_amount` — sipariş/satış/reçete/POS vb. tutar gösterimi */
const PERMISSION_FINANCIAL_VIEW_AMOUNT = "financial.view_amount" as const;

export function canViewMonetaryAmounts(
  userPermissions: string[] | undefined,
  is_superuser: boolean | undefined
): boolean {
  return hasPermission(userPermissions, is_superuser, PERMISSION_FINANCIAL_VIEW_AMOUNT);
}

/** seed_rbac: `pos.manage_connections` — POS WebSocket bağlantılarını listeleme/kesme (UI + disconnect) */
export const PERMISSION_POS_MANAGE_CONNECTIONS = "pos.manage_connections" as const;

export function canManagePosConnections(
  userPermissions: string[] | undefined,
  is_superuser: boolean | undefined
): boolean {
  return hasPermission(userPermissions, is_superuser, PERMISSION_POS_MANAGE_CONNECTIONS);
}
