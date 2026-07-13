"use client";

import { memo, useState } from "react";
import { MessageSquarePlus, Minus, Plus } from "lucide-react";
import { CartItem } from "@/types/pos";
import { AMOUNT_DISPLAY_MASK, formatAmount, formatCurrency } from "@/lib/formatters";
import { useCanViewAmounts } from "@/hooks/useCanViewAmounts";
import { toast } from "sonner";
import { usePosStore } from "@/store/usePosStore";
import { useTranslations } from "next-intl";
import { CartItemNoteModal } from "@/features/pos/components/CartItemNoteModal";
import { cn } from "@/lib/utils";

interface CartItemNodeProps {
  item: CartItem;
  onUpdateQuantity: (cartId: string, delta: number) => void;
}

export const CartItemNode = memo(function CartItemNode({ item, onUpdateQuantity }: CartItemNodeProps) {
  const t = useTranslations("pos.cartItem");
  const canViewAmounts = useCanViewAmounts();
  const stockTrackingMode = usePosStore((s) => s.stockTrackingMode);
  const updateCartItemNotes = usePosStore((s) => s.updateCartItemNotes);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const { product, quantity, selectedUnit, unitPrice, notes, selectedModifiers } = item;
  const hasNotes = Boolean(notes?.trim());
  const modifierSum = (selectedModifiers ?? []).reduce((s, m) => s + m.price_adjustment, 0);
  const effectivePrice = (unitPrice ?? (
    product.has_discount && product.discounted_price
      ? product.discounted_price
      : product.base_price
  )) + modifierSum;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-slate-50 p-3 border-border bg-muted/50">
      <div className="flex items-start justify-between">
        <div className="flex w-3/4 flex-col">
          <span className="text-lg font-bold text-slate-800 text-foreground">{product.name}</span>
          {selectedUnit && (
            <span className="text-xs font-bold text-blue-600 uppercase tracking-tighter">
              {selectedUnit.name} 
            </span>
          )}
          {(selectedModifiers ?? []).map((m) => (
            <span key={m.id} className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              + {m.name}
              {m.price_adjustment ? (
                <span className="ml-1 text-xs font-mono text-emerald-900/80 dark:text-emerald-400/70">
                  ({canViewAmounts ? `+${formatCurrency(m.price_adjustment)}` : AMOUNT_DISPLAY_MASK})
                </span>
              ) : null}
            </span>
          ))}
        </div>
        <span className="font-medium text-slate-900 text-foreground text-lg font-mono">
          {formatAmount((effectivePrice * quantity), canViewAmounts)}
        </span>
      </div>
      {product.is_combined && product.combined_items && product.combined_items.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-[-2px] mb-1">
          {product.combined_items.map((ci, idx) => {
            const q = typeof ci.quantity === "number" ? ci.quantity : 0;
            const label =
              typeof ci.product_name === "string"
                ? ci.product_name
                : (typeof ci.product?.name === "string" ? ci.product.name : "");
            const subKey =
              typeof ci.product === "object" && ci.product && "id" in ci.product && ci.product.id
                ? String(ci.product.id)
                : `${label}-${idx}`;
            const unitLabel =
              typeof ci.product_unit_name === "string" && ci.product_unit_name.trim()
                ? ` — ${ci.product_unit_name}`
                : "";
            return (
              <span key={subKey} className="text-xs font-medium text-muted-foreground">
                • {q}x {label}
                {unitLabel}
              </span>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between mt-1">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {selectedUnit ? (
            <span className="text-xs text-muted-foreground font-mono">
             {canViewAmounts ? t("pricePerUnit", { price: formatCurrency(effectivePrice) }) : AMOUNT_DISPLAY_MASK}
            </span>
          ) : product.has_discount && product.discounted_price ? (
            <>
              <span className="text-xs line-through text-muted-foreground font-mono">
                {canViewAmounts ? t("pricePerPiece", { price: formatCurrency(product.base_price) }) : AMOUNT_DISPLAY_MASK}
              </span>
              <span className="text-xs text-amber-600 font-semibold font-mono">
                {canViewAmounts ? t("pricePerPiece", { price: formatCurrency(effectivePrice) }) : AMOUNT_DISPLAY_MASK}
              </span>
            </>
          ) : (
            <span className="text-xs text-slate-900  text-foreground font-mono">
              {canViewAmounts ? t("pricePerPiece", { price: formatCurrency(product.base_price) }) : AMOUNT_DISPLAY_MASK}
            </span>
          )}
          <button
            type="button"
            onClick={() => setNoteModalOpen(true)}
            className={cn(
              "inline-flex w-fit max-w-full items-center gap-1 rounded-lg px-2 py-1 text-2xs font-semibold transition-colors touch-manipulation",
              hasNotes
                ? "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/60"
                : "text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
            )}
          >
            <MessageSquarePlus size={14} strokeWidth={2.25} aria-hidden />
            <span className="truncate">{hasNotes ? t("itemNoteEdit") : t("itemNoteAdd")}</span>
          </button>
          {hasNotes ? (
            <p className="line-clamp-2 text-2xs text-amber-800/90 dark:text-amber-200/80" title={notes}>
              {notes}
            </p>
          ) : null}
        </div>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-border border-border bg-card">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartId, -1)}
            className="flex h-11 min-w-[2.75rem] touch-manipulation items-center justify-center bg-slate-50 text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100 bg-muted/80 text-foreground dark:hover:bg-rose-950/40 dark:hover:text-rose-300 dark:active:bg-rose-950/60"
            title={t("decreaseQty")}
          >
            <Minus size={22} strokeWidth={2.75} aria-hidden />
          </button>
          <span className="flex min-w-[2.75rem] items-center justify-center border-x-2 border-border bg-slate-100/90 px-3 text-center text-base font-bold tabular-nums text-slate-900 border-input bg-muted text-foreground">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => {
              const isBlockMode = product.pos_block_mode === 'BLOCK';
              const isWarnMode = product.pos_block_mode === 'WARN';

              if (stockTrackingMode === 'INGREDIENT') {
                if (product.is_reserved_out) {
                  if (isBlockMode) {
                    toast.error(t("toastIngredientDepleted", { name: product.name }));
                    return;
                  } else if (isWarnMode) {
                    toast.warning(t("toastIngredientDepleted", { name: product.name }));
                  }
                }
              } else {
                const isLimited = product.availability_mode === 'LIMITED';
                const remaining = product.remaining_portions || 0;

                if (isLimited && quantity >= remaining) {
                  if (isBlockMode) {
                    toast.error(t("toastQuotaExceededBlock", { name: product.name, remaining: String(remaining) }));
                    return;
                  } else if (isWarnMode) {
                    toast.warning(t("toastQuotaExceededWarn", { name: product.name }));
                  }
                } else if (product.availability_mode === 'SOLD_OUT') {
                  if (isBlockMode) {
                    toast.error(t("toastSoldOut", { name: product.name }));
                    return;
                  } else if (isWarnMode) {
                    toast.warning(t("toastSoldOut", { name: product.name }));
                  }
                }
              }

              onUpdateQuantity(item.cartId, 1);
            }}
            className="flex h-11 min-w-[2.75rem] touch-manipulation items-center justify-center bg-blue-50 text-blue-700 transition-colors hover:bg-blue-600 hover:text-white active:bg-blue-700 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-600 dark:hover:text-white dark:active:bg-blue-700"
            title={t("increaseQty")}
          >
            <Plus size={22} strokeWidth={2.75} aria-hidden />
          </button>
        </div>
      </div>

      <CartItemNoteModal
        productName={product.name}
        initialNotes={notes ?? ""}
        open={noteModalOpen}
        onClose={() => setNoteModalOpen(false)}
        onSave={(value) => updateCartItemNotes(item.cartId, value)}
      />
    </div>
  );
});

