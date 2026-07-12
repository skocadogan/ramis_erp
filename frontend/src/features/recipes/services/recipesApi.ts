import api from "@/lib/api"
import type { Recipe, RecipeCategory, RecipeFormState, RecipeIngredientDraft } from "../types"

function mapIngredientPayload(ing: RecipeIngredientDraft) {
  const base = {
    quantity: parseFloat(ing.quantity),
    unit: ing.unit,
    notes: ing.notes,
  }
  if (ing.kind === "sub_recipe" && ing.sub_recipe_id) {
    return { ...base, sub_recipe_id: ing.sub_recipe_id }
  }
  return { ...base, stock_item_id: ing.stock_item_id }
}

function filterValidIngredients(ingredients: RecipeIngredientDraft[]) {
  return ingredients
    .filter(ing => ing.quantity && (ing.kind === "sub_recipe" ? ing.sub_recipe_id : ing.stock_item_id))
    .map(mapIngredientPayload)
}

export const recipesApi = {
  getRecipes: (categoryId?: string | null) => {
    const params = categoryId ? { category_id: categoryId } : {}
    return api.get("/recipes/recipes/", { params }).then(r => {
      const raw = r.data?.results ?? r.data
      return Array.isArray(raw) ? (raw as Recipe[]) : []
    })
  },

  getCategories: () =>
    api.get("/recipes/categories/").then(r => {
      const raw = r.data?.results ?? r.data
      return Array.isArray(raw) ? (raw as RecipeCategory[]) : []
    }),

  createCategory: (data: Partial<RecipeCategory>) =>
    api.post("/recipes/categories/", data).then(r => r.data as RecipeCategory),

  updateCategory: (id: string, data: Partial<RecipeCategory>) =>
    api.put(`/recipes/categories/${id}/`, data).then(r => r.data as RecipeCategory),

  deleteCategory: (id: string) => api.delete(`/recipes/categories/${id}/`),

  createRecipe: (
    formData: RecipeFormState,
    ingredients: RecipeIngredientDraft[],
  ) =>
    api
      .post("/recipes/recipes/", {
        ...formData,
        product_id: formData.product_id || null,
        category_id: formData.category_id || null,
        ingredients: filterValidIngredients(ingredients),
      })
      .then(r => r.data as Recipe),

  updateRecipe: (
    id: string,
    formData: RecipeFormState,
    ingredients: RecipeIngredientDraft[],
  ) =>
    api
      .put(`/recipes/recipes/${id}/`, {
        ...formData,
        product_id: formData.product_id || null,
        category_id: formData.category_id || null,
        ingredients: filterValidIngredients(ingredients),
      })
      .then(r => r.data as Recipe),

  deleteRecipe: (id: string) => api.delete(`/recipes/recipes/${id}/`),
}
