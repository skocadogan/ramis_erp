"""FulfillmentService - Eksik listelerinin şubedeki diğer depolardan karşılanmasını yönetir."""

from decimal import Decimal
from collections import defaultdict
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.warehouse.models import (
    DeficiencyReport,
    DeficiencyReportStatus,
    Warehouse,
    WarehouseStockLevel,
)
from .transfer_service import TransferService


class DeficiencyFulfillmentService:
    """Eksik listelerinin şubedeki diğer depolardan karşılanmasını (Auto-Fulfill) yönetir."""

    @staticmethod
    def get_availability(report_id) -> list[dict]:
        """İlgili rapor için mutfak deposu dışındaki tedarik depolarındaki stok miktarını hesaplar."""
        report = DeficiencyReport.objects.prefetch_related('items__stock_item').get(id=report_id)
        kitchen_branch = report.kitchen_station.branch_id

        # Mutfak hariç aynı şubedeki diğer aktif depolar (Soğuk, Kuru, Sarf vb.)
        supply_warehouses = Warehouse.objects.filter(
            branches__id=kitchen_branch,
            is_active=True
        ).exclude(warehouse_type='KITCHEN')

        availability_data = []
        for item in report.items.all():
            stock_levels = WarehouseStockLevel.objects.filter(
                stock_item=item.stock_item,
                warehouse__in=supply_warehouses,
                quantity__gt=0
            ).select_related('warehouse')

            total_available = sum(sl.quantity for sl in stock_levels)
            warehouses_info = [
                {
                    'warehouse_id': str(sl.warehouse.id),
                    'warehouse_name': sl.warehouse.name,
                    'available_quantity': str(sl.quantity)
                } for sl in stock_levels
            ]

            req_qty = item.quantity
            can_fully_fulfill = total_available >= req_qty
            can_partially_fulfill = total_available > 0 and not can_fully_fulfill

            availability_data.append({
                'item_id': str(item.id),
                'stock_item_id': str(item.stock_item.id),
                'stock_item_name': item.stock_item.name,
                'required_quantity': str(req_qty),
                'total_available': str(total_available),
                'can_fully_fulfill': can_fully_fulfill,
                'can_partially_fulfill': can_partially_fulfill,
                'warehouses': warehouses_info
            })

        return availability_data

    @staticmethod
    def _get_supply_warehouses(report: DeficiencyReport) -> Warehouse:
        """
        Mutfak deposu dışındaki tedarik depolarını getirir.
        Soğuk, Kuru, Sarf vb. depolar dahil edilir.
        """
        kitchen_branch = report.kitchen_station.branch_id
        return Warehouse.objects.filter(
            branches__id=kitchen_branch,
            is_active=True
        ).exclude(warehouse_type='KITCHEN')

    @staticmethod
    def _calculate_allocations(report: DeficiencyReport, availability: list[dict]) -> defaultdict:
        """
        Mevcut stoklara göre hangi depo kaynaklı ne kadar ürün ayrılacak hesaplar.
        Returns: allocations_by_warehouse dict (warehouse_id -> list of allocation dicts)
        """
        targets = {str(item.id): item.quantity for item in report.items.all()}
        return DeficiencyFulfillmentService.calculate_allocations_for_targets(
            report,
            availability,
            targets,
        )

    @staticmethod
    def calculate_allocations_for_targets(
        report: DeficiencyReport,
        availability: list[dict],
        targets: dict[str, Decimal],
    ) -> defaultdict:
        """Belirli kalemler için hedef transfer miktarına göre depo tahsisleri."""
        allocations_by_warehouse = defaultdict(list)
        items_by_id = {str(item.id): item for item in report.items.all()}

        for item_id, target_qty in targets.items():
            item = items_by_id.get(str(item_id))
            if not item or target_qty <= 0:
                continue
            item_avail = next((a for a in availability if a['item_id'] == str(item_id)), None)
            if not item_avail or not item_avail.get('warehouses'):
                continue

            remaining_to_allocate = target_qty
            for wh in item_avail['warehouses']:
                if remaining_to_allocate <= 0:
                    break
                wh_qty = Decimal(wh['available_quantity'])
                allocated = min(wh_qty, remaining_to_allocate)
                if allocated <= 0:
                    continue
                remaining_to_allocate -= allocated

                allocations_by_warehouse[wh['warehouse_id']].append(
                    {
                        'stock_item_id': item.stock_item_id,
                        'quantity': allocated,
                        'unit': item.unit,
                        'report_item': item,
                    },
                )

        return allocations_by_warehouse

    @staticmethod
    def warehouse_names_for_ids(warehouse_ids) -> dict[str, str]:
        from apps.warehouse.models import Warehouse

        ids = [wid for wid in warehouse_ids if wid]
        if not ids:
            return {}
        return {
            str(w.id): w.name
            for w in Warehouse.objects.filter(id__in=ids, is_active=True)
        }

    @staticmethod
    def create_transfers_for_allocations(
        report: DeficiencyReport,
        allocations_by_warehouse: defaultdict,
        user=None,
    ) -> list:
        """Ayrımlar için transferleri oluşturur ve onaylar."""
        return DeficiencyFulfillmentService._create_transfers_for_allocations(
            report,
            allocations_by_warehouse,
            user,
        )

    @staticmethod
    def _create_transfers_for_allocations(
        report: DeficiencyReport,
        allocations_by_warehouse: defaultdict,
        user=None
    ) -> list:
        """
        Ayrımlar için transferler oluşturur ve onaylar.
        Returns: created_transfers list
        """
        created_transfers = []

        for root_wh_id, alloc_items in allocations_by_warehouse.items():
            # O depo için bir transfer oluştur
            data = {
                'source_warehouse_id': root_wh_id,
                'target_warehouse_id': report.target_warehouse_id,
                'transfer_date': timezone.now().date(),
                'notes': f"Eksik Listesi #{report.report_number} üzerinden otomatik karşılandı.",
            }
            items_data = [
                {
                    'stock_item_id': a['stock_item_id'],
                    'quantity': a['quantity'],
                    'unit': a['unit'],
                    'notes': ''
                } for a in alloc_items
            ]
            transfer = TransferService.create_transfer(data, items_data, user)
            transfer.deficiency_report = report
            transfer.save(update_fields=['deficiency_report'])
            created_transfers.append(transfer)

            # Transferi anında onayla
            TransferService.approve_transfer(transfer.id, user)

        return created_transfers

    @staticmethod
    def _update_report_with_fulfillments(
        report: DeficiencyReport,
        allocations_by_warehouse: defaultdict
    ) -> None:
        """
        Transfer sonrası raporu günceller ve 0 kalan kalemleri siler.
        Rapor durumunu (COMMITTED/APPROVED) ayarlar.
        """
        # Orijinal listeden düşelim
        for root_wh_id, alloc_items in allocations_by_warehouse.items():
            for a in alloc_items:
                report_item = a['report_item']
                report_item.quantity -= a['quantity']

        # Güncellenen kalemleri kaydet, 0 olanları sil
        any_remaining = False
        for item in report.items.all():
            if item.quantity <= 0:
                item.delete()
            else:
                item.save()
                any_remaining = True

        # Rapor durumu
        if not any_remaining:
            # Tüm liste bitti!
            report.status = DeficiencyReportStatus.COMMITTED
            report.save(update_fields=['status'])
        else:
            # Geriye alınacaklar kaldı
            if report.status == DeficiencyReportStatus.PENDING:
                report.status = DeficiencyReportStatus.APPROVED
            report.save(update_fields=['status'])

    @staticmethod
    @transaction.atomic
    def auto_fulfill(report_id, user=None) -> list:
        """Mevcut stoklara göre transferleri oluşturur ve raporu günceller."""
        report = DeficiencyReport.objects.select_for_update().prefetch_related('items').get(id=report_id)
        if report.status not in (DeficiencyReportStatus.PENDING, DeficiencyReportStatus.APPROVED):
            raise ValueError(_('Sadece bekleyen veya onaylı raporlardan otomatik karşılama yapılabilir.'))

        # Adım 1: Mevcut stokları hesapla
        availability = DeficiencyFulfillmentService.get_availability(report_id)

        # Adım 2: Hangi depo kaynaklı ne kadar ürün ayrılacak hesapla
        allocations_by_warehouse = DeficiencyFulfillmentService._calculate_allocations(
            report, availability
        )

        if not allocations_by_warehouse:
            raise ValueError(_('Herhangi bir tedarik deposunda mevcut stok bulunamadı.'))

        # Adım 3: Transferleri oluştur ve onayla
        created_transfers = DeficiencyFulfillmentService._create_transfers_for_allocations(
            report, allocations_by_warehouse, user
        )

        # Adım 4: Raporu güncelle
        DeficiencyFulfillmentService._update_report_with_fulfillments(
            report, allocations_by_warehouse
        )

        # WebSocket bildirimi
        from apps.warehouse.ws_broadcast import schedule_deficiency_status_changed
        schedule_deficiency_status_changed(report)

        return created_transfers
