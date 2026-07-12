import api from "@/lib/api"

export const menuApi = {
  getCategories: (params?: { apply_tag_filter?: boolean }) =>
    api.get("/menu/categories/", {
      params: params?.apply_tag_filter === false ? { apply_tag_filter: "0" } : undefined,
    }),
  getProducts: (params?: { apply_tag_filter?: boolean }) =>
    api.get("/menu/products/", {
      params: params?.apply_tag_filter === false ? { apply_tag_filter: "0" } : undefined,
    }),

  createProduct: (formData: FormData) =>
    api.post("/menu/products/", formData, { headers: { "Content-Type": "multipart/form-data" } }),

  updateProduct: (id: string, formData: FormData) =>
    api.patch(`/menu/products/${id}/`, formData, { headers: { "Content-Type": "multipart/form-data" } }),

  patchProduct: (id: string, data: Record<string, unknown>) =>
    api.patch(`/menu/products/${id}/`, data),

  deleteProduct: (id: string) => api.delete(`/menu/products/${id}/`),

  copyProduct: (id: string) => api.post(`/menu/products/${id}/copy/`),

  reorderProducts: (order_ids: string[]) =>
    api.post("/menu/products/reorder/", { order_ids }),

  bulkPriceUpdate: (product_ids: string[], branch_id: string | null, change_type: string, value: number) =>
    api.post("/menu/products/bulk_price/", { product_ids, branch_id, change_type, value }),

  bulkDiscount: (product_ids: string[], discount_rate: number, branch_id: string | null) =>
    api.post("/menu/products/bulk_discount/", { product_ids, discount_rate, branch_id }),

  createCategory: (data: unknown) => api.post("/menu/categories/", data),

  updateCategory: (id: string, data: unknown) => api.patch(`/menu/categories/${id}/`, data),

  deleteCategory: (id: string) => api.delete(`/menu/categories/${id}/`),

  reorderCategories: (order_ids: string[]) =>
    api.post("/menu/categories/reorder/", { order_ids }),

  getModifierGroups: () => api.get("/menu/modifier-groups/"),
  createModifierGroup: (data: unknown) => api.post("/menu/modifier-groups/", data),
  updateModifierGroup: (id: string, data: unknown) => api.patch(`/menu/modifier-groups/${id}/`, data),
  deleteModifierGroup: (id: string) => api.delete(`/menu/modifier-groups/${id}/`),

  getModifiers: (groupId?: string) =>
    api.get("/menu/modifiers/", groupId ? { params: { group: groupId } } : undefined),
  createModifier: (data: unknown) => api.post("/menu/modifiers/", data),
  updateModifier: (id: string, data: unknown) => api.patch(`/menu/modifiers/${id}/`, data),
  deleteModifier: (id: string) => api.delete(`/menu/modifiers/${id}/`),

  setProductModifierGroups: (productId: string, groupIds: string[]) =>
    api.post(`/menu/products/${productId}/modifier-groups/`, { group_ids: groupIds }),

  getProductRecommendations: (productId: string) =>
    api.get(`/menu/products/${productId}/recommendations/`),

  syncProductRecommendations: (
    productId: string,
    items: { recommended_product_id: string; product_unit_id: string | null; order: number }[],
  ) => api.put(`/menu/products/${productId}/recommendations/`, { items }),

  getMenuTags: (branchId: string) =>
    api.get("/menu/tags/", { params: { branch_id: branchId } }),
  createMenuTag: (name: string, branchId: string) =>
    api.post("/menu/tags/", { name, branch: branchId }),
  updateMenuTag: (id: string, data: { name: string }) =>
    api.patch(`/menu/tags/${id}/`, data),
  deleteMenuTag: (id: string) => api.delete(`/menu/tags/${id}/`),

  getCatalogSettings: (branchId: string) =>
    api.get("/menu/catalog-settings/", { params: { branch_id: branchId } }),
  activateCatalogTag: (payload: {
    branch_id: string
    tag_id?: string | null
    filter_untagged?: boolean
  }) => api.post("/menu/catalog-settings/", payload),
}
