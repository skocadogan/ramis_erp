"use client"

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
import { StockCategory, StockItem } from "@/features/inventory/types"
import { useTranslations } from "next-intl"

interface DeleteConfirmationModalsProps {
  isDeleteDialogOpen: boolean
  setIsDeleteDialogOpen: (val: boolean) => void
  handleDeleteSupplier: () => void
  isMovementDeleteDialogOpen: boolean
  setIsMovementDeleteDialogOpen: (val: boolean) => void
  handleDeleteMovement: () => void
  isUnitDeleteDialogOpen: boolean
  setIsUnitDeleteDialogOpen: (val: boolean) => void
  handleDeleteUnit: () => void
  isCategoryDeleteDialogOpen: boolean
  setIsCategoryDeleteDialogOpen: (val: boolean) => void
  handleDeleteCategory: () => void
  categoryToDelete: StockCategory | null
  categories: StockCategory[]
  isStockItemDeleteDialogOpen: boolean
  setIsStockItemDeleteDialogOpen: (val: boolean) => void
  handleDeleteStockItem: () => void
  stockItemToDelete: StockItem | null
}

export function DeleteConfirmationModals({
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  handleDeleteSupplier,
  isMovementDeleteDialogOpen,
  setIsMovementDeleteDialogOpen,
  handleDeleteMovement,
  isUnitDeleteDialogOpen,
  setIsUnitDeleteDialogOpen,
  handleDeleteUnit,
  isCategoryDeleteDialogOpen,
  setIsCategoryDeleteDialogOpen,
  handleDeleteCategory,
  categoryToDelete,
  categories,
  isStockItemDeleteDialogOpen,
  setIsStockItemDeleteDialogOpen,
  handleDeleteStockItem,
  stockItemToDelete,
}: DeleteConfirmationModalsProps) {
  const t = useTranslations("inventory")
  return (
    <>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.supplierTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.supplierDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSupplier} className="bg-rose-600 hover:bg-rose-700 text-white">
              {t("delete.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isMovementDeleteDialogOpen} onOpenChange={setIsMovementDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.movementTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.movementDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMovement} className="bg-rose-600 hover:bg-rose-700 text-white">
              {t("delete.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isUnitDeleteDialogOpen} onOpenChange={setIsUnitDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.unitTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.unitDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUnit} className="bg-rose-600 hover:bg-rose-700 text-white">
              {t("delete.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isCategoryDeleteDialogOpen} onOpenChange={setIsCategoryDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.categoryTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.categoryDesc", { name: categoryToDelete?.name ?? "" })}
              {categories.some((c) => c.parent === categoryToDelete?.id) && (
                <span className="mt-2 block font-medium text-rose-600">
                  {t("delete.categoryChildrenWarn")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCategory} className="bg-rose-600 hover:bg-rose-700 text-white">
              {t("delete.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isStockItemDeleteDialogOpen} onOpenChange={setIsStockItemDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.stockItemTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {(stockItemToDelete?.recipe_usage_count ?? 0) > 0 ? (
                <>
                  {t("delete.stockItemRecipeDesc", {
                    name: stockItemToDelete?.name ?? "",
                    count: stockItemToDelete?.recipe_usage_count ?? 0,
                  })}
                  <span className="mt-2 block font-medium text-rose-600">
                    {t("delete.stockItemRecipeWarn")}
                  </span>
                </>
              ) : (
                t("delete.stockItemDesc", { name: stockItemToDelete?.name ?? "" })
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStockItem} className="bg-rose-600 hover:bg-rose-700 text-white">
              {t("delete.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
