import api, { skipInterceptorToast } from "@/lib/api"
import { ProductionPlanForm, ProductDayAvailabilityForm, ProductionDaySettings } from "../types"
import type { ProductionPlan, ProductDayAvailability } from "../types"

interface ProductionPlanningPaginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

const CHUNK = 200
const MAX_PAGES = 500

export async function fetchAllProductionPlans(params?: {
  branch_id?: string
  start_date?: string
  end_date?: string
}): Promise<ProductionPlan[]> {
  const out: ProductionPlan[] = []
  let page = 1
  for (;;) {
    const { data } = await api.get<ProductionPlanningPaginated<ProductionPlan>>("/production-planning/plans/", {
      params: { ...params, page, page_size: CHUNK },
    })
    out.push(...(data.results || []))
    if (!data.next) break
    page += 1
    if (page > MAX_PAGES) break
  }
  return out
}

export async function fetchAllProductAvailabilities(params?: {
  branch_id?: string
  date?: string
  product_id?: string
}): Promise<ProductDayAvailability[]> {
  const out: ProductDayAvailability[] = []
  let page = 1
  for (;;) {
    const { data } = await api.get<ProductionPlanningPaginated<ProductDayAvailability>>(
      "/production-planning/availability/",
      { params: { ...params, page, page_size: CHUNK } }
    )
    out.push(...(data.results || []))
    if (!data.next) break
    page += 1
    if (page > MAX_PAGES) break
  }
  return out
}

export const productionPlanningApi = {
  // Plans
  getPlans: (params?: {
    branch_id?: string
    start_date?: string
    end_date?: string
    page?: number
    page_size?: number
  }) => api.get("/production-planning/plans/", { params }),

  getPlan: (id: string) => api.get(`/production-planning/plans/${id}/`),

  createPlan: (data: ProductionPlanForm) => api.post("/production-planning/plans/", data, { ...skipInterceptorToast }),

  updatePlan: (id: string, data: Partial<ProductionPlanForm>) =>
    api.patch(`/production-planning/plans/${id}/`, data, { ...skipInterceptorToast }),

  deletePlan: (id: string) => api.delete(`/production-planning/plans/${id}/`, { ...skipInterceptorToast }),

  approvePlan: (id: string) => api.post(`/production-planning/plans/${id}/approve/`, undefined, { ...skipInterceptorToast }),

  copyPlan: (id: string, data: { target_date: string }) =>
    api.post(`/production-planning/plans/${id}/copy/`, data, { ...skipInterceptorToast }),

  getPlanMrp: (id: string, params?: { station_id?: string }) => api.get(`/production-planning/plans/${id}/mrp/`, { params }),

  getPlanApproximateCost: (
    id: string,
    params?: { station_id?: string; page?: number; page_size?: number }
  ) => api.get(`/production-planning/plans/${id}/approximate-cost/`, { params }),

  getPlanMrpPdfUrl: (id: string, params?: { station_id?: string; station_name?: string }) => {
    const baseUrl = api.defaults.baseURL || ""
    const url = `${baseUrl}/production-planning/plans/${id}/mrp-pdf/`
    const searchParams = new URLSearchParams()
    if (params?.station_id) searchParams.append("station_id", params.station_id)
    if (params?.station_name) searchParams.append("station_name", params.station_name)
    const qs = searchParams.toString()
    return qs ? `${url}?${qs}` : url
  },

  previewForecast: (id: string, data: { horizon_weeks?: number }) =>
    api.post<{ preview: { product_id: string; product_name: string; target_quantity: number; historical_avg: number }[] }>(
      `/production-planning/plans/${id}/preview-forecast/`,
      data,
      { ...skipInterceptorToast },
    ),

  applyForecastToPlan: (id: string, data: { target_date: string; horizon_weeks?: number; overwrite?: boolean }) =>
    api.post(`/production-planning/plans/${id}/apply-forecast/`, data, { ...skipInterceptorToast }),

  // Bulunabilirlik (Ürün kalmadı uyarısı (86) listesi, limitleri)
  getAvailabilities: (params?: {
    branch_id?: string
    date?: string
    product_id?: string
    page?: number
    page_size?: number
  }) => api.get("/production-planning/availability/", { params }),

  createAvailability: (data: ProductDayAvailabilityForm | ProductDayAvailabilityForm[]) => {
    if (Array.isArray(data)) {
      return api.post("/production-planning/availability/bulk-create/", data, { ...skipInterceptorToast })
    }
    return api.post("/production-planning/availability/", data, { ...skipInterceptorToast })
  },

  updateAvailability: (id: string, data: Partial<ProductDayAvailabilityForm>) =>
    api.patch(`/production-planning/availability/${id}/`, data, { ...skipInterceptorToast }),

  deleteAvailability: (id: string) => api.delete(`/production-planning/availability/${id}/`, { ...skipInterceptorToast }),

  // Üretim Planı → Mutfak Görevleri
  createPrepTasks: (planId: string, data: {
    plan_line_id: string
    scheduled_start?: string
    deadline?: string
    assigned_user_ids?: string[]
  }[]) => api.post(`/production-planning/plans/${planId}/create-prep-tasks/`, data, { ...skipInterceptorToast }),

  // Ayarlar
  getSettings: (params?: { branch_id?: string }) => api.get("/production-planning/settings/", { params }),

  createSettings: (data: ProductionDaySettings) =>
    api.post("/production-planning/settings/", data, { ...skipInterceptorToast }),

  updateSettings: (id: string, data: Partial<ProductionDaySettings>) =>
    api.patch(`/production-planning/settings/${id}/`, data, { ...skipInterceptorToast }),
}
