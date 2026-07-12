"use client"

import { useCallback, useMemo, useState } from "react"
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { allergensApi } from "@/features/allergens/services/allergensApi"
import type { Allergen, AllergenFormState } from "@/features/allergens/types"
import { parseApiError } from "@/lib/parseApiError"
import { useDebounce } from "@/hooks/useDebounce"
import { pageFromDrfNext } from "@/lib/pagination"

const ALLERGEN_PAGE_SIZE = 50

export type SortField = "code" | "name" | "prevalence_pct" | "risk_score" | "sort_order"
export type SortDir = "asc" | "desc"

function emptyForm(): AllergenFormState {
  return { code: "", name: "", prevalence_pct: "0", risk_score: "5", sort_order: "0" }
}

export function useAllergens(showToast: (msg: string, type?: "success" | "error") => void) {
  const t = useTranslations("allergens")
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)

  const [sortField, setSortField] = useState<SortField>("sort_order")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const [filterActive, setFilterActive] = useState<string>("")

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<AllergenFormState>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const allergensQuery = useInfiniteQuery({
    queryKey: ["allergens", "infinite", debouncedSearch, sortField, sortDir, filterActive],
    queryFn: async ({ pageParam = 1 }) => {
      const params: Record<string, string | number> = {
        page: pageParam as number,
        page_size: ALLERGEN_PAGE_SIZE,
        ordering: sortDir === "desc" ? `-${sortField}` : sortField,
      }
      if (debouncedSearch) params.search = debouncedSearch
      if (filterActive) params.is_active = filterActive
      return allergensApi.list(params)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => pageFromDrfNext(lastPage.next),
  })

  const allergens = useMemo(
    () => allergensQuery.data?.pages.flatMap((p) => p.results) ?? [],
    [allergensQuery.data?.pages],
  )
  const totalCount = allergensQuery.data?.pages[0]?.count ?? 0

  const toggleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }, [sortField])

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
  }, [])

  const handleFilterActiveChange = useCallback((val: string) => {
    setFilterActive(val)
  }, [])

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["allergens"] })
    return allergensQuery.refetch()
  }, [queryClient, allergensQuery])

  const openCreate = useCallback(() => {
    setEditingId(null)
    setFormData(emptyForm())
    setShowForm(true)
  }, [])

  const openEdit = useCallback((allergen: Allergen) => {
    setEditingId(allergen.id)
    setFormData({
      code: allergen.code,
      name: allergen.name,
      prevalence_pct: String(allergen.prevalence_pct),
      risk_score: String(allergen.risk_score),
      sort_order: String(allergen.sort_order ?? 0),
    })
    setShowForm(true)
  }, [])

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        prevalence_pct: parseFloat(formData.prevalence_pct) || 0,
        risk_score: Math.min(10, Math.max(1, parseInt(formData.risk_score, 10) || 1)),
        sort_order: parseInt(formData.sort_order, 10) || 0,
      }
      if (editingId) {
        await allergensApi.update(editingId, payload)
        showToast(t("toasts.updated"))
      } else {
        await allergensApi.create(payload)
        showToast(t("toasts.created"))
      }
      setShowForm(false)
      setEditingId(null)
      setFormData(emptyForm())
      await refresh()
    } catch (e) {
      showToast(parseApiError(e), "error")
    } finally {
      setIsSubmitting(false)
    }
  }, [editingId, formData, refresh, showToast, t])

  const confirmDelete = useCallback(async () => {
    if (!deleteId) return
    setIsSubmitting(true)
    try {
      await allergensApi.remove(deleteId)
      showToast(t("toasts.deleted"))
      setDeleteId(null)
      await refresh()
    } catch (e) {
      showToast(parseApiError(e), "error")
    } finally {
      setIsSubmitting(false)
    }
  }, [deleteId, refresh, showToast, t])

  return {
    allergens,
    totalCount,
    isLoading: allergensQuery.isLoading,
    isFetching: allergensQuery.isFetching,
    fetchNextPage: allergensQuery.fetchNextPage,
    hasNextPage: allergensQuery.hasNextPage,
    isFetchingNextPage: allergensQuery.isFetchingNextPage,

    search,
    setSearch: handleSearchChange,

    sortField,
    sortDir,
    toggleSort,

    filterActive,
    setFilterActive: handleFilterActiveChange,

    showForm,
    setShowForm,
    editingId,
    formData,
    setFormData,
    isSubmitting,
    deleteId,
    setDeleteId,
    openCreate,
    openEdit,
    handleSubmit,
    confirmDelete,
    refresh,
  }
}
