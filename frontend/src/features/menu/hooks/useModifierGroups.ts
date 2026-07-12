"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { menuApi } from "@/features/menu/services/menuApi"
import type { ModifierGroup, ModifierGroupForm, MenuModifier, ModifierForm } from "@/features/menu/types"

const EMPTY_GROUP_FORM: ModifierGroupForm = {
  name: "",
  is_multiple: false,
  is_required: false,
}

const EMPTY_MODIFIER_FORM: ModifierForm = {
  name: "",
  price_adjustment: "0",
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === "object" && "results" in data) {
    const r = (data as { results?: unknown }).results
    return Array.isArray(r) ? (r as T[]) : []
  }
  return []
}

export function useModifierGroups(onCatalogChange?: () => void) {
  const t = useTranslations("menu_management.modifierGroups")
  const [groups, setGroups] = useState<ModifierGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupForm, setGroupForm] = useState<ModifierGroupForm>(EMPTY_GROUP_FORM)
  const [modifierForm, setModifierForm] = useState<ModifierForm>(EMPTY_MODIFIER_FORM)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchGroups = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await menuApi.getModifierGroups()
      const list = unwrapList<ModifierGroup>(res.data)
      setGroups(list)
      setSelectedGroupId((prev) => prev ?? list[0]?.id ?? null)
    } catch {
      toast.error(t("toasts.loadFailed"))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void fetchGroups()
  }, [fetchGroups])

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null

  const openCreateGroup = () => {
    setEditingGroup(null)
    setGroupForm(EMPTY_GROUP_FORM)
    setShowGroupForm(true)
  }

  const openEditGroup = (group: ModifierGroup) => {
    setEditingGroup(group)
    setGroupForm({
      name: group.name,
      is_multiple: group.is_multiple,
      is_required: group.is_required,
    })
    setShowGroupForm(true)
  }

  const handleSaveGroup = async () => {
    if (!groupForm.name.trim()) return
    setIsSubmitting(true)
    try {
      if (editingGroup) {
        await menuApi.updateModifierGroup(editingGroup.id, groupForm)
      } else {
        await menuApi.createModifierGroup(groupForm)
      }
      setShowGroupForm(false)
      setEditingGroup(null)
      setGroupForm(EMPTY_GROUP_FORM)
      await fetchGroups()
      onCatalogChange?.()
    } catch {
      toast.error(t("toasts.groupSaveFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteGroup = async (group: ModifierGroup) => {
    setIsSubmitting(true)
    try {
      await menuApi.deleteModifierGroup(group.id)
      if (selectedGroupId === group.id) setSelectedGroupId(null)
      await fetchGroups()
      onCatalogChange?.()
    } catch {
      toast.error(t("toasts.groupDeleteFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddModifier = async () => {
    if (!selectedGroup || !modifierForm.name.trim()) return
    setIsSubmitting(true)
    try {
      await menuApi.createModifier({
        group: selectedGroup.id,
        name: modifierForm.name.trim(),
        price_adjustment: modifierForm.price_adjustment.replace(",", "."),
      })
      setModifierForm(EMPTY_MODIFIER_FORM)
      await fetchGroups()
      onCatalogChange?.()
    } catch {
      toast.error(t("toasts.modifierSaveFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteModifier = async (modifier: MenuModifier) => {
    if (!selectedGroup) return
    setIsSubmitting(true)
    try {
      await menuApi.deleteModifier(modifier.id)
      await fetchGroups()
      onCatalogChange?.()
    } catch {
      toast.error(t("toasts.modifierDeleteFailed"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    groups,
    isLoading,
    selectedGroupId,
    setSelectedGroupId,
    selectedGroup,
    groupForm,
    setGroupForm,
    modifierForm,
    setModifierForm,
    showGroupForm,
    setShowGroupForm,
    editingGroup,
    isSubmitting,
    openCreateGroup,
    openEditGroup,
    handleSaveGroup,
    handleDeleteGroup,
    handleAddModifier,
    handleDeleteModifier,
    fetchGroups,
  }
}
