"""PRIORITY_CONSUME — FEFO boost + mevcut prep görev priority artışı."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.inventory.models import ExpiryActionType
from apps.prep.models import PrepStatus, PrepTask
from apps.recipes.models import Recipe, RecipeIngredient

from ._common import load_lot_for_action, lot_branch


def _product_ids_for_stock_item(stock_item_id) -> list:
    recipe_ids = RecipeIngredient.objects.filter(
        stock_item_id=stock_item_id,
        is_active=True,
    ).values_list('recipe_id', flat=True)
    return list(
        Recipe.objects.filter(id__in=recipe_ids, is_active=True, product_id__isnull=False)
        .values_list('product_id', flat=True)
        .distinct()
    )


def _active_prep_tasks_for_products(branch_id, product_ids):
    if not branch_id or not product_ids:
        return PrepTask.objects.none()
    return PrepTask.objects.filter(
        branch_id=branch_id,
        product_id__in=product_ids,
        is_active=True,
        status__in=[PrepStatus.PENDING, PrepStatus.IN_PROGRESS],
    ).order_by('-priority', 'created_at')


def preview_priority_consume(user, lot_id: str, **params) -> dict:
    lot = load_lot_for_action(user, lot_id)
    branch = lot_branch(lot)
    product_ids = _product_ids_for_stock_item(lot.stock_item_id)
    prep_qs = _active_prep_tasks_for_products(branch.id if branch else None, product_ids)

    boost_value = settings.EXPIRY_FEFO_BOOST_VALUE
    boost_until = timezone.now() + timedelta(hours=settings.EXPIRY_FEFO_BOOST_HOURS)
    delta = settings.EXPIRY_PREP_PRIORITY_DELTA

    prep_tasks = [
        {
            'id': str(task.id),
            'title': task.title,
            'current_priority': task.priority,
            'new_priority': min(99, task.priority + delta),
        }
        for task in prep_qs
    ]

    warnings = []
    if not prep_tasks:
        warnings.append('Aktif prep görevi bulunamadı; yalnızca FEFO boost uygulanacak.')

    return {
        'action_type': ExpiryActionType.PRIORITY_CONSUME,
        'can_execute': True,
        'warnings': warnings,
        'fefo_boost_value': boost_value,
        'fefo_boost_until': boost_until.isoformat(),
        'prep_tasks': prep_tasks,
    }


def execute_priority_consume(user, lot_id: str, **params) -> dict:
    preview = preview_priority_consume(user, lot_id, **params)
    lot = load_lot_for_action(user, lot_id)
    branch = lot_branch(lot)

    boost_until = timezone.now() + timedelta(hours=settings.EXPIRY_FEFO_BOOST_HOURS)
    lot.fefo_priority_boost = settings.EXPIRY_FEFO_BOOST_VALUE
    lot.fefo_priority_until = boost_until
    lot.save(update_fields=['fefo_priority_boost', 'fefo_priority_until', 'updated_at'])

    product_ids = _product_ids_for_stock_item(lot.stock_item_id)
    prep_qs = _active_prep_tasks_for_products(branch.id if branch else None, product_ids)
    delta = settings.EXPIRY_PREP_PRIORITY_DELTA
    updated_ids = []

    for task in prep_qs:
        task.priority = min(99, task.priority + delta)
        task.save(update_fields=['priority', 'updated_at'])
        updated_ids.append(str(task.id))

    if branch and updated_ids:
        from core.ws_deferred import schedule_prep_update

        schedule_prep_update(str(branch.id), None, refresh_all=True)

    return {
        'fefo_boost': settings.EXPIRY_FEFO_BOOST_VALUE,
        'fefo_boost_until': boost_until.isoformat(),
        'prep_task_ids': updated_ids,
        'warnings': preview.get('warnings', []),
    }
