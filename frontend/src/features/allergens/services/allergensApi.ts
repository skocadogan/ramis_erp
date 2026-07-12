import api from "@/lib/api"
import type { PaginatedResponse } from "@/lib/types"
import type { Allergen } from "@/features/allergens/types"

export const allergensApi = {
  list: (params: Record<string, string | number> = {}) =>
    api.get<PaginatedResponse<Allergen>>("/inventory/allergens/", { params }).then((r) => r.data),

  listAll: async (params: { search?: string } = {}) => {
    const pageSize = 500
    let page = 1
    const all: Allergen[] = []
    let hasNext = true

    while (hasNext) {
      const data = await allergensApi.list({
        ...params,
        page,
        page_size: pageSize,
      })
      all.push(...data.results)
      hasNext = !!data.next
      page += 1
    }

    return all
  },

  create: (data: Partial<Allergen>) =>
    api.post<Allergen>("/inventory/allergens/", data).then((r) => r.data),

  update: (id: string, data: Partial<Allergen>) =>
    api.put<Allergen>(`/inventory/allergens/${id}/`, data).then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/inventory/allergens/${id}/`),
}
