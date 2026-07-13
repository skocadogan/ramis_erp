"use client"

import { lazy, Suspense } from "react"
import { useTranslations } from "next-intl"
import { ChefHat, Plus, Search, Loader2, Info, Layers, Package } from "lucide-react"
import { AppShell } from "@/components/shell/AppShell"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { useModulePermissions } from "@/hooks/useModulePermissions"

import { useRecipes } from "@/features/recipes/hooks/useRecipes"
import { useRecipeActions } from "@/features/recipes/hooks/useRecipeActions"
import { RecipeCard } from "@/features/recipes/components/RecipeCard"
import { RecipeCategoryTreeView } from "@/features/recipes/components/RecipeCategoryTreeView"

const RecipeFormModal = lazy(() =>
  import("@/features/recipes/components/RecipeFormModal").then((m) => ({
    default: m.RecipeFormModal,
  }))
);
const RecipeCategoryManagementModal = lazy(() =>
  import("@/features/recipes/components/RecipeCategoryManagementModal").then((m) => ({
    default: m.RecipeCategoryManagementModal,
  }))
);
const RecipeCategoryFormModal = lazy(() =>
  import("@/features/recipes/components/RecipeCategoryFormModal").then((m) => ({
    default: m.RecipeCategoryFormModal,
  }))
);
import { useRecipeCategoryActions } from "@/features/recipes/hooks/useRecipeCategoryActions"
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

function RecipesPageContent() {
  const t = useTranslations("recipes.page")
  const tInvItems = useTranslations("inventory.nav.tabs.items")
  const { canManage } = useModulePermissions()
  const canManageRecipes = canManage("recipes.manage_recipe")
  const canDeleteRecipes = canManage("recipes.delete_recipe")

  const recipes = useRecipes()
  const actions = useRecipeActions({
    onSuccess: recipes.refresh,
    stockItems: recipes.stockItems,
    allRecipes: recipes.recipes,
  })
  
  const categoryActions = useRecipeCategoryActions({
    onSuccess: recipes.refresh
  })

  if (recipes.isLoading && recipes.recipes.length === 0) {
    return (
      <AppShell>
        <div className="flex h-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="text-sm text-muted-foreground">{t("loading")}</span>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex h-full bg-background overflow-hidden">
        {/* Sol Sidebar: Kategoriler */}
        <div className="w-64 flex-shrink-0 border-r border-border border-border bg-card flex flex-col overflow-hidden">
          <RecipeCategoryTreeView
            categories={recipes.recipeCategories}
            selectedCategoryId={recipes.selectedCategoryId}
            onCategorySelect={recipes.setSelectedCategoryId}
            onManageCategories={categoryActions.openManagement}
          />
        </div>

        {/* Ana İçerik */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden p-6 flex flex-col gap-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-foreground flex items-center gap-3">
                  
                  {t("title")}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info size={16} className="hover:text-blue-500 cursor-help transition-colors" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs text-xs leading-relaxed">
                        {t("titleTooltip")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("subtitle")}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative group">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-600 transition-colors" />
                  <input
                    type="text"
                    placeholder={t("searchPlaceholder")}
                    value={recipes.searchTerm}
                    onChange={(e) => recipes.setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-muted border-border text-foreground w-64 transition-all shadow-sm"
                  />
                </div>
                {canManageRecipes && (
                  <button
                    onClick={() => actions.openForm()}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 hover:shadow-lg transition-all active:scale-[0.98]"
                  >
                    <Plus size={18} />{t("newRecipe")}
                  </button>
                )}
              </div>
            </div>

            {/* Stats Summary Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card/40 p-3 rounded-xl border border-border shadow-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 shrink-0">
                  <ChefHat size={16} />
                </div>
                <div>
                  <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">{t("statTotalRecipes")}</p>
                  <p className="text-base font-bold text-foreground leading-none">{recipes.recipes.length}</p>
                </div>
              </div>
              <div className="bg-card/40 p-3 rounded-xl border border-border shadow-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 shrink-0">
                  <Layers size={16} />
                </div>
                <div>
                  <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">{t("statCategories")}</p>
                  <p className="text-base font-bold text-foreground leading-none">{recipes.recipeCategories.length}</p>
                </div>
              </div>
              <div className="bg-card/40 p-3 rounded-xl border border-border shadow-sm flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 shrink-0">
                  <Package size={16} />
                </div>
                <div>
                  <p className="text-2xs font-bold text-muted-foreground uppercase tracking-wider leading-none mb-1">{tInvItems("label")}</p>
                  <p className="text-base font-bold text-foreground leading-none">{recipes.stockItems.length}</p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar">
              {recipes.filteredRecipes.length === 0 ? (
                <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground bg-card/50 rounded-2xl border-2 border-dashed border-border">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <ChefHat size={48} className="text-muted-foreground" />
                  </div>
                  <span className="text-sm font-medium">{t("emptyState")}</span>
                  <button 
                    onClick={() => { recipes.setSearchTerm(""); recipes.setSelectedCategoryId(null); }}
                    className="mt-2 text-xs text-blue-600 hover:underline font-semibold"
                  >
                    {t("clearFilters")}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-5">
                  {recipes.filteredRecipes.map(recipe => (
                    <RecipeCard
                      key={recipe.id}
                      recipe={recipe}
                      onEdit={canManageRecipes ? () => actions.openForm(recipe) : undefined}
                      onDelete={canDeleteRecipes ? () => actions.confirmDeleteRecipe(recipe.id) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <RecipeFormModal
          open={actions.showForm}
          isSubmitting={actions.isSubmitting}
          formData={actions.formData}
          setFormData={actions.setFormData}
          ingredients={actions.ingredients}
          addIngredient={actions.addIngredient}
          removeIngredient={actions.removeIngredient}
          updateIngredient={actions.updateIngredient}
          onSubmit={actions.handleSubmitRecipe}
          onClose={actions.closeForm}
          products={recipes.products}
          recipeCategories={recipes.recipeCategories}
          stockItems={recipes.stockItems}
          stockUnits={recipes.stockUnits}
          branches={recipes.branches}
          subRecipes={recipes.recipes}
          editingRecipeId={actions.editingRecipeId}
          editingRecipe={actions.editingRecipe}
        />
      </Suspense>

      {/* Kategori Yönetimi Modalları */}
      <Suspense fallback={null}>
        <RecipeCategoryManagementModal
          open={categoryActions.showManagement}
          onClose={categoryActions.closeManagement}
          categories={recipes.recipeCategories}
          onAddCategory={categoryActions.openForm}
          onEditCategory={(cat) => categoryActions.openForm(undefined, cat)}
          onDeleteCategory={categoryActions.handleDelete}
        />
      </Suspense>

      <Suspense fallback={null}>
        <RecipeCategoryFormModal
          open={categoryActions.showForm}
          onClose={categoryActions.closeForm}
          editingCategoryId={categoryActions.editingCategoryId}
          formData={categoryActions.formData}
          setFormData={categoryActions.setFormData}
          isSubmitting={categoryActions.isSubmitting}
          onSubmit={categoryActions.handleSubmit}
          categories={recipes.recipeCategories}
        />
      </Suspense>

      <AlertDialog open={!!actions.recipeToDelete} onOpenChange={(open) => !open && actions.cancelDeleteRecipe()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={actions.executeDeleteRecipe}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!categoryActions.deletingCategory}
        onOpenChange={(open) => !open && categoryActions.setDeletingCategory(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteCategoryTitle") || t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {categoryActions.deletingCategory?.name} — {t("deleteCategoryDescription") || t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={categoryActions.isDeleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void categoryActions.confirmDelete()
              }}
              disabled={categoryActions.isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {categoryActions.isDeleting && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

export default function RecipesPage() {
  return (
    <AuthGuard module="recipes" mode="manage">
      <RecipesPageContent />
    </AuthGuard>
  )
}
