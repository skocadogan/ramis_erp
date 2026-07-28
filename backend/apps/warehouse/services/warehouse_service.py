"""WarehouseService - Depo CRUD ve stok seviyesi iş mantığı."""

from decimal import Decimal
from django.db import transaction

from apps.warehouse.models import Warehouse, WarehouseStockLevel
from apps.inventory.stock_minimum import ZERO_QTY, normalize_minimum_quantity


class WarehouseService:
    """Depo CRUD ve stok seviyesi iş mantığı."""

    @staticmethod
    @transaction.atomic
    def create_warehouse(data: dict) -> Warehouse:
        """Yeni depo oluşturur. Şubelerde varsayılan depo yoksa otomatik varsayılan yapar."""
        branches = data.pop('branches', [])
        is_default = data.get('is_default', False)

        # Eğer is_default ise veya seçilen şubelerin hiçbirinde varsayılan depo yoksa is_default yap
        if is_default:
            Warehouse.objects.filter(branches__id__in=[b.id for b in branches], is_default=True).update(is_default=False)
        else:
            # Seçilen şubelerden herhangi birinde varsayılan depo yoksa bu depoyu varsayılan yap (basitleştirilmiş mantık)
            has_default = Warehouse.objects.filter(branches__id__in=[b.id for b in branches], is_default=True).exists()
            if not has_default and branches:
                data['is_default'] = True

        warehouse = Warehouse.objects.create(**data)
        if branches:
            warehouse.branches.set(branches)

        return warehouse

    @staticmethod
    @transaction.atomic
    def update_warehouse(warehouse_id, data: dict) -> Warehouse:
        warehouse = Warehouse.objects.get(id=warehouse_id)
        branches = data.pop('branches', None)
        is_default = data.pop('is_default', None)

        for attr, value in data.items():
            setattr(warehouse, attr, value)

        if branches is not None:
            warehouse.branches.set(branches)

        if is_default is True:
            # Bu deponun bağlı olduğu tüm şubelerdeki diğer varsayılan depoları iptal et
            current_branches = warehouse.branches.all()
            Warehouse.objects.filter(branches__id__in=[b.id for b in current_branches], is_default=True).update(is_default=False)
            warehouse.is_default = True
        elif is_default is False:
            warehouse.is_default = False

        warehouse.save()
        return warehouse

    @staticmethod
    @transaction.atomic
    def delete_warehouse(warehouse_id) -> None:
        warehouse = Warehouse.objects.get(id=warehouse_id)
        warehouse.delete()

    @staticmethod
    @transaction.atomic
    def update_stock_level(warehouse_id, stock_item_id, quantity_delta: Decimal) -> WarehouseStockLevel:
        """Depo stok seviyesini güncellerken WarehouseStockLevel kaydını kilitler."""
        level, created = WarehouseStockLevel.objects.select_for_update().get_or_create(
            warehouse_id=warehouse_id,
            stock_item_id=stock_item_id,
            defaults={'quantity': ZERO_QTY, 'minimum_quantity': ZERO_QTY},
        )
        level.quantity += quantity_delta
        level.save(update_fields=['quantity', 'updated_at'])
        return level

    @staticmethod
    @transaction.atomic
    def set_minimum_quantity(warehouse_id, stock_item_id, minimum_quantity: Decimal) -> WarehouseStockLevel:
        """Depo bazlı minimum stok eşiğini ayarlar (-1 = sınırsız)."""
        minimum_quantity = normalize_minimum_quantity(minimum_quantity)
        level, _ = WarehouseStockLevel.objects.select_for_update().get_or_create(
            warehouse_id=warehouse_id,
            stock_item_id=stock_item_id,
            defaults={'quantity': ZERO_QTY, 'minimum_quantity': ZERO_QTY},
        )
        level.minimum_quantity = minimum_quantity
        level.save(update_fields=['minimum_quantity', 'updated_at'])
        return level
