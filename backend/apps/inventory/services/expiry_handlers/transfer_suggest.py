"""TRANSFER_SUGGEST — DRAFT transfer oluşturma."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.inventory.models import ExpiryActionType
from apps.warehouse.models import TransferStatus, Warehouse, WarehouseTransfer, WarehouseType
from apps.warehouse.services.transfer_service import TransferService, TransferStockValidationError

from ._common import load_lot_for_action, lot_branch


def _resolve_target_warehouse(lot, target_warehouse_id: str | None) -> Warehouse:
    source = lot.warehouse
    if source.warehouse_type == WarehouseType.KITCHEN:
        if not target_warehouse_id:
            raise ValueError(_('Mutfak deposundaki lot için hedef depo seçilmelidir.'))
        try:
            wh = Warehouse.objects.get(id=target_warehouse_id, is_active=True)
        except Warehouse.DoesNotExist as exc:
            raise ValueError(_('Geçersiz hedef depo.')) from exc
        if str(wh.id) == str(source.id):
            raise ValueError(_('Kaynak ve hedef depo aynı olamaz.'))
        return wh

    branch = lot_branch(lot)
    if not branch:
        raise ValueError(_('Lot deposuna bağlı şube bulunamadı.'))

    if target_warehouse_id:
        try:
            wh = Warehouse.objects.get(id=target_warehouse_id, is_active=True)
        except Warehouse.DoesNotExist as exc:
            raise ValueError(_('Geçersiz hedef depo.')) from exc
        if not wh.branches.filter(id=branch.id).exists():
            raise ValueError(_('Hedef depo lot şubesi ile uyumlu değil.'))
        return wh

    kitchen = (
        Warehouse.objects.filter(
            branches=branch,
            warehouse_type=WarehouseType.KITCHEN,
            is_active=True,
        )
        .exclude(id=source.id)
        .order_by('name')
        .first()
    )
    if not kitchen:
        raise ValueError(_('Şube için mutfak deposu bulunamadı.'))
    return kitchen


def _existing_draft_transfer(lot) -> WarehouseTransfer | None:
    since = timezone.now() - timedelta(hours=settings.EXPIRY_TRANSFER_IDEMPOTENCY_HOURS)
    return (
        WarehouseTransfer.objects.filter(
            status=TransferStatus.DRAFT,
            is_active=True,
            source_expiry_action__stock_lot_id=lot.id,
            source_expiry_action__action_type=ExpiryActionType.TRANSFER_SUGGEST,
            created_at__gte=since,
        )
        .order_by('-created_at')
        .first()
    )


def preview_transfer_suggest(user, lot_id: str, **params) -> dict:
    lot = load_lot_for_action(user, lot_id)
    target_warehouse_id = params.get('target_warehouse_id')
    quantity_raw = params.get('quantity')

    existing = _existing_draft_transfer(lot)
    if existing:
        return {
            'action_type': ExpiryActionType.TRANSFER_SUGGEST,
            'can_execute': False,
            'warnings': [
                _('Bu lot için zaten bekleyen bir transfer taslağı var: %(num)s')
                % {'num': existing.transfer_number},
            ],
            'existing_transfer_id': str(existing.id),
            'existing_transfer_number': existing.transfer_number,
        }

    target = _resolve_target_warehouse(lot, target_warehouse_id)
    qty = Decimal(str(quantity_raw)) if quantity_raw is not None else lot.quantity
    if qty <= 0 or qty > lot.quantity:
        raise ValueError(_('Geçersiz transfer miktarı.'))

    return {
        'action_type': ExpiryActionType.TRANSFER_SUGGEST,
        'can_execute': True,
        'warnings': [],
        'source_warehouse_id': str(lot.warehouse_id),
        'source_warehouse_name': lot.warehouse.name,
        'target_warehouse_id': str(target.id),
        'target_warehouse_name': target.name,
        'quantity': str(qty),
        'unit': lot.stock_item.unit,
        'stock_item_name': lot.stock_item.name,
    }


def execute_transfer_suggest(user, lot_id: str, **params) -> dict:
    preview = preview_transfer_suggest(user, lot_id, **params)
    if not preview.get('can_execute'):
        raise ValueError(preview.get('warnings', ['İşlem yapılamaz.'])[0])

    lot = load_lot_for_action(user, lot_id)
    target = _resolve_target_warehouse(lot, params.get('target_warehouse_id'))
    qty = Decimal(preview['quantity'])
    skt = lot.expiry_date.isoformat() if lot.expiry_date else '—'
    notes = params.get('notes') or ''
    transfer_notes = (
        f'SKT transfer önerisi — Lot {lot.lot_number or lot.id}, SKT {skt}'
        + (f' — {notes}' if notes else '')
    )

    try:
        transfer = TransferService.create_transfer(
            {
                'source_warehouse_id': lot.warehouse_id,
                'target_warehouse_id': target.id,
                'transfer_date': timezone.localdate(),
                'status': TransferStatus.DRAFT,
                'notes': transfer_notes,
            },
            [
                {
                    'stock_item_id': lot.stock_item_id,
                    'quantity': qty,
                    'unit': lot.stock_item.unit,
                    'notes': f'Lot: {lot.lot_number or lot.id}',
                },
            ],
            user=user,
        )
    except TransferStockValidationError as exc:
        raise ValueError(str(exc)) from exc

    return {
        'transfer_id': str(transfer.id),
        'transfer_number': transfer.transfer_number,
        'target_warehouse_id': str(target.id),
        'quantity': str(qty),
    }
