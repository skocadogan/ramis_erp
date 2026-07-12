from django.db import transaction
from django.utils.translation import gettext_lazy as _

from .models import Recipe, RecipeIngredient


class RecipeService:
    """Reçete yönetimi iş mantığı."""

    @staticmethod
    @transaction.atomic
    def create_recipe(
        name: str,
        product_id=None,
        category_id=None,
        servings: int = 1,
        serving_quantity=None,
        serving_unit: str = '',
        description: str = '',
        prep_time_minutes: int = 0,
        cook_time_minutes: int = 0,
        prep_time_per_serving: int = 0,
        cook_time_per_serving: int = 0,
        instructions: str = '',
        ingredients_data: list[dict] | None = None,
        branches_data: list | None = None,
    ) -> Recipe:
        """
        Yeni reçete oluşturur.

        Args:
            product_id: Menü ürünü ID'si
            category_id: Reçete kategorisi ID'si
            name: Reçete adı
            servings: Porsiyon sayısı
            serving_quantity: Porsiyon miktarı/ağırlığı
            serving_unit: Porsiyon birimi
            description: Açıklama
            prep_time_minutes: Hazırlık süresi
            cook_time_minutes: Pişirme süresi
            instructions: Hazırlanış talimatları
            ingredients_data: Malzeme listesi [{"stock_item_id": ..., "quantity": ..., "unit": ...}]

        Returns:
            Oluşturulan Recipe nesnesi
        """
        recipe = Recipe.objects.create(
            product_id=product_id,
            category_id=category_id,
            name=name,
            description=description,
            servings=servings,
            serving_quantity=serving_quantity,
            serving_unit=serving_unit,
            prep_time_minutes=prep_time_minutes,
            cook_time_minutes=cook_time_minutes,
            prep_time_per_serving=prep_time_per_serving,
            cook_time_per_serving=cook_time_per_serving,
            instructions=instructions,
        )

        if ingredients_data:
            for ing_data in ingredients_data:
                RecipeService._create_ingredient(recipe, ing_data)
        
        if branches_data is not None:
            recipe.branches.set(branches_data)

        from .allergen_service import recalculate_recipe_allergens
        recalculate_recipe_allergens(recipe)

        return recipe

    @staticmethod
    @transaction.atomic
    def update_recipe(recipe: Recipe, **kwargs) -> Recipe:
        """Reçete bilgilerini günceller."""
        ingredients_data = kwargs.pop('ingredients_data', None)
        branches_data = kwargs.pop('branches_data', None)

        for field, value in kwargs.items():
            if hasattr(recipe, field):
                setattr(recipe, field, value)
        recipe.save()

        if ingredients_data is not None:
            recipe.ingredients.all().delete()
            for ing_data in ingredients_data:
                RecipeService._create_ingredient(recipe, ing_data)
        
        if branches_data is not None:
            recipe.branches.set(branches_data)

        from .allergen_service import recalculate_recipe_allergens
        recalculate_recipe_allergens(recipe)

        return recipe

    @staticmethod
    def _create_ingredient(recipe: Recipe, ing_data: dict) -> RecipeIngredient:
        sub_recipe_id = ing_data.get('sub_recipe_id')
        stock_item_id = ing_data.get('stock_item_id')
        common = {
            'recipe': recipe,
            'quantity': ing_data['quantity'],
            'unit': ing_data['unit'],
            'notes': ing_data.get('notes', ''),
        }
        if sub_recipe_id:
            return RecipeIngredient.objects.create(
                **common,
                sub_recipe_id=sub_recipe_id,
            )
        return RecipeIngredient.objects.create(
            **common,
            stock_item_id=stock_item_id,
        )

    @staticmethod
    def add_ingredient(
        recipe: Recipe,
        stock_item_id=None,
        sub_recipe_id=None,
        quantity=None,
        unit: str = '',
        notes: str = '',
    ) -> RecipeIngredient:
        """Reçeteye malzeme veya alt reçete ekler."""
        payload = {
            'quantity': quantity,
            'unit': unit,
            'notes': notes,
        }
        if sub_recipe_id:
            payload['sub_recipe_id'] = sub_recipe_id
        else:
            payload['stock_item_id'] = stock_item_id
        return RecipeService._create_ingredient(recipe, payload)

    @staticmethod
    def remove_ingredient(recipe: Recipe, ingredient_id) -> None:
        """Reçeteden malzeme çıkarır."""
        recipe.ingredients.filter(id=ingredient_id).delete()
