import type { Zone, Table, Category, ProductionPlan, AvailabilityLine } from "../types/models";
import apiClient from "./client";

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object" && "results" in data) {
    const r = (data as { results?: T[] }).results;
    return Array.isArray(r) ? r : [];
  }
  return [];
}

export async function fetchZones(branchId: string): Promise<Zone[]> {
  const res = await apiClient.get("/zones/", { params: { branch_id: branchId } });
  return unwrapList<Zone>(res.data);
}

export async function fetchTables(branchId: string): Promise<Table[]> {
  const res = await apiClient.get("/tables/", { params: { branch_id: branchId, scope: "waiter" } });
  return unwrapList<Table>(res.data);
}

export async function fetchTakeawayVirtualTables(branchId: string): Promise<Table[]> {
  const res = await apiClient.get("/tables/takeaway_virtual/", {
    params: { branch_id: branchId, scope: "waiter" },
  });
  return Array.isArray(res.data) ? (res.data as Table[]) : [];
}

export async function fetchMenuCategories(branchId: string): Promise<Category[]> {
  const res = await apiClient.get("/menu/categories/", {
    params: { branch_id: branchId },
  });
  return unwrapList<Category>(res.data);
}

export type FetchMenuProductsOptions = {
  categoryId?: string | null;
  featuredOnly?: boolean;
};

export async function fetchMenuProducts(branchId: string, options?: FetchMenuProductsOptions) {
  const params: Record<string, string> = {
    branch_id: branchId,
    show_on_pos: "true",
  };
  if (options?.categoryId) {
    params.category_id = options.categoryId;
  }
  if (options?.featuredOnly) {
    params.is_featured = "true";
  }
  const res = await apiClient.get("/menu/products/", { params });
  return unwrapList<Record<string, unknown>>(res.data);
}

async function fetchWaiterTablesCount(branchId: string) {
  const res = await apiClient.get<{ count: number }>("/tables/waiter-count/", {
    params: { branch_id: branchId, scope: "waiter" },
  });
  return res.data.count ?? 0;
}

export async function fetchReadyForWaiterCount(branchId: string) {
  const res = await apiClient.get<{ count: number }>("/orders/items/ready-for-waiter/count/", {
    params: { branch_id: branchId },
  });
  return res.data.count ?? 0;
}

export async function fetchActiveShift(branchId: string, posTerminalUuid: string | null) {
  const res = await apiClient.get("/shifts/active/", {
    params: {
      branch_id: branchId,
      terminal_id: posTerminalUuid || undefined,
    },
  });
  return res.data;
}

export async function fetchDashboardStats(branchId: string) {
  const [tablesCount, readyCount] = await Promise.all([
    fetchWaiterTablesCount(branchId),
    fetchReadyForWaiterCount(branchId),
  ]);
  return { tables: tablesCount, ready: readyCount, delivered: 0 };
}

export async function fetchMyOrders(branchId: string) {
  const res = await apiClient.get("/orders/main/", {
    params: {
      branch_id: branchId,
      status: "PENDING,PREPARING,READY,DELIVERED",
    },
  });
  return unwrapList<Record<string, unknown>>(res.data);
}

export type KitchenPrinter = {
  id: string;
  name?: string;
  usage_type?: string;
  is_active?: boolean;
  kitchen_station?: string | null;
  kitchen_station_name?: string | null;
  receipt_template_slug?: string | null;
  ip_address?: string | null;
  port?: number | null;
  device_path?: string | null;
  connection_type_display?: string;
};

export async function fetchPrinters(
  branchId: string,
  params?: Record<string, unknown>
): Promise<KitchenPrinter[]> {
  const res = await apiClient.get("/printing/printers/", {
    params: { branch_id: branchId, ...params },
  });
  return unwrapList<KitchenPrinter>(res.data);
}

export async function fetchReceiptTemplates() {
  const res = await apiClient.get("/reporting/receipts/");
  return unwrapList<Record<string, unknown>>(res.data);
}

export async function fetchProductionPlans(
  branchId: string,
  date: string
): Promise<ProductionPlan[]> {
  const res = await apiClient.get("/production-planning/plans/", {
    params: { branch_id: branchId, start_date: date, end_date: date, page_size: 100 },
  });
  return unwrapList<ProductionPlan>(res.data);
}

export async function fetchProductAvailabilities(
  branchId: string,
  date: string
): Promise<AvailabilityLine[]> {
  const res = await apiClient.get("/production-planning/availability/", {
    params: { branch_id: branchId, date, page_size: 200 },
  });
  return unwrapList<AvailabilityLine>(res.data);
}

export async function fetchPendingWaiterCalls(branchId: string) {
  const res = await apiClient.get<{ calls: Record<string, unknown>[] }>("/waiter-calls/pending/", {
    params: { branch_id: branchId },
  });
  return res.data.calls ?? [];
}

export async function dismissWaiterCalls(params: {
  branchId: string;
  callId?: string;
  callIds?: string[];
  dismissAll?: boolean;
}): Promise<void> {
  const body: Record<string, unknown> = {
    branch_id: params.branchId,
  };
  if (params.dismissAll) {
    body.dismiss_all = true;
  } else if (params.callIds?.length) {
    body.call_ids = params.callIds;
  } else if (params.callId) {
    body.call_id = params.callId;
  }
  await apiClient.post("/waiter-calls/dismiss/", body);
}

export async function startTableCleaning(tableId: string) {
  const res = await apiClient.post(`/tables/${tableId}/start_cleaning/`);
  return res.data;
}

export async function finishTableCleaning(tableId: string) {
  const res = await apiClient.post(`/tables/${tableId}/finish_cleaning/`);
  return res.data;
}
