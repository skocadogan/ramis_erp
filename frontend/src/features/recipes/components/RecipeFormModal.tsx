"use client"

import { useTranslations } from "next-intl"
import React, { useMemo, useState, type Dispatch, type SetStateAction } from "react"
import { Plus, Trash2, Search, ChefHat, Info, ShieldAlert, BookOpen } from "lucide-react"
import { useDirtyFormWarning } from "@/hooks/useDirtyFormWarning"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import StockItemSelect from "@/features/inventory/components/StockItemSelect"
import type { RecipeMenuItem, RecipeStockItem, RecipeBranch, RecipeStockUnit, RecipeFormState, RecipeIngredientDraft, RecipeCategory, Recipe } from "../types"
import { AllergenReferenceModal } from "@/features/allergens/components/AllergenReferenceModal"
import { RecipeCategorySelectTree } from "./RecipeCategorySelectTree"
import { filterSelectableMenuProducts } from "../utils/selectableMenuProducts"

interface RecipeFormModalProps {
  open: boolean
  isSubmitting: boolean
  formData: RecipeFormState
  setFormData: Dispatch<SetStateAction<RecipeFormState>>
  ingredients: RecipeIngredientDraft[]
  addIngredient: () => void
  removeIngredient: (index: number) => void
  updateIngredient: (index: number, field: keyof RecipeIngredientDraft, value: string) => void
  onSubmit: () => void
  onClose: () => void
  products: RecipeMenuItem[]
  recipeCategories: RecipeCategory[]
  stockItems: RecipeStockItem[]
  stockUnits: RecipeStockUnit[]
  branches: RecipeBranch[]
  subRecipes: Recipe[]
  editingRecipeId: string | null
  editingRecipe: Recipe | null
}

export function RecipeFormModal({
  open,
  isSubmitting,
  formData,
  setFormData,
  ingredients,
  addIngredient,
  removeIngredient,
  updateIngredient,
  onSubmit,
  onClose,
  products,
  recipeCategories,
  stockItems,
  stockUnits,
  branches,
  subRecipes,
  editingRecipeId,
  editingRecipe,
}: RecipeFormModalProps) {
  const t = useTranslations("recipes.form")
  const tInv = useTranslations("inventory")
  const [ingredientSearch, setIngredientSearch] = useState("")
  const [showAllergenRef, setShowAllergenRef] = useState(false)

  const selectableSubRecipes = useMemo(
    () => subRecipes.filter(r => r.id !== editingRecipeId),
    [subRecipes, editingRecipeId],
  )

  const selectableProducts = useMemo(
    () => filterSelectableMenuProducts(
      products,
      formData.branches ?? [],
      formData.product_id || undefined,
    ),
    [products, formData.branches, formData.product_id],
  )

  // Detect unsaved changes when editing a recipe
  const isDirty = useMemo(() => {
    if (!editingRecipeId || !editingRecipe) return false
    return (
      formData.name !== editingRecipe.name ||
      formData.servings !== editingRecipe.servings ||
      formData.prep_time_minutes !== editingRecipe.prep_time_minutes ||
      formData.cook_time_minutes !== editingRecipe.cook_time_minutes ||
      formData.prep_time_per_serving !== editingRecipe.prep_time_per_serving ||
      formData.cook_time_per_serving !== editingRecipe.cook_time_per_serving ||
      formData.product_id !== editingRecipe.product ||
      formData.category_id !== (editingRecipe.category ?? "") ||
      (formData.serving_quantity ?? null) !== (editingRecipe.serving_quantity ?? null) ||
      (formData.serving_unit ?? "") !== (editingRecipe.serving_unit ?? "") ||
      (formData.description ?? "") !== (editingRecipe.description ?? "")
    )
  }, [editingRecipeId, editingRecipe, formData])

  useDirtyFormWarning(isDirty)

  const toggleBranch = (branchId: string) => {
    const current = formData.branches || []
    if (current.includes(branchId)) {
      setFormData({ ...formData, branches: current.filter((id: string) => id !== branchId) })
    } else {
      setFormData({ ...formData, branches: [...current, branchId] })
    }
  }

  const sectionClass = "space-y-3 border-b border-border pb-5"
  const sectionTitleClass = "text-sm font-bold text-foreground"
  const fieldLabelClass = "text-xs font-semibold text-muted-foreground"
  const selectClass =
    "mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring appearance-none"
  const inlineSelectClass =
    "h-8 w-full rounded border border-input bg-transparent px-2 text-2xs outline-none focus-visible:ring-1 focus-visible:ring-ring"

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent layout="scroll" size="7xl" className="max-h-[95vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ChefHat className="text-blue-600" size={16} />
            {editingRecipeId ? t("titleEdit") : t("titleNew")}
          </DialogTitle>
        </DialogHeader>

        <TooltipProvider delay={300}>
        <DialogBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0" data-scroll-close-popover>
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-12">
            {/* Left Column: General Info */}
            <div className="space-y-5 overflow-y-auto px-6 py-5 custom-scrollbar lg:col-span-5 lg:border-r lg:border-border">

              {/* Section: Basic Info */}
              <div className={sectionClass}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-3.5 bg-blue-600 rounded-full" />
                  <span className={sectionTitleClass}>{t("sectionBasic")}</span>
                </div>
                <div>
                  <label className={`${fieldLabelClass} ml-1`}>{t("fieldRecipeName")}</label>
                  <Input
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1"
                    placeholder={t("placeholderRecipeName")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1 ml-1">
                      <label className={fieldLabelClass}>{t("fieldMenuProduct")}</label>
                      <HelpTooltip text={t("help.menuProduct")} />
                    </div>
                    <select
                      value={formData.product_id || ""}
                      onChange={e => setFormData({ ...formData, product_id: e.target.value })}
                      className={selectClass}
                    >
                      <option value="">{t("selectPlaceholder")}</option>
                      {selectableProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 ml-1">
                      <label className={fieldLabelClass}>{t("fieldCategory")}</label>
                      <HelpTooltip text={t("help.category")} />
                    </div>
                    <div className="mt-0.5">
                      <RecipeCategorySelectTree
                        categories={recipeCategories}
                        value={formData.category_id}
                        onChange={val => setFormData({ ...formData, category_id: val })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Timing & Portions */}
              <div className={sectionClass}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-3.5 bg-amber-500 rounded-full" />
                    <span className={sectionTitleClass}>{t("sectionTiming")}</span>
                  </div>
                  {formData.learned_timing && formData.learned_timing.length > 0 && (
                    <div className="group relative">
                      <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-100 cursor-help">
                        <ChefHat size={10} />
                        <span className="text-3xs font-bold uppercase">{t("badgeLearnedFromKitchen")}</span>
                      </div>
                      {/* Tooltip-like dropdown */}
                      <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg z-50 invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all">
                        <h4 className="text-2xs font-bold text-foreground mb-2 border-b border-border pb-1">{t("learnedTimingTitle")}</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                          {formData.learned_timing.map((lt, idx) => (
                            <div key={idx} className="flex justify-between items-center text-2xs border-b border-border pb-1 last:border-0">
                              <div className="flex flex-col">
                                <span className="font-bold text-foreground">{lt.branch_name}</span>
                                <span className="text-3xs text-muted-foreground">{lt.station_name}</span>
                              </div>
                              <div className="flex flex-col items-end">
                                <span className="text-blue-600 font-bold">{t("minutesShort", { n: lt.ema_minutes })}</span>
                                <span className="text-4xs text-muted-foreground">{t("learnedSampleCount", { count: lt.sample_count })}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="mt-2 text-4xs text-muted-foreground leading-tight italic">
                          {t("learnedFootnote")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="flex items-center gap-1 ml-1">
                      <label className={fieldLabelClass}>{t("fieldServings")}</label>
                      <HelpTooltip text={t("help.servings")} />
                    </div>
                    <div className="mt-0.5">
                      <NumberInput
                        min="1"
                        value={formData.servings}
                        onChange={val => setFormData({ ...formData, servings: parseInt(val) || 1 })}
                        className="bg-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 ml-1">
                      <label className={fieldLabelClass}>{t("fieldPrepTotal")}</label>
                      <HelpTooltip text={t("help.prepTotal")} />
                    </div>
                    <div className="mt-0.5">
                      <NumberInput
                        min="0"
                        value={formData.prep_time_minutes}
                        onChange={val => setFormData({ ...formData, prep_time_minutes: parseInt(val) || 0 })}
                        className="bg-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1 ml-1">
                      <label className={fieldLabelClass}>{t("fieldCookTotal")}</label>
                      <HelpTooltip text={t("help.cookTotal")} />
                    </div>
                    <div className="mt-0.5">
                      <NumberInput
                        min="0"
                        value={formData.cook_time_minutes}
                        onChange={val => setFormData({ ...formData, cook_time_minutes: parseInt(val) || 0 })}
                        className="bg-transparent"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-blue-600">{t("fieldPrepPerServing")}</label>
                      <HelpTooltip text={t("help.prepPerServing")} />
                    </div>
                    <NumberInput
                      min="0"
                      value={formData.prep_time_per_serving}
                      onChange={val => setFormData({ ...formData, prep_time_per_serving: parseInt(val) || 0 })}
                      className="bg-transparent"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <label className="text-xs font-bold text-amber-600">{t("fieldCookPerServing")}</label>
                      <HelpTooltip text={t("help.cookPerServing")} />
                    </div>
                    <NumberInput
                      min="0"
                      value={formData.cook_time_per_serving}
                      onChange={val => setFormData({ ...formData, cook_time_per_serving: parseInt(val) || 0 })}
                      className="bg-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Other Details */}
              <div className={`${sectionClass} space-y-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1 h-3.5 bg-muted-foreground rounded-full" />
                  <span className={sectionTitleClass}>{t("sectionOther")}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`${fieldLabelClass} ml-1`}>{t("fieldServingQty")}</label>
                    <div className="mt-0.5">
                      <NumberInput
                        min="0"
                        step="0.001"
                        placeholder="0.000"
                        value={formData.serving_quantity}
                        onChange={val => setFormData({ ...formData, serving_quantity: parseFloat(val) || 0 })}
                        className="bg-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={`${fieldLabelClass} ml-1`}>{t("fieldUnit")}</label>
                    <Input
                      value={formData.serving_unit}
                      onChange={e => setFormData({ ...formData, serving_unit: e.target.value })}
                      className="mt-0.5"
                      placeholder={t("placeholderUnit")}
                    />
                  </div>
                </div>
                <div>
                  <label className={`${fieldLabelClass} ml-1`}>{t("fieldBranchAccess")}</label>
                  <div className="mt-0.5 grid max-h-28 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-border p-2 custom-scrollbar">
                    {branches.map(branch => (
                      <label key={branch.id} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={(formData.branches || []).includes(branch.id)}
                          onChange={() => toggleBranch(branch.id)}
                          className="w-3 h-3 text-blue-600 rounded border-border focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-2xs font-medium text-muted-foreground group-hover:text-blue-600 transition-colors">
                          {branch.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section: Allergens (computed, read-only) */}
              <div className="space-y-2 rounded-lg border border-amber-200/70 p-3 dark:border-amber-900/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={14} className="text-amber-600" />
                    <span className={sectionTitleClass}>{t("sectionAllergens")}</span>
                    {editingRecipe?.is_allergenic && (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-2xs font-bold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        {t("allergenicBadge")}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAllergenRef(true)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    <BookOpen size={12} />
                    {t("allergenReference")}
                  </button>
                </div>
                {editingRecipe?.allergens && editingRecipe.allergens.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {editingRecipe.allergens.map((a) => (
                      <span
                        key={a.id}
                        className="rounded-md border border-amber-200/70 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-800 dark:text-amber-100"
                        title={`${a.code} · ${Number(a.prevalence_pct).toFixed(2)}%`}
                      >
                        {a.name}
                        <span className="ml-1 text-2xs opacity-70">({a.risk_score})</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("noAllergens")}</p>
                )}
                {editingRecipe?.allergen_sources && editingRecipe.allergen_sources.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-2xs text-muted-foreground">
                    {editingRecipe.allergen_sources.map((src, idx) => (
                      <li key={`${src.type}-${src.name}-${idx}`}>
                        {src.type === "sub_recipe"
                          ? t("allergenSourceSubRecipe", { name: src.name })
                          : t("allergenSourceStock", { name: src.name })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Column: Ingredients List */}
            <div className="flex min-h-0 flex-col overflow-hidden lg:col-span-7">
              {/* Header: Search & Add */}
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder={tInv("pickRows.lineFilterPlaceholder")}
                    value={ingredientSearch}
                    onChange={(e) => setIngredientSearch(e.target.value)}
                    className="h-8 pl-8 text-sub"
                  />
                </div>
                <Button type="button" size="sm" onClick={addIngredient}>
                  <Plus size={14} /> {t("addIngredient")}
                </Button>
              </div>

              {/* Table Headers */}
              <div className="grid shrink-0 grid-cols-12 gap-2 border-b border-border px-6 py-2 text-xs font-bold text-muted-foreground">
                <div className="col-span-2">{t("colType")}</div>
                <div className="col-span-5">{tInv("pickRows.colStockItem")}</div>
                <div className="col-span-2 text-center">{tInv("movementsTable.colQty")}</div>
                <div className="col-span-2 text-center">{tInv("itemsTable.colUnit")}</div>
                <div className="col-span-1 text-right pr-1">{tInv("movementsTable.colAction")}</div>
              </div>

              {/* Table Body / Scrollable Area */}
              <div className="flex-1 space-y-0 overflow-y-auto px-6 py-2 custom-scrollbar">
                {ingredients.map((ing, i) => ({ ing, i })).filter(({ ing }) => {
                  const stockItem = stockItems.find(s => s.id === ing.stock_item_id)
                  const subRecipe = selectableSubRecipes.find(r => r.id === ing.sub_recipe_id)
                    ?? subRecipes.find(r => r.id === ing.sub_recipe_id)
                  const searchStr = ingredientSearch.toLowerCase()
                  if (!ingredientSearch) return true
                  if (ing.kind === "sub_recipe") {
                    return (subRecipe?.name || "").toLowerCase().includes(searchStr)
                  }
                  return !ing.stock_item_id ||
                    (stockItem?.name || "").toLowerCase().includes(searchStr) ||
                    (stockItem?.sku || "").toLowerCase().includes(searchStr)
                }).map(({ ing, i }) => (
                  <div key={ing.clientId} className="grid grid-cols-12 items-center gap-1 border-b border-border py-1.5 last:border-b-0">
                    <div className="col-span-2">
                      <select
                        value={ing.kind}
                        onChange={e => updateIngredient(i, "kind", e.target.value)}
                        className={`${inlineSelectClass} font-bold`}
                      >
                        <option value="stock_item">{t("ingredientTypeStock")}</option>
                        <option value="sub_recipe">{t("ingredientTypeSubRecipe")}</option>
                      </select>
                    </div>
                    <div className="col-span-5">
                      {ing.kind === "sub_recipe" ? (
                        <select
                          value={ing.sub_recipe_id}
                          onChange={e => updateIngredient(i, "sub_recipe_id", e.target.value)}
                          className={`${inlineSelectClass} font-medium`}
                        >
                          <option value="">{t("selectSubRecipe")}</option>
                          {selectableSubRecipes.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      ) : (
                        <StockItemSelect
                          value={ing.stock_item_id}
                          onSelect={item => updateIngredient(i, "stock_item_id", item.id)}
                        />
                      )}
                    </div>
                    <div className="col-span-2">
                      <NumberInput
                        placeholder="0.00"
                        value={ing.quantity}
                        onChange={val => updateIngredient(i, "quantity", val)}
                        containerClassName="h-8"
                        className="bg-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <select
                        value={ing.unit}
                        onChange={e => updateIngredient(i, "unit", e.target.value)}
                        className={`${inlineSelectClass} font-bold`}
                      >
                        <option value="">{tInv("itemsTable.colUnit")}</option>
                        {stockUnits.map(u => (
                          <option key={u.id} value={u.short_name}>{u.short_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeIngredient(i)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}

                {ingredients.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center py-12 text-center">
                    <ChefHat size={28} className="text-muted-foreground/30 mb-2" />
                    <p className="text-sub font-bold text-muted-foreground">{t("emptyIngredients")}</p>
                  </div>
                )}
              </div>

              {/* Instructions / Description (Optional) */}
              <div className="shrink-0 border-t border-border px-6 py-4">
                <label className={`${fieldLabelClass} ml-1`}>{t("fieldInstructions")}</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 min-h-[120px] w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  rows={6}
                  placeholder={t("placeholderInstructions")}
                />
              </div>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between">
          <div className="text-2xs font-medium italic text-muted-foreground">
            {t("footerRequiredHint")}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={onSubmit} disabled={isSubmitting || !formData.name}>
              {isSubmitting ? t("submitProcessing") : editingRecipeId ? t("submitSave") : t("submitCreate")}
            </Button>
          </div>
        </DialogFooter>
        </TooltipProvider>
      </DialogContent>
    </Dialog>

    <AllergenReferenceModal open={showAllergenRef} onClose={() => setShowAllergenRef(false)} showPrevalence />
    </>
  )
}

function HelpTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="inline-flex items-center rounded-sm text-muted-foreground hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
      >
        <Info size={10} className="cursor-help" aria-hidden />
        <span className="sr-only">{text}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-64 border border-border bg-popover px-3 py-2 text-xs text-popover-foreground leading-relaxed shadow-md"
      >
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
