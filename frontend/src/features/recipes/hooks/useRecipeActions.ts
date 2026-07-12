"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { newClientId } from "@/lib/clientId"
import { toast } from "sonner"
import { recipesApi } from "../services/recipesApi"
import type { Recipe, RecipeStockItem, RecipeFormState, RecipeIngredientDraft } from "../types"
import { formatIngredientQuantityDisplay } from "../utils/ingredientQuantity"

export type { RecipeFormState, RecipeIngredientDraft }

interface UseRecipeActionsProps {
  onSuccess: () => void
  stockItems: RecipeStockItem[]
  allRecipes: Recipe[]
}

const initialFormState: RecipeFormState = {
  product_id: "",
  category_id: "",
  name: "",
  description: "",
  servings: 1,
  serving_quantity: 0,
  serving_unit: "g",
  prep_time_minutes: 0,
  cook_time_minutes: 0,
  prep_time_per_serving: 0,
  cook_time_per_serving: 0,
  instructions: "",
  branches: [],
}

export function useRecipeActions({ onSuccess, stockItems, allRecipes }: UseRecipeActionsProps) {
  const t = useTranslations("recipes")
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [recipeToDelete, setRecipeToDelete] = useState<string | null>(null)
  const [formData, setFormData] = useState<RecipeFormState>(initialFormState)
  const [ingredients, setIngredients] = useState<RecipeIngredientDraft[]>([])

  const handleSubmitRecipe = async () => {
    setIsSubmitting(true)
    try {
      if (editingRecipeId) {
        await recipesApi.updateRecipe(editingRecipeId, formData, ingredients)
      } else {
        await recipesApi.createRecipe(formData, ingredients)
      }
      closeForm()
      onSuccess()
    } catch (e) {
      console.error("Reçete kaydetme hatası:", e)
      toast.error(t("toast.recipeSaveError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmDeleteRecipe = (id: string) => {
    setRecipeToDelete(id)
  }

  const executeDeleteRecipe = async () => {
    if (!recipeToDelete) return
    try {
      await recipesApi.deleteRecipe(recipeToDelete)
      toast.success(t("toast.recipeDeleteSuccess"))
      onSuccess()
    } catch (e) {
      console.error("Reçete silme hatası:", e)
      toast.error(t("toast.recipeDeleteError"))
    } finally {
      setRecipeToDelete(null)
    }
  }

  const cancelDeleteRecipe = () => {
    setRecipeToDelete(null)
  }

  const newEmptyIngredientRow = (): RecipeIngredientDraft => ({
    clientId: newClientId("ing"),
    kind: "stock_item",
    stock_item_id: "",
    sub_recipe_id: "",
    quantity: "",
    unit: "",
    notes: "",
  })

  const addIngredient = () => {
    setIngredients([newEmptyIngredientRow(), ...ingredients])
  }

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index))
  }

  const updateIngredient = (index: number, field: keyof RecipeIngredientDraft, value: string) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    if (field === "stock_item_id") {
      const item = stockItems.find(s => s.id === value)
      if (item) {
        updated[index].kind = "stock_item"
        updated[index].unit = item.unit
        updated[index].sub_recipe_id = ""
      }
    }
    if (field === "sub_recipe_id") {
      const sub = allRecipes.find(r => r.id === value)
      if (sub) {
        updated[index].kind = "sub_recipe"
        updated[index].stock_item_id = ""
        if (sub.serving_unit) updated[index].unit = sub.serving_unit
      }
    }
    if (field === "kind") {
      if (value === "stock_item") {
        updated[index].sub_recipe_id = ""
      } else {
        updated[index].stock_item_id = ""
      }
    }
    setIngredients(updated)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingRecipeId(null)
    setEditingRecipe(null)
    setFormData(initialFormState)
    setIngredients([])
  }

  const openForm = (recipe?: Recipe) => {
    if (recipe) {
      setEditingRecipeId(recipe.id)
      setEditingRecipe(recipe)
      setFormData({
        product_id: recipe.product || "",
        category_id: recipe.category || "",
        name: recipe.name,
        description: recipe.description || "",
        servings: recipe.servings,
        serving_quantity: recipe.serving_quantity || 0,
        serving_unit: recipe.serving_unit || "",
        prep_time_minutes: recipe.prep_time_minutes,
        cook_time_minutes: recipe.cook_time_minutes,
        prep_time_per_serving: recipe.prep_time_per_serving,
        cook_time_per_serving: recipe.cook_time_per_serving,
        instructions: recipe.instructions || "",
        branches: recipe.branches || [],
      })
      setIngredients(
        (recipe.ingredients || []).map(ing => ({
          clientId: newClientId("ing"),
          kind: ing.ingredient_type === "sub_recipe" ? "sub_recipe" as const : "stock_item" as const,
          stock_item_id: ing.stock_item || "",
          sub_recipe_id: ing.sub_recipe || "",
          quantity: formatIngredientQuantityDisplay(ing.quantity),
          unit: ing.unit,
          notes: ing.notes || "",
        }))
      )
    } else {
      setEditingRecipeId(null)
      setEditingRecipe(null)
      setFormData(initialFormState)
      setIngredients([])
    }
    setShowForm(true)
  }

  return {
    showForm,
    setShowForm,
    editingRecipeId,
    editingRecipe,
    openForm,
    closeForm,
    isSubmitting,
    formData,
    setFormData,
    ingredients,
    setIngredients,
    addIngredient,
    removeIngredient,
    updateIngredient,
    handleSubmitRecipe,
    recipeToDelete,
    confirmDeleteRecipe,
    executeDeleteRecipe,
    cancelDeleteRecipe,
  }
}
