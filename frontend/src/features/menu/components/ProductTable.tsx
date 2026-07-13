"use client"

import { useMemo } from "react"
import { Search, Plus, TrendingUp, Tag, GripVertical, Utensils, StarIcon, Building2, Flame, ChefHat } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Product, MenuTag, MenuCatalogSettings } from "@/features/menu/types"
import type { Branch } from "@/types/user.types"
import { ProductActionsMenu } from "./ProductActionsMenu"
import { ActiveTagFilterSelect } from "./ActiveTagFilterSelect"
import { formatTagsForBranch } from "@/features/menu/lib/menuTagFilter"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppImage } from "@/components/AppImage"
import { AMOUNT_DISPLAY_MASK, formatCurrency } from "@/lib/formatters"
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts"

import { cn } from "@/lib/utils"

interface Props {
  products: Product[]
  searchTerm: string
  canManage: boolean
  onSearchChange: (v: string) => void
  onAdd: () => void
  onEdit: (p: Product) => void
  onDelete: (p: Product) => void
  onToggleActive: (p: Product) => void
  onTogglePos: (p: Product) => void
  onToggleFeatured: (p: Product) => void
  onTogglePopular: (p: Product) => void
  onToggleChefRecommendation: (p: Product) => void
  onBulkPrice: () => void
  onDiscount: () => void
  onReorder?: (order_ids: string[]) => void
  onCopy?: (p: Product) => void
  onRemoveDiscount?: (p: Product) => void
  isCombinedTab?: boolean
  menuTags?: MenuTag[]
  catalogSettings?: MenuCatalogSettings | null
  onTagFilterSelect?: (value: string) => void
  showAllProducts?: boolean
  onShowAllChange?: (v: boolean) => void
  tagFilterActive?: boolean
  getEffectiveMenuActive?: (p: Product) => boolean
  branches?: Branch[]
  selectedBranchId?: string | null
  onBranchChange?: (branchId: string) => void
}


export default function ProductTable({
  products, searchTerm, canManage,
  onSearchChange, onAdd, onEdit, onDelete, onCopy, onToggleActive, onTogglePos, onToggleFeatured, onTogglePopular, onToggleChefRecommendation, onBulkPrice, onDiscount, onReorder,
  onRemoveDiscount,
  isCombinedTab = false,
  menuTags = [],
  catalogSettings = null,
  onTagFilterSelect,
  showAllProducts = false,
  onShowAllChange,
  tagFilterActive = false,
  getEffectiveMenuActive,
  branches = [],
  selectedBranchId = null,
  onBranchChange,
}: Props) {
  const t = useTranslations("menu_management")
  const emptyColSpan = useMemo(
    () => (canManage ? 1 : 0) + 3 + (isCombinedTab ? 1 : 0) + 2 + (canManage ? 1 : 0),
    [canManage, isCombinedTab]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (onReorder && over && active.id !== over.id) {
      const oldIndex = products.findIndex(p => p.id === active.id);
      const newIndex = products.findIndex(p => p.id === over.id);
      const newItems = arrayMove(products, oldIndex, newIndex);
      onReorder(newItems.map(p => p.id));
    }
  }

  const displayProducts = products.filter(p => !!p.is_combined === isCombinedTab);

  return (
    <div className="flex-1 flex flex-col gap-3 overflow-hidden no-scrollbar">
      <div className="flex items-center justify-between shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("productTable.searchPlaceholder")}
              value={searchTerm}
              onChange={e => onSearchChange(e.target.value)}
              className="pl-8 pr-4 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-input text-foreground w-56"
            />
          </div>
          {tagFilterActive && onShowAllChange && (
            <label className="flex items-center gap-2 shrink-0 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={showAllProducts}
                onClick={() => onShowAllChange(!showAllProducts)}
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring/40",
                  showAllProducts ? "bg-blue-600" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
                    showAllProducts ? "translate-x-4" : "translate-x-0",
                  )}
                />
              </button>
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                {t("productTable.showAll")}
              </span>
            </label>
          )}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            {branches.length > 1 && onBranchChange && selectedBranchId && (
              <Select value={selectedBranchId} onValueChange={(v) => { if (v) onBranchChange(v) }}>
                <SelectTrigger size="sm" className="h-8 min-w-[8rem]">
                  <Building2 size={13} className="text-muted-foreground" />
                  <SelectValue placeholder={t("tagFilter.branch")} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {onTagFilterSelect && (menuTags.length > 0 || catalogSettings?.has_tags) && selectedBranchId && (
              <ActiveTagFilterSelect
                tags={menuTags}
                catalogSettings={catalogSettings}
                onSelect={onTagFilterSelect}
              />
            )}
            <button type="button" onClick={onDiscount}
              className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-all dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300">
              <Tag size={15} />{t("productTable.discount")}
            </button>
            <button type="button" onClick={onBulkPrice}
              className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-1.5 text-sm font-medium hover: transition-all bg-muted border-input text-muted-foreground dark:hover:">
              <TrendingUp size={15} />{t("productTable.bulkPrice")}
            </button>
            <button type="button" onClick={onAdd}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-all">
              <Plus size={15} />{t("productTable.newProduct")}
            </button>
          </div>
        )}

      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-border bg-card border-border no-scrollbar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={products.map(p => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <table className="w-full text-sm">
              <thead className="border-b border-border sticky top-0 bg-muted border-border z-10">
                <tr>
                  {canManage && <th className="w-8"></th>}
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("productTable.columns.product")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("productTable.columns.branch")}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("productTable.columns.category")}</th>
                  {isCombinedTab && <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("productTable.columns.contents")}</th>}
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("productTable.columns.price")}</th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider dark:text-muted-foreground">{t("productTable.columns.status")}</th>
                  {canManage && <th className="w-12 px-4 py-2.5"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayProducts.length === 0 ? (
                  <tr>
                    <td colSpan={emptyColSpan} className="text-center py-12 text-sm text-muted-foreground">
                      {t("productTable.empty")}
                    </td>
                  </tr>
                ) : (
                  displayProducts.map(product => (
                    <SortableProductRow
                      key={product.id}
                      product={product}
                      canManage={canManage}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onCopy={onCopy}
                      onRemoveDiscount={onRemoveDiscount}
                      onToggleActive={onToggleActive}
                      onTogglePos={onTogglePos}
                      onToggleFeatured={onToggleFeatured}
                      onTogglePopular={onTogglePopular}
                      onToggleChefRecommendation={onToggleChefRecommendation}
                      isCombinedRow={isCombinedTab}
                      menuActive={getEffectiveMenuActive ? getEffectiveMenuActive(product) : product.is_active}
                      branchTagLabel={formatTagsForBranch(product.tags, selectedBranchId)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

interface RowProps {
  product: Product
  canManage: boolean
  onEdit: (p: Product) => void
  onDelete: (p: Product) => void
  onCopy?: (p: Product) => void
  onRemoveDiscount?: (p: Product) => void
  onToggleActive: (product: Product) => void
  onTogglePos: (product: Product) => void
  onToggleFeatured: (product: Product) => void
  onTogglePopular: (product: Product) => void
  onToggleChefRecommendation: (product: Product) => void
  isCombinedRow?: boolean
  menuActive?: boolean
  branchTagLabel?: string
}

function SortableProductRow({ product, canManage, onEdit, onDelete, onCopy, onRemoveDiscount, onToggleActive, onTogglePos, onToggleFeatured, onTogglePopular, onToggleChefRecommendation, isCombinedRow, menuActive, branchTagLabel }: RowProps) {
  const t = useTranslations("menu_management")
  const canViewAmounts = useCanViewAmounts()
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.6 : 1,
    backgroundColor: isDragging ? 'rgba(241, 245, 249, 0.5)' : undefined,
  };

  return (
    <tr ref={setNodeRef} style={style} className="group hover:/50 dark:hover:/50">
      {canManage && (
        <td className="pl-2 w-8">
          <button {...attributes} {...listeners} className="p-1 hover:text-muted-foreground cursor-grab active:cursor-grabbing">
            <GripVertical size={14} />
          </button>
        </td>
      )}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14 flex-shrink-0 rounded-md border overflow-hidden flex items-center justify-center border-border bg-muted shadow-sm">
            {product.image ? (
              <AppImage src={product.image} alt="" fill className="object-cover" sizes="56px" />
            ) : (
              <Utensils size={20} className="" />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground truncate">{product.name}</span>
              {product.is_featured && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs bg-amber-50 text-amber-600 border border-amber-100 font-bold dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400">
                  <StarIcon size={14} className="text-amber-500 fill-amber-500" />
                  {t("productTable.featured")}
                </span>
              )}
              {product.is_popular && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs bg-orange-50 text-orange-600 border border-orange-100 font-bold dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-400">
                  <Flame size={14} className="text-orange-500" />
                  {t("productTable.popular")}
                </span>
              )}
              {product.is_chef_recommendation && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs bg-violet-50 text-violet-600 border border-violet-100 font-bold dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-400">
                  <ChefHat size={14} className="text-violet-500" />
                  {t("productTable.chefRecommendation")}
                </span>
              )}
            </div>
            {product.description && (
              <p className="text-xs text-muted-foreground mt-0.5 whitespace-normal break-words max-w-[300px] lg:max-w-[500px]">{product.description}</p>
            )}
            {(branchTagLabel || (product.tags?.length ?? 0) > 0) && (
              <p className="text-2xs text-violet-600 dark:text-violet-400 mt-0.5 font-medium">
                {branchTagLabel || product.tags!.map((tag) => tag.name).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 max-w-[150px]">
          {product.branch_names && product.branch_names.length > 0 ? (
            product.branch_names.map((name, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-blue-50 text-blue-600 border border-blue-100 font-bold dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400">
                <Building2 size={10} />
                {name.toUpperCase()}
              </span>
            ))
          ) : (
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 italic">
              <Utensils size={12} className="text-muted-foreground" />
              {product.branch_name || t("productTable.allBranches")}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-accent text-muted-foreground whitespace-nowrap">
          <Tag size={10} />{product.category_name}
        </span>
      </td>
      {isCombinedRow && (
        <td className="px-4 py-3">
          <div className="flex flex-col gap-0.5 max-w-[200px]">
            {product.combined_items?.map((item, idx) => (
              <span key={idx} className="text-sub text-muted-foreground truncate">
                {item.quantity}x {item.product_name || '...'}
                {item.product_unit_name ? (
                  <span className="text-muted-foreground"> ({item.product_unit_name})</span>
                ) : null}
              </span>
            ))}
            {(!product.combined_items || product.combined_items.length === 0) && (
              <span className="text-sub text-muted-foreground italic">{t("productTable.emptyPackage")}</span>
            )}
          </div>
        </td>
      )}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {product.has_discount && product.discounted_price ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm line-through text-muted-foreground font-mono">
              {canViewAmounts ? formatCurrency(product.base_price) : AMOUNT_DISPLAY_MASK}
            </span>
            <span className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">
              {canViewAmounts ? formatCurrency(product.discounted_price) : AMOUNT_DISPLAY_MASK}
            </span>
            <span className="text-2xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold">
              {t("productTable.discountBadge", { pct: (product.discount_rate || 0).toFixed(0) })}
            </span>
          </div>
        ) : (
          <span className="font-semibold text-foreground">
            {canViewAmounts ? formatCurrency(product.base_price) : AMOUNT_DISPLAY_MASK}
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          {menuActive ? (
            <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              {t("productTable.menuActive")}
            </span>
          ) : (
            <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-medium text-muted-foreground bg-accent dark:text-muted-foreground">
              {t("productTable.menuInactive")}
            </span>
          )}
          {product.show_on_pos === false && (
            <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              {t("productTable.posHidden")}
            </span>
          )}
        </div>
      </td>
      {canManage && (
        <td className="px-4 py-3">
          <ProductActionsMenu
            product={product}
            canManage={canManage}
            onEdit={onEdit}
            onDelete={onDelete}
            onCopy={onCopy}
            onRemoveDiscount={onRemoveDiscount}
            onToggleActive={onToggleActive}
            onTogglePos={onTogglePos}
            onToggleFeatured={onToggleFeatured}
            onTogglePopular={onTogglePopular}
            onToggleChefRecommendation={onToggleChefRecommendation}
            align="right"
          />
        </td>
      )}
    </tr>
  );
}
