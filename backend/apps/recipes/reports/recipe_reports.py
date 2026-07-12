from django.utils.translation import gettext, gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.recipes import selectors
from apps.recipes.allergen_expansion import get_recipe_allergens, get_recipe_allergen_sources

class RecipeDetailReport(BaseModuleReport):
    """
    Tek bir reçetenin tüm detaylarını (malzemeler, maliyet, talimatlar) içeren rapor.
    """
    slug = 'recipe-detail'
    name = gettext_lazy('Reçete Detay Raporu')
    description = gettext_lazy('Reçete malzemeleri, porsiyon maliyetleri ve hazırlık talimatları.')
    category = 'RECIPES'
    template_name = 'reports/recipe_detail_report.html'

    def get_context(self) -> dict:
        filters = self.kwargs
        recipe_id = filters.get('recipe_id')

        if not recipe_id:
            return {"error": gettext("Reçete belirtilmedi.")}

        recipe = selectors.get_recipe(recipe_id)
        if not recipe:
            return {"error": gettext("Reçete bulunamadı.")}

        allergens = get_recipe_allergens(recipe)
        allergen_sources = get_recipe_allergen_sources(recipe) if allergens.exists() else []

        return {
            "report_name": gettext("%(name)s — Reçete Kartı") % {"name": recipe.name},
            "report_description": self.description,
            "recipe": recipe,
            "ingredients": recipe.ingredients.all(),
            "allergens": allergens,
            "allergen_sources": allergen_sources,
            "filters": filters,
        }

# Raporu kaydet
report_registry.register(RecipeDetailReport)
