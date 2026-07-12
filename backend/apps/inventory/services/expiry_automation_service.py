"""SKT aksiyon otomasyon orchestrator — preview / execute."""

from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from apps.audit.services import record_audit
from apps.inventory.models import ExpiryAction, ExpiryActionType

from .expiry_action_service import ExpiryActionService
from .expiry_handlers._common import validate_action_type
from .expiry_handlers.plan_note import execute_plan_note, preview_plan_note
from .expiry_handlers.priority_consume import execute_priority_consume, preview_priority_consume
from .expiry_handlers.transfer_suggest import execute_transfer_suggest, preview_transfer_suggest


def _automation_enabled() -> bool:
    return bool(getattr(settings, 'EXPIRY_ACTION_AUTOMATION_ENABLED', False))


_PREVIEW_HANDLERS = {
    ExpiryActionType.PRIORITY_CONSUME: preview_priority_consume,
    ExpiryActionType.TRANSFER_SUGGEST: preview_transfer_suggest,
    ExpiryActionType.PLAN_NOTE: preview_plan_note,
}

_EXECUTE_HANDLERS = {
    ExpiryActionType.PRIORITY_CONSUME: execute_priority_consume,
    ExpiryActionType.TRANSFER_SUGGEST: execute_transfer_suggest,
    ExpiryActionType.PLAN_NOTE: execute_plan_note,
}


class ExpiryAutomationService:
    @staticmethod
    def preview_action(user, lot_id: str, action_type: str, **params) -> dict:
        validate_action_type(action_type)
        handler = _PREVIEW_HANDLERS.get(action_type)
        if not handler:
            raise ValueError(_('Desteklenmeyen aksiyon tipi.'))
        preview = handler(user, lot_id, **params)
        preview['automation_enabled'] = _automation_enabled()
        return preview

    @staticmethod
    @transaction.atomic
    def execute_action(user, lot_id: str, action_type: str, **params) -> ExpiryAction:
        validate_action_type(action_type)

        if not _automation_enabled():
            return ExpiryActionService.record_action(
                user=user,
                lot_id=lot_id,
                action_type=action_type,
                notes=params.get('notes', ''),
            )

        handler = _EXECUTE_HANDLERS.get(action_type)
        if not handler:
            raise ValueError(_('Desteklenmeyen aksiyon tipi.'))

        preview = ExpiryAutomationService.preview_action(
            user, lot_id, action_type, **params
        )
        if not preview.get('can_execute', True):
            msg = preview.get('warnings', ['İşlem yapılamaz.'])
            raise ValueError(msg[0] if msg else 'İşlem yapılamaz.')

        result = handler(user, lot_id, **params)

        action = ExpiryActionService.record_action(
            user=user,
            lot_id=lot_id,
            action_type=action_type,
            notes=params.get('notes', ''),
        )
        action.automation_applied = True
        action.result_json = result
        action.save(update_fields=['automation_applied', 'result_json', 'updated_at'])

        if action_type == ExpiryActionType.TRANSFER_SUGGEST and result.get('transfer_id'):
            from apps.warehouse.models import WarehouseTransfer

            WarehouseTransfer.objects.filter(id=result['transfer_id']).update(
                source_expiry_action=action,
            )
            from apps.warehouse.ws_broadcast import schedule_expiry_transfer_draft_created

            transfer = WarehouseTransfer.objects.select_related(
                'source_warehouse',
            ).get(id=result['transfer_id'])
            schedule_expiry_transfer_draft_created(transfer, action)

        record_audit(
            action=f'inventory.expiry_automation.{action_type.lower()}',
            target_instance=action,
            after_json={
                'lot_id': lot_id,
                'action_type': action_type,
                'automation_applied': True,
                'result': result,
            },
        )
        return action
