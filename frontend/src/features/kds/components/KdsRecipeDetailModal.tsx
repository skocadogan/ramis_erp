"use client";

import {
  ChefHat,
  Clock,
  Users
} from "lucide-react";
import { useTranslations } from "next-intl";
import { formatQuantity } from "@/lib/formatters";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Recipe } from "@/features/recipes/types";

interface KdsRecipeDetailModalProps {
  recipe: Recipe | null;
  onClose: () => void;
}

export function KdsRecipeDetailModal({ recipe, onClose }: KdsRecipeDetailModalProps) {
  const t = useTranslations("kds");
  if (!recipe) return null;

  return (
    <Dialog open={!!recipe} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[1200px] lg:max-w-[1400px] w-full h-[90vh] bg-background border-border text-foreground overflow-hidden flex flex-col p-0 shadow-lg">
        <DialogHeader className="p-10 pb-6 shrink-0 border-b border-border/50 bg-muted/10">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold text-foreground uppercase tracking-tight flex items-center gap-2">
                <ChefHat className="text-blue-500 shrink-0" size={24} />
                {recipe.name}
              </DialogTitle>
              <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest">
                {recipe.product_name || t('recipeDetail.defaultTitle')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 py-4">
            {recipe.prep_time_minutes > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs text-muted-foreground">
                <Clock size={14} className="text-blue-400" />
                <span className="font-bold">{t('recipeDetail.prepTime')}</span> {recipe.prep_time_minutes} {t('status.late_min_abbr') || 'dk'}
              </div>
            )}
            {recipe.cook_time_minutes > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs text-muted-foreground">
                <Clock size={14} className="text-orange-400" />
                <span className="font-bold">{t('recipeDetail.cookTime')}</span> {recipe.cook_time_minutes} {t('status.late_min_abbr') || 'dk'}
              </div>
            )}
            {recipe.servings > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted border border-border text-xs text-muted-foreground">
                <Users size={14} className="text-emerald-400" />
                <span className="font-bold">{t('recipeDetail.servings')}</span> {recipe.servings}
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50 overflow-hidden">
          {/* Sol Sütun: Malzemeler */}
          <div className="flex flex-col min-h-0">
            <div className="px-8 py-4 bg-muted/40 border-b border-border/50">
              <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500">
                {t('recipeDetail.ingredients')}
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-2.5 custom-scrollbar bg-background/50">
              {recipe.ingredients?.length > 0 ? (
                recipe.ingredients.map((ing) => (
                  <div key={ing.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/40 border border-border/30 hover:bg-muted/60 transition-colors group">
                    <span className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors">{ing.stock_item_name}</span>
                    <span className="text-sm font-bold tabular-nums bg-muted px-3 py-1.5 rounded-lg border border-border text-foreground">
                      {formatQuantity(ing.quantity)} {ing.unit}
                    </span>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/60 italic text-xs">
                  {t('recipeDetail.noIngredients')}
                </div>
              )}
            </div>
          </div>

          {/* Sağ Sütun: Hazırlanış */}
          <div className="flex flex-col min-h-0 /10">
            <div className="px-8 py-4 bg-muted/40 border-b border-border/50">
              <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">
                {t('recipeDetail.instructions')}
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              <div className="space-y-8">
                {recipe.description && (
                  <div className="space-y-3">
                    <h5 className="text-2xs font-bold uppercase tracking-[0.3em] text-muted-foreground/60">{t('recipeDetail.description')}</h5>
                    <div className="text-lg italic text-foreground leading-relaxed whitespace-pre-wrap font-medium">
                      {recipe.description}
                    </div>
                  </div>
                )}
                
                {recipe.instructions && (
                  <div className="space-y-3">
                    <h5 className="text-2xs font-bold uppercase tracking-[0.3em] text-muted-foreground/60">{t('recipeDetail.steps')}</h5>
                    <div className="text-base text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {recipe.instructions}
                    </div>
                  </div>
                )}

                {!recipe.description && !recipe.instructions && (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground/60 italic text-xs py-10">
                    {t('recipeDetail.noInstructions')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-background flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
          >
            {t('inventory.close')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
