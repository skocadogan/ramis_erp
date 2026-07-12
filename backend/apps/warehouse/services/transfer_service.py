"""TransferService - Depolar arası transfer iş mantığı."""

from decimal import Decimal
from uuid import UUID
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.inventory.stock_minimum import quantity_at_warehouse_level
from apps.warehouse.models import (
    DeficiencyReportStatus,
    WarehouseTransfer,
    WarehouseTransferItem,
    TransferStatus,
    WarehouseStockLevel,
)
from apps.inventory.services import InventoryService
from apps.inventory.services.lot_consumption_service import ConsumedLotLine
from apps.inventory.models import StockItem, StockMovementType


class TransferStockValidationError(Exception):
    """Kaynak depoda transfer için yeterli stok yok."""

    def __init__(self, message, insufficient_items: list | None = None, feasible_items: list | None = None):
        self.insufficient_items = insufficient_items or []
        self.feasible_items = feasible_items or []
        super().__init__(message)


class TransferService:
    """Depolar arası transfer iş mantığı."""

    @staticmethod
    def _lock_warehouse_stock_levels(warehouse_id, stock_item_ids) -> None:
        """
        Depoda verilen stok kalemleri için WarehouseStockLevel satırlarını
        stock_item_id sırasıyla kilitler (deadlock riskini azaltır).
        Satır yoksa kilit yoktur (stok 0 kabul edilir).
        """
        unique_ids = sorted({UUID(str(x)) for x in stock_item_ids})
        for sid in unique_ids:
            WarehouseStockLevel.objects.select_for_update().filter(
                warehouse_id=warehouse_id,
                stock_item_id=sid,
                is_active=True,
            ).first()

    @staticmethod
    def _lock_transfer_warehouses_stock_levels(transfer: WarehouseTransfer) -> None:
        """Tamamlama öncesi kaynak ve hedef depoda ilgili stok satırlarını sabit sırada kilitler."""
        ids = list(transfer.items.values_list('stock_item_id', flat=True).distinct())
        TransferService._lock_warehouse_stock_levels(transfer.source_warehouse_id, ids)
        TransferService._lock_warehouse_stock_levels(transfer.target_warehouse_id, ids)

    @staticmethod
    def _lock_source_levels_for_transfer(transfer: WarehouseTransfer) -> None:
        """Onay öncesi yalnızca kaynak depo stok satırlarını kilitler."""
        ids = transfer.items.values_list('stock_item_id', flat=True).distinct()
        TransferService._lock_warehouse_stock_levels(transfer.source_warehouse_id, list(ids))

    @staticmethod
    def _transfer_line_source_demand_normalized(line: WarehouseTransferItem) -> tuple[Decimal, str]:
        """
        Onay/stok kontrolü: kaynakta bulunması gereken miktar (stok kalemi birimi).
        Kısmi teslim (received_quantity > 0) ise kaynak yalnızca bu miktarı verir.
        """
        si = line.stock_item
        n_plan, unit, _ = InventoryService._normalize_quantity_to_item_unit(si, line.quantity, line.unit)
        if line.received_quantity and line.received_quantity > 0:
            n_recv, _, _ = InventoryService._normalize_quantity_to_item_unit(
                si, line.received_quantity, line.unit
            )
            if n_recv > n_plan:
                raise ValueError(
                    _('Onay: alınan miktar transfer miktarını aşamaz: %(name)s')
                    % {'name': si.name}
                )
            return n_recv, unit
        return n_plan, unit

    @staticmethod
    def _transfer_line_outbound_raw(line: WarehouseTransferItem):
        """
        Çıkış/giriş için ham miktar ve birim.
        received_quantity > 0 ise kısmi teslim; normalize edilmiş olarak quantity'yi aşamaz.
        """
        si = line.stock_item
        n_max, _, _ = InventoryService._normalize_quantity_to_item_unit(si, line.quantity, line.unit)
        if line.received_quantity and line.received_quantity > 0:
            n_recv, _, _ = InventoryService._normalize_quantity_to_item_unit(
                si, line.received_quantity, line.unit
            )
            if n_recv > n_max:
                raise ValueError(
                    _('Alınan miktar transfer miktarını aşamaz: %(name)s')
                    % {'name': si.name}
                )
            if n_recv <= 0:
                raise ValueError(
                    _('Alınan miktar geçersiz: %(name)s')
                    % {'name': si.name}
                )
            return line.received_quantity, line.unit
        if line.quantity <= 0:
            raise ValueError(_('Transfer kalemi miktarı pozitif olmalı: %s') % si.name)
        return line.quantity, line.unit

    @staticmethod
    def partition_transfer_lines_by_source_stock(
        source_warehouse_id,
        items_data: list[dict],
    ) -> tuple[list[dict], list[dict]]:
        """
        Kaynak depodaki mevcut stoka göre kalemleri ayırır.
        Aynı malzeme birden fazla satırda ise stok, satır sırasına göre kümülatif düşülür.
        Dönüş: (yetersiz satırlar [API için], transfer edilebilir orijinal item_data satırları)
        """
        insufficient: list[dict] = []
        feasible: list[dict] = []
        remaining_by_item: dict[UUID, Decimal] = {}

        def _remaining(sid: UUID) -> Decimal:
            if sid not in remaining_by_item:
                level = WarehouseStockLevel.objects.filter(
                    warehouse_id=source_warehouse_id,
                    stock_item_id=sid,
                    is_active=True,
                ).first()
                remaining_by_item[sid] = quantity_at_warehouse_level(level)
            return remaining_by_item[sid]

        for row in items_data:
            stock_item_id = row.get('stock_item_id')
            qty = row.get('quantity')
            unit = row.get('unit')
            try:
                item = StockItem.objects.get(id=stock_item_id)
            except StockItem.DoesNotExist:
                insufficient.append({
                    'stock_item_id': str(stock_item_id),
                    'stock_item_name': '?',
                    'requested_quantity': str(qty),
                    'available_quantity': '0',
                    'unit': str(unit or ''),
                    'detail': _('Stok kalemi bulunamadı.'),
                })
                continue

            normalized_qty, normalized_unit, _ = InventoryService._normalize_quantity_to_item_unit(
                item, qty, unit
            )
            available = _remaining(item.id)
            if available < normalized_qty:
                insufficient.append({
                    'stock_item_id': str(stock_item_id),
                    'stock_item_name': item.name,
                    'requested_quantity': str(normalized_qty),
                    'available_quantity': str(available),
                    'unit': normalized_unit,
                })
            else:
                feasible.append(row)
                remaining_by_item[item.id] = available - normalized_qty

        return insufficient, feasible

    @staticmethod
    def validate_existing_transfer_items_against_source(transfer: WarehouseTransfer) -> list[dict]:
        """Taslak / bekleyen transfer kalemleri için kaynak depoda yeterli stok var mı (kümülatif)."""
        insufficient: list[dict] = []
        remaining_by_item: dict[UUID, Decimal] = {}

        def _remaining(sid: UUID) -> Decimal:
            if sid not in remaining_by_item:
                level = WarehouseStockLevel.objects.filter(
                    warehouse_id=transfer.source_warehouse_id,
                    stock_item_id=sid,
                    is_active=True,
                ).first()
                remaining_by_item[sid] = quantity_at_warehouse_level(level)
            return remaining_by_item[sid]

        for line in transfer.items.select_related('stock_item').order_by('id').all():
            item = line.stock_item
            normalized_qty, normalized_unit = TransferService._transfer_line_source_demand_normalized(line)
            available = _remaining(item.id)
            if available < normalized_qty:
                insufficient.append({
                    'stock_item_id': str(item.id),
                    'stock_item_name': item.name,
                    'requested_quantity': str(normalized_qty),
                    'available_quantity': str(available),
                    'unit': normalized_unit,
                })
            else:
                remaining_by_item[item.id] = available - normalized_qty
        return insufficient

    @staticmethod
    @transaction.atomic
    def create_transfer(
        data: dict,
        items_data: list[dict],
        user=None,
        *,
        accept_partial: bool = False,
    ) -> WarehouseTransfer:
        source_id = data.get('source_warehouse') or data.get('source_warehouse_id')
        target_id = data.get('target_warehouse') or data.get('target_warehouse_id')
        if source_id == target_id:
            raise ValueError(_('Kaynak ve hedef depo aynı olamaz.'))
        if not items_data:
            raise ValueError(_('En az bir transfer kalemi gerekli.'))

        stock_ids = [row['stock_item_id'] for row in items_data]
        TransferService._lock_warehouse_stock_levels(source_id, stock_ids)

        insufficient, feasible = TransferService.partition_transfer_lines_by_source_stock(
            source_id, items_data
        )
        if insufficient:
            if not accept_partial:
                msg = (
                    _('Kaynak depoda tüm kalemler için yeterli stok yok.')
                    if not feasible
                    else _('Bazı kalemler için kaynak depoda yeterli stok yok.')
                )
                raise TransferStockValidationError(
                    msg,
                    insufficient_items=insufficient,
                    feasible_items=feasible,
                )
            if not feasible:
                raise TransferStockValidationError(
                    _('Hiçbir kalem için kaynak depoda yeterli stok yok.'),
                    insufficient_items=insufficient,
                    feasible_items=[],
                )
            items_data = feasible

        data['requested_by'] = user
        transfer = WarehouseTransfer.objects.create(**data)

        for row in items_data:
            WarehouseTransferItem.objects.create(
                transfer=transfer,
                stock_item_id=row['stock_item_id'],
                quantity=row['quantity'],
                unit=row['unit'],
                notes=row.get('notes', ''),
            )

        from apps.audit.services import record_audit

        branch = transfer.source_warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.transfer.created',
            target_instance=transfer,
            after_json={
                'transfer_number': transfer.transfer_number,
                'source_warehouse_id': str(transfer.source_warehouse_id),
                'target_warehouse_id': str(transfer.target_warehouse_id),
                'item_count': len(items_data),
            },
            actor=user,
            branch=branch,
        )

        return transfer

    @staticmethod
    @transaction.atomic
    def update_transfer(
        transfer_id,
        data: dict,
        items_data: list[dict],
        _user=None,
        *,
        accept_partial: bool = False,
    ) -> WarehouseTransfer:
        """
        Tamamlanmamış (COMPLETED/CANCELLED dışı) transferi günceller.
        Kısmi teslim alınmış (received_quantity > 0) satır varsa düzenleme yapılmaz.
        """
        transfer = WarehouseTransfer.objects.select_for_update().get(id=transfer_id)
        if transfer.status in (TransferStatus.COMPLETED, TransferStatus.CANCELLED):
            raise ValueError(_('Tamamlanmış veya iptal edilmiş transferler düzenlenemez.'))

        for line in transfer.items.all():
            if line.received_quantity and line.received_quantity > 0:
                raise ValueError(
                    _('Hedefte kısmi teslim kaydı olan transfer kalemleri bu ekrandan değiştirilemez.')
                )

        source_id = data.get('source_warehouse') or data.get('source_warehouse_id')
        target_id = data.get('target_warehouse') or data.get('target_warehouse_id')
        if source_id == target_id:
            raise ValueError(_('Kaynak ve hedef depo aynı olamaz.'))
        if not items_data:
            raise ValueError(_('En az bir transfer kalemi gerekli.'))

        stock_ids = [row['stock_item_id'] for row in items_data]
        TransferService._lock_warehouse_stock_levels(source_id, stock_ids)

        insufficient, feasible = TransferService.partition_transfer_lines_by_source_stock(
            source_id, items_data
        )
        if insufficient:
            if not accept_partial:
                msg = (
                    _('Kaynak depoda tüm kalemler için yeterli stok yok.')
                    if not feasible
                    else _('Bazı kalemler için kaynak depoda yeterli stok yok.')
                )
                raise TransferStockValidationError(
                    msg,
                    insufficient_items=insufficient,
                    feasible_items=feasible,
                )
            if not feasible:
                raise TransferStockValidationError(
                    _('Hiçbir kalem için kaynak depoda yeterli stok yok.'),
                    insufficient_items=insufficient,
                    feasible_items=[],
                )
            items_data = feasible

        transfer.source_warehouse_id = source_id
        transfer.target_warehouse_id = target_id
        transfer.transfer_date = data['transfer_date']
        transfer.notes = data.get('notes', '') or ''
        transfer.save(
            update_fields=[
                'source_warehouse_id',
                'target_warehouse_id',
                'transfer_date',
                'notes',
                'updated_at',
            ]
        )

        transfer.items.all().delete()
        for row in items_data:
            WarehouseTransferItem.objects.create(
                transfer=transfer,
                stock_item_id=row['stock_item_id'],
                quantity=row['quantity'],
                unit=row['unit'],
                notes=row.get('notes', ''),
            )

        return transfer

    @staticmethod
    @transaction.atomic
    def approve_transfer(transfer_id, user=None) -> WarehouseTransfer:
        transfer = WarehouseTransfer.objects.select_for_update().get(id=transfer_id)
        if transfer.status not in (TransferStatus.DRAFT, TransferStatus.PENDING):
            raise ValueError(_('Sadece taslak veya bekleyen transferler onaylanabilir.'))
        TransferService._lock_source_levels_for_transfer(transfer)
        bad = TransferService.validate_existing_transfer_items_against_source(transfer)
        if bad:
            raise TransferStockValidationError(
                _('Onay için kaynak depoda yeterli stok yok.'),
                insufficient_items=bad,
                feasible_items=[],
            )
        transfer.status = TransferStatus.IN_TRANSIT
        transfer.approved_by = user
        transfer.save(update_fields=['status', 'approved_by', 'updated_at'])
        from apps.audit.services import record_audit

        branch = transfer.source_warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.transfer.approved',
            target_instance=transfer,
            after_json={'status': transfer.status},
            actor=user,
            branch=branch,
        )
        if transfer.deficiency_report_id:
            from apps.warehouse.ws_broadcast import schedule_kitchen_transfer_status_changed

            schedule_kitchen_transfer_status_changed(transfer)
        return transfer

    @staticmethod
    @transaction.atomic
    def complete_transfer(transfer_id, user=None) -> WarehouseTransfer:
        """Transferi tamamlar — kaynak depodan çıkış, hedef depoya giriş yapar."""
        transfer = WarehouseTransfer.objects.select_for_update().get(id=transfer_id)
        if transfer.status != TransferStatus.IN_TRANSIT:
            raise ValueError(_('Sadece transfer halindeki işlemler tamamlanabilir.'))

        TransferService._lock_transfer_warehouses_stock_levels(transfer)

        bad = TransferService.validate_existing_transfer_items_against_source(transfer)
        if bad:
            raise TransferStockValidationError(
                _('Tamamlama anında kaynak depoda yeterli stok yok; stok başka işlemle değişmiş olabilir.'),
                insufficient_items=bad,
                feasible_items=[],
            )

        items = transfer.items.select_related('stock_item').order_by('id').all()
        if not items.exists():
            raise ValueError(_('Transfer kalemi bulunmuyor.'))

        for item in items:
            qty_raw, line_unit = TransferService._transfer_line_outbound_raw(item)

            # Kaynak depodan stok çıkışı (deduct_stock birim dönüşümü için satır birimini kullanır)
            out_movement = InventoryService.deduct_stock(
                transfer.source_warehouse_id,
                item.stock_item_id,
                qty_raw,
                reference=f'Transfer #{transfer.transfer_number} — Çıkış',
                notes=f'Hedef: {transfer.target_warehouse.code}',
                performed_by=user,
                movement_type=StockMovementType.TRANSFER,
                unit=line_unit,
            )

            consumption_lines = [
                ConsumedLotLine(
                    lot_id=ml.stock_lot_id,
                    lot_number=ml.lot_number or "",
                    expiry_date=ml.expiry_date,
                    quantity=ml.quantity,
                    unit_price=ml.unit_price,
                )
                for ml in out_movement.lot_consumptions.filter(is_active=True)
            ]

            in_reference = f'Transfer #{transfer.transfer_number} — Giriş'
            in_notes = f'Kaynak: {transfer.source_warehouse.code}'

            if consumption_lines:
                InventoryService.receive_stock_lots(
                    transfer.target_warehouse_id,
                    item.stock_item_id,
                    consumption_lines,
                    reference=in_reference,
                    notes=in_notes,
                    performed_by=user,
                    unit=line_unit,
                )
            else:
                InventoryService.receive_stock(
                    transfer.target_warehouse_id,
                    item.stock_item_id,
                    qty_raw,
                    reference=in_reference,
                    notes=in_notes,
                    performed_by=user,
                    unit=line_unit,
                )

        transfer.status = TransferStatus.COMPLETED
        transfer.completed_date = timezone.now().date()
        transfer.save(update_fields=['status', 'completed_date', 'updated_at'])

        from apps.audit.services import record_audit

        branch = transfer.source_warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.transfer.completed',
            target_instance=transfer,
            after_json={
                'status': transfer.status,
                'completed_date': transfer.completed_date.isoformat() if transfer.completed_date else None,
            },
            actor=user,
            branch=branch,
        )

        if transfer.deficiency_report:
            report = transfer.deficiency_report
            report.status = DeficiencyReportStatus.COMMITTED
            report.save(update_fields=['status', 'updated_at'])
            from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

            schedule_deficiency_status_changed(report)

        return transfer

    @staticmethod
    @transaction.atomic
    def cancel_transfer(transfer_id) -> WarehouseTransfer:
        transfer = WarehouseTransfer.objects.select_for_update().get(id=transfer_id)
        if transfer.status in (TransferStatus.COMPLETED, TransferStatus.CANCELLED):
            raise ValueError(_('Tamamlanmış veya iptal edilmiş transferler iptal edilemez.'))
        transfer.status = TransferStatus.CANCELLED
        transfer.save(update_fields=['status', 'updated_at'])
        from apps.audit.services import record_audit

        branch = transfer.source_warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.transfer.cancelled',
            target_instance=transfer,
            after_json={'status': transfer.status},
            branch=branch,
        )
        if transfer.deficiency_report_id:
            from apps.warehouse.ws_broadcast import schedule_kitchen_transfer_status_changed

            schedule_kitchen_transfer_status_changed(transfer)
        return transfer
