"""GoodsReceivingService - Mal kabul iş mantığı — stoğa giriş yapar."""

from core.decimal_constants import ZERO_QTY
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from apps.warehouse.models import (
    GoodsReceiving,
    GoodsReceivingItem,
    GoodsReceivingStatus,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    DeficiencyReportStatus,
)
from apps.inventory.services import InventoryService
from apps.inventory.services.return_cancel_service import record_receiving_rejection


class GoodsReceivingService:
    """Mal kabul iş mantığı — stoğa giriş yapar."""

    @staticmethod
    def normalize_item_quantities(received, rejected):
        """Form miktarlarını depo alanlarına çevirir.

        UI'daki ``received_quantity`` = kabul edilen (stoğa girecek) miktar.
        ``rejected_quantity`` = reddedilen miktar. İkisi birbirinden bağımsızdır.
        """
        accepted = received or ZERO_QTY
        rejected = rejected or ZERO_QTY

        if accepted < ZERO_QTY:
            raise ValueError(_('Kabul edilen miktar negatif olamaz.'))
        if rejected < ZERO_QTY:
            raise ValueError(_('Reddedilen miktar negatif olamaz.'))

        return accepted, rejected, accepted

    @staticmethod
    @transaction.atomic
    def create_receiving(data: dict, items_data: list[dict], user=None) -> GoodsReceiving:
        data['received_by'] = user
        receiving = GoodsReceiving.objects.create(**data)

        total = ZERO_QTY
        for item_data in items_data:
            accepted, rejected, _ = GoodsReceivingService.normalize_item_quantities(
                item_data.get('received_quantity'),
                item_data.get('rejected_quantity'),
            )
            item_data['received_quantity'] = accepted
            item_data['rejected_quantity'] = rejected
            item_data['goods_receiving'] = receiving
            item = GoodsReceivingItem.objects.create(**item_data)
            total += accepted * item.unit_price

        receiving.total_amount = total
        receiving.save(update_fields=['total_amount', 'updated_at'])
        return receiving

    @staticmethod
    @transaction.atomic
    def complete_receiving(receiving_id, user=None) -> GoodsReceiving:
        """Mal kabulü tamamlar → stoğa giriş yapar + WarehouseStockLevel günceller."""
        receiving = GoodsReceiving.objects.select_for_update().get(id=receiving_id)
        if receiving.status not in (GoodsReceivingStatus.PENDING, GoodsReceivingStatus.INSPECTED):
            raise ValueError(_('Bu mal kabul zaten tamamlanmış.'))

        items = receiving.items.select_related('stock_item').all()
        has_accepted = False
        has_rejected = False

        for item in items:
            rejected_qty = item.rejected_quantity or ZERO_QTY
            accepted_qty = item.accepted_quantity

            if rejected_qty > 0:
                has_rejected = True
                record_receiving_rejection(
                    warehouse_id=receiving.warehouse_id,
                    stock_item_id=item.stock_item_id,
                    quantity=rejected_qty,
                    unit_price=item.unit_price,
                    unit=item.unit,
                    supplier_id=receiving.supplier_id,
                    purchase_order_id=receiving.purchase_order_id,
                    receiving_number=receiving.receiving_number,
                    performed_by=user,
                    notes=item.notes or '',
                )

            if accepted_qty <= 0:
                continue

            has_accepted = True

            InventoryService.receive_stock(
                receiving.warehouse_id,
                item.stock_item_id,
                accepted_qty,
                reference=f'Mal Kabul #{receiving.receiving_number}',
                notes=item.notes or '',
                performed_by=user,
                supplier_id=receiving.supplier_id,
                unit=item.unit,
                unit_price=item.unit_price,
                lot_number=(item.batch_number or '').strip(),
                expiry_date=item.expiry_date,
            )

            if receiving.purchase_order:
                po_items = PurchaseOrderItem.objects.filter(
                    purchase_order=receiving.purchase_order,
                    stock_item=item.stock_item,
                )
                for po_item in po_items:
                    po_item.received_quantity += accepted_qty
                    po_item.save(update_fields=['received_quantity', 'updated_at'])

        if has_accepted and not has_rejected:
            receiving.status = GoodsReceivingStatus.ACCEPTED
        elif has_accepted and has_rejected:
            receiving.status = GoodsReceivingStatus.PARTIALLY_ACCEPTED
        elif has_rejected:
            receiving.status = GoodsReceivingStatus.REJECTED
        else:
            raise ValueError(_('Kabul veya red miktarı girilmemiş.'))

        receiving.inspected_by = user
        receiving.save(update_fields=['status', 'inspected_by', 'updated_at'])

        if receiving.purchase_order:
            GoodsReceivingService._update_po_status(receiving.purchase_order)

        from apps.audit.services import record_audit

        branch = receiving.warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.goods_receiving.completed',
            target_instance=receiving,
            after_json={
                'status': receiving.status,
                'receiving_number': receiving.receiving_number,
                'total_amount': str(receiving.total_amount),
            },
            actor=user,
            branch=branch,
        )

        return receiving

    @staticmethod
    def _update_po_status(purchase_order: PurchaseOrder) -> None:
        """PO kalemleri kontrol edip durum ve teslim tutarını günceller."""
        items = purchase_order.items.filter(is_active=True)
        all_received = all(item.is_fully_received for item in items)
        any_received = any((item.received_quantity or ZERO_QTY) > ZERO_QTY for item in items)

        if all_received:
            purchase_order.status = PurchaseOrderStatus.RECEIVED
        elif any_received:
            purchase_order.status = PurchaseOrderStatus.PARTIALLY_RECEIVED

        update_fields = ['status', 'updated_at']
        if any_received:
            received_total = sum(
                (item.received_quantity or ZERO_QTY) * (item.unit_price or ZERO_QTY)
                for item in items
            )
            purchase_order.total_amount = received_total
            update_fields.append('total_amount')

        purchase_order.save(update_fields=update_fields)

        if purchase_order.deficiency_report:
            report = purchase_order.deficiency_report
            old_status = report.status
            if purchase_order.status == PurchaseOrderStatus.RECEIVED:
                report.status = DeficiencyReportStatus.COMMITTED
            elif purchase_order.status == PurchaseOrderStatus.PARTIALLY_RECEIVED:
                report.status = DeficiencyReportStatus.PARTIALLY_COMMITTED

            if old_status != report.status:
                report.save(update_fields=['status', 'updated_at'])
                from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

                schedule_deficiency_status_changed(report)

    @staticmethod
    @transaction.atomic
    def delete_receiving(receiving_id, user=None) -> None:
        """Bekleyen mal kabul kaydını soft-delete eder."""
        del user
        receiving = GoodsReceiving.objects.select_for_update().get(
            id=receiving_id,
            is_active=True,
        )
        if receiving.status != GoodsReceivingStatus.PENDING:
            raise ValueError(_('Tamamlanmış mal kabul kayıtları silinemez.'))

        for item in receiving.items.filter(is_active=True):
            item.delete()
        receiving.delete()
