"""KitchenClosingService - Gün sonu mutfak kapanış sayımı hizmeti."""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import StockMovement, StockMovementType
from apps.warehouse.models import WarehouseStockLevel
from core.quantity_format import format_quantity_display

from .inventory_services import InsufficientStockError, InventoryService


class KitchenClosingService:
    """
    Gün sonu mutfak kapanış sayımı: Aşçı sadece o gün hareket gören
    ürünleri sayarak firelerin sistemce otomatik kaydedilmesini sağlar.
    """

    @staticmethod
    def get_daily_active_items(warehouse_id):
        """
        Belirtilen mutfak deposunda bugün hareket gören
        (tüketilen, transfer edilen, girişi yapılan) stok kalemlerini döndürür.
        Aşçının sayacağı kısa listeyi üretir.
        """
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        # Bugün hareket gören stok kalemlerinin ID'leri
        moved_item_ids = StockMovement.objects.filter(
            warehouse_id=warehouse_id,
            created_at__gte=today_start,
        ).values_list('stock_item_id', flat=True).distinct()

        # Bu kalemlerin güncel depo seviyelerini getir (teorik stok)
        levels = WarehouseStockLevel.objects.filter(
            warehouse_id=warehouse_id,
            stock_item_id__in=moved_item_ids,
            is_active=True,
        ).select_related('stock_item')

        return [
            {
                'stock_item_id': str(level.stock_item_id),
                'stock_item_name': level.stock_item.name,
                'stock_item_sku': level.stock_item.sku,
                'unit': level.stock_item.unit,
                'theoretical_quantity': format_quantity_display(level.quantity),
                'counted_quantity': None,  # Aşçı tarafından doldurulacak
            }
            for level in levels
        ]

    @staticmethod
    @transaction.atomic
    def submit_closing_count(
        warehouse_id,
        items: list[dict],
        performed_by=None,
    ) -> list[StockMovement]:
        """
        Aşçının girdiği sayım verilerini işler.
        Teorik stok ile gerçek sayım arasındaki farkı WASTE olarak kaydeder.
        """
        waste_movements = []

        for entry in items:
            stock_item_id = entry['stock_item_id']
            counted = Decimal(str(entry['counted_quantity']))

            level = WarehouseStockLevel.objects.select_for_update().filter(
                warehouse_id=warehouse_id,
                stock_item_id=stock_item_id,
                is_active=True,
            ).first()

            if not level:
                continue

            theoretical = level.quantity
            difference = theoretical - counted  # Pozitif ise fire var

            if difference <= 0:
                # Sayılan >= teorik: Fire yok, gerekirse düzeltme yapılabilir
                continue

            # Fark = fire olarak kaydet
            try:
                movement = InventoryService.deduct_stock(
                    warehouse_id=warehouse_id,
                    stock_item_id=stock_item_id,
                    quantity=difference,
                    reference='Gün Sonu Kapanış Sayımı',
                    notes=(
                        f'Teorik: {format_quantity_display(theoretical)}, '
                        f'Sayılan: {format_quantity_display(counted)}, '
                        f'Fire: {format_quantity_display(difference)}'
                    ),
                    performed_by=performed_by,
                    movement_type=StockMovementType.WASTE,
                )
                waste_movements.append(movement)
            except InsufficientStockError:
                # Fire miktarı teorikten büyük olduğunda veya stok yetersizse
                pass

        return waste_movements
