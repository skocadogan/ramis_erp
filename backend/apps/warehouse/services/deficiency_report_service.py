"""DeficiencyReportService - Eksik listesi oluşturma ve yaşam döngüsü."""

from core.decimal_constants import ZERO_QTY
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.branches.models import KitchenStation
from apps.inventory.models import StockItem
from apps.inventory.stock_minimum import ZERO_QTY
from core.branch_scope import user_accessible_warehouse_id_strings

from apps.warehouse.models import (
    DeficiencyReport,
    DeficiencyReportItem,
    DeficiencyReportStatus,
    PurchaseOrderStatus,
)
from .purchase_order_service import PurchaseOrderService
from .transfer_service import TransferService
from .fulfillment_service import DeficiencyFulfillmentService


class DeficiencyReportService:
    """Eksik listesi iş mantığı."""

    @staticmethod
    def _assert_target_warehouse_access(user, warehouse_id) -> None:
        allowed = user_accessible_warehouse_id_strings(user)
        if allowed is None:
            return
        if not allowed or str(warehouse_id) not in allowed:
            raise ValueError(_('Bu depo için eksik listesi oluşturma yetkiniz yok.'))

    @staticmethod
    def _resolve_target_warehouse(kitchen_station_id):
        try:
            station = (
                KitchenStation.objects.select_related('warehouse', 'branch')
                .get(id=kitchen_station_id, is_active=True)
            )
        except (KitchenStation.DoesNotExist, ValueError, TypeError):
            raise ValueError(_('Geçersiz mutfak istasyonu.')) from None

        if not station.warehouse_id:
            raise ValueError(_('Seçilen istasyona bağlı depo tanımlı değil.'))

        return station, station.warehouse

    @staticmethod
    @transaction.atomic
    def create_report(
        *,
        kitchen_station_id,
        notes: str = '',
        items: list[dict],
        user=None,
    ) -> DeficiencyReport:
        station, target_warehouse = DeficiencyReportService._resolve_target_warehouse(
            kitchen_station_id,
        )
        DeficiencyReportService._assert_target_warehouse_access(user, target_warehouse.id)

        report = DeficiencyReport.objects.create(
            kitchen_station=station,
            target_warehouse=target_warehouse,
            status=DeficiencyReportStatus.PENDING,
            notes=notes or None,
            created_by=user,
        )

        stock_ids = [row['stock_item_id'] for row in items]
        stock_items = {
            item.id: item
            for item in StockItem.objects.filter(id__in=stock_ids, is_active=True)
        }
        if len(stock_items) != len(set(stock_ids)):
            raise ValueError(_('Geçersiz veya pasif stok kalemi seçildi.'))

        for row in items:
            DeficiencyReportItem.objects.create(
                report=report,
                stock_item=stock_items[row['stock_item_id']],
                quantity=Decimal(str(row['quantity'])),
                unit=row['unit'],
                notes=row.get('notes') or None,
            )

        from apps.warehouse.ws_broadcast import schedule_deficiency_created

        schedule_deficiency_created(report)
        return report

    @staticmethod
    @transaction.atomic
    def approve_report(report_id, user=None) -> DeficiencyReport:
        report = DeficiencyReport.objects.select_for_update().get(id=report_id)
        if report.status != DeficiencyReportStatus.PENDING:
            raise ValueError(_('Sadece bekleyen raporlar onaylanabilir.'))

        report.status = DeficiencyReportStatus.APPROVED
        report.approved_by = user
        report.approved_at = timezone.now()
        report.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

        from apps.audit.services import record_audit

        branch = report.target_warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.deficiency_report.approved',
            target_instance=report,
            after_json={'status': report.status, 'report_number': report.report_number},
            actor=user,
            branch=branch,
        )

        from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

        schedule_deficiency_status_changed(report)
        return report

    @staticmethod
    @transaction.atomic
    def cancel_report(report_id, user=None) -> DeficiencyReport:
        del user
        report = DeficiencyReport.objects.select_for_update().get(id=report_id)
        if report.status in (
            DeficiencyReportStatus.COMMITTED,
            DeficiencyReportStatus.CANCELLED,
        ):
            raise ValueError(_('Bu rapor iptal edilemez.'))

        report.status = DeficiencyReportStatus.CANCELLED
        report.save(update_fields=['status', 'updated_at'])

        from apps.audit.services import record_audit

        branch = report.target_warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.deficiency_report.cancelled',
            target_instance=report,
            after_json={'status': report.status, 'report_number': report.report_number},
            actor=user,
            branch=branch,
        )

        from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

        schedule_deficiency_status_changed(report)
        return report

    @staticmethod
    @transaction.atomic
    def delete_report(report_id, user=None) -> None:
        del user
        report = DeficiencyReport.objects.select_for_update().prefetch_related(
            'purchase_orders', 'transfers',
        ).get(id=report_id)

        if report.status in (
            DeficiencyReportStatus.ORDERED,
            DeficiencyReportStatus.PARTIALLY_COMMITTED,
            DeficiencyReportStatus.COMMITTED,
        ):
            raise ValueError(_('İşlenmiş raporlar silinemez.'))

        if report.status == DeficiencyReportStatus.APPROVED:
            if report.purchase_orders.filter(is_active=True).exists() or report.transfers.filter(
                is_active=True,
            ).exists():
                raise ValueError(_('Bağlı sipariş veya transfer varken rapor silinemez.'))

        report.delete()

    @staticmethod
    @transaction.atomic
    def create_purchase_order(report_id, supplier_id, warehouse_id, user=None):
        report = (
            DeficiencyReport.objects.select_for_update()
            .prefetch_related('items__stock_item')
            .get(id=report_id)
        )
        if report.status not in (
            DeficiencyReportStatus.PENDING,
            DeficiencyReportStatus.APPROVED,
        ):
            raise ValueError(_('Bu rapordan sipariş oluşturulamaz.'))

        DeficiencyReportService._assert_target_warehouse_access(user, warehouse_id)

        items_data = [
            {
                'stock_item_id': item.stock_item_id,
                'quantity': item.quantity,
                'unit': item.unit,
                'unit_price': item.stock_item.last_purchase_price or ZERO_QTY,
                'notes': item.notes or '',
            }
            for item in report.items.all()
        ]
        if not items_data:
            raise ValueError(_('Rapor kalemi bulunmuyor.'))

        po = PurchaseOrderService.create_order(
            {
                'supplier_id': supplier_id,
                'warehouse_id': warehouse_id,
                'status': PurchaseOrderStatus.DRAFT,
                'order_date': timezone.now().date(),
                'deficiency_report': report,
                'notes': _('Eksik Listesi #%(number)s') % {'number': report.report_number},
            },
            items_data,
            user=user,
        )

        report.status = DeficiencyReportStatus.ORDERED
        report.save(update_fields=['status', 'updated_at'])

        from apps.audit.services import record_audit

        branch = po.warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.deficiency_report.ordered',
            target_instance=report,
            after_json={
                'report_number': report.report_number,
                'purchase_order_id': str(po.id),
                'purchase_order_number': po.order_number,
            },
            actor=user,
            branch=branch,
        )

        from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

        schedule_deficiency_status_changed(report)
        return po

    @staticmethod
    @transaction.atomic
    def create_transfer(report_id, source_warehouse_id, user=None):
        report = DeficiencyReport.objects.prefetch_related('items').get(id=report_id)
        if report.status not in (
            DeficiencyReportStatus.PENDING,
            DeficiencyReportStatus.APPROVED,
        ):
            raise ValueError(_('Bu rapordan transfer oluşturulamaz.'))

        DeficiencyReportService._assert_target_warehouse_access(user, report.target_warehouse_id)

        items_data = [
            {
                'stock_item_id': item.stock_item_id,
                'quantity': item.quantity,
                'unit': item.unit,
                'notes': item.notes or '',
            }
            for item in report.items.all()
        ]
        if not items_data:
            raise ValueError(_('Rapor kalemi bulunmuyor.'))

        transfer = TransferService.create_transfer(
            {
                'source_warehouse_id': source_warehouse_id,
                'target_warehouse_id': report.target_warehouse_id,
                'transfer_date': timezone.now().date(),
                'notes': _('Eksik Listesi #%(number)s') % {'number': report.report_number},
            },
            items_data,
            user=user,
        )
        transfer.deficiency_report = report
        transfer.save(update_fields=['deficiency_report'])

        if report.status == DeficiencyReportStatus.PENDING:
            report.status = DeficiencyReportStatus.APPROVED
            report.approved_by = user
            report.approved_at = timezone.now()
            report.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])

            from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed

            schedule_deficiency_status_changed(report)

        return transfer

    @staticmethod
    def get_availability(report_id) -> list[dict]:
        return DeficiencyFulfillmentService.get_availability(report_id)

    @staticmethod
    def auto_fulfill(report_id, user=None) -> list:
        return DeficiencyFulfillmentService.auto_fulfill(report_id, user=user)
