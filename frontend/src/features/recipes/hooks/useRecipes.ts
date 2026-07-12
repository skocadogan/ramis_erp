"use client"

import { useCallback, useEffect, useState } from "react"
import api from "@/lib/api"
import { recipesApi } from "../services/recipesApi"
import type { Recipe, RecipeMenuItem, RecipeStockItem, RecipeBranch, RecipeStockUnit, RecipeCategory } from "../types"

export type { Recipe,     RecipeCategory }

/** Yetki: `/recipes` sayfası `AuthGuard module="recipes"` ile sarıldığında bu hook çalışır. */
export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [products, setProducts] = useState<RecipeMenuItem[]>([])
  const [recipeCategories, setRecipeCategories] = useState<RecipeCategory[]>([])
  const [stockItems, setStockItems] = useState<RecipeStockItem[]>([])
  const [branches, setBranches] = useState<RecipeBranch[]>([])
  const [stockUnits, setStockUnits] = useState<RecipeStockUnit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const fetchData = useCallback(async (categoryId?: string | null) => {
    setIsLoading(true)
    try {
      const [recipesData, catsData] = await Promise.all([
        recipesApi.getRecipes(categoryId),
        recipesApi.getCategories(),
      ])
      setRecipes(recipesData)
      setRecipeCategories(catsData)
    } catch (e) {
      console.error("Reçete verileri yüklenemedi:", e)
      setRecipes([])
    }

    const [productsResult, stockResult, branchesResult, unitsResult] = await Promise.allSettled([
      api.get("/menu/products/"),
      api.get("/inventory/stock-items/"),
      api.get("/branches/"),
      api.get("/inventory/stock-units/"),
    ])

    if (productsResult.status === "fulfilled") {
      const d = productsResult.value.data
      const raw = d?.results ?? d
      setProducts(Array.isArray(raw) ? raw : [])
    }
    if (stockResult.status === "fulfilled") {
      const d = stockResult.value.data
      const raw = d?.results ?? d
      setStockItems(Array.isArray(raw) ? raw : [])
    }
    if (branchesResult.status === "fulfilled") {
      const d = branchesResult.value.data
      const raw = d?.results ?? d
      setBranches(Array.isArray(raw) ? raw : [])
    }
    if (unitsResult.status === "fulfilled") {
      const d = unitsResult.value.data
      const raw = d?.results ?? d
      setStockUnits(Array.isArray(raw) ? raw : [])
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    void fetchData(selectedCategoryId)
  }, [fetchData, selectedCategoryId])

  const filteredRecipes = recipes.filter(r =>
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.product_name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return {
    recipes,
    products,
    recipeCategories,
    stockItems,
    branches,
    stockUnits,
    isLoading,
    searchTerm,
    setSearchTerm,
    selectedCategoryId,
    setSelectedCategoryId,
    filteredRecipes,
    refresh: () => fetchData(selectedCategoryId),
  }
}
