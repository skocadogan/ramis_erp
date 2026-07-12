import api, { skipInterceptorToast } from "@/lib/api";
import type { PaginatedResponse } from "@/lib/types";
import {
  PrepTask,
  PrepStatus,
  PrepTemplate,
  PrepSmartRule,
  PrepBranchSettings,
  SmartSuggestion,
  PrepTaskListMode,
} from "../types";

const PREP_LIST_PAGE_SIZE = 50;

function normalizePrepListPage<T>(
  data: PaginatedResponse<T> | T[],
): PaginatedResponse<T> {
  if (Array.isArray(data)) {
    return { results: data, count: data.length, next: null, previous: null };
  }
  const results = data.results ?? [];
  return {
    results,
    count: data.count ?? results.length,
    next: data.next ?? null,
    previous: data.previous ?? null,
  };
}

function historicParam(
  include_historic_completed?: boolean | null,
): { include_historic_completed?: 0 | 1 } {
  if (include_historic_completed === true) return { include_historic_completed: 1 };
  if (include_historic_completed === false) return { include_historic_completed: 0 };
  return {};
}

export const prepApi = {
  /** Şablonlardan bugünün görevlerini üretir (idempotent). GET /list artık bunu yapmaz. */
  generateFromTemplates: async () => {
    const res = await api.post<{ created_count: number; message: string }>(
      "/prep/tasks/generate-from-templates/",
      undefined,
      { ...skipInterceptorToast },
    );
    return res.data;
  },

  getTasksPage: async (params?: {
    branch_id?: string;
    station_id?: string;
    include_historic_completed?: boolean | null;
    status_group?: "active" | "completed" | "";
    page?: number;
    page_size?: number;
  }) => {
    const { include_historic_completed, status_group, page = 1, page_size, ...rest } =
      params ?? {};
    const res = await api.get<PaginatedResponse<PrepTask> | PrepTask[]>("/prep/tasks/", {
      params: {
        ...rest,
        ...historicParam(include_historic_completed),
        ...(status_group ? { status_group } : {}),
        page,
        page_size: page_size ?? PREP_LIST_PAGE_SIZE,
      },
    });
    return normalizePrepListPage(res.data);
  },

  /** Tüm sayfaları birleştirir (KDS operasyonel liste). */
  getTasksAll: async (params?: {
    branch_id?: string;
    station_id?: string;
    include_historic_completed?: boolean | null;
    status_group?: "active" | "completed" | "";
  }) => {
    const all: PrepTask[] = [];
    let page = 1;
    while (true) {
      const batch = await prepApi.getTasksPage({
        ...params,
        page,
        page_size: 200,
      });
      all.push(...batch.results);
      if (!batch.next) break;
      page += 1;
    }
    return all;
  },

  getTasks: async (params?: {
    branch_id?: string;
    station_id?: string;
    include_historic_completed?: boolean | null;
    listMode?: PrepTaskListMode;
  }) => {
    const { listMode, ...rest } = params ?? {};
    const include_historic_completed =
      listMode === "full"
        ? true
        : listMode === "operational"
          ? false
          : rest.include_historic_completed;
    return prepApi.getTasksAll({ ...rest, include_historic_completed });
  },
  
  updateStatus: async (taskId: string, status: PrepStatus) => {
    const res = await api.post<PrepTask>(
      `/prep/tasks/${taskId}/set_status/`,
      { status },
      { ...skipInterceptorToast },
    );
    return res.data;
  },
  
  completeTask: async (taskId: string, completedQuantity?: number) => {
    const res = await api.post<PrepTask>(
      `/prep/tasks/${taskId}/complete/`,
      { completed_quantity: completedQuantity },
      { ...skipInterceptorToast },
    );
    return res.data;
  },

  /** Kademeli ilerleme: görev tamamlanmadan completed_quantity güncellenir */
  recordProgress: async (taskId: string, completedQuantity: number) => {
    const res = await api.post<PrepTask>(
      `/prep/tasks/${taskId}/record-progress/`,
      { completed_quantity: completedQuantity },
      { ...skipInterceptorToast },
    );
    return res.data;
  },
  
  createTask: async (data: Partial<PrepTask>) => {
    const res = await api.post<PrepTask>("/prep/tasks/", data, { ...skipInterceptorToast });
    return res.data;
  },

  patchTask: async (taskId: string, data: Partial<PrepTask>) => {
    const res = await api.patch<PrepTask>(
      `/prep/tasks/${taskId}/`,
      data,
      { ...skipInterceptorToast },
    );
    return res.data;
  },

  deleteTask: async (taskId: string) => {
    await api.delete(`/prep/tasks/${taskId}/`, { ...skipInterceptorToast });
  },
  
  getTemplatesPage: async (params?: {
    branch_id?: string;
    page?: number;
    page_size?: number;
  }) => {
    const { page = 1, page_size, ...rest } = params ?? {};
    const res = await api.get<PaginatedResponse<PrepTemplate> | PrepTemplate[]>(
      "/prep/templates/",
      { params: { ...rest, page, page_size: page_size ?? PREP_LIST_PAGE_SIZE } },
    );
    return normalizePrepListPage(res.data);
  },

  getTemplates: async (params?: { branch_id?: string }) => {
    const all: PrepTemplate[] = [];
    let page = 1;
    while (true) {
      const batch = await prepApi.getTemplatesPage({ ...params, page, page_size: 200 });
      all.push(...batch.results);
      if (!batch.next) break;
      page += 1;
    }
    return all;
  },
  
  createTemplate: async (data: Partial<PrepTemplate>) => {
    const res = await api.post<PrepTemplate>("/prep/templates/", data);
    return res.data;
  },
  
  updateTemplate: async (id: string, data: Partial<PrepTemplate>) => {
    const res = await api.patch<PrepTemplate>(`/prep/templates/${id}/`, data);
    return res.data;
  },
  
  deleteTemplate: async (id: string) => {
    await api.delete(`/prep/templates/${id}/`);
  },

  getSmartRulesPage: async (params?: {
    branch_id?: string;
    page?: number;
    page_size?: number;
  }) => {
    const { page = 1, page_size, ...rest } = params ?? {};
    const res = await api.get<PaginatedResponse<PrepSmartRule> | PrepSmartRule[]>(
      "/prep/smart-rules/",
      { params: { ...rest, page, page_size: page_size ?? PREP_LIST_PAGE_SIZE } },
    );
    return normalizePrepListPage(res.data);
  },

  getSmartRules: async (params?: { branch_id?: string }) => {
    const all: PrepSmartRule[] = [];
    let page = 1;
    while (true) {
      const batch = await prepApi.getSmartRulesPage({ ...params, page, page_size: 200 });
      all.push(...batch.results);
      if (!batch.next) break;
      page += 1;
    }
    return all;
  },

  createSmartRule: async (data: Partial<PrepSmartRule>) => {
    const res = await api.post<PrepSmartRule>("/prep/smart-rules/", data);
    return res.data;
  },

  updateSmartRule: async (id: string, data: Partial<PrepSmartRule>) => {
    const res = await api.patch<PrepSmartRule>(`/prep/smart-rules/${id}/`, data);
    return res.data;
  },

  deleteSmartRule: async (id: string) => {
    await api.delete(`/prep/smart-rules/${id}/`);
  },

  /** Kayıt yokken varsayılan: management_hide_old_completed false */
  getPrepBranchSettingsByBranch: async (branchId: string) => {
    const res = await api.get<PrepBranchSettings>(
      "/prep/branch-settings/by-branch/",
      { params: { branch_id: branchId } }
    );
    return res.data;
  },

  patchPrepBranchSettingsByBranch: async (data: {
    branch: string;
    management_hide_old_completed: boolean;
  }) => {
    const res = await api.patch<PrepBranchSettings>(
      "/prep/branch-settings/by-branch/",
      data
    );
    return res.data;
  },
  
  getBranches: async () => {
    const res = await api.get("/branches/");
    // Sayfalanmış veri gelirse .results kısmını al, yoksa doğrudan veriyi dön
    return Array.isArray(res.data) ? res.data : res.data.results || [];
  },
  
  getStations: async (branchId?: string) => {
    const res = await api.get("/stations/", { 
      params: { branch_id: branchId } 
    });
    // Sayfalanmış veri gelirse .results kısmını al, yoksa doğrudan veriyi dön
    return Array.isArray(res.data) ? res.data : res.data.results || [];
  },

  getProducts: async (branchId?: string) => {
    const res = await api.get("/menu/products/", { 
      params: { branch_id: branchId } 
    });
    return Array.isArray(res.data) ? res.data : res.data.results || [];
  },
  
  getSmartSuggestionsPage: async (params?: {
    branch_id?: string;
    page?: number;
    page_size?: number;
  }) => {
    const { branch_id, page = 1, page_size } = params ?? {};
    const res = await api.get<PaginatedResponse<SmartSuggestion> | SmartSuggestion[]>(
      "/prep/templates/smart_suggestions/",
      { params: { branch_id, page, page_size: page_size ?? PREP_LIST_PAGE_SIZE } },
    );
    return normalizePrepListPage(res.data);
  },

  getSmartSuggestions: async (branchId?: string) => {
    const all: SmartSuggestion[] = [];
    let page = 1;
    while (true) {
      const batch = await prepApi.getSmartSuggestionsPage({
        branch_id: branchId,
        page,
        page_size: 200,
      });
      all.push(...batch.results);
      if (!batch.next) break;
      page += 1;
    }
    return all;
  },

  getRuleDiscovery: async (branchId?: string) => {
    const res = await api.get("/prep/templates/rule_discovery/", {
      params: { branch_id: branchId }
    });
    return res.data;
  },

  /** Şubeye atanmış kullanıcıları getirir (atama seçici için) */
  getBranchUsers: async (branchId: string): Promise<{ id: string; username: string; first_name: string; last_name: string }[]> => {
    const res = await api.get(`/branches/${branchId}/users/`);
    return Array.isArray(res.data) ? res.data : res.data.results || [];
  },
};
