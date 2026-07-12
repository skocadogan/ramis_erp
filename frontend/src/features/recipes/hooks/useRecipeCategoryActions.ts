"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { recipesApi } from "../services/recipesApi"
import type { RecipeCategory } from "../types"

interface UseRecipeCategoryActionsProps {
  onSuccess: () => void
}

const initialCategoryForm = {
  name: "",
  code: "",
  parent: ""
}

export function useRecipeCategoryActions({ onSuccess }: UseRecipeCategoryActionsProps) {
  const t = useTranslations("recipes")
  // Modallerin görünürlük durumları
  const [showManagement, setShowManagement] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Form verileri
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [formData, setFormData] = useState(initialCategoryForm)
  const [deletingCategory, setDeletingCategory] = useState<RecipeCategory | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const openManagement = () => setShowManagement(true)
  const closeManagement = () => setShowManagement(false)

  const openForm = (parentId?: string, category?: RecipeCategory) => {
    if (category) {
      setEditingCategoryId(category.id)
      setFormData({
        name: category.name,
        code: category.code,
        parent: category.parent || ""
      })
    } else {
      setEditingCategoryId(null)
      setFormData({
        ...initialCategoryForm,
        parent: parentId || ""
      })
    }
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingCategoryId(null)
    setFormData(initialCategoryForm)
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const payload = {
        name: formData.name,
        code: formData.code.toUpperCase(),
        parent: formData.parent || null
      }

      if (editingCategoryId) {
        await recipesApi.updateCategory(editingCategoryId, payload)
        toast.success(t("toast.categoryUpdated"))
      } else {
        await recipesApi.createCategory(payload)
        toast.success(t("toast.categoryCreated"))
      }
      
      closeForm()
      onSuccess()
    } catch (e) {
      console.error("Kategori kaydetme hatası:", e)
      toast.error(t("toast.categorySaveError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = (category: RecipeCategory) => {
    setDeletingCategory(category)
  }

  const confirmDelete = async () => {
    if (!deletingCategory) return
    setIsDeleting(true)
    try {
      await recipesApi.deleteCategory(deletingCategory.id)
      toast.success(t("toast.categoryDeleted"))
      setDeletingCategory(null)
      onSuccess()
    } catch (e) {
      console.error("Kategori silme hatası:", e)
      toast.error(t("toast.categoryDeleteError"))
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    showManagement,
    openManagement,
    closeManagement,
    showForm,
    openForm,
    closeForm,
    isSubmitting,
    formData,
    setFormData,
    editingCategoryId,
    handleSubmit,
    handleDelete,
    deletingCategory,
    setDeletingCategory,
    confirmDelete,
    isDeleting
  }
}
