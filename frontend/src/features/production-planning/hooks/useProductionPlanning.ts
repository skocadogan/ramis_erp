import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  type UseQueryOptions,
} from "@tanstack/react-query"
import { productionPlanningApi, fetchAllProductionPlans, fetchAllProductAvailabilities } from "../services/api"
import { 
  ProductionPlan, 
  ProductionPlanForm, 
  ProductDayAvailability, 
  ProductDayAvailabilityForm, 
  ProductionDaySettings,
  ApproximateCostResult,
} from "../types"

export interface PaginatedResponse<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

/** DRF `next` mutlak veya göreli olabilir */
function pageFromDrfNext(next: string | null): number | undefined {
  if (!next) return undefined
  try {
    const url = new URL(next, typeof window !== "undefined" ? window.location.origin : "http://localhost")
    const p = url.searchParams.get("page")
    return p ? parseInt(p, 10) : undefined
  } catch {
    return undefined
  }
}

// --- QUERY KEYS ---
const QUERY_KEYS = {
  plans: (branch_id?: string, start_date?: string, end_date?: string) =>
    ["production_plans", { branch_id, start_date, end_date }] as const,
  /** Sayfalanmış plan listesi (infinite) */
  plansInfinite: (branch_id?: string, start_date?: string, end_date?: string) =>
    ["production_plans", "infinite", { branch_id, start_date, end_date }] as const,
  /** Tek seferde tüm sayfalar (KDS/ modal vb.) */
  plansAll: (branch_id?: string, start_date?: string, end_date?: string) =>
    ["production_plans", "all", { branch_id, start_date, end_date }] as const,
  planDetail: (id: string) => ["production_plan_detail", id] as const,
  planMrp: (id: string) => ["production_plan_mrp", id] as const,
  planApproximateCost: (id: string, station_id?: string) =>
    ["production_plan_approximate_cost", id, station_id ?? "all"] as const,
  availabilities: (branch_id?: string, date?: string, product_id?: string) =>
    ["product_availabilities", { branch_id, date, product_id }] as const,
  availabilitiesInfinite: (branch_id?: string, date?: string, product_id?: string) =>
    ["product_availabilities", "infinite", { branch_id, date, product_id }] as const,
  availabilitiesAll: (branch_id?: string, date?: string, product_id?: string) =>
    ["product_availabilities", "all", { branch_id, date, product_id }] as const,
  settings: (branch_id?: string) => ["production_settings", { branch_id }] as const,
}

// --- QUERIES ---

export function usePlans(
  params?: { branch_id?: string; start_date?: string; end_date?: string },
  options?: Omit<UseQueryOptions<PaginatedResponse<ProductionPlan>>, "queryKey" | "queryFn">
) {
  return useQuery<PaginatedResponse<ProductionPlan>>({
    queryKey: QUERY_KEYS.plans(params?.branch_id, params?.start_date, params?.end_date),
    queryFn: async () => {
      const response = await productionPlanningApi.getPlans({ ...params, page: 1, page_size: 200 })
      return response.data
    },
    ...options,
  })
}

/** Üretim planları — sayfalanmış infinite scroll (liste ekranı) */
export function usePlansInfinite(
  params?: { branch_id?: string; start_date?: string; end_date?: string },
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery<PaginatedResponse<ProductionPlan>>({
    queryKey: QUERY_KEYS.plansInfinite(params?.branch_id, params?.start_date, params?.end_date),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      const response = await productionPlanningApi.getPlans({ ...params, page, page_size: 50 })
      return response.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: options?.enabled ?? true,
  })
}

/** Tüm sayfalar birleşik (modal / özet; ürün başına tüm kısıtlar) */
export function useAllProductionPlans(
  params?: { branch_id?: string; start_date?: string; end_date?: string },
  options?: Omit<UseQueryOptions<ProductionPlan[]>, "queryKey" | "queryFn">
) {
  return useQuery<ProductionPlan[]>({
    queryKey: QUERY_KEYS.plansAll(params?.branch_id, params?.start_date, params?.end_date),
    queryFn: () => fetchAllProductionPlans(params),
    ...options,
  })
}

export function usePlanMrp(id: string, station_id?: string) {
  return useQuery({
    queryKey: [...QUERY_KEYS.planMrp(id), station_id].filter(Boolean),
    queryFn: async () => {
      const response = await productionPlanningApi.getPlanMrp(id, { station_id })
      return response.data
    },
    enabled: !!id,
  })
}

export function usePlanApproximateCostInfinite(
  id: string,
  station_id?: string,
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery<ApproximateCostResult>({
    queryKey: QUERY_KEYS.planApproximateCost(id, station_id),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      const response = await productionPlanningApi.getPlanApproximateCost(id, {
        station_id,
        page,
        page_size: 50,
      })
      return response.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.has_next ? lastPage.next_page ?? undefined : undefined),
    enabled: (options?.enabled ?? true) && !!id,
  })
}


export function useAvailabilitiesInfinite(
  params?: { branch_id?: string; date?: string; product_id?: string },
  options?: { enabled?: boolean }
) {
  return useInfiniteQuery<PaginatedResponse<ProductDayAvailability>>({
    queryKey: QUERY_KEYS.availabilitiesInfinite(params?.branch_id, params?.date, params?.product_id),
    queryFn: async ({ pageParam }) => {
      const page = typeof pageParam === "number" ? pageParam : 1
      const response = await productionPlanningApi.getAvailabilities({ ...params, page, page_size: 50 })
      return response.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
    enabled: options?.enabled ?? true,
  })
}

export function useAllProductAvailabilities(
  params?: { branch_id?: string; date?: string; product_id?: string },
  options?: Omit<UseQueryOptions<ProductDayAvailability[]>, "queryKey" | "queryFn">
) {
  return useQuery<ProductDayAvailability[]>({
    queryKey: QUERY_KEYS.availabilitiesAll(params?.branch_id, params?.date, params?.product_id),
    queryFn: () => fetchAllProductAvailabilities(params),
    ...options,
  })
}

export function useSettings(params?: { branch_id?: string }) {
  return useQuery({
    queryKey: QUERY_KEYS.settings(params?.branch_id),
    queryFn: async () => {
      const response = await productionPlanningApi.getSettings(params)
      return response.data
    },
  })
}

// --- MUTATIONS ---

export function useCreatePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ProductionPlanForm) => productionPlanningApi.createPlan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_plans"] })
    },
  })
}

export function useUpdatePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductionPlanForm> }) => productionPlanningApi.updatePlan(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.planDetail(id) })
      queryClient.invalidateQueries({ queryKey: ["production_plans"] })
    },
  })
}

export function useDeletePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productionPlanningApi.deletePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_plans"] })
    },
  })
}

export function useApprovePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productionPlanningApi.approvePlan(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.planDetail(id) })
      queryClient.invalidateQueries({ queryKey: ["production_plans"] })
    },
  })
}

export function useCopyPlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, target_date }: { id: string; target_date: string }) =>
      productionPlanningApi.copyPlan(id, { target_date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_plans"] })
    },
  })
}

export function useApplyForecast() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { target_date: string; horizon_weeks?: number; overwrite?: boolean } }) =>
      productionPlanningApi.applyForecastToPlan(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.planDetail(id) })
    },
  })
}

// Bulunabilirlik Mutations
export function useCreateAvailability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ProductDayAvailabilityForm | ProductDayAvailabilityForm[]) =>
      productionPlanningApi.createAvailability(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product_availabilities"] })
    },
  })
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductDayAvailabilityForm> }) =>
      productionPlanningApi.updateAvailability(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product_availabilities"] })
    },
  })
}

export function useDeleteAvailability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => productionPlanningApi.deleteAvailability(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product_availabilities"] })
    },
  })
}

// Üretim Planı → Mutfak Görevleri
export function useCreatePrepTasks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      planId,
      data,
    }: {
      planId: string
      data: {
        plan_line_id: string
        scheduled_start?: string
        deadline?: string
        assigned_user_ids?: string[]
      }[]
    }) => productionPlanningApi.createPrepTasks(planId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_plans"] })
    },
  })
}

// Ayarlar Mutations
export function useCreateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ProductionDaySettings) => productionPlanningApi.createSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_settings"] })
    },
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductionDaySettings> }) =>
      productionPlanningApi.updateSettings(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production_settings"] })
    },
  })
}
