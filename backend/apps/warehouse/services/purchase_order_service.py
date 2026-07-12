"""PurchaseOrderService - Satın alma siparişi iş mantığı."""

from decimal import Decimal, ROUND_UP
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from core.decimal_constants import ZERO_QTY

from apps.warehouse.models import (
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseOrderStatus,
    WarehouseStockLevel,
)
from apps.inventory.models import StockItem
from apps.inventory.stock_minimum import q_low_stock_warehouse_level

# Taslak dışı; `edit_purchase_order_post_approval` ile düzenlenebilen durumlar (teslim/iptal hariç)
_EXTENDED_PO_EDIT_STATUSES = frozenset(
    (
        PurchaseOrderStatus.PENDING,
        PurchaseOrderStatus.APPROVED,
        PurchaseOrderStatus.ORDERED,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
    ),
)


class PurchaseOrderService:
    """Satın alma siparişi iş mantığı."""

    @staticmethod
    def _get_low_stock_levels(warehouse_id):
        """Depo için düşük stok seviyelerini döndürür (quantity < minimum_quantity)."""
        return (
            WarehouseStockLevel.objects.select_related("stock_item")
            .filter(warehouse_id=warehouse_id, is_active=True)
            .filter(q_low_stock_warehouse_level())
            .order_by("stock_item__name")
        )

    @staticmethod
    def _get_needed(lvl) -> Decimal:
        """Minimum eşiği karşılamak için gereken miktarı hesaplar.
        Ondalık artıkları önlemek için sonuç 2 ondalık basamağa yuvarlanır (üste).
        """
        needed = lvl.minimum_quantity - lvl.quantity
        if needed < Decimal("0"):
            return Decimal("0")
        if needed == Decimal("0"):
            return lvl.minimum_quantity.quantize(Decimal("0.01"), rounding=ROUND_UP)
        return needed.quantize(Decimal("0.01"), rounding=ROUND_UP)

    @staticmethod
    def preview_suggestions(warehouse_id) -> dict:
        """
        PO oluşturmadan önizleme analizi döndürür.
        Returns: {
            'suggestions': [{
                'stock_item_id': str, 'stock_item_name': str,
                'needed': str, 'unit': str,
                'suppliers': [{'id': str, 'name': str}],
                'has_conflict': bool,  # birden fazla tedarikçi var
            }],
            'skipped_items': [{'id', 'name', 'quantity', 'minimum_quantity', 'unit'}],
            'has_conflicts': bool,
        }
        """
        levels = PurchaseOrderService._get_low_stock_levels(warehouse_id)
        stock_item_ids = [lvl.stock_item_id for lvl in levels]
        items_qs = StockItem.objects.filter(id__in=stock_item_ids).prefetch_related("suppliers")
        suppliers_by_item = {i.id: list(i.suppliers.all()) for i in items_qs}

        suggestions = []
        skipped_items = []
        has_conflicts = False

        for lvl in levels:
            suppliers = suppliers_by_item.get(lvl.stock_item_id, [])
            if not suppliers:
                skipped_items.append({
                    "id": str(lvl.stock_item_id),
                    "name": lvl.stock_item.name,
                    "quantity": str(lvl.quantity),
                    "minimum_quantity": str(lvl.minimum_quantity),
                    "unit": lvl.stock_item.unit,
                })
                continue
            needed = PurchaseOrderService._get_needed(lvl)
            if needed == Decimal("0"):
                continue
            item_has_conflict = len(suppliers) > 1
            if item_has_conflict:
                has_conflicts = True
            suggestions.append({
                "stock_item_id": str(lvl.stock_item_id),
                "stock_item_name": lvl.stock_item.name,
                "needed": str(needed),
                "unit": lvl.stock_item.unit,
                "suppliers": [{"id": str(s.id), "name": s.name} for s in suppliers],
                "has_conflict": item_has_conflict,
            })

        return {
            "suggestions": suggestions,
            "skipped_items": skipped_items,
            "has_conflicts": has_conflicts,
        }

    @staticmethod
    @transaction.atomic
    def suggest_orders_for_warehouse(warehouse_id, user=None, preferred_suppliers: dict | None = None) -> dict:
        """
        Depo bazında düşük stok kalemlerinden PO taslakları üretir.
        - preferred_suppliers: {str(stock_item_id): str(supplier_id)} — birden fazla tedarikçi olan
          kalemler için kullanıcı seçimi.
        - Minimum eşiğe tamamlayacak kadar miktar önerilir.
        Returns: {'orders': list[PurchaseOrder], 'skipped_items': [...]}
        """
        levels = PurchaseOrderService._get_low_stock_levels(warehouse_id)
        stock_item_ids = [lvl.stock_item_id for lvl in levels]
        items_qs = StockItem.objects.filter(id__in=stock_item_ids).prefetch_related("suppliers")
        suppliers_by_item = {i.id: list(i.suppliers.all()) for i in items_qs}

        by_supplier: dict[str, list[dict]] = {}
        skipped_items: list[dict] = []

        for lvl in levels:
            suppliers = suppliers_by_item.get(lvl.stock_item_id, [])
            if not suppliers:
                skipped_items.append({
                    "id": str(lvl.stock_item_id),
                    "name": lvl.stock_item.name,
                    "quantity": str(lvl.quantity),
                    "minimum_quantity": str(lvl.minimum_quantity),
                    "unit": lvl.stock_item.unit,
                })
                continue

            # Tedarikçi belirle: kullanıcı tercihi > ilk kayıtlı
            item_id_str = str(lvl.stock_item_id)
            preferred_id = (preferred_suppliers or {}).get(item_id_str)
            if preferred_id:
                supplier = next((s for s in suppliers if str(s.id) == preferred_id), suppliers[0])
            else:
                supplier = suppliers[0]

            needed = PurchaseOrderService._get_needed(lvl)
            if needed == Decimal("0"):
                continue

            by_supplier.setdefault(str(supplier.id), []).append({
                "stock_item_id": lvl.stock_item_id,
                "quantity": needed,
                "unit": lvl.stock_item.unit,
                "unit_price": lvl.stock_item.last_purchase_price or ZERO_QTY,
                "notes": "Otomatik öneri (minimum eşiğe tamamlama)",
            })

        created: list[PurchaseOrder] = []
        for supplier_id, items_data in by_supplier.items():
            po = PurchaseOrder.objects.create(
                supplier_id=supplier_id,
                warehouse_id=warehouse_id,
                status=PurchaseOrderStatus.DRAFT,
                order_date=timezone.now().date(),
                created_by=user,
                notes="Otomatik öneri: düşük stok kalemleri",
            )
            total = ZERO_QTY
            for item_data in items_data:
                poi = PurchaseOrderItem.objects.create(purchase_order=po, **item_data)
                total += poi.quantity * poi.unit_price
            po.total_amount = total
            po.save(update_fields=["total_amount", "updated_at"])
            created.append(po)

        return {"orders": created, "skipped_items": skipped_items}

    @staticmethod
    @transaction.atomic
    def create_order(data: dict, items_data: list[dict], user=None) -> PurchaseOrder:
        data['created_by'] = user
        order = PurchaseOrder.objects.create(**data)

        total = ZERO_QTY
        for item_data in items_data:
            item_data['purchase_order'] = order
            item = PurchaseOrderItem.objects.create(**item_data)
            total += item.quantity * item.unit_price

        order.total_amount = total
        order.save(update_fields=['total_amount', 'updated_at'])
        return order

    @staticmethod
    @transaction.atomic
    def update_order(
        order_id,
        data: dict,
        items_data: list[dict] | None = None,
        *,
        allow_edit_after_approval: bool = False,
    ) -> PurchaseOrder:
        order = PurchaseOrder.objects.select_for_update().get(id=order_id)
        st = order.status

        if st == PurchaseOrderStatus.DRAFT:
            pass
        elif st in _EXTENDED_PO_EDIT_STATUSES:
            if not allow_edit_after_approval:
                raise ValueError(
                    _(
                        'Onay bekleyen veya onaylanmış siparişleri düzenlemek için '
                        '"Sipariş Düzenleme" yetkisi gerekir.',
                    ),
                )
        else:
            raise ValueError(_('Bu durumdaki satın alma siparişi düzenlenemez.'))

        for attr, value in data.items():
            setattr(order, attr, value)

        if items_data is not None:
            order.items.all().delete()
            total = ZERO_QTY
            for item_data in items_data:
                item_data['purchase_order'] = order
                item = PurchaseOrderItem.objects.create(**item_data)
                total += item.quantity * item.unit_price
            order.total_amount = total

        order.save()
        return order

    @staticmethod
    @transaction.atomic
    def submit_for_approval(order_id) -> PurchaseOrder:
        order = PurchaseOrder.objects.select_for_update().get(id=order_id)
        if order.status != PurchaseOrderStatus.DRAFT:
            raise ValueError(_('Sadece taslak siparişler onaya gönderilebilir.'))
        order.status = PurchaseOrderStatus.PENDING
        order.save(update_fields=['status', 'updated_at'])
        return order

    @staticmethod
    @transaction.atomic
    def approve_order(order_id, user=None) -> PurchaseOrder:
        order = PurchaseOrder.objects.select_for_update().get(id=order_id)
        if order.status != PurchaseOrderStatus.PENDING:
            raise ValueError(_('Sadece onay bekleyen siparişler onaylanabilir.'))
        order.status = PurchaseOrderStatus.APPROVED
        order.approved_by = user
        order.approved_at = timezone.now()
        order.save(update_fields=['status', 'approved_by', 'approved_at', 'updated_at'])
        from apps.audit.services import record_audit

        branch = order.warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.purchase_order.approved',
            target_instance=order,
            after_json={'status': order.status, 'order_number': order.order_number},
            actor=user,
            branch=branch,
        )
        return order

    @staticmethod
    @transaction.atomic
    def mark_ordered(order_id) -> PurchaseOrder:
        order = PurchaseOrder.objects.select_for_update().get(id=order_id)
        if order.status != PurchaseOrderStatus.APPROVED:
            raise ValueError(_('Sadece onaylanmış siparişler sipariş verildi olarak işaretlenebilir.'))
        order.status = PurchaseOrderStatus.ORDERED
        order.save(update_fields=['status', 'updated_at'])
        return order

    @staticmethod
    @transaction.atomic
    def cancel_order(order_id) -> PurchaseOrder:
        order = PurchaseOrder.objects.select_for_update().get(id=order_id)
        non_cancellable = (PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED)
        if order.status in non_cancellable:
            raise ValueError(_('Teslim alınmış veya iptal edilmiş siparişler iptal edilemez.'))
        order.status = PurchaseOrderStatus.CANCELLED
        order.save(update_fields=['status', 'updated_at'])
        from apps.audit.services import record_audit

        branch = order.warehouse.branches.filter(is_active=True).order_by('name').first()
        record_audit(
            action='warehouse.purchase_order.cancelled',
            target_instance=order,
            after_json={'status': order.status, 'order_number': order.order_number},
            branch=branch,
        )
        return order

    @staticmethod
    def recalculate_status(order_id) -> PurchaseOrder:
        """Mal kabul sonrası PO durumunu kalemlere göre yeniden hesaplar."""
        from .goods_receiving_service import GoodsReceivingService

        order = PurchaseOrder.objects.get(id=order_id)
        GoodsReceivingService._update_po_status(order)
        order.refresh_from_db()
        return order
