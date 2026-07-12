"use client"

import { useReducer } from "react"
import type { StockItem, StockCategory, StockUnit, Supplier, FEFOReportListItem } from "@/features/inventory/types"

// ─── Form data shapes ────────────────────────────────────────────────────────

export interface MovementFormData {
  stock_item_id: string
  warehouse_id: string
  movement_type: string
  quantity: string
  unit: string
  reference: string
  notes: string
  supplier_id: string
  unit_price: string
}

export interface SupplierFormData {
  name: string
  contact_person: string
  phone: string
  email: string
  address: string
  notes: string
  stock_items: string[]
}

export interface CategoryFormData {
  name: string
  code: string
  parent: string
}

export interface UnitFormData {
  name: string
  short_name: string
  multiplier: string
}

// ─── Reducer state ────────────────────────────────────────────────────────────

interface ModalState {
  movement: {
    open: boolean
    data: MovementFormData
  }
  costHistory: {
    open: boolean
    item: StockItem | null
  }
  stockItemDetail: {
    open: boolean
    item: StockItem | null
  }
  stockItemDelete: {
    open: boolean
    target: StockItem | null
  }
  supplier: {
    formOpen: boolean
    editingId: string | null
    formData: SupplierFormData
    deleteOpen: boolean
    deleteTargetId: string | null
  }
  movementDelete: {
    open: boolean
    targetId: string | null
  }
  category: {
    formOpen: boolean
    editingId: string | null
    formData: CategoryFormData
    deleteOpen: boolean
    deleteTarget: StockCategory | null
  }
  unit: {
    formOpen: boolean
    editingId: string | null
    formData: UnitFormData
    deleteOpen: boolean
    deleteTargetId: string | null
  }
  fefoLotDetail: {
    open: boolean
    item: FEFOReportListItem | null
  }
}

// ─── Reducer actions ──────────────────────────────────────────────────────────

type ModalAction =
  | { type: "OPEN_MOVEMENT_FORM"; payload?: Partial<MovementFormData> }
  | { type: "CLOSE_MOVEMENT_FORM" }
  | { type: "SET_MOVEMENT_DATA"; payload: MovementFormData }
  | { type: "OPEN_COST_HISTORY"; item: StockItem }
  | { type: "CLOSE_COST_HISTORY" }
  | { type: "OPEN_STOCK_ITEM_DETAIL"; item: StockItem }
  | { type: "CLOSE_STOCK_ITEM_DETAIL" }
  | { type: "OPEN_STOCK_ITEM_DELETE"; item: StockItem }
  | { type: "CLOSE_STOCK_ITEM_DELETE" }
  | { type: "OPEN_ADD_SUPPLIER" }
  | { type: "OPEN_EDIT_SUPPLIER"; supplier: Supplier }
  | { type: "CLOSE_SUPPLIER_FORM" }
  | { type: "SET_SUPPLIER_FORM_DATA"; payload: SupplierFormData }
  | { type: "OPEN_SUPPLIER_DELETE"; id: string }
  | { type: "CLOSE_SUPPLIER_DELETE" }
  | { type: "OPEN_MOVEMENT_DELETE"; id: string }
  | { type: "CLOSE_MOVEMENT_DELETE" }
  | { type: "OPEN_ADD_CATEGORY" }
  | { type: "OPEN_ADD_SUBCATEGORY"; parentId: string }
  | { type: "OPEN_EDIT_CATEGORY"; category: StockCategory }
  | { type: "CLOSE_CATEGORY_FORM" }
  | { type: "SET_CATEGORY_FORM_DATA"; payload: CategoryFormData }
  | { type: "OPEN_CATEGORY_DELETE"; category: StockCategory }
  | { type: "CLOSE_CATEGORY_DELETE" }
  | { type: "OPEN_ADD_UNIT" }
  | { type: "OPEN_EDIT_UNIT"; unit: StockUnit }
  | { type: "CLOSE_UNIT_FORM" }
  | { type: "SET_UNIT_FORM_DATA"; payload: UnitFormData }
  | { type: "OPEN_UNIT_DELETE"; id: string }
  | { type: "CLOSE_UNIT_DELETE" }
  | { type: "OPEN_FEFO_LOT_DETAIL"; item: FEFOReportListItem }
  | { type: "CLOSE_FEFO_LOT_DETAIL" }

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MOVEMENT_DATA: MovementFormData = {
  stock_item_id: "", warehouse_id: "", movement_type: "IN",
  quantity: "", unit: "", reference: "", notes: "", supplier_id: "", unit_price: "0",
}
const DEFAULT_SUPPLIER_DATA: SupplierFormData = {
  name: "", contact_person: "", phone: "", email: "", address: "", notes: "", stock_items: [],
}
const DEFAULT_CATEGORY_DATA: CategoryFormData = { name: "", code: "", parent: "" }
const DEFAULT_UNIT_DATA: UnitFormData = { name: "", short_name: "", multiplier: "1.000" }

const INITIAL_STATE: ModalState = {
  movement: { open: false, data: DEFAULT_MOVEMENT_DATA },
  costHistory: { open: false, item: null },
  stockItemDetail: { open: false, item: null },
  stockItemDelete: { open: false, target: null },
  supplier: { formOpen: false, editingId: null, formData: DEFAULT_SUPPLIER_DATA, deleteOpen: false, deleteTargetId: null },
  movementDelete: { open: false, targetId: null },
  category: { formOpen: false, editingId: null, formData: DEFAULT_CATEGORY_DATA, deleteOpen: false, deleteTarget: null },
  unit: { formOpen: false, editingId: null, formData: DEFAULT_UNIT_DATA, deleteOpen: false, deleteTargetId: null },
  fefoLotDetail: { open: false, item: null },
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    // ---- Movement form ----
    case "OPEN_MOVEMENT_FORM":
      return { ...state, movement: { open: true, data: { ...DEFAULT_MOVEMENT_DATA, ...action.payload } } }
    case "CLOSE_MOVEMENT_FORM":
      return { ...state, movement: { ...state.movement, open: false } }
    case "SET_MOVEMENT_DATA":
      return { ...state, movement: { ...state.movement, data: action.payload } }

    // ---- Cost history ----
    case "OPEN_COST_HISTORY":
      return { ...state, costHistory: { open: true, item: action.item } }
    case "CLOSE_COST_HISTORY":
      return { ...state, costHistory: { open: false, item: null } }

    case "OPEN_STOCK_ITEM_DETAIL":
      return { ...state, stockItemDetail: { open: true, item: action.item } }
    case "CLOSE_STOCK_ITEM_DETAIL":
      return { ...state, stockItemDetail: { open: false, item: null } }

    case "OPEN_STOCK_ITEM_DELETE":
      return { ...state, stockItemDelete: { open: true, target: action.item } }
    case "CLOSE_STOCK_ITEM_DELETE":
      return { ...state, stockItemDelete: { open: false, target: null } }

    // ---- Supplier form ----
    case "OPEN_ADD_SUPPLIER":
      return { ...state, supplier: { ...state.supplier, formOpen: true, editingId: null, formData: DEFAULT_SUPPLIER_DATA } }
    case "OPEN_EDIT_SUPPLIER": {
      const s = action.supplier
      return {
        ...state,
        supplier: {
          ...state.supplier, formOpen: true, editingId: s.id,
          formData: { name: s.name, contact_person: s.contact_person || "", phone: s.phone || "", email: s.email || "", address: s.address || "", notes: s.notes || "", stock_items: s.stock_items || [] },
        },
      }
    }
    case "CLOSE_SUPPLIER_FORM":
      return { ...state, supplier: { ...state.supplier, formOpen: false, editingId: null } }
    case "SET_SUPPLIER_FORM_DATA":
      return { ...state, supplier: { ...state.supplier, formData: action.payload } }
    case "OPEN_SUPPLIER_DELETE":
      return { ...state, supplier: { ...state.supplier, deleteOpen: true, deleteTargetId: action.id } }
    case "CLOSE_SUPPLIER_DELETE":
      return { ...state, supplier: { ...state.supplier, deleteOpen: false, deleteTargetId: null } }

    // ---- Movement delete ----
    case "OPEN_MOVEMENT_DELETE":
      return { ...state, movementDelete: { open: true, targetId: action.id } }
    case "CLOSE_MOVEMENT_DELETE":
      return { ...state, movementDelete: { open: false, targetId: null } }

    // ---- Category form ----
    case "OPEN_ADD_CATEGORY":
      return { ...state, category: { ...state.category, formOpen: true, editingId: null, formData: DEFAULT_CATEGORY_DATA } }
    case "OPEN_ADD_SUBCATEGORY":
      return { ...state, category: { ...state.category, formOpen: true, editingId: null, formData: { ...DEFAULT_CATEGORY_DATA, parent: action.parentId } } }
    case "OPEN_EDIT_CATEGORY": {
      const c = action.category
      return { ...state, category: { ...state.category, formOpen: true, editingId: c.id, formData: { name: c.name, code: c.code, parent: c.parent || "" } } }
    }
    case "CLOSE_CATEGORY_FORM":
      return { ...state, category: { ...state.category, formOpen: false, editingId: null } }
    case "SET_CATEGORY_FORM_DATA":
      return { ...state, category: { ...state.category, formData: action.payload } }
    case "OPEN_CATEGORY_DELETE":
      return { ...state, category: { ...state.category, deleteOpen: true, deleteTarget: action.category } }
    case "CLOSE_CATEGORY_DELETE":
      return { ...state, category: { ...state.category, deleteOpen: false, deleteTarget: null } }

    // ---- Unit form ----
    case "OPEN_ADD_UNIT":
      return { ...state, unit: { ...state.unit, formOpen: true, editingId: null, formData: DEFAULT_UNIT_DATA } }
    case "OPEN_EDIT_UNIT": {
      const u = action.unit
      return { ...state, unit: { ...state.unit, formOpen: true, editingId: u.id, formData: { name: u.name, short_name: u.short_name, multiplier: String(u.multiplier) } } }
    }
    case "CLOSE_UNIT_FORM":
      return { ...state, unit: { ...state.unit, formOpen: false, editingId: null } }
    case "SET_UNIT_FORM_DATA":
      return { ...state, unit: { ...state.unit, formData: action.payload } }
    case "OPEN_UNIT_DELETE":
      return { ...state, unit: { ...state.unit, deleteOpen: true, deleteTargetId: action.id } }
    case "CLOSE_UNIT_DELETE":
      return { ...state, unit: { ...state.unit, deleteOpen: false, deleteTargetId: null } }

    case "OPEN_FEFO_LOT_DETAIL":
      return { ...state, fefoLotDetail: { open: true, item: action.item } }
    case "CLOSE_FEFO_LOT_DETAIL":
      return { ...state, fefoLotDetail: { open: false, item: null } }

    default:
      return state
  }
}

// ─── Public hook ──────────────────────────────────────────────────────────────

export function useInventoryModalManager() {
  const [state, dispatch] = useReducer(modalReducer, INITIAL_STATE)

  return {
    // ---- Movement form ----
    showMovementForm: state.movement.open,
    movementData: state.movement.data,
    setShowMovementForm: (open: boolean) =>
      dispatch({ type: open ? "OPEN_MOVEMENT_FORM" : "CLOSE_MOVEMENT_FORM" }),
    setMovementData: (data: MovementFormData) =>
      dispatch({ type: "SET_MOVEMENT_DATA", payload: data }),
    openMovementFormFor: (
      stockItemId: string,
      movementType: string,
      unit: string,
      options?: { warehouseId?: string | null; quantity?: string },
    ) =>
      dispatch({
        type: "OPEN_MOVEMENT_FORM",
        payload: {
          stock_item_id: stockItemId,
          movement_type: movementType,
          unit,
          ...(options?.warehouseId ? { warehouse_id: options.warehouseId } : {}),
          ...(options?.quantity !== undefined ? { quantity: options.quantity } : {}),
        },
      }),
    openMovementForm: (defaults?: Partial<MovementFormData>) =>
      dispatch({ type: "OPEN_MOVEMENT_FORM", payload: defaults }),

    // ---- Cost history ----
    showCostHistory: state.costHistory.open,
    selectedItemForHistory: state.costHistory.item,
    openCostHistory: (item: StockItem) => dispatch({ type: "OPEN_COST_HISTORY", item }),
    closeCostHistory: () => dispatch({ type: "CLOSE_COST_HISTORY" }),

    showStockItemDetail: state.stockItemDetail.open,
    stockItemDetailItem: state.stockItemDetail.item,
    openStockItemDetail: (item: StockItem) => dispatch({ type: "OPEN_STOCK_ITEM_DETAIL", item }),
    closeStockItemDetail: () => dispatch({ type: "CLOSE_STOCK_ITEM_DETAIL" }),

    isStockItemDeleteDialogOpen: state.stockItemDelete.open,
    stockItemToDelete: state.stockItemDelete.target,
    setIsStockItemDeleteDialogOpen: (open: boolean) => { if (!open) dispatch({ type: "CLOSE_STOCK_ITEM_DELETE" }) },
    openStockItemDelete: (item: StockItem) => dispatch({ type: "OPEN_STOCK_ITEM_DELETE", item }),
    closeStockItemDelete: () => dispatch({ type: "CLOSE_STOCK_ITEM_DELETE" }),

    // ---- Supplier form ----
    showSupplierForm: state.supplier.formOpen,
    editingSupplierId: state.supplier.editingId,
    supplierFormData: state.supplier.formData,
    setShowSupplierForm: (open: boolean) =>
      dispatch({ type: open ? "OPEN_ADD_SUPPLIER" : "CLOSE_SUPPLIER_FORM" }),
    setSupplierFormData: (data: SupplierFormData) =>
      dispatch({ type: "SET_SUPPLIER_FORM_DATA", payload: data }),
    openAddSupplier: () => dispatch({ type: "OPEN_ADD_SUPPLIER" }),
    openEditSupplier: (supplier: Supplier) => dispatch({ type: "OPEN_EDIT_SUPPLIER", supplier }),
    closeSupplierForm: () => dispatch({ type: "CLOSE_SUPPLIER_FORM" }),

    // ---- Supplier delete ----
    isDeleteDialogOpen: state.supplier.deleteOpen,
    supplierToDelete: state.supplier.deleteTargetId,
    setIsDeleteDialogOpen: (open: boolean) => { if (!open) dispatch({ type: "CLOSE_SUPPLIER_DELETE" }) },
    openSupplierDelete: (id: string) => dispatch({ type: "OPEN_SUPPLIER_DELETE", id }),
    closeSupplierDelete: () => dispatch({ type: "CLOSE_SUPPLIER_DELETE" }),

    // ---- Movement delete ----
    isMovementDeleteDialogOpen: state.movementDelete.open,
    movementToDelete: state.movementDelete.targetId,
    setIsMovementDeleteDialogOpen: (open: boolean) => { if (!open) dispatch({ type: "CLOSE_MOVEMENT_DELETE" }) },
    openMovementDelete: (id: string) => dispatch({ type: "OPEN_MOVEMENT_DELETE", id }),
    closeMovementDelete: () => dispatch({ type: "CLOSE_MOVEMENT_DELETE" }),

    // ---- Category form ----
    showCategoryForm: state.category.formOpen,
    editingCategoryId: state.category.editingId,
    categoryFormData: state.category.formData,
    setShowCategoryForm: (open: boolean) =>
      dispatch({ type: open ? "OPEN_ADD_CATEGORY" : "CLOSE_CATEGORY_FORM" }),
    setCategoryFormData: (data: CategoryFormData) =>
      dispatch({ type: "SET_CATEGORY_FORM_DATA", payload: data }),
    openAddSubcategory: (parentId: string) => dispatch({ type: "OPEN_ADD_SUBCATEGORY", parentId }),
    openEditCategory: (category: StockCategory) => dispatch({ type: "OPEN_EDIT_CATEGORY", category }),
    closeCategoryForm: () => dispatch({ type: "CLOSE_CATEGORY_FORM" }),

    // ---- Category delete ----
    isCategoryDeleteDialogOpen: state.category.deleteOpen,
    categoryToDelete: state.category.deleteTarget,
    setIsCategoryDeleteDialogOpen: (open: boolean) => { if (!open) dispatch({ type: "CLOSE_CATEGORY_DELETE" }) },
    openCategoryDelete: (category: StockCategory) => dispatch({ type: "OPEN_CATEGORY_DELETE", category }),
    closeCategoryDelete: () => dispatch({ type: "CLOSE_CATEGORY_DELETE" }),

    // ---- Unit form ----
    showUnitForm: state.unit.formOpen,
    editingUnitId: state.unit.editingId,
    unitFormData: state.unit.formData,
    setShowUnitForm: (open: boolean) =>
      dispatch({ type: open ? "OPEN_ADD_UNIT" : "CLOSE_UNIT_FORM" }),
    setUnitFormData: (data: UnitFormData) =>
      dispatch({ type: "SET_UNIT_FORM_DATA", payload: data }),
    openEditUnit: (unit: StockUnit) => dispatch({ type: "OPEN_EDIT_UNIT", unit }),
    closeUnitForm: () => dispatch({ type: "CLOSE_UNIT_FORM" }),

    // ---- Unit delete ----
    isUnitDeleteDialogOpen: state.unit.deleteOpen,
    unitToDelete: state.unit.deleteTargetId,
    setIsUnitDeleteDialogOpen: (open: boolean) => { if (!open) dispatch({ type: "CLOSE_UNIT_DELETE" }) },
    openUnitDelete: (id: string) => dispatch({ type: "OPEN_UNIT_DELETE", id }),
    closeUnitDelete: () => dispatch({ type: "CLOSE_UNIT_DELETE" }),

    // ---- FEFO Lot Detail Modal ----
    showFEFOLotDetail: state.fefoLotDetail.open,
    fefoLotDetailItem: state.fefoLotDetail.item,
    openFEFOLotDetail: (item: FEFOReportListItem) => dispatch({ type: "OPEN_FEFO_LOT_DETAIL", item }),
    closeFEFOLotDetail: () => dispatch({ type: "CLOSE_FEFO_LOT_DETAIL" }),
  }
}
