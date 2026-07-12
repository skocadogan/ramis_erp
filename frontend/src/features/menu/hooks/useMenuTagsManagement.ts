"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { menuApi } from "@/features/menu/services/menuApi"
import type { MenuTag } from "@/features/menu/types"

export interface MenuTagForm {
  name: string
}

const EMPTY_TAG_FORM: MenuTagForm = { name: "" }

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === "object" && "results" in data) {
    const r = (data as { results?: unknown }).results
    return Array.isArray(r) ? (r as T[]) : []
  }
  return []
}

export function useMenuTagsManagement(
  branchId: string | null,
  onTagsChanged?: () => void,
) {
  const t = useTranslations("menu_management.menuTagsTab")
  const [tags, setTags] = useState<MenuTag[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [tagForm, setTagForm] = useState<MenuTagForm>(EMPTY_TAG_FORM)
  const [showTagForm, setShowTagForm] = useState(false)
  const [editingTag, setEditingTag] = useState<MenuTag | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchTags = useCallback(async () => {
    if (!branchId) {
      setTags([])
      setSelectedTagId(null)
      return
    }
    setIsLoading(true)
    try {
      const res = await menuApi.getMenuTags(branchId)
      const list = unwrapList<MenuTag>(res.data)
      setTags(list)
      setSelectedTagId((prev) => (prev && list.some((tag) => tag.id === prev) ? prev : list[0]?.id ?? null))
    } catch {
      toast.error(t("toasts.loadFailed"))
      setTags([])
    } finally {
      setIsLoading(false)
    }
  }, [branchId, t])

  useEffect(() => {
    void fetchTags()
  }, [fetchTags])

  const selectedTag = tags.find((tag) => tag.id === selectedTagId) ?? null

  const openCreateTag = () => {
    setEditingTag(null)
    setTagForm(EMPTY_TAG_FORM)
    setShowTagForm(true)
  }

  const openEditTag = (tag: MenuTag) => {
    setEditingTag(tag)
    setTagForm({ name: tag.name.replace(/^#/, "") })
    setShowTagForm(true)
  }

  const closeTagForm = () => {
    setShowTagForm(false)
    setEditingTag(null)
    setTagForm(EMPTY_TAG_FORM)
  }

  const handleSaveTag = async () => {
    if (!tagForm.name.trim() || !branchId) return
    setIsSubmitting(true)
    try {
      if (editingTag) {
        await menuApi.updateMenuTag(editingTag.id, { name: tagForm.name })
      } else {
        await menuApi.createMenuTag(tagForm.name, branchId)
      }
      setShowTagForm(false)
      setEditingTag(null)
      setTagForm(EMPTY_TAG_FORM)
      await fetchTags()
      onTagsChanged?.()
    } catch {
      toast.error(editingTag ? t("toasts.updateFailed") : t("toasts.createFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteTag = async (tag: MenuTag) => {
    if (!confirm(t("deleteConfirm", { name: tag.name }))) return
    setIsSubmitting(true)
    try {
      await menuApi.deleteMenuTag(tag.id)
      if (selectedTagId === tag.id) setSelectedTagId(null)
      await fetchTags()
      onTagsChanged?.()
    } catch {
      toast.error(t("toasts.deleteFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    tags,
    isLoading,
    selectedTagId,
    selectedTag,
    setSelectedTagId,
    tagForm,
    setTagForm,
    showTagForm,
    setShowTagForm,
    editingTag,
    isSubmitting,
    openCreateTag,
    openEditTag,
    closeTagForm,
    handleSaveTag,
    handleSubmitTag: handleSaveTag,
    handleDeleteTag,
  }
}
