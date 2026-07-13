"use client"

import { useMemo, useState, useEffect, useCallback } from "react"
import { X, SlidersHorizontal, ShieldAlert } from "lucide-react"
import { useTranslations } from "next-intl"
import { Product, ProductModifier, ProductUnit } from "@/types/pos"
import { AMOUNT_DISPLAY_MASK, formatCurrency } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { usePosStore } from "@/store/usePosStore"
import {
  buildDisplayAllergenModalPayload,
  productHasAllergens,
} from "@/features/pos/utils/displayAllergenModal"

export interface ProductOptionsSelectionState {
  step: "unit" | "modifiers"
  selectedUnit: ProductUnit | null | undefined
  pickedModifiers: ProductModifier[]
}

interface Props {
  product: Product
  onConfirm: (unit: ProductUnit | null | undefined, modifiers: ProductModifier[]) => void
  onClose: () => void
  onStepChange?: (step: "unit" | "modifiers") => void
  onSelectionChange?: (state: ProductOptionsSelectionState) => void
  /** Müşteri ekranına allerjen modalı yansıt (yalnızca POS) */
  syncCustomerDisplay?: boolean
}

function unitPrice(product: Product, unit: ProductUnit | null): number {
  if (!unit) {
    if (product.has_discount && product.discounted_price != null) return product.discounted_price
    return product.base_price
  }
  if (unit.price_override != null) return unit.price_override
  return product.base_price * unit.multiplier
}

export function ProductOptionsModal({
  product,
  onConfirm,
  onClose,
  onStepChange,
  onSelectionChange,
  syncCustomerDisplay = true,
}: Props) {
  const t = useTranslations("pos.options")
  const tUnit = useTranslations("pos.unit")
  const tProduct = useTranslations("pos.product")
  const canViewAmounts = useCanViewAmounts()
  const setDisplayAllergenModal = usePosStore((s) => s.setDisplayAllergenModal)
  const hasAllergens = productHasAllergens(product)
  const [showAllergens, setShowAllergens] = useState(false)
  const hasUnits = (product.units?.length ?? 0) > 0
  const groups = useMemo(() => product.modifier_groups ?? [], [product.modifier_groups])
  const needsUnitStep = hasUnits
  const [step, setStep] = useState<"unit" | "modifiers">(needsUnitStep ? "unit" : "modifiers")
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit | null | undefined>(
    needsUnitStep ? undefined : null
  )
  const [picked, setPicked] = useState<Record<string, ProductModifier[]>>({})

  useEffect(() => {
    onStepChange?.(step)
  }, [step, onStepChange])

  useEffect(() => {
    onSelectionChange?.({
      step,
      selectedUnit,
      pickedModifiers: Object.values(picked).flat(),
    })
  }, [step, selectedUnit, picked, onSelectionChange])

  const handleAllergenOpenChange = useCallback(
    (open: boolean) => {
      setShowAllergens(open)
      if (syncCustomerDisplay) {
        setDisplayAllergenModal(open ? buildDisplayAllergenModalPayload(product) : null)
      }
    },
    [product, setDisplayAllergenModal, syncCustomerDisplay]
  )

  const baseUnitPrice = useMemo(() => {
    if (selectedUnit === undefined) return product.base_price
    return unitPrice(product, selectedUnit ?? null)
  }, [product, selectedUnit])

  const modifierTotal = useMemo(
    () => Object.values(picked).flat().reduce((s, m) => s + m.price_adjustment, 0),
    [picked]
  )

  const toggleModifier = (groupId: string, mod: ProductModifier, isMultiple: boolean) => {
    setPicked((prev) => {
      const current = prev[groupId] ?? []
      const exists = current.some((m) => m.id === mod.id)
      if (isMultiple) {
        return {
          ...prev,
          [groupId]: exists ? current.filter((m) => m.id !== mod.id) : [...current, mod],
        }
      }
      return { ...prev, [groupId]: exists ? [] : [mod] }
    })
  }

  const validationError = useMemo(() => {
    for (const g of groups) {
      if (g.is_required && !(picked[g.id]?.length)) {
        return t("requiredGroup", { name: g.name })
      }
    }
    return null
  }, [groups, picked, t])

  const goModifiers = (unit: ProductUnit | null) => {
    setSelectedUnit(unit)
    if (groups.length > 0) {
      setStep("modifiers")
    } else {
      onConfirm(unit, [])
      onClose()
    }
  }

  const handleConfirm = () => {
    if (validationError) return
    const flat = Object.values(picked).flat()
    onConfirm(selectedUnit ?? null, flat)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background max-h-[90vh] w-full max-w-lg overflow-hidden rounded-xl border border-border shadow-md">
        <div className="flex items-center justify-between border-b px-5 py-4 border-border">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-2 dark:bg-blue-900/30">
              <SlidersHorizontal size={18} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">{product.name}</h3>
              <p className="text-xs text-muted-foreground">
                {step === "unit" ? tUnit("select") : t("selectModifiers")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasAllergens && (
              <button
                type="button"
                aria-label={tProduct("allergenIconAria")}
                onClick={() => handleAllergenOpenChange(true)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2"
              >
                <ShieldAlert size={16} strokeWidth={2.25} />
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover: dark:hover:">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {step === "unit" && hasUnits && (
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => goModifiers(null)}
                className="flex items-center justify-between rounded-lg border-2 p-4 hover:border-blue-500 border-border"
              >
                <span className="font-bold">{tUnit("standard")}</span>
                <span className="font-mono font-bold">
                  {canViewAmounts ? formatCurrency(unitPrice(product, null)) : AMOUNT_DISPLAY_MASK}
                </span>
              </button>
              {product.units!.map((unit) => (
                <button
                  key={unit.id || unit.name}
                  type="button"
                  onClick={() => goModifiers(unit)}
                  className="flex items-center justify-between rounded-lg border-2 p-4 hover:border-blue-500 border-border"
                >
                  <span className="font-bold">{unit.name}</span>
                  <span className="font-mono font-bold">
                    {canViewAmounts ? formatCurrency(unitPrice(product, unit)) : AMOUNT_DISPLAY_MASK}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === "modifiers" && (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.id}>
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    {group.name}
                    {group.is_required && (
                      <span className="ml-2 text-2xs uppercase text-amber-600">{t("required")}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.modifiers.map((mod) => {
                      const active = (picked[group.id] ?? []).some((m) => m.id === mod.id)
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => toggleModifier(group.id, mod, group.is_multiple)}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
 active
 ? "border-blue-600 bg-blue-600 text-white"
 : "border-border border-border bg-muted text-foreground"
 }`}
                        >
                          {mod.name}
                          {mod.price_adjustment > 0 && canViewAmounts && (
                            <span className="ml-1 text-xs opacity-80">+{formatCurrency(mod.price_adjustment)}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {validationError && (
                <p className="text-sm text-red-600">{validationError}</p>
              )}
            </div>
          )}
        </div>

        {step === "modifiers" && (
          <div className="flex items-center justify-between border-t px-5 py-4 border-border">
            <span className="text-sm font-bold text-blue-600">
              {canViewAmounts
                ? t("lineTotal", { total: formatCurrency(baseUnitPrice + modifierTotal) })
                : AMOUNT_DISPLAY_MASK}
            </span>
            <button
              type="button"
              disabled={Boolean(validationError)}
              onClick={handleConfirm}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t("addToCart")}
            </button>
          </div>
        )}
      </div>

      <Dialog open={showAllergens} onOpenChange={handleAllergenOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="text-amber-600" size={18} />
              {tProduct("allergenDialogTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="mb-2 text-sm font-semibold text-foreground">{product.name}</p>
          {(product.allergens?.length ?? 0) > 0 ? (
            <ul className="space-y-2">
              {product.allergens!.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/20"
                >
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {tProduct("allergenRisk", { score: a.risk_score })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{tProduct("allergenDialogEmpty")}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
