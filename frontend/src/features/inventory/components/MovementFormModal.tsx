"use client"

import { Plus, Loader2, Info } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { NumberInput } from "@/components/ui/number-input"
import { StockUnit, Supplier } from "@/features/inventory/types"
import StockItemSelect from "./StockItemSelect"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

interface MovementFormModalProps {
  showMovementForm: boolean
  setShowMovementForm: (show: boolean) => void
  movementData: { stock_item_id: string; warehouse_id: string; movement_type: string; quantity: string; unit: string; reference: string; notes: string; supplier_id: string; unit_price: string }
  setMovementData: (data: { stock_item_id: string; warehouse_id: string; movement_type: string; quantity: string; unit: string; reference: string; notes: string; supplier_id: string; unit_price: string }) => void
  isSubmitting: boolean
  handleMovementSubmit: () => void
  suppliers: Supplier[]
  stockUnits: StockUnit[]
  warehouses?: { id: string; name: string }[]
}

const input =
  "w-full mt-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"

function isIntegerUnit(unit: string, stockUnits: StockUnit[]): boolean {
  if (!unit) return false
  const found = stockUnits.find(
    (u) => u.short_name === unit || u.name === unit
  )
  if (!found) return false
  return found.multiplier !== 1
}

export function MovementFormModal({
  showMovementForm,
  setShowMovementForm,
  movementData,
  setMovementData,
  isSubmitting,
  handleMovementSubmit,
  suppliers,
  stockUnits,
  warehouses,
}: MovementFormModalProps) {
  const t = useTranslations("inventory.movementForm")

  const mt = movementData.movement_type
  const allowDecimal = !isIntegerUnit(movementData.unit, stockUnits)
  const title =
    mt === "IN"
      ? t("titleIn")
      : mt === "OUT"
        ? t("titleOut")
        : mt === "ADJUSTMENT"
          ? t("titleAdj")
          : mt === "WASTE"
            ? t("titleWaste")
            : t("titleFallback")
  const subtitle =
    mt === "IN"
      ? t("subIn")
      : mt === "OUT"
        ? t("subOut")
        : mt === "ADJUSTMENT"
          ? t("subAdj")
          : mt === "WASTE"
            ? t("subWaste")
            : t("subtitleFallback")

  return (
    <TooltipProvider delay={300}>
      <Dialog open={showMovementForm} onOpenChange={setShowMovementForm}>
        <DialogContent layout="scroll" size="4xl" className="max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div>
              <Label>{t("selectProduct")}</Label>
              <StockItemSelect
                value={movementData.stock_item_id}
                onSelect={(item) =>
                  setMovementData({
                    ...movementData,
                    stock_item_id: item.id,
                    unit: item.unit,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {warehouses && warehouses.length > 0 && (
                <div className="min-w-0">
                  <Label>
                    {t("warehouse")}
                    {movementData.movement_type === "ADJUSTMENT" ? " *" : ""}
                  </Label>
                  <select
                    value={movementData.warehouse_id}
                    onChange={(e) => setMovementData({ ...movementData, warehouse_id: e.target.value })}
                    className={input}
                    required={movementData.movement_type === "ADJUSTMENT"}
                  >
                    {movementData.movement_type !== "ADJUSTMENT" && (
                      <option value="">{t("defaultWarehouse")}</option>
                    )}
                    {movementData.movement_type === "ADJUSTMENT" && !movementData.warehouse_id && (
                      <option value="">{t("selectWarehouseRequired")}</option>
                    )}
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={warehouses && warehouses.length > 0 ? "min-w-0" : "min-w-0 sm:col-span-2"}>
                <div className="flex items-center gap-1">
                  <Label>{t("movementType")}</Label>
                  <HelpTooltip text={t("typeHelp")} />
                </div>
                <select
                  value={movementData.movement_type}
                  onChange={(e) => setMovementData({ ...movementData, movement_type: e.target.value })}
                  className={input}
                >
                  <option value="IN">{t("optIn")}</option>
                  <option value="OUT">{t("optOut")}</option>
                  <option value="ADJUSTMENT">{t("optAdj")}</option>
                  <option value="WASTE">{t("optWaste")}</option>
                </select>
              </div>
            </div>
            <div>
              <Label>{t("supplierOpt")}</Label>
              <select
                value={movementData.supplier_id}
                onChange={(e) => setMovementData({ ...movementData, supplier_id: e.target.value })}
                className={input}
              >
                <option value="">{t("selectPlaceholder")}</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center gap-1">
                  <Label>{movementData.movement_type === "ADJUSTMENT" ? t("newQty") : t("qty")}</Label>
                  {movementData.movement_type === "ADJUSTMENT" && <HelpTooltip text={t("targetQtyHelp")} />}
                </div>
                <NumberInput
                  step={allowDecimal ? "0.001" : "1"}
                  value={movementData.quantity}
                  onChange={(val) => {
                    const cleaned = val.replace(",", ".")
                    setMovementData({
                      ...movementData,
                      quantity: allowDecimal
                        ? cleaned
                        : Math.floor(Number(cleaned)).toString(),
                    })
                  }}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>{t("unitLabel")}</Label>
                <select value={movementData.unit} onChange={(e) => setMovementData({ ...movementData, unit: e.target.value })} className={input}>
                  <option value="">{t("selectPlaceholder")}</option>
                  {stockUnits.map((u) => (
                    <option key={u.id} value={u.short_name}>
                      {u.name} ({u.short_name})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {(movementData.movement_type === "IN" || movementData.movement_type === "WASTE" || movementData.movement_type === "OUT") && (
              <div>
                <div className="flex items-center gap-1">
                  <Label>{t("unitPrice")}</Label>
                  <HelpTooltip text={
                    movementData.movement_type === "IN"
                      ? t("unitPriceHelp")
                      : t("unitPriceWasteHelp")
                  } />
                </div>
                <NumberInput
                  step="0.01"
                  value={movementData.unit_price || "0"}
                  onChange={(val) => setMovementData({ ...movementData, unit_price: val })}
                  placeholder="0.00"
                  suffix=""
                />
              </div>
            )}
            <div>
              <Label>{t("reference")}</Label>
              <input
                value={movementData.reference}
                onChange={(e) => setMovementData({ ...movementData, reference: e.target.value })}
                className={input}
                placeholder={movementData.movement_type === "WASTE" ? t("referenceWastePh") : t("referencePh")}
              />
            </div>
            <div>
              <Label>{t("notes")}</Label>
              <textarea value={movementData.notes} onChange={(e) => setMovementData({ ...movementData, notes: e.target.value })} className={input} rows={2} />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowMovementForm(false)} disabled={isSubmitting}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleMovementSubmit}
              disabled={
                isSubmitting
                || !movementData.stock_item_id
                || !movementData.quantity
                || !movementData.unit
                || (movementData.movement_type === "ADJUSTMENT" && !movementData.warehouse_id)
              }
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}
              {t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}

function HelpTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger>
        <Info size={12} className="text-muted-foreground hover:text-blue-500 cursor-help transition-colors" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
