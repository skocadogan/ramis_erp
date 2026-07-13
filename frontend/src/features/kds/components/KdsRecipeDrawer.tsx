"use client";

import { useState } from "react";
import {
  ChefHat,
  Search,
  X,
  Clock,
  Users,
  UtensilsCrossed,
  ChevronRight,
  Loader2,
  BookOpen
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useRecipes } from "@/features/recipes/hooks/useRecipes";
import { RecipeCategorySelectTree } from "@/features/recipes/components/RecipeCategorySelectTree";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KdsRecipeDetailModal } from "./KdsRecipeDetailModal";
import type { Recipe } from "@/features/recipes/types";

interface KdsRecipeDrawerProps {
  collapsed?: boolean;
}

export function KdsRecipeDrawer({ collapsed = false }: KdsRecipeDrawerProps) {
  const t = useTranslations("kds");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const {
    recipes,
    recipeCategories,
    searchTerm,
    setSearchTerm,
    isLoading
  } = useRecipes();

  const filteredRecipes = recipes.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.product_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !activeCategoryId || r.category === activeCategoryId;
    return matchesSearch && matchesCategory;
  });

  const buttonContent = (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className={cn(
        "flex shrink-0 items-center rounded-xl transition-colors duration-200 text-blue-600 hover:bg-blue-500/10 dark:text-blue-400",
        collapsed ? "size-11 justify-center p-0" : "h-11 gap-2 px-3"
      )}
      title={t('recipes.title')}
    >
      <ChefHat size={28} className="shrink-0" />
      {!collapsed && (
        <span className="max-w-[10rem] truncate text-xs font-semibold sm:text-sm">{t('sidebar.recipes')}</span>
      )}
    </button>
  );

  return (
    <>
      {collapsed ? (
        <TooltipProvider delay={0}>
          <Tooltip>
            <TooltipTrigger render={buttonContent} />
            <TooltipContent side="top" sideOffset={8} className="bg-popover text-popover-foreground border-border font-semibold text-xs">
              {t('sidebar.recipes')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        buttonContent
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label={t('inventory.close')}
            onClick={() => setIsOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-lg"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted px-4 py-3">
              <div className="flex items-center gap-2">
                <ChefHat size={18} className="text-blue-500" />
                <h3 className="font-bold text-sm text-foreground">{t('recipes.title')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="hover:bg-muted rounded-lg p-2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={t('inventory.close')}
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 border-b border-border bg-muted/50 space-y-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t('recipes.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-[color,box-shadow,border-color]"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <RecipeCategorySelectTree
                    categories={recipeCategories}
                    value={activeCategoryId || ""}
                    onChange={(val) => setActiveCategoryId(val || null)}
                    placeholder={t('recipes.allCategories')}
                    className="h-10 bg-background border-border text-foreground"
                  />
                </div>
                {activeCategoryId && (
                  <button
                    onClick={() => setActiveCategoryId(null)}
                    className="p-2.5 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
                    title={t('recipes.clearFilter')}
                  >
                    <UtensilsCrossed className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3 custom-scrollbar">
              {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                  <span className="text-xs text-muted-foreground font-medium">{t('loading')}</span>
                </div>
              ) : filteredRecipes.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-muted-foreground">
                  <ChefHat size={48} className="opacity-10 mb-4" />
                  <p className="text-sm font-medium italic">{t('recipes.noMatch')}</p>
                </div>
              ) : (
                filteredRecipes.map((recipe) => (
                  <button
                    key={recipe.id}
                    onClick={() => setSelectedRecipe(recipe)}
                    className="flex items-center gap-4 w-full p-3 rounded-xl bg-muted border border-border hover:border-primary/30 hover:bg-muted/80 transition-[colors,background-color] text-left group"
                  >
                    <div className="p-3 rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 transition-colors shrink-0">
                      <BookOpen size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-foreground truncate group-hover:text-foreground transition-colors">
                        {recipe.name}
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-sub text-muted-foreground">
                        {(recipe.prep_time_minutes > 0 || recipe.cook_time_minutes > 0) && (
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="shrink-0" />
                            {recipe.prep_time_minutes + recipe.cook_time_minutes} {t('status.late_min_abbr') || 'dk'}
                          </span>
                        )}
                        {recipe.servings > 0 && (
                          <span className="flex items-center gap-1">
                            <Users size={12} className="shrink-0" />
                            {t('recipes.servings', { count: recipe.servings })}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))
              )}
            </div>

            <div className="p-4 border-t border-border bg-muted/50 text-2xs text-muted-foreground font-medium text-center italic">
              {t('recipes.recipeCount', { count: filteredRecipes.length })}
            </div>
          </aside>
        </div>
      )}

      {/* Reçete Detay Modalı */}
      <KdsRecipeDetailModal
        recipe={selectedRecipe}
        onClose={() => setSelectedRecipe(null)}
      />
    </>
  );
}
