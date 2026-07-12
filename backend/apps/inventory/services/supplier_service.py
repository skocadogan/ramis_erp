"""SupplierService - Tedarikçi iş mantığı."""

from django.db import transaction

from apps.inventory.models import Supplier


class SupplierService:
    """Tedarikçi iş mantığı."""

    @staticmethod
    @transaction.atomic
    def create_supplier(data: dict) -> Supplier:
        stock_items = data.pop('stock_items', [])
        supplier = Supplier.objects.create(**data)
        if stock_items:
            supplier.stock_items.set(stock_items)
        return supplier

    @staticmethod
    @transaction.atomic
    def update_supplier(supplier_id, data: dict) -> Supplier:
        stock_items = data.pop('stock_items', None)
        supplier = Supplier.objects.get(id=supplier_id)
        
        for attr, value in data.items():
            setattr(supplier, attr, value)
        
        supplier.save()
        
        if stock_items is not None:
            supplier.stock_items.set(stock_items)
            
        return supplier

    @staticmethod
    @transaction.atomic
    def delete_supplier(supplier_id) -> None:
        supplier = Supplier.objects.get(id=supplier_id)
        supplier.is_active = False
        supplier.save(update_fields=['is_active', 'updated_at'])
