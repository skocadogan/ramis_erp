"use client";

import { memo, useCallback, useState } from "react";
import { Utensils, Plus, ShieldAlert, Check, Sparkles } from "lucide-react";
import { Product } from "@/types/pos";
import { AppImage } from "@/components/AppImage";
import { useTranslations } from "next-intl";
import { formatAmount } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { usePosStore } from "@/store/usePosStore";
import { buildDisplayAllergenModalPayload } from "@/features/pos/utils/displayAllergenModal";
import { productHasRecommendations } from "@/features/pos/utils/displayRecommendedModal";
import { formatProductCalories } from "@/features/pos/utils/formatProductCalories";
import { RecommendedProductsDialog } from "@/features/pos/components/RecommendedProductsDialog";

export type PosStockTrackingMode = "PRODUCT" | "INGREDIENT";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  /** POS store stok takip modu — kart başına store aboneliği olmaması için üstten verilir */
  stockTrackingMode: PosStockTrackingMode;
  /** Masada açık siparişte bu ürünün toplam adedi (garson menüsü) */
  orderedQty?: number;
  layout?: "pos" | "waiter";
}

function isProductPosInactive(product: Product): boolean {
  return product.is_active === false;
}

export const ProductCard = memo(function ProductCard({
  product,
  onAddToCart,
  stockTrackingMode,
  orderedQty = 0,
  layout = "pos",
}: ProductCardProps) {
  const t = useTranslations("pos.product");
  const canViewAmounts = useCanViewAmounts();
  const setDisplayAllergenModal = usePosStore((s) => s.setDisplayAllergenModal);

  let isSoldOut = false;
  let isLimited = false;
  if (stockTrackingMode === "INGREDIENT") {
    isSoldOut = !!product.is_reserved_out;
  } else {
    isSoldOut = product.availability_mode === "SOLD_OUT";
    isLimited = product.availability_mode === "LIMITED";
  }

  const isBlockMode = product.pos_block_mode === "BLOCK";
  const isWarnMode = product.pos_block_mode === "WARN";

  const disabled = isProductPosInactive(product) || (isSoldOut && isBlockMode);

  const showOrdered = orderedQty > 0;
  const [showInfo, setShowInfo] = useState(false);
  const [showAllergens, setShowAllergens] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [isAdded, setIsAdded] = useState(false);
  const hasAllergens = !!product.is_allergenic && (product.allergens?.length ?? 0) > 0;
  const hasRecommendations = productHasRecommendations(product);
  const caloriesLabel = formatProductCalories(product.calories, t);

  const handleAllergenOpenChange = useCallback(
    (open: boolean) => {
      setShowAllergens(open);
      if (layout === "pos") {
        setDisplayAllergenModal(open ? buildDisplayAllergenModalPayload(product) : null);
      }
    },
    [layout, product, setDisplayAllergenModal]
  );

  const handleAddClick = () => {
    if (disabled) {
      if (stockTrackingMode === "INGREDIENT" && product.is_reserved_out) {
        toast.error(t("stockError", { name: product.name }));
      } else if (stockTrackingMode === "PRODUCT" && isSoldOut) {
        toast.error(t("limitError", { name: product.name }));
      }
      return;
    }

    if (isSoldOut && isWarnMode) {
      const msg =
        stockTrackingMode === "INGREDIENT"
          ? t("ingredientWarn", { name: product.name })
          : t("soldOutWarn", { name: product.name });
      toast.warning(msg);
    } else if (
      stockTrackingMode === "PRODUCT" &&
      isLimited &&
      isWarnMode &&
      (product.remaining_portions ?? 0) <= 0
    ) {
      toast.warning(t("quotaWarn", { name: product.name }));
    }
    onAddToCart(product);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 400);
  };

  return (
    <>
      <div
        className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors
 ${
 disabled
 ? "border-border opacity-55 grayscale-[0.35] dark:border-slate-700"
 : "border-border hover:border-blue-400 dark:border-slate-700 dark:hover:border-blue-500"
 }`}
      >
        {hasAllergens && (
          <button
            type="button"
            aria-label={t("allergenIconAria")}
            onClick={(e) => {
              e.stopPropagation();
              handleAllergenOpenChange(true);
            }}
            className="absolute right-2 top-[3.75rem] z-30 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white shadow-md ring-2 ring-background sm:top-[5.75rem]"
          >
            <ShieldAlert size={14} strokeWidth={2.25} />
          </button>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={handleAddClick}
          title={disabled ? t("disabledError") : undefined}
          className={`flex w-full flex-col text-left ${
 disabled ? "cursor-not-allowed" : "cursor-pointer"
 }`}
        >
        <div
          className="relative flex h-24 w-full items-center justify-center bg-muted/30 sm:h-32"
          onClick={(e) => {
            if (layout === "waiter") {
              e.preventDefault();
              e.stopPropagation();
              if (product.description) {
                setShowInfo(true);
              }
            }
          }}
        >
          {showOrdered && (
            <span
              className="absolute left-2 top-2 z-20 flex min-h-7 min-w-7 items-center justify-center rounded-lg bg-rose-600 px-1.5 text-xs font-bold text-white shadow-md ring-2 ring-background"
              title={t("orderedQty")}
            >
              {orderedQty}
            </span>
          )}

          {isSoldOut && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 motion-reduce:bg-black/55 supports-[backdrop-filter]:backdrop-blur-[1px] motion-reduce:backdrop-blur-none">
              <span
                className={`text-white text-2xs font-bold px-2 py-1 rounded shadow-lg uppercase tracking-tighter rotate-[-5deg] ${
 stockTrackingMode === "INGREDIENT" ? "bg-amber-600" : "bg-red-600"
 }`}
              >
                {stockTrackingMode === "INGREDIENT" ? t("soldOutIngredient") : t("soldOut86")}
              </span>
            </div>
          )}

          {stockTrackingMode === "PRODUCT" && isLimited && !isSoldOut && (
            <div className="absolute right-2 top-2 z-20">
              <span className="bg-amber-500 text-white text-2xs font-bold px-1.5 py-1 rounded shadow-md flex items-center gap-1 border border-white/20">
                <Plus size={10} strokeWidth={4} />
                {product.remaining_portions?.toFixed(0) ?? "0"}
              </span>
            </div>
          )}

          {product.image ? (
            <AppImage
              src={product.image}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 200px"
            />
          ) : (
            <Utensils size={26} className="transition-colors group-hover:text-blue-200" />
          )}
        </div>
        <div className="z-10 w-full bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="line-clamp-2 min-h-[2.5rem] text-left text-sm font-bold leading-snug text-foreground sm:line-clamp-1 sm:min-h-0 sm:text-base">
                {product.name}
              </h4>
              {caloriesLabel && (
                <p className="mt-0.5 text-right font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {caloriesLabel}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {product.is_combined && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-primary shadow-sm border border-primary/20">
                  {t("combined")}
                </span>
              )}
              {disabled && !isSoldOut && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("closed")}
                </span>
              )}
            </div>
          </div>
          {layout === "pos" && product.description && (
            <p className="mt-1 line-clamp-2 text-left text-xs leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-col">
              {product.has_discount && product.discounted_price ? (
                <>
                  <span className="font-mono text-xs line-through text-muted-foreground dark:text-muted-foreground">
                    {formatAmount(product.base_price, canViewAmounts)}
                  </span>
                  <span className={`font-bold text-sm ${disabled ? "text-muted-foreground" : "text-amber-600"}`}>
                    {formatAmount(product.discounted_price ?? 0, canViewAmounts)}
                  </span>
                  <span className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1 py-0.5 rounded font-semibold">
                    %{product.discount_rate?.toFixed(0) ?? "0"}
                  </span>
                </>
              ) : (
                <span className={`sm:text-lg font-bold font-mono ${disabled ? "text-muted-foreground" : "text-primary"}`}>
                  {formatAmount(product.base_price, canViewAmounts)}
                </span>
              )}
            </div>
            {!disabled && (
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 sm:h-10 sm:w-10 ${
 isAdded
 ? "bg-green-500 text-white scale-110 sm:opacity-100"
 : "bg-blue-100 text-blue-700 group-hover:bg-blue-600 group-hover:text-white dark:bg-blue-950/60 dark:text-blue-300 dark:group-hover:bg-blue-600 dark:group-hover:text-white opacity-80 sm:opacity-80"
 }`}>
                {isAdded
                  ? <Check size={22} strokeWidth={2.75} className="sm:size-[20px]" aria-hidden />
                  : <Plus size={24} strokeWidth={2.75} className="sm:size-[22px]" aria-hidden />
                }
              </div>
            )}
          </div>
        </div>
        </button>

        {hasRecommendations && (
          <button
            type="button"
            aria-label={t("recommendedIconAria")}
            onClick={() => setShowRecommendations(true)}
            className="mx-3 mb-3 flex h-10 w-[calc(100%-1.5rem)] items-center justify-center gap-2 rounded-xl border border-violet-300/80 bg-violet-50 text-violet-800 transition-colors hover:bg-violet-100 sm:h-11 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-100 dark:hover:bg-violet-950/70"
          >
            <Sparkles size={16} strokeWidth={2.25} className="shrink-0 sm:size-[18px]" />
            <span className="text-xs font-bold uppercase tracking-wide sm:text-sm">{t("recommendedBadge")}</span>
          </button>
        )}
      </div>

      <RecommendedProductsDialog
        sourceProduct={product}
        open={showRecommendations}
        onOpenChange={setShowRecommendations}
        layout={layout}
      />

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{product.name}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAllergens} onOpenChange={handleAllergenOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="text-amber-500" size={18} />
              {t("allergenDialogTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm font-semibold text-foreground mb-2">{product.name}</p>
          {(product.allergens?.length ?? 0) > 0 ? (
            <ul className="space-y-2">
              {product.allergens!.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/20"
                >
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {t("allergenRisk", { score: a.risk_score })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("allergenDialogEmpty")}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});
