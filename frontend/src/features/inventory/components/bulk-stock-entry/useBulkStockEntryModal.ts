"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { useDebounce } from "@/hooks/useDebounce"
import { inventoryApi } from "@/features/inventory/services/inventoryApi"
import type { StockReceiptDraft } from "@/features/inventory/types"
import { AUTO_SAVE_DEBOUNCE_MS } from "./bulkStockEntry.constants"
import type { BulkStockEntryModalProps, DraftLineForm } from "./bulkStockEntry.types"
import {
  buildPayloadLines,
  draftLineFromApi,
  emptyLine,
  lineIsValid,
  parseApiError,
} from "./bulkStockEntry.utils"

export function useBulkStockEntryModal({ open, onDone, warehouses, initialLines }: BulkStockEntryModalProps) {
  const t = useTranslations("inventory")
  const [draftId, setDraftId] = useState<string | null>(null)
  const [status, setStatus] = useState<"DRAFT" | "POSTED" | null>(null)
  const [warehouseId, setWarehouseId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<DraftLineForm[]>([emptyLine()])
  const [manualSaving, setManualSaving] = useState(false)
  const [autoSaveBusy, setAutoSaveBusy] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [finalizeError, setFinalizeError] = useState("")
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true)
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [draftSummaries, setDraftSummaries] = useState<StockReceiptDraft[]>([])
  const [draftListLoading, setDraftListLoading] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const lastSavedSnapshotRef = useRef<string | null>(null)
  const prevLoadingDraftRef = useRef(false)
  const persistInFlightRef = useRef(false)
  const linesRef = useRef(lines)
  const formSnapshotRef = useRef("")

  const formSnapshot = useMemo(
    () =>
      JSON.stringify({
        warehouseId,
        supplierId,
        reference,
        notes,
        lines,
      }),
    [warehouseId, supplierId, reference, notes, lines],
  )

  useEffect(() => { linesRef.current = lines }, [lines])
  useEffect(() => { formSnapshotRef.current = formSnapshot }, [formSnapshot])
  const debouncedSnapshot = useDebounce(formSnapshot, AUTO_SAVE_DEBOUNCE_MS)

  const refreshDraftList = useCallback(async () => {
    setDraftListLoading(true)
    try {
      const data = await inventoryApi.getStockReceiptDrafts({ page_size: 100 })
      const rows = [...(data.results ?? [])].sort((a, b) => {
        if (a.status !== b.status) return a.status === "DRAFT" ? -1 : 1
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })
      setDraftSummaries(rows)
    } catch {
      setDraftSummaries([])
      toast.error(t("bulkStockEntry.toastDraftListFailed"))
    } finally {
      setDraftListLoading(false)
    }
  }, [t])

  const applyDraftFromApi = useCallback((d: StockReceiptDraft, opts?: { syncSnapshot?: boolean }) => {
    const mappedLines = d.lines?.length ? d.lines.map(draftLineFromApi) : [emptyLine()]
    setDraftId(d.id)
    setStatus(d.status)
    setWarehouseId(d.warehouse)
    setSupplierId(d.supplier || "")
    setReference(d.reference || "")
    setNotes(d.notes || "")
    setLines(mappedLines)
    setLastSavedAt(d.updated_at ? new Date(d.updated_at) : null)
    if (opts?.syncSnapshot) {
      lastSavedSnapshotRef.current = JSON.stringify({
        warehouseId: d.warehouse,
        supplierId: d.supplier || "",
        reference: d.reference || "",
        notes: d.notes || "",
        lines: mappedLines,
      })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setDraftId(null)
    setStatus(null)
    setSupplierId("")
    setReference("")
    setNotes("")
    setWarehouseId("")
    setLines(initialLines?.length ? [...initialLines, emptyLine()] : [emptyLine()])
    setSaveError("")
    setFinalizeError("")
    setLastSavedAt(null)
    lastSavedSnapshotRef.current = null
    void refreshDraftList()
  // initialLines kasıtlı olarak bağımlılık dışında — yalnızca açılışta bir kez uygulanır
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshDraftList])

  useEffect(() => {
    if (!open || warehouses.length === 0) return
    setWarehouseId((w) => w || warehouses[0].id)
  }, [open, warehouses])

  const warehouseName = useCallback(
    (id: string) => warehouses.find((w) => w.id === id)?.name ?? id.slice(0, 8),
    [warehouses],
  )

  const startNewDraftForm = useCallback(() => {
    setDraftId(null)
    setStatus(null)
    setSupplierId("")
    setReference("")
    setNotes("")
    setWarehouseId(warehouses[0]?.id ?? "")
    setLines([emptyLine()])
    setSaveError("")
    setFinalizeError("")
    setLastSavedAt(null)
    lastSavedSnapshotRef.current = null
  }, [warehouses])

  const loadDraftById = useCallback(
    async (id: string) => {
      setLoadingDraft(true)
      setSaveError("")
      try {
        const d = await inventoryApi.getStockReceiptDraft(id)
        applyDraftFromApi(d)
      } catch (e) {
        toast.error(parseApiError(e))
      } finally {
        setLoadingDraft(false)
      }
    },
    [applyDraftFromApi],
  )

  useEffect(() => {
    setFinalizeError("")
  }, [formSnapshot])

  /** Taslak yükleme bittiğinde lastSaved'i formSnapshot ile aynı yap (manuel JSON.stringify sapması otomatik kaydı kilitliyordu). */
  useEffect(() => {
    if (prevLoadingDraftRef.current && !loadingDraft) {
      lastSavedSnapshotRef.current = formSnapshotRef.current
    }
    prevLoadingDraftRef.current = loadingDraft
  }, [loadingDraft, formSnapshot])

  const validLines = useMemo(() => lines.filter(lineIsValid), [lines])
  const canSave = !!warehouseId && validLines.length > 0 && status !== "POSTED"
  const canFinalize = !!draftId && status === "DRAFT" && canSave && !manualSaving && !autoSaveBusy

  const patchLine = useCallback((localKey: string, patch: Partial<DraftLineForm>) => {
    setLines((prev) => prev.map((l) => (l.localKey === localKey ? { ...l, ...patch } : l)))
  }, [])

  const removeLine = useCallback((localKey: string) => {
    setLines((prev) => prev.filter((l) => l.localKey !== localKey))
  }, [])

  const persistDraft = useCallback(
    async (opts: { silent: boolean }) => {
      if (!warehouseId) {
        if (!opts.silent) toast.error(t("bulkStockEntry.toastSelectWarehouse"))
        return
      }
      const linesNow = linesRef.current
      const validNow = linesNow.filter(lineIsValid)
      if (validNow.length === 0) {
        if (!opts.silent) toast.error(t("bulkStockEntry.toastValidLine"))
        return
      }
      if (persistInFlightRef.current) return
      persistInFlightRef.current = true
      if (opts.silent) {
        setAutoSaveBusy(true)
        setSaveError("")
      } else {
        setManualSaving(true)
        setSaveError("")
      }
      try {
        const payload = {
          warehouse: warehouseId,
          supplier: supplierId || null,
          reference: reference.trim(),
          notes: notes.trim(),
          lines: buildPayloadLines(validNow),
        }
        if (draftId) {
          const updated = await inventoryApi.updateStockReceiptDraft(draftId, payload)
          setStatus(updated.status)
          lastSavedSnapshotRef.current = formSnapshotRef.current
          setLastSavedAt(new Date())
          if (!opts.silent) toast.success(t("bulkStockEntry.toastDraftUpdated"))
          if (!opts.silent) void refreshDraftList()
        } else {
          const created = await inventoryApi.createStockReceiptDraft(payload)
          setDraftId(created.id)
          setStatus(created.status)
          lastSavedSnapshotRef.current = formSnapshotRef.current
          setLastSavedAt(new Date())
          if (!opts.silent) toast.success(t("bulkStockEntry.toastDraftSaved"))
          void refreshDraftList()
        }
      } catch (e) {
        const msg = parseApiError(e)
        setSaveError(msg)
        if (!opts.silent) toast.error(msg)
      } finally {
        persistInFlightRef.current = false
        if (opts.silent) setAutoSaveBusy(false)
        else setManualSaving(false)
      }
    },
    [warehouseId, supplierId, reference, notes, draftId, refreshDraftList, t],
  )

  useEffect(() => {
    if (!open || !autoSaveEnabled || status === "POSTED") return
    if (formSnapshot !== debouncedSnapshot) return
    if (debouncedSnapshot === lastSavedSnapshotRef.current) return
    if (!warehouseId || validLines.length === 0) return
    void persistDraft({ silent: true })
  }, [
    open,
    autoSaveEnabled,
    status,
    formSnapshot,
    debouncedSnapshot,
    warehouseId,
    validLines.length,
    persistDraft,
  ])

  const handleSaveDraft = useCallback(() => {
    void persistDraft({ silent: false })
  }, [persistDraft])

  const runFinalize = useCallback(async () => {
    if (!draftId || status !== "DRAFT") return
    setFinalizeConfirmOpen(false)
    setFinalizing(true)
    setFinalizeError("")
    try {
      const res = await inventoryApi.finalizeStockReceiptDraft(draftId)
      applyDraftFromApi(res.draft, { syncSnapshot: true })
      toast.success(t("bulkStockEntry.toastFinalized", { count: res.count }))
      void refreshDraftList()
      onDone()
    } catch (e) {
      const msg = parseApiError(e)
      setFinalizeError(msg)
      toast.error(msg)
    } finally {
      setFinalizing(false)
    }
  }, [draftId, status, onDone, applyDraftFromApi, refreshDraftList, t])

  const deleteDraft = () => {
    if (!draftId) return
    setShowDeleteConfirm(true)
  }

  const executeDelete = async () => {
    if (!draftId) return
    setIsDeleting(true)
    const isPosted = status === "POSTED"
    try {
      await inventoryApi.deleteStockReceiptDraft(draftId)
      toast.success(isPosted ? t("bulkStockEntry.toastDeletedPosted") : t("bulkStockEntry.toastDeletedDraft"))
      startNewDraftForm()
      void refreshDraftList()
      setShowDeleteConfirm(false)
    } catch (e) {
      toast.error(parseApiError(e))
    } finally {
      setIsDeleting(false)
    }
  }

  const addEmptyLine = useCallback(() => {
    setLines((prev) => [emptyLine(), ...prev])
  }, [])

  return {
    draftId,
    status,
    warehouseId,
    setWarehouseId,
    supplierId,
    setSupplierId,
    reference,
    setReference,
    notes,
    setNotes,
    lines,
    manualSaving,
    autoSaveBusy,
    finalizing,
    saveError,
    finalizeError,
    autoSaveEnabled,
    setAutoSaveEnabled,
    finalizeConfirmOpen,
    setFinalizeConfirmOpen,
    lastSavedAt,
    draftSummaries,
    draftListLoading,
    loadingDraft,
    warehouseName,
    startNewDraftForm,
    loadDraftById,
    validLines,
    canSave,
    canFinalize,
    patchLine,
    removeLine,
    handleSaveDraft,
    runFinalize,
    addEmptyLine,
    setFinalizeError,
    deleteDraft,
    deletingDraft: isDeleting,
    showDeleteConfirm,
    setShowDeleteConfirm,
    executeDelete,
    isDeleting,
  }
}
