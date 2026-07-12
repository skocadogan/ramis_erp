"""Reçete allerjen genişletme — stok kalemleri ve alt reçetelerden birleşim."""

from __future__ import annotations

from typing import TYPE_CHECKING

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

if TYPE_CHECKING:
    from apps.inventory.models import Allergen
    from .models import Recipe


def expand_recipe_allergen_ids(
    recipe: Recipe,
    *,
    visited: set | None = None,
) -> set:
    """Reçetenin doğrudan ve alt reçete kaynaklı allerjen ID kümesini döndürür."""
    from apps.inventory.models import Allergen

    if visited is None:
        visited = set()
    if recipe.id in visited:
        raise ValidationError(
            _('Reçete döngüsü tespit edildi: %(name)s') % {'name': recipe.name}
        )
    visited.add(recipe.id)

    allergen_ids: set = set()
    ingredients = recipe.ingredients.filter(is_active=True).select_related(
        'stock_item', 'sub_recipe'
    ).prefetch_related('stock_item__allergens')

    for ingredient in ingredients:
        if ingredient.stock_item_id:
            for aid in ingredient.stock_item.allergens.filter(is_active=True).values_list(
                'id', flat=True
            ):
                allergen_ids.add(aid)
        elif ingredient.sub_recipe_id:
            sub = ingredient.sub_recipe
            if sub and sub.is_active:
                allergen_ids |= expand_recipe_allergen_ids(sub, visited=visited)

    visited.discard(recipe.id)
    return allergen_ids


def get_recipe_allergens(recipe: Recipe):
    """Aktif allerjen queryset — risk puanına göre sıralı."""
    from apps.inventory.models import Allergen

    ids = expand_recipe_allergen_ids(recipe)
    if not ids:
        return Allergen.objects.none()
    return Allergen.objects.filter(id__in=ids, is_active=True).order_by(
        '-risk_score', 'name'
    )


def get_recipe_allergen_sources(recipe: Recipe) -> list[dict]:
    """Reçete formu için allerjen kaynak satırları."""
    from apps.inventory.models import Allergen

    sources: list[dict] = []
    ingredients = recipe.ingredients.filter(is_active=True).select_related(
        'stock_item', 'sub_recipe'
    ).prefetch_related('stock_item__allergens')

    for ingredient in ingredients:
        if ingredient.stock_item_id:
            allergens = list(
                ingredient.stock_item.allergens.filter(is_active=True).order_by(
                    '-risk_score', 'name'
                )
            )
            if allergens:
                sources.append({
                    'type': 'stock_item',
                    'name': ingredient.stock_item.name,
                    'allergens': allergens,
                })
        elif ingredient.sub_recipe_id and ingredient.sub_recipe:
            sub_allergens = list(get_recipe_allergens(ingredient.sub_recipe))
            if sub_allergens:
                sources.append({
                    'type': 'sub_recipe',
                    'name': ingredient.sub_recipe.name,
                    'allergens': sub_allergens,
                })

    return sources


def preview_recipe_allergens_from_ingredients(
    ingredients_data: list[dict],
    *,
    editing_recipe_id=None,
) -> tuple[set, list[dict]]:
    """
    Kayıt öncesi taslak malzeme listesinden allerjen önizlemesi.
    ingredients_data: stock_item_id / sub_recipe_id içeren dict listesi.
    """
    from apps.inventory.models import Allergen, StockItem
    from .models import Recipe

    allergen_ids: set = set()
    sources: list[dict] = []

    for ing in ingredients_data or []:
        stock_id = ing.get('stock_item_id')
        sub_id = ing.get('sub_recipe_id')
        if stock_id:
            item = StockItem.objects.filter(pk=stock_id, is_active=True).prefetch_related(
                'allergens'
            ).first()
            if not item:
                continue
            item_allergens = list(
                item.allergens.filter(is_active=True).order_by('-risk_score', 'name')
            )
            if item_allergens:
                sources.append({
                    'type': 'stock_item',
                    'name': item.name,
                    'allergens': item_allergens,
                })
                allergen_ids.update(a.id for a in item_allergens)
        elif sub_id:
            if editing_recipe_id and str(sub_id) == str(editing_recipe_id):
                continue
            sub = Recipe.objects.filter(pk=sub_id, is_active=True).first()
            if not sub:
                continue
            sub_allergens = list(get_recipe_allergens(sub))
            if sub_allergens:
                sources.append({
                    'type': 'sub_recipe',
                    'name': sub.name,
                    'allergens': sub_allergens,
                })
                allergen_ids.update(a.id for a in sub_allergens)

    return allergen_ids, sources
