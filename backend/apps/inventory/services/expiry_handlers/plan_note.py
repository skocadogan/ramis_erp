"""PLAN_NOTE — üretim planına zaman damgalı not append."""

from __future__ import annotations

from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.inventory.models import ExpiryActionType
from apps.production_planning.models import ProductionPlan, ProductionPlanStatus

from ._common import load_lot_for_action, lot_branch


def _today_plan(branch) -> ProductionPlan | None:
    if not branch:
        return None
    return (
        ProductionPlan.objects.filter(
            branch=branch,
            plan_date=timezone.localdate(),
            is_active=True,
        )
        .order_by('-updated_at')
        .first()
    )


def _build_note_line(lot, user_notes: str) -> str:
    skt = lot.expiry_date.isoformat() if lot.expiry_date else '—'
    ts = timezone.localtime().strftime('%Y-%m-%d %H:%M')
    base = f'[SKT {ts}] {lot.stock_item.name} ({lot.lot_number or lot.id}, SKT {skt})'
    if user_notes:
        return f'{base}: {user_notes.strip()}'
    return base


def preview_plan_note(user, lot_id: str, **params) -> dict:
    lot = load_lot_for_action(user, lot_id)
    branch = lot_branch(lot)
    plan = _today_plan(branch)
    user_notes = (params.get('notes') or '').strip()
    note_line = _build_note_line(lot, user_notes)

    warnings = []
    can_execute = True
    if not plan:
        can_execute = False
        warnings.append('Bugün için üretim planı bulunamadı; önce plan oluşturun.')
    elif plan.status == ProductionPlanStatus.LOCKED:
        can_execute = False
        warnings.append('Kilitli plana not eklenemez.')

    return {
        'action_type': ExpiryActionType.PLAN_NOTE,
        'can_execute': can_execute,
        'warnings': warnings,
        'plan_id': str(plan.id) if plan else None,
        'plan_status': plan.status if plan else None,
        'note_preview': note_line,
    }


def execute_plan_note(user, lot_id: str, **params) -> dict:
    preview = preview_plan_note(user, lot_id, **params)
    if not preview.get('can_execute'):
        raise ValueError(preview.get('warnings', ['İşlem yapılamaz.'])[0])

    lot = load_lot_for_action(user, lot_id)
    branch = lot_branch(lot)
    plan = _today_plan(branch)
    if not plan:
        raise ValueError('Bugün için üretim planı bulunamadı.')
    if plan.status == ProductionPlanStatus.LOCKED:
        raise ValueError('Kilitli plana not eklenemez.')

    note_line = preview['note_preview']
    if plan.notes:
        plan.notes = f'{plan.notes.rstrip()}\n{note_line}'
    else:
        plan.notes = note_line
    plan.save(update_fields=['notes', 'updated_at'])

    return {
        'plan_id': str(plan.id),
        'note_line': note_line,
    }
