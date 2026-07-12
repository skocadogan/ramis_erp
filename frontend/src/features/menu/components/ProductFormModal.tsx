"use client"

import { useEffect, useMemo, useState } from "react"
import { ImageIcon, X, Plus, Trash2, Scale, Building2, Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { useDirtyFormWarning } from "@/hooks/useDirtyFormWarning"
import type { Category, Product, ProductForm, ProductUnit, ModifierGroup, MenuTag } from "@/features/menu/types"
import { CategorySelectTree } from "./CategorySelectTree"
import ProductSelect from "./ProductSelect"
import { MenuTagSelect } from "./MenuTagSelect"
import type { Branch } from "@/types/user.types"
import { AppImage } from "@/components/AppImage"
import { resolveMediaUrl } from "@/lib/mediaUrl"
import { formatCurrency, formatAmount } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import {
  computeGrossFromNetAndTax,
  computeSalePriceFromGrossAndTax,
} from "@/features/menu/lib/productPricing"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RecommendedProductsModal } from "./RecommendedProductsModal"
import { menuApi } from "@/features/menu/services/menuApi"
import type { ProductRecommendation } from "@/features/menu/types"
import { apiUnitIdToSelect, unitDisplayPrice } from "@/features/menu/lib/recommendedProductPricing"

const inputClass =
  "mt-1 flex h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"

const textareaClass =
  "mt-1 block w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"

const smallNumericInputClass =
  "h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-ring"

const selectClass =
  "h-7 w-full rounded-md border border-input bg-transparent px-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"

const chipUnselectedClass =
  "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"

function ToggleSwitch({
  checked,
  onChange,
  activeClassName,
}: {
  checked: boolean
  onChange: () => void
  activeClassName?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40",
        checked ? (activeClassName ?? "bg-primary") : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  )
}

function combinedChildUnitDisplayPrice(unit: ProductUnit, basePrice: number | string): string {
  const bp = parseFloat(String(basePrice ?? "0").replace(",", ".")) || 0
  const o = unit.price_override
  if (o != null && String(o).trim() !== "") {
    return formatCurrency(o)
  }
  const m = unit.multiplier || 0
  return formatCurrency(bp * m)
}

/** Bir alt ürün kalemi için tek birim fiyatı (ana fiyat veya seçili satış birimine göre). */
function combinedChildLineUnitPrice(
  child: Product | undefined,
  productUnitId: string | null | undefined
): number {
  if (!child) return 0
  const bp = child.base_price || 0
  if (!productUnitId) return bp
  const u = child.units?.find((x) => x.id === productUnitId)
  if (!u) return bp
  const o = u.price_override
  if (o != null && String(o).trim() !== "") {
    return parseFloat(String(o).replace(",", ".")) || 0
  }
  const m = u.multiplier || 0
  return bp * m
}

/** Virgül veya nokta ile ondalık giriş; ara durumlarda (örn. "0.") yazıyı korur. */
function MenuDecimalInput({
  value,
  onCommit,
  className,
  fallbackOnBlur,
}: {
  value: number
  onCommit: (n: number) => void
  className?: string
  fallbackOnBlur: number
}) {
  const [text, setText] = useState(() => String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  const normalize = (raw: string) => raw.trim().replace(",", ".")

  const parsePositive = (raw: string): number | null => {
    const t = normalize(raw)
    if (t === "" || t === ".") return null
    const n = Number.parseFloat(t)
    if (!Number.isFinite(n) || n <= 0) return null
    return n
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        const n = parsePositive(raw)
        if (n != null) onCommit(n)
      }}
      onBlur={() => {
        const n = parsePositive(text)
        if (n == null) {
          setText(String(fallbackOnBlur))
          onCommit(fallbackOnBlur)
        } else {
          setText(String(n))
          onCommit(n)
        }
      }}
      className={className}
    />
  )
}

interface Props {
  mode: "create" | "edit"
  form: ProductForm
  categories: Category[]
  allProducts: Product[] // Added for combined product selection
  isSubmitting: boolean
  onChange: (form: ProductForm) => void
  onSubmit: () => void
  onClose: () => void
  branches: Branch[]
  modifierGroups?: ModifierGroup[]
  /** Birleşik ürün seçiminde kendisini hariç tutmak için (yalnızca edit) */
  editingProductId?: string | null
  /** Düzenlemede: bu menü ürününe ait reçetenin porsiyon başı maliyeti (API) */
  recipeCostPerServing?: number | null
  menuTags?: MenuTag[]
}

export default function ProductFormModal({
  mode,
  form,
  categories,
  allProducts,
  isSubmitting,
  onChange,
  onSubmit,
  onClose,
  branches,
  modifierGroups = [],
  editingProductId = null,
  recipeCostPerServing = null,
  menuTags = [],
}: Props) {
  const t = useTranslations("menu_management")
  const canViewAmounts = useCanViewAmounts()
  const [showRecommendedModal, setShowRecommendedModal] = useState(false)
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([])

  useEffect(() => {
    if (mode !== "edit" || !editingProductId) {
      setRecommendations([])
      return
    }
    let cancelled = false
    void menuApi.getProductRecommendations(editingProductId).then((res) => {
      if (!cancelled) setRecommendations((res.data ?? []) as ProductRecommendation[])
    }).catch(() => {
      if (!cancelled) setRecommendations([])
    })
    return () => { cancelled = true }
  }, [mode, editingProductId])

  // Capture initial form on mount for edit mode dirty detection.
  // The modal is conditionally rendered per mode, so useState initializer
  // runs exactly once and captures the pristine edit form.
  const [initialFormSnapshot] = useState(() =>
    mode === "edit" ? JSON.stringify(form) : null
  )
  const isDirty =
    mode === "edit" &&
    initialFormSnapshot !== null &&
    JSON.stringify(form) !== initialFormSnapshot

  useDirtyFormWarning(isDirty)

  /** Brüt ve/veya vergi değişti: brüt sabit kabul edilip net güncellenir. */
  const syncFromGrossAndTax = (gross: string, tax: string) => {
    onChange({
      ...form,
      gross_price: gross,
      tax_rate: tax,
      base_price: computeSalePriceFromGrossAndTax(gross, tax),
    })
  }

  /** Net ve/veya vergi değişti: net sabit kabul edilip brüt güncellenir. */
  const syncFromNetAndTax = (netVal: string, tax: string) => {
    const rawNet = String(netVal ?? "").trim()
    if (!rawNet) {
      onChange({ ...form, base_price: "", gross_price: "", tax_rate: tax })
      return
    }
    const n = parseFloat(rawNet.replace(",", "."))
    if (!Number.isFinite(n) || n <= 0) {
      onChange({ ...form, base_price: "", gross_price: "", tax_rate: tax })
      return
    }
    onChange({
      ...form,
      base_price: n.toFixed(2),
      tax_rate: tax,
      gross_price: computeGrossFromNetAndTax(rawNet, tax),
    })
  }

  /** Vergi değişti: önce brüt doluysa net güncellenir; değilse net sabit brüt güncellenir. */
  const syncTaxRate = (tax: string) => {
    const grossRaw = String(form.gross_price ?? "").trim()
    const brut = parseFloat(grossRaw.replace(",", "."))
    if (grossRaw && Number.isFinite(brut) && brut > 0) {
      syncFromGrossAndTax(form.gross_price, tax)
    } else {
      syncFromNetAndTax(form.base_price, tax)
    }
  }

  const suggestedCombinedPackagePrice = useMemo(() => {
    if (!form.is_combined) return null
    let total = 0
    let hasLine = false
    for (const item of form.combined_items) {
      if (!item.product?.trim()) continue
      const child = allProducts.find((p) => p.id === item.product)
      const unitPrice = combinedChildLineUnitPrice(child, item.product_unit)
      const qParsed = Number.parseFloat(String(item.quantity).replace(",", "."))
      const q = Number.isFinite(qParsed) && qParsed > 0 ? qParsed : 1
      total += unitPrice * q
      hasLine = true
    }
    return hasLine ? total : null
  }, [form.is_combined, form.combined_items, allProducts])

  return (
    <>
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent layout="scroll" size="7xl" className="min-h-[85vh] max-h-[96vh] xl:max-w-[90rem]">
        <DialogHeader className="pr-12">
          <DialogTitle>
            {form.name.trim() ||
              (mode === "create" ? t("productForm.titleNew") : t("productForm.titleEdit"))}
          </DialogTitle>
          {form.name.trim() ? (
            <DialogDescription>
              {mode === "create" ? t("productForm.titleNew") : t("productForm.titleEdit")}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-h-[calc(85vh-7.5rem)]">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2 md:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.28fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-8 lg:overflow-hidden">
          {/* Column 1: Core Details */}
          <div className="space-y-4 min-h-0 lg:overflow-y-auto lg:pr-1">
            <div className="flex gap-4 mb-6">
              <div className="shrink-0">
                <label className="text-sm font-ui-semibold text-foreground block mb-3">{t("productForm.image")}</label>
                {form.image ? (
                  <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-border bg-background shadow-sm transition-all group/img">
                    <AppImage
                      src={
                        form.image instanceof File
                          ? URL.createObjectURL(form.image)
                          : resolveMediaUrl(form.image) ?? ""
                      }
                      alt={t("productForm.previewAlt")}
                      fill
                      className="object-cover"
                      sizes="128px"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => onChange({ ...form, image: null })}
                        className="rounded-full bg-destructive p-2 text-destructive-foreground shadow-lg transition-transform hover:scale-110 hover:bg-destructive/90"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted/40 hover:text-foreground">
                    <ImageIcon size={28} className="mb-1" />
                    <span className="text-2xs font-ui-medium text-center px-2">{t("productForm.uploadImage")}</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*, image/webp, .webp"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) onChange({ ...form, image: file })
                      }}
                    />
                  </label>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-4">
                <div>
                  <label className="text-sm font-ui-medium text-foreground">{t("productForm.category")}</label>
                  <CategorySelectTree
                    categories={categories}
                    value={form.category ?? ""}
                    onChange={(value) => onChange({ ...form, category: value })}
                    placeholder={t("productForm.selectPlaceholder")}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-ui-medium text-foreground">{t("productForm.order")}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={form.order}
                      onChange={(e) => {
                        const t = e.target.value.trim()
                        if (t === "") onChange({ ...form, order: 0 })
                        else {
                          const n = parseInt(t.replace(/\D/g, ""), 10)
                          if (!Number.isNaN(n)) onChange({ ...form, order: n })
                        }
                      }}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-ui-medium text-foreground">{t("productForm.calories")}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={form.calories ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value.trim()
                        if (raw === "") {
                          onChange({ ...form, calories: null })
                          return
                        }
                        const n = parseInt(raw.replace(/\D/g, ""), 10)
                        if (!Number.isNaN(n) && n > 0) onChange({ ...form, calories: n })
                      }}
                      className={inputClass}
                      placeholder={t("productForm.caloriesPlaceholder")}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm font-ui-medium text-foreground">{t("productForm.name")}</label>
              <input value={form.name} onChange={e => onChange({ ...form, name: e.target.value })}
                className={inputClass} placeholder={t("productForm.namePlaceholder")} />
            </div>

            <div>
              <label className="text-sm font-ui-medium text-foreground">{t("productForm.tags")}</label>
              <MenuTagSelect
                className="mt-1"
                value={form.tag_ids}
                onChange={(tag_ids) => onChange({ ...form, tag_ids })}
                tags={menuTags}
              />
            </div>

            <div>
              <label className="text-sm font-ui-medium text-foreground">{t("productForm.description")}</label>
              <textarea
                value={form.description}
                onChange={(e) => onChange({ ...form, description: e.target.value })}
                className={textareaClass}
                rows={4}
                placeholder={t("productForm.descriptionPlaceholder")}
              />
            </div>

            {mode === "edit" && editingProductId && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRecommendedModal(true)}
                >
                  {t("recommendedProducts.button")}
                </Button>
                {recommendations.length > 0 && (
                  <div className="overflow-hidden rounded-md border border-border/60 bg-background">
                    <div className="h-[22.5rem] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-muted/10 backdrop-blur-sm">
                          <tr className="text-left text-xs text-muted-foreground">
                            <th className="px-3 pb-2 pt-2 pr-3">{t("recommendedProducts.columns.product")}</th>
                            <th className="pb-2 pt-2 pr-3">{t("recommendedProducts.columns.unit")}</th>
                            <th className="px-3 pb-2 pt-2 text-right">{t("recommendedProducts.columns.price")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recommendations.map((rec) => {
                            const stubProduct = allProducts.find((p) => p.id === rec.recommended_product_id)
                            const unitSelect = apiUnitIdToSelect(rec.product_unit)
                            const price = stubProduct
                              ? unitDisplayPrice(stubProduct, unitSelect)
                              : rec.recommended_product_discounted_price ?? rec.recommended_product_base_price
                            const unitLabel =
                              !rec.product_unit
                                ? t("recommendedProducts.standardUnit")
                                : rec.product_unit_name ?? "—"
                            return (
                              <tr key={rec.id} className="border-t border-border/60">
                                <td className="px-3 py-1.5 pr-3 font-ui-medium">{rec.recommended_product_name}</td>
                                <td className="py-1.5 pr-3 text-muted-foreground">{unitLabel}</td>
                                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                  {canViewAmounts ? formatCurrency(price) : "—"}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column 2: Status & Branch Options */}
          <div className="space-y-6 min-h-0 lg:overflow-y-auto lg:pr-1">
            <div className="space-y-3 rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-ui-semibold text-foreground">
                    {t("productForm.menuActive")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("productForm.menuActiveHint")}
                  </p>
                </div>
                <ToggleSwitch
                  checked={form.is_active}
                  onChange={() => onChange({ ...form, is_active: !form.is_active })}
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border/80 pt-3">
                <div className="min-w-0">
                  <p className="text-sm font-ui-semibold text-foreground">{t("productForm.feature")}</p>
                </div>
                <ToggleSwitch
                  checked={form.is_featured}
                  onChange={() => onChange({ ...form, is_featured: !form.is_featured })}
                  activeClassName="bg-amber-500"
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border/80 pt-3">
                <div className="min-w-0">
                  <p className="text-sm font-ui-semibold text-foreground">{t("productForm.combinedProduct")}</p>
                </div>
                <ToggleSwitch
                  checked={form.is_combined}
                  onChange={() => onChange({ ...form, is_combined: !form.is_combined })}
                  activeClassName="bg-purple-600"
                />
              </div>
            </div>

            {modifierGroups.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="text-sm font-ui-semibold text-foreground mb-3">{t("productForm.modifierGroups")}</h3>
                <div className="flex flex-wrap gap-2">
                  {modifierGroups.map((group) => {
                    const isSelected = form.modifier_group_ids.includes(group.id)
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => {
                          const next = isSelected
                            ? form.modifier_group_ids.filter((id) => id !== group.id)
                            : [...form.modifier_group_ids, group.id]
                          onChange({ ...form, modifier_group_ids: next })
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-ui-semibold border transition-all",
                          isSelected
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : cn("border", chipUnselectedClass, "hover:border-emerald-500/50")
                        )}
                      >
                        {group.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-ui-semibold text-foreground">
                <Building2 size={16} className="text-primary" /> {t("productForm.branchAccess")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">{t("productForm.noBranches")}</p>
                ) : (
                  branches.map(branch => {
                    const isSelected = form.branches.includes(branch.id)
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        onClick={() => {
                          const newBranches = isSelected
                            ? form.branches.filter(id => id !== branch.id)
                            : [...form.branches, branch.id]
                          onChange({ ...form, branches: newBranches })
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-ui-semibold border transition-all",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : cn("border", chipUnselectedClass)
                        )}
                      >
                        {branch.name}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-3">
              <label className="text-sm font-ui-semibold text-foreground">{t("productForm.pricing")}</label>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("productForm.pricingHint")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-ui-medium text-foreground">{t("productForm.grossPrice")}</label>
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={form.gross_price}
                      onChange={(e) => syncFromGrossAndTax(e.target.value, form.tax_rate)}
                      className={cn(inputClass, "mt-0 flex-1 min-w-0")}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-ui-medium text-foreground">{t("productForm.taxRate")}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.tax_rate}
                    onChange={(e) => syncTaxRate(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="text-sm font-ui-medium text-foreground">{t("productForm.netPrice")}</label>
                <div className="mt-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={form.base_price}
                    onChange={(e) => syncFromNetAndTax(e.target.value, form.tax_rate)}
                    className={cn(inputClass, "mt-0 flex-1 min-w-0")}
                    placeholder="0"
                  />
                </div>
              </div>
              {mode === "edit" && !form.is_combined && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {recipeCostPerServing != null ? (
                    <>
                      {t("productForm.recipeCost")}
                      <span className="font-ui-medium text-foreground">
                        {formatAmount(recipeCostPerServing, canViewAmounts)}
                      </span>
                    </>
                  ) : (
                    <>{t("productForm.noRecipe")}</>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Column 3: Selling Units or Combined Items */}
          <div className="flex h-full min-h-0 min-w-0 flex-col space-y-4 overflow-hidden lg:border-l lg:border-border lg:pl-4">
            {!form.is_combined ? (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center gap-2 text-sm font-ui-semibold text-foreground">
                    <Scale size={16} className="text-primary" /> {t("productForm.sellingUnits")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onChange({
                      ...form,
                      units: [...form.units, { name: "", multiplier: 1.0, price_override: null, order: form.units.length }]
                    })}
                    className="flex items-center gap-1 text-xs font-ui-medium text-primary hover:text-primary/80"
                  >
                    <Plus size={14} /> {t("productForm.addUnit")}
                  </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-2 pb-2 [scrollbar-gutter:stable]">
                  {form.units.length > 0 ? (
                    form.units.map((unit, index) => (
                      <div key={index} className="relative flex flex-col gap-2 rounded-md border border-border bg-background px-3 py-2">
                        <div className="flex items-center gap-2">
                          <input
                            placeholder={t("productForm.unitNamePlaceholder")}
                            value={unit.name}
                            onChange={(e) => {
                              const newUnits = [...form.units]
                              newUnits[index] = { ...unit, name: e.target.value }
                              onChange({ ...form, units: newUnits })
                            }}
                            className="h-6 border-none bg-transparent p-0 text-ui-sm font-ui-semibold placeholder:font-ui-normal focus:ring-0"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newUnits = form.units.filter((_, i) => i !== index)
                              onChange({ ...form, units: newUnits })
                            }}
                            className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-2xs font-ui-medium text-muted-foreground">{t("productForm.multiplier")}</label>
                            <div className="flex items-center gap-1">
                              <MenuDecimalInput
                                value={unit.multiplier > 0 ? unit.multiplier : 1}
                                fallbackOnBlur={1}
                                onCommit={(m) => {
                                  const newUnits = [...form.units]
                                  const basePriceStr = (form.base_price || "0").toString().replace(",", ".")
                                  const basePrice = Number.parseFloat(basePriceStr) || 0
                                  const calculatedPrice = Number.parseFloat((basePrice * m).toFixed(2))
                                  newUnits[index] = {
                                    ...unit,
                                    multiplier: m,
                                    price_override: Number.isFinite(calculatedPrice) ? calculatedPrice : null,
                                  }
                                  onChange({ ...form, units: newUnits })
                                }}
                                className={smallNumericInputClass}
                              />
                              <span className="shrink-0 text-2xs text-muted-foreground">×</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-2xs font-ui-medium text-muted-foreground">{t("productForm.price")}</label>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                value={unit.price_override?.toString().replace(",", ".") || ""}
                                onChange={(e) => {
                                  const val = e.target.value
                                  const newUnits = [...form.units]
                                  newUnits[index] = {
                                    ...unit,
                                    price_override:
                                      val.trim() !== ""
                                        ? Number.parseFloat(val.trim().replace(",", "."))
                                        : null,
                                  }
                                  onChange({ ...form, units: newUnits })
                                }}
                                className={smallNumericInputClass}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground italic">{t("productForm.noUnitsYet")}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="mb-2 flex items-center justify-between pr-2">
                  <h3 className="flex items-center gap-1.5 text-xs font-ui-semibold text-foreground">
                    <Plus size={14} className="text-purple-500" /> {t("productForm.packageContents")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => onChange({
                      ...form,
                      combined_items: [...form.combined_items, { product: "", quantity: 1, product_unit: null }]
                    })}
                    className="text-xs font-ui-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 flex items-center gap-1"
                  >
                    <Plus size={14} /> {t("productForm.addProduct")}
                  </button>
                </div>

                {suggestedCombinedPackagePrice !== null ? (
                  <div className="mb-2 shrink-0 pr-2">
                    <div className="rounded-md border border-purple-200 bg-purple-50 px-2.5 py-2 dark:border-purple-800/60 dark:bg-purple-950/35">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                        <p className="text-2xs font-ui-medium uppercase tracking-wide text-purple-800 dark:text-purple-200/90">
                          {t("productForm.suggestedPrice")}
                        </p>
                        <p className="text-base font-ui-semibold tabular-nums text-purple-900 dark:text-purple-100">
                          {formatCurrency(suggestedCombinedPackagePrice)}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const net = suggestedCombinedPackagePrice
                            if (net == null || !Number.isFinite(net) || net <= 0) return
                            syncFromNetAndTax(net.toFixed(2), form.tax_rate)
                          }}
                          className="rounded border border-purple-300 bg-background px-2 py-0.5 text-2xs font-ui-medium text-purple-800 hover:bg-muted dark:border-purple-700 dark:text-purple-200"
                        >
                          {t("productForm.applyNetPrice")}
                        </button>
                      </div>
                      <p className="mt-1 text-[9px] leading-snug text-purple-800/80 dark:text-purple-200/65">
                        {t("productForm.suggestedHelp")}
                      </p>
                    </div>
                  </div>
                ) : form.combined_items.length > 0 ? (
                  <p className="mb-2 shrink-0 pr-2 text-[9px] text-muted-foreground">
                    {t("productForm.suggestedHint")}
                  </p>
                ) : null}

                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pb-2 pr-2">
                  {form.combined_items.length > 0 ? (
                    form.combined_items.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-md border border-border bg-background p-1.5"
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="min-w-0 flex-1">
                            <ProductSelect
                              value={item.product}
                              allProducts={allProducts.filter(
                                (p) => !p.is_combined && p.id !== (editingProductId ?? "")
                              )}
                              triggerClassName="h-8 min-h-8 py-1.5 px-2 text-sub leading-tight"
                              onSelect={(productId: string) => {
                                const newItems = [...form.combined_items]
                                newItems[index] = { ...item, product: productId, product_unit: null }
                                onChange({ ...form, combined_items: newItems })
                              }}
                            />
                          </div>
                          <div className="w-[7.25rem] shrink-0" title={t("productForm.qtyTitle")}>
                            <MenuDecimalInput
                              value={(() => {
                                const qNum = Number.parseFloat(String(item.quantity).replace(",", "."))
                                return Number.isFinite(qNum) && qNum > 0 ? qNum : 1
                              })()}
                              fallbackOnBlur={1}
                              onCommit={(n) => {
                                const newItems = [...form.combined_items]
                                newItems[index] = { ...item, quantity: n }
                                onChange({ ...form, combined_items: newItems })
                              }}
                              className={cn(smallNumericInputClass, "h-7 px-1 text-center text-xs font-ui-semibold")}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const newItems = form.combined_items.filter((_, i) => i !== index)
                              onChange({ ...form, combined_items: newItems })
                            }}
                            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                            aria-label={t("productForm.removeLineAria")}
                          >
                            <Trash2 size={12} strokeWidth={2} />
                          </button>
                        </div>
                        {(() => {
                          const child = item.product
                            ? allProducts.find((p) => p.id === item.product)
                            : undefined
                          const childUnits =
                            child?.units?.filter((u) => u.name?.trim() && u.id) ?? []
                          if (childUnits.length === 0) return null
                          const sel = childUnits.find((u) => u.id === item.product_unit)
                          return (
                            <div className="mt-1.5 space-y-0.5 border-t border-border/80 pt-1.5">
                              <select
                                value={item.product_unit ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value
                                  const newItems = [...form.combined_items]
                                  newItems[index] = {
                                    ...item,
                                    product_unit: v ? v : null,
                                  }
                                  onChange({ ...form, combined_items: newItems })
                                }}
                                className={selectClass}
                              >
                                <option value="">{t("productForm.unitDefault")}</option>
                                {childUnits.map((u) => (
                                  <option key={u.id ?? `${u.name}-${u.order}`} value={u.id ?? ""}>
                                    {u.name} — {combinedChildUnitDisplayPrice(u, child?.base_price ?? "0")}
                                  </option>
                                ))}
                              </select>
                              {sel && child ? (
                                <p className="text-[9px] text-muted-foreground">
                                  {t("productForm.unitSelected")}{combinedChildUnitDisplayPrice(sel, child.base_price)}
                                  {t("productForm.perPiece")}
                                </p>
                              ) : null}
                            </div>
                          )
                        })()}
                      </div>
                    ))
                  ) : (
                    <p className="py-3 text-center text-sub italic text-muted-foreground">
                      {t("productForm.emptyCombined")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("productForm.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || form.units.some(u => !u.name.trim())}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? t("productForm.saving") : mode === "create" ? t("productForm.save") : t("productForm.update")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {mode === "edit" && editingProductId && (
      <RecommendedProductsModal
        open={showRecommendedModal}
        onOpenChange={setShowRecommendedModal}
        sourceProductId={editingProductId}
        sourceProductName={form.name}
        sourceBranchIds={form.branches}
        categories={categories}
        allProducts={allProducts}
        onSaved={setRecommendations}
      />
    )}
    </>
  )
}
