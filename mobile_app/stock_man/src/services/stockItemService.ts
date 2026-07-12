// ============================================================
// Stock Man — Stock Item service (+ categories, units, allergens)
//
// Endpoints covered (see docs/wiki/Inventory.md, Stock_Man_App.md):
//   - /inventory/stock-items/                     list + get
//   - /inventory/stock-items/{id}/                detail
//   - /inventory/stock-items/{id}/warehouse-levels/   per-WH levels
//   - /inventory/stock-items/expiring_lots/       legacy SKT list
//   - /inventory/stock-items/fefo-report/         FEFO batch report
//   - /inventory/stock-items/low_stock/           paginated low stock
//   - /inventory/stock-items/summary/             widget counters
//   - /inventory/stock-movements/                 audit log
//   - /inventory/categories/, /inventory/stock-units/, /inventory/allergens/
// ============================================================

import { axiosClient } from "@/api/client";
import { extractResults } from "@/types/api";
import type {
  StockItem,
  StockLot,
  StockMovement,
  StockCategory,
  Allergen,
  StockUnit,
  Paginated,
  UUID,
} from "@/types";

export const stockItemService = {
  list: async (params?: {
    warehouse_id?: UUID;
    category_id?: UUID;
    supplier_id?: UUID;
    is_low_stock?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
    stock_status?: "normal" | "low" | "critical" | "warning";
  }): Promise<Paginated<StockItem>> => {
    const res = await axiosClient.get("/inventory/stock-items/", { params });
    return res.data;
  },

  get: async (id: UUID): Promise<StockItem> => {
    const res = await axiosClient.get<StockItem>(`/inventory/stock-items/${id}/`);
    return res.data;
  },

  create: async (data: {
    name: string;
    sku: string;
    barcode?: string;
    unit?: string;
    category?: UUID;
    minimum_quantity?: number;
    last_purchase_price?: number;
    allergen_ids?: UUID[];
  }): Promise<StockItem> => {
    const res = await axiosClient.post<StockItem>("/inventory/stock-items/", data);
    return res.data;
  },

  warehouseLevels: async (id: UUID): Promise<import("@/types").WarehouseStockLevel[]> => {
    const res = await axiosClient.get(`/inventory/stock-items/${id}/warehouse-levels/`);
    return extractResults<import("@/types").WarehouseStockLevel>(res.data);
  },

  expiringLots: async (params?: {
    warehouse_id?: UUID;
    stock_item_id?: UUID;
    days_ahead?: 3 | 7;
  }): Promise<StockLot[]> => {
    const res = await axiosClient.get("/inventory/stock-items/expiring_lots/", { params });
    return extractResults<StockLot>(res.data);
  },

  fefoReport: async (params?: { warehouse_id?: UUID; search?: string }): Promise<
    {
      id: UUID;
      name: string;
      sku: string;
      total_quantity: number;
      total_value: number;
    }[]
  > => {
    const res = await axiosClient.get("/inventory/stock-items/fefo-report/", { params });
    return extractResults(res.data);
  },

  fefoReportDetail: async (params: {
    stock_item_id: UUID;
    warehouse_id?: UUID;
  }): Promise<{
    id: UUID;
    name: string;
    sku: string;
    unit: string;
    category_name: string;
    total_quantity: number;
    total_value: number;
    lots: StockLot[];
  }> => {
    const res = await axiosClient.get("/inventory/stock-items/fefo-report/detail/", { params });
    return res.data;
  },

  lowStock: async (params?: {
    warehouse_id?: UUID;
  }): Promise<Paginated<StockItem>> => {
    const res = await axiosClient.get("/inventory/stock-items/low_stock/", { params });
    return res.data;
  },

  summary: async (params?: {
    warehouse_id?: UUID;
  }): Promise<{ total: number; low: number; critical: number; out: number }> => {
    const res = await axiosClient.get("/inventory/stock-items/summary/", { params });
    return res.data;
  },

  movements: async (params?: {
    stock_item_id?: UUID;
    warehouse_id?: UUID;
    movement_type?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<Paginated<StockMovement>> => {
    const res = await axiosClient.get("/inventory/stock-movements/", { params });
    return res.data;
  },
};

export const stockCategoryService = {
  list: async (params?: { parent?: UUID; search?: string }): Promise<Paginated<StockCategory>> => {
    const res = await axiosClient.get("/inventory/categories/", { params });
    return res.data;
  },
  get: async (id: UUID): Promise<StockCategory> => {
    const res = await axiosClient.get<StockCategory>(`/inventory/categories/${id}/`);
    return res.data;
  },
};

export const stockUnitService = {
  list: async (): Promise<StockUnit[]> => {
    const res = await axiosClient.get("/inventory/stock-units/");
    return extractResults<StockUnit>(res.data);
  },
};

export const allergenService = {
  list: async (params?: { search?: string }): Promise<Paginated<Allergen>> => {
    const res = await axiosClient.get("/inventory/allergens/", { params });
    return res.data;
  },
};
