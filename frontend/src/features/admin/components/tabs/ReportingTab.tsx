"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  Plus, Edit, Trash2, Star, StarOff,
  ChevronLeft, Save, AlertCircle, Loader2, Layers,
  HelpCircle, Copy, Download, Upload
} from "lucide-react"
import {
  adminApi,
  type ReceiptTemplate,
  type ReceiptTemplateForm,
  type ReceiptBlock,
} from "../../services/adminApi"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ReceiptBlockEditor } from "./reporting/ReceiptBlockEditor"
import { ReceiptPreview } from "./reporting/ReceiptPreview"
import { ReceiptDesignerGuide } from "./reporting/ReceiptDesignerGuide"

interface Props { canManage: boolean }

const CATEGORY_COLORS: Record<string, string> = {
  POS_RECEIPT:    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50",
  KITCHEN_TICKET: "bg-orange-100  text-orange-700  border-orange-200  dark:bg-orange-900/30  dark:text-orange-400  dark:border-orange-800/50",
  WAITER_TICKET:  "bg-sky-100     text-sky-700     border-sky-200     dark:bg-sky-900/30     dark:text-sky-400     dark:border-sky-800/50",
}

export function ReportingTab({ canManage }: Props) {
  const t = useTranslations("admin")

  const categories = useMemo(() => [
    { value: "ALL",            label: t('reporting.categories.all') },
    { value: "POS_RECEIPT",    label: t('reporting.categories.pos') },
    { value: "KITCHEN_TICKET", label: t('reporting.categories.kitchen') },
    { value: "WAITER_TICKET",  label: t('reporting.categories.waiter') },
  ], [t])

  const emptyForm: ReceiptTemplateForm = {
    name: "",
    slug: "",
    category: "POS_RECEIPT",
    paper_width: 48,
    layout_json: [],
    is_default: false,
    is_active: true,
  }

  const [templates, setTemplates]       = useState<ReceiptTemplate[]>([])
  const [isLoading, setIsLoading]       = useState(true)
  const [error, setError]               = useState("")
  const [catFilter, setCatFilter]       = useState("ALL")

  // Editör modu
  const [mode, setMode]                 = useState<"list" | "edit">("list")
  const [editing, setEditing]           = useState<ReceiptTemplate | null>(null)
  const [form, setForm]                 = useState<ReceiptTemplateForm>(emptyForm)
  const [formError, setFormError]       = useState("")
  const [isSaving, setIsSaving]         = useState(false)

  // Önizleme
  const [showHelp, setShowHelp]           = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<ReceiptTemplate | null>(null)
  const [previewWidth, setPreviewWidth] = useState(320)
  const isResizing = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = rect.right - e.clientX
      setPreviewWidth(Math.max(200, Math.min(800, newWidth)))
    }

    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  // ── Veri çekme ──────────────────────────────────────────────────────────────
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await adminApi.getReceiptTemplates()
      setTemplates(data)
    } catch {
      setError(t('reporting.messages.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => { void fetchTemplates() }, [fetchTemplates])

  // ── Filtreleme ───────────────────────────────────────────────────────────────
  const filtered = catFilter === "ALL"
    ? templates
    : templates.filter(temp => temp.category === catFilter)

  // ── Yeni / Düzenle ───────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError("")
    setMode("edit")
  }

  const openEdit = (temp: ReceiptTemplate) => {
    setEditing(temp)
    setForm({
      name: temp.name, slug: temp.slug, category: temp.category,
      paper_width: temp.paper_width, layout_json: temp.layout_json,
      is_default: temp.is_default, is_active: temp.is_active,
    })
    setFormError("")
    setMode("edit")
  }

  // Önizleme şablonunu form state'inden türet (henüz kaydedilmemiş değişiklikler)
  const livePreviewTemplate: ReceiptTemplate | null = mode === "edit" ? {
    ...(editing ?? { id: "preview", created_at: "", updated_at: "", category_display: "" }),
    ...form,
  } : null

  // ── Kaydetme ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setFormError(t('reporting.editor.validation.nameRequired')); return }
    if (!form.slug.trim()) { setFormError(t('reporting.editor.validation.slugRequired')); return }
    if (form.layout_json.length === 0) { setFormError(t('reporting.editor.validation.blocksRequired')); return }

    setIsSaving(true); setFormError("")
    try {
      if (editing) {
        await adminApi.updateReceiptTemplate(editing.slug, form)
        toast.success(t('reporting.messages.updateSuccess'))
      } else {
        await adminApi.createReceiptTemplate(form)
        toast.success(t('reporting.messages.createSuccess'))
      }
      setMode("list")
      void fetchTemplates()
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorVal = e as any
      const detail = errorVal?.response?.data
      setFormError(
        typeof detail === "string" ? detail
          : JSON.stringify(detail ?? t('reporting.editor.validation.saveError'))
      )
    } finally {
      setIsSaving(false)
    }
  }

  // ── Silme ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!templateToDelete) return
    try {
      await adminApi.deleteReceiptTemplate(templateToDelete.slug)
      toast.success(t('reporting.messages.deleteSuccess'))
      void fetchTemplates()
    } catch { toast.error(t('reporting.messages.deleteError')) }
    finally {
      setDeleteConfirmOpen(false)
      setTemplateToDelete(null)
    }
  }

  const openDeleteConfirm = (temp: ReceiptTemplate) => {
    setTemplateToDelete(temp)
    setDeleteConfirmOpen(true)
  }

  // ── Varsayılan yap ────────────────────────────────────────────────────────────
  const handleSetDefault = async (temp: ReceiptTemplate) => {
    try {
      await adminApi.setReceiptDefault(temp.slug)
      toast.success(t('reporting.messages.setDefaultSuccess', { name: temp.name }))
      void fetchTemplates()
    } catch { toast.error(t('reporting.messages.setDefaultError')) }
  }

  // ── Kopyala (Clone) ──────────────────────────────────────────────────────────
  const handleClone = async (temp: ReceiptTemplate) => {
    const newName = `${temp.name} (${t('reporting.clone')})`
    const newSlug = `${temp.slug}-clone-${Date.now().toString().slice(-4)}`
    
    try {
      await adminApi.createReceiptTemplate({
        name: newName,
        slug: newSlug,
        category: temp.category,
        paper_width: temp.paper_width,
        layout_json: temp.layout_json,
        is_default: false,
        is_active: true,
      })
      toast.success(t('reporting.messages.cloneSuccess', { name: temp.name }))
      void fetchTemplates()
    } catch {
      toast.error(t('reporting.messages.cloneError'))
    }
  }
  
  // ── Dışa Aktar (Export) ──────────────────────────────────────────────────────
  const handleExport = (temp: ReceiptTemplate) => {
    const data = {
      name: temp.name,
      category: temp.category,
      paper_width: temp.paper_width,
      layout_json: temp.layout_json
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `template-${temp.slug}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(t('reporting.messages.exportSuccess'))
  }

  // ── İçe Aktar (Import) ──────────────────────────────────────────────────────
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        if (!data.name || !data.layout_json) {
          toast.error(t('reporting.editor.validation.invalidFile'))
          return
        }
        
        // Formu doldur ve editörü aç
        setEditing(null)
        setForm({
          ...emptyForm,
          name: `${data.name}${t("reporting.importedNameSuffix")}`,
          slug: `${data.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}-import-${Date.now().toString().slice(-4)}`,
          category: data.category || "POS_RECEIPT",
          paper_width: data.paper_width || 48,
          layout_json: data.layout_json || [],
        })
        setMode("edit")
        toast.success(t('reporting.messages.importSuccess'))
      } catch {
        toast.error(t('reporting.editor.validation.readError'))
      }
    }
    reader.readAsText(file)
    e.target.value = "" // Reset input
  }

  // ── Blok değişiklikleri ───────────────────────────────────────────────────────
  const handleBlocksChange = (blocks: ReceiptBlock[]) =>
    setForm(f => ({ ...f, layout_json: blocks }))

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER — LİSTE GÖRÜNÜMÜ
  // ════════════════════════════════════════════════════════════════════════════
  if (mode === "list") return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
           
            {t('reporting.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('reporting.description')}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5
              text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer transition-all bg-muted border-input text-foreground dark:hover:bg-slate-700">
              <Upload size={15} /> {t('reporting.import')}
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <button onClick={openCreate}
              className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5
                text-sm font-medium text-white hover:bg-indigo-700 transition-all">
              <Plus size={15} /> {t('reporting.addNew')}
            </button>
          </div>
        )}
      </div>

      {/* Hata */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-200
          rounded-md px-3 py-2 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Kategori filtresi */}
      <div className="flex gap-1.5">
        {categories.map(c => (
          <button key={c.value} onClick={() => setCatFilter(c.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all
              ${catFilter === c.value
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 bg-muted dark:text-muted-foreground dark:hover:bg-slate-700"
              }`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Tablo */}
      <div className="rounded-lg border border-border overflow-hidden
        bg-card border-border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-border bg-muted border-border">
            <tr>
              {[t('reporting.table.name'), t('reporting.table.category'), t('reporting.table.paper'), t('reporting.table.blocks'), t('reporting.table.default'), t('common.actions')].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground
                  uppercase tracking-wider dark:text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center">
                <Loader2 size={20} className="animate-spin mx-auto text-muted-foreground" />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center">
                <Layers size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-muted-foreground">{t('common.noMatch')}</p>
              </td></tr>
            ) : (
              filtered.map(temp => (
                <tr key={temp.id}
                  className="border-b border-slate-100 hover:bg-slate-50/50
                  border-border dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-foreground text-foreground">
                    {temp.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded border text-sub font-semibold
                      ${CATEGORY_COLORS[temp.category] ?? "bg-slate-100 text-muted-foreground"}`}>
                      {temp.category_display}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                    {temp.paper_width >= 48 ? t("reporting.paperWidth80") : t("reporting.paperWidth58")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {temp.layout_json.length} {t('reporting.table.blocks').toLowerCase()}
                  </td>
                  <td className="px-4 py-3">
                    {temp.is_default
                      ? <span className="text-xs font-semibold text-amber-500 flex items-center gap-1">
                          <Star size={11} fill="currentColor" /> {t('reporting.table.default')}
                        </span>
                      : <span className="text-xs text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {canManage && (
                        <button onClick={() => handleSetDefault(temp)}
                          className={`p-1.5 rounded transition ${temp.is_default
                            ? "bg-amber-100 text-amber-500 hover:bg-amber-200 dark:bg-amber-900/30"
                            : "hover:bg-amber-50 text-muted-foreground hover:text-amber-500 dark:hover:bg-amber-900/20"
                          }`} title={temp.is_default ? t('reporting.table.default') : t('reporting.table.default')}>
                          {temp.is_default ? <Star size={14} fill="currentColor" /> : <StarOff size={14} />}
                        </button>
                      )}
                      <button onClick={() => openEdit(temp)}
                        className="p-1.5 rounded hover:bg-slate-100 text-muted-foreground hover:text-indigo-600
                          transition dark:hover:bg-slate-800" title={t('common.edit')}>
                        <Edit size={14} />
                      </button>
                      {canManage && (
                        <button onClick={() => handleClone(temp)}
                          className="p-1.5 rounded hover:bg-slate-100 text-muted-foreground hover:text-indigo-600
                            transition dark:hover:bg-slate-800" title={t('reporting.clone')}>
                          <Copy size={14} />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => handleExport(temp)}
                          className="p-1.5 rounded hover:bg-slate-100 text-muted-foreground hover:text-blue-600
                            transition dark:hover:bg-slate-800" title={t('reporting.export')}>
                          <Download size={14} />
                        </button>
                      )}
                      {canManage && (
                        <button onClick={() => openDeleteConfirm(temp)}
                          className="p-1.5 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-600
                            transition dark:hover:bg-rose-900/20" title={t('common.delete')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Silme Onay Modalı */}
      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setTemplateToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('reporting.modals.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('reporting.modals.deleteDesc', { name: templateToDelete?.name || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER — EDİTÖR GÖRÜNÜMÜ
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full gap-0 -mx-6 -mt-4">
      {/* Editör topbar */}
      <div className="flex items-center gap-3 px-6 py-3
        border-b border-border
        bg-card border-border">
        <button onClick={() => setMode("list")}
          className="flex items-center gap-1.5 text-sm
            text-muted-foreground hover:text-slate-900
            dark:text-muted-foreground dark:hover:text-slate-200 transition">
          <ChevronLeft size={16} /> {t('reporting.editor.returnList')}
        </button>
        <span className="text-muted-foreground">|</span>

        {/* Meta alanlar */}
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder={t('reporting.editor.templateName')}
          className="h-8 px-2.5 text-sm rounded w-48
            bg-slate-100 border border-slate-300 text-slate-900
            focus:outline-none focus:border-indigo-500
            bg-muted border-input text-foreground" />
        <input value={form.slug}
          onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") }))}
          placeholder={t('reporting.editor.slug')}
          className="h-8 px-2.5 text-sm font-mono rounded w-36
            bg-slate-100 border border-slate-300 text-slate-900
            focus:outline-none focus:border-indigo-500
            bg-muted border-input text-foreground"
          readOnly={!!editing} />
        <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as ReceiptTemplateForm["category"] }))}
          className="h-8 px-2 text-sm rounded
          bg-slate-100 border border-slate-300 text-slate-900
          focus:outline-none focus:border-indigo-500
          bg-muted border-input text-foreground">
          <option value="POS_RECEIPT">{t('reporting.categories.pos')}</option>
          <option value="KITCHEN_TICKET">{t('reporting.categories.kitchen')}</option>
          <option value="WAITER_TICKET">{t('reporting.categories.waiter')}</option>
        </select>
        <select value={form.paper_width} onChange={e => setForm(f => ({ ...f, paper_width: parseInt(e.target.value) }))}
          className="h-8 px-2 text-sm rounded
          bg-slate-100 border border-slate-300 text-slate-900
          focus:outline-none focus:border-indigo-500
          bg-muted border-input text-foreground">
          <option value={32}>{t("reporting.paperWidth58")}</option>
          <option value={48}>{t("reporting.paperWidth80")}</option>
        </select>

        <div className="flex-1" />

        {formError && (
          <span className="text-xs text-rose-400 flex items-center gap-1">
            <AlertCircle size={12} /> {formError}
          </span>
        )}

        <button onClick={handleSave} disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-indigo-600 text-white
          text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all">
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {editing ? t('common.update') : t('common.save')}
        </button>
      </div>

      {/* Editör gövdesi — sol: bloklar, sağ: önizleme */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden min-h-0" style={{ height: "calc(100vh - 220px)" }}>
        {/* Sol: Blok editörü */}
        <div className="flex-1 overflow-hidden flex flex-col
          bg-slate-50 border-r border-border min-w-0
          bg-card border-border">
            <div className="px-3 py-2 border-b flex items-center justify-between
              border-border border-border bg-muted/60">
              <p className="text-xs font-semibold uppercase tracking-wider
                text-muted-foreground">
                {t('reporting.editor.blocksCount', { count: form.layout_json.length })}
              </p>
              <button onClick={() => setShowHelp(true)} 
                className="text-muted-foreground hover:text-indigo-500 transition p-1"
                title={t('reporting.editor.help')}>
                <HelpCircle size={16} />
              </button>
            </div>
          <div className="flex-1 overflow-hidden">
            <ReceiptBlockEditor
              blocks={form.layout_json}
              onChange={handleBlocksChange}
            />
          </div>
        </div>

        {/* Sürükleme tutamacı */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 cursor-col-resize bg-transparent hover:bg-indigo-400/40 active:bg-indigo-500/60
            transition-colors shrink-0 relative group"
          title={t('reporting.editor.dragToResize')}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* Sağ: Termal önizleme */}
        <div className="flex flex-col bg-slate-100
          bg-card border-border transition-none shrink-0"
          style={{ width: `${previewWidth}px` }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/50">
            <span className="text-2xs font-semibold text-muted-foreground uppercase tracking-widest">{t('reporting.editor.preview')}</span>
          </div>
          <div className="flex-1 overflow-auto">
            <ReceiptPreview template={livePreviewTemplate} />
          </div>
        </div>

        {/* Yardım Modalı */}
        <ReceiptDesignerGuide 
          open={showHelp} 
          onOpenChange={setShowHelp} 
        />
      </div>
    </div>
  )
}
