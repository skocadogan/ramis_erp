"""StockCountingService - Stok sayımı iş mantığı."""

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.inventory.services import InventoryService
from apps.warehouse.models import (
    CountingDifferenceReason,
    CountingStatus,
    StockCounting,
    StockCountingItem,
    WarehouseStockLevel,
)
from core.decimal_constants import ZERO_QTY
from core.quantity_format import format_quantity_display

_STOCK_OUT_REASONS = frozenset({
    CountingDifferenceReason.CANCEL_RETURN,
    CountingDifferenceReason.WASTE,
})


def _coerce_counted_quantity(value) -> Decimal:
    if value is None:
        return ZERO_QTY
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).strip())
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError(_('Geçersiz sayılan miktar.')) from exc


def _validate_difference_reason(
    item_name: str,
    diff: Decimal,
    reason: str | None,
) -> str | None:
    if diff == ZERO_QTY:
        return None

    if not reason:
        raise ValueError(
            _('%(item)s için fark oluştu; neden seçilmelidir.')
            % {'item': item_name},
        )

    valid = {choice.value for choice in CountingDifferenceReason}
    if reason not in valid:
        raise ValueError(_('Geçersiz fark nedeni: %(reason)s') % {'reason': reason})

    if diff > ZERO_QTY and reason in _STOCK_OUT_REASONS:
        raise ValueError(
            _('%(item)s için pozitif farkta İptal/İade veya Fire/Zayi seçilemez.')
            % {'item': item_name},
        )

    return reason


def _counting_movement_notes(counting: StockCounting, item: StockCountingItem) -> str:
    reason_label = ''
    if item.difference_reason:
        reason_label = item.get_difference_reason_display()
    user_note = (item.notes or '').strip()
    base = _(
        'Sayım #%(number)s — %(item)s: %(qty)s %(unit)s (%(reason)s)',
    ) % {
        'number': counting.counting_number,
        'item': item.stock_item.name,
        'qty': format_quantity_display(abs(item.difference)),
        'unit': item.unit,
        'reason': reason_label or _('Belirtilmedi'),
    }
    if user_note:
        return f'{base} — {user_note}'
    return base


class StockCountingService:
    """Stok sayımı iş mantığı."""

    @staticmethod
    @transaction.atomic
    def create_counting(data: dict, items_data: list[dict], user=None) -> StockCounting:
        data['counted_by'] = user
        counting = StockCounting.objects.create(**data)

        for item_data in items_data:
            item_data['counting'] = counting
            StockCountingItem.objects.create(**item_data)

        return counting

    @staticmethod
    @transaction.atomic
    def start_counting(counting_id) -> StockCounting:
        counting = StockCounting.objects.select_for_update().get(id=counting_id)
        if counting.status != CountingStatus.DRAFT:
            raise ValueError(_('Sadece taslak sayımlar başlatılabilir.'))
        counting.status = CountingStatus.IN_PROGRESS
        counting.save(update_fields=['status', 'updated_at'])
        return counting

    @staticmethod
    @transaction.atomic
    def complete_counting(counting_id) -> StockCounting:
        counting = StockCounting.objects.select_for_update().get(id=counting_id)
        if counting.status != CountingStatus.IN_PROGRESS:
            raise ValueError(_('Sadece devam eden sayımlar tamamlanabilir.'))

        items = counting.items.select_related('stock_item').all()
        for item in items:
            if item.difference != ZERO_QTY:
                _validate_difference_reason(
                    item.stock_item.name,
                    item.difference,
                    item.difference_reason,
                )

        counting.status = CountingStatus.COMPLETED
        counting.save(update_fields=['status', 'updated_at'])
        return counting

    @staticmethod
    @transaction.atomic
    def approve_counting(counting_id, user=None) -> StockCounting:
        """Sayımı onaylar → farkları stoğa ve ilgili tablolara yansıtır."""
        counting = StockCounting.objects.select_for_update().get(id=counting_id)
        if counting.status != CountingStatus.COMPLETED:
            raise ValueError(_('Sadece tamamlanmış sayımlar onaylanabilir.'))

        items = counting.items.select_related('stock_item').all()

        for item in items:
            if item.difference == ZERO_QTY:
                continue

            reason = _validate_difference_reason(
                item.stock_item.name,
                item.difference,
                item.difference_reason,
            )
            notes = _counting_movement_notes(counting, item)
            reference = f'Sayım:{counting.id}'

            if reason in _STOCK_OUT_REASONS:
                qty = abs(item.difference)
                if reason == CountingDifferenceReason.CANCEL_RETURN:
                    movement = InventoryService.cancel_stock(
                        counting.warehouse_id,
                        item.stock_item_id,
                        qty,
                        reference=reference,
                        notes=notes,
                        performed_by=user,
                        unit=item.unit,
                    )
                else:
                    movement = InventoryService.waste_stock(
                        counting.warehouse_id,
                        item.stock_item_id,
                        qty,
                        reference=reference,
                        notes=notes,
                        performed_by=user,
                        unit=item.unit,
                    )
            else:
                movement = InventoryService.adjust_stock(
                    counting.warehouse_id,
                    item.stock_item_id,
                    item.counted_quantity,
                    notes=notes,
                    performed_by=user,
                )

            item.linked_movement = movement
            item.save(update_fields=['linked_movement', 'updated_at'])

        counting.status = CountingStatus.APPROVED
        counting.approved_by = user
        counting.approved_at = timezone.now()
        counting.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

        from apps.audit.services import record_audit

        branch = counting.warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.stock_counting.approved',
            target_instance=counting,
            after_json={
                'status': counting.status,
                'counting_number': counting.counting_number,
            },
            actor=user,
            branch=branch,
        )
        return counting

    @staticmethod
    @transaction.atomic
    def delete_counting(counting_id, user=None) -> None:
        """Sayımı siler; iptal/iade veya fire/zayi kalemlerinin stok etkisini geri alır."""
        from apps.inventory.services.stock_movement_service import delete_movement

        counting = StockCounting.objects.select_for_update().get(id=counting_id)
        items = counting.items.select_related('linked_movement', 'stock_item').all()

        for item in items:
            if (
                item.linked_movement_id
                and item.difference_reason in _STOCK_OUT_REASONS
            ):
                delete_movement(item.linked_movement_id)
                item.linked_movement = None
                item.save(update_fields=['linked_movement', 'updated_at'])

        counting.delete()

        from apps.audit.services import record_audit

        branch = counting.warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.stock_counting.deleted',
            target_instance=counting,
            before_json={
                'counting_number': counting.counting_number,
                'status': counting.status,
            },
            actor=user,
            branch=branch,
        )

    @staticmethod
    @transaction.atomic
    def auto_populate_items(counting_id) -> list[StockCountingItem]:
        """Depodaki tüm stok kalemlerini otomatik olarak sayım kalemleri olarak ekler."""
        counting = StockCounting.objects.get(id=counting_id)
        levels = WarehouseStockLevel.objects.filter(
            warehouse=counting.warehouse,
            is_active=True,
        ).select_related('stock_item')

        created_items = []
        for level in levels:
            item, was_created = StockCountingItem.objects.get_or_create(
                counting=counting,
                stock_item=level.stock_item,
                defaults={
                    'system_quantity': level.quantity,
                    'counted_quantity': ZERO_QTY,
                    'unit': level.stock_item.unit,
                },
            )
            if was_created:
                created_items.append(item)

        return created_items

    @staticmethod
    @transaction.atomic
    def update_counting_items(counting_id, items_data: list[dict]) -> StockCounting:
        """Sayım kalemlerini (sayılan miktar, neden ve not) toplu olarak günceller."""
        counting = StockCounting.objects.select_for_update().get(id=counting_id)
        if counting.status == CountingStatus.APPROVED:
            raise ValueError(_('Onaylanmış sayımlar güncellenemez.'))

        for item_data in items_data:
            item_id = item_data.get('id')
            stock_item_id = item_data.get('stock_item_id')
            if not item_id and not stock_item_id:
                continue

            lookup = {'counting': counting}
            if item_id:
                lookup['id'] = item_id
            else:
                lookup['stock_item_id'] = stock_item_id

            item = StockCountingItem.objects.select_for_update().get(**lookup)
            item.counted_quantity = _coerce_counted_quantity(
                item_data.get('counted_quantity', ZERO_QTY),
            )
            item.notes = item_data.get('notes') or ''

            reason = item_data.get('difference_reason')
            if reason == '':
                reason = None
            prospective_diff = item.counted_quantity - item.system_quantity
            item.difference_reason = _validate_difference_reason(
                item.stock_item.name,
                prospective_diff,
                reason,
            )

            item.save(update_fields=[
                'counted_quantity',
                'notes',
                'difference',
                'difference_reason',
                'updated_at',
            ])

        counting.updated_at = timezone.now()
        counting.save(update_fields=['updated_at'])
        return counting
