import api from "@/lib/api"
import type { SearchResponse, SearchModuleKey } from "../types"

export interface SearchParams {
  q: string
  modules?: SearchModuleKey[]
}

export const searchApi = {
  /**
   * Global arama endpoint'ini çağırır.
   * GET /api/v1/search/?q=<query>&modules=<m1,m2>
   */
  search: async ({ q, modules }: SearchParams): Promise<SearchResponse> => {
    const params: Record<string, string> = { q }
    if (modules && modules.length > 0) {
      params.modules = modules.join(",")
    }
    const { data } = await api.get<SearchResponse>("/search/", { params })
    return data
  },
}
