import { isAxiosError } from "axios"
import api, { skipInterceptorToast } from "@/lib/api"
import { extractApiError } from "@/lib/api-utils"

export interface RecycleBinSummary {
  app_label: string
  model_name: string
  verbose_name: string
  count: number
}

export interface RecycleBinItem {
  id: string
  name: string
  deleted_at: string | null
  app_label: string
  model_name: string
}

export interface RecycleBinActionResponse {
  status?: string
  message?: string
  deleted_refs?: string[]
}

export interface RecycleBinDeleteErrorPayload {
  error?: string
  dependencies?: string[]
  can_force_delete?: boolean
}

export function parseRecycleBinDeleteError(
  err: unknown,
  fallback: string,
): RecycleBinDeleteErrorPayload & { message: string } {
  if (isAxiosError(err)) {
    const data = err.response?.data as RecycleBinDeleteErrorPayload | undefined
    return {
      message: data?.error ?? extractApiError(err, fallback),
      error: data?.error,
      dependencies: Array.isArray(data?.dependencies) ? data.dependencies : undefined,
      can_force_delete: data?.can_force_delete,
    }
  }
  return { message: fallback }
}

export const recycleBinApi = {
  getSummary: () =>
    api.get<RecycleBinSummary[]>("/recycle-bin/summary/").then((res) => res.data),

  getItems: (appLabel: string, modelName: string, search: string = "") =>
    api
      .get<RecycleBinItem[]>(`/recycle-bin/list/${appLabel}/${modelName}/`, { params: { search } })
      .then((res) => res.data),

  restore: (appLabel: string, modelName: string, id: string) =>
    api
      .post<RecycleBinActionResponse>(
        "/recycle-bin/action/",
        { app_label: appLabel, model_name: modelName, id, action: "restore" },
        { ...skipInterceptorToast },
      )
      .then((res) => res.data),

  hardDelete: (appLabel: string, modelName: string, id: string) =>
    api
      .post<RecycleBinActionResponse>(
        "/recycle-bin/action/",
        { app_label: appLabel, model_name: modelName, id, action: "hard_delete" },
        { ...skipInterceptorToast },
      )
      .then((res) => res.data),

  previewForceDelete: (appLabel: string, modelName: string, id: string) =>
    api
      .post<{ dependencies: string[] }>(
        "/recycle-bin/action/",
        { app_label: appLabel, model_name: modelName, id, action: "preview_force_delete" },
        { ...skipInterceptorToast },
      )
      .then((res) => res.data),

  forceHardDelete: (appLabel: string, modelName: string, id: string) =>
    api
      .post<RecycleBinActionResponse>(
        "/recycle-bin/action/",
        { app_label: appLabel, model_name: modelName, id, action: "force_hard_delete" },
        { ...skipInterceptorToast },
      )
      .then((res) => res.data),

  restoreAll: (appLabel: string, modelName: string) =>
    api
      .post<RecycleBinActionResponse>(
        "/recycle-bin/action/",
        { app_label: appLabel, model_name: modelName, action: "restore_all" },
        { ...skipInterceptorToast },
      )
      .then((res) => res.data),

  emptyBin: (appLabel: string, modelName: string) =>
    api
      .post<RecycleBinActionResponse>(
        "/recycle-bin/action/",
        { app_label: appLabel, model_name: modelName, action: "empty_bin" },
        { ...skipInterceptorToast },
      )
      .then((res) => res.data),
}
