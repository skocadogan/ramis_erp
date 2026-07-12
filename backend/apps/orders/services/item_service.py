import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from django.utils.translation import gettext as _
from core.decimal_constants import ZERO_MONEY
from ..models import Order, OrderItem, OrderItemModifier, OrderStatus
from ..cancellation_reasons import (
    SMART_TABLE_CANCEL_AUDIT_TEXT,
    SMART_TABLE_CANCEL_SOURCE,
    normalize_cancellation_reason_inputs,
)
from .order_core_service import OrderValidationError
from apps.audit.services import record_audit

logger = logging.getLogger(__name__)

class ItemService:
    @staticmethod
    @transaction.atomic
    def cancel_item(item, reason_code=None, reason_text=None, cancel_source=None):
        """Tek bir kalemi iptal eder."""
        from apps.branches.services import TableService
        if item.status in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]:
            raise OrderValidationError(_("Ürün zaten tamamlanmış veya iptal edilmiş."))

        reason_code, reason_text = normalize_cancellation_reason_inputs(reason_code, reason_text)
        if cancel_source == SMART_TABLE_CANCEL_SOURCE:
            reason_text = str(SMART_TABLE_CANCEL_AUDIT_TEXT)

        order = item.order
        previous_order_status = order.status

        # EPIC-05: Hazırlanmış ürün iptal ediliyorsa WASTE stok hareketi oluştur
        prepared_statuses = [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED]
        if item.status in prepared_statuses and not item.waste_recorded:
            if order.branch_id and order.stock_tracking_mode == "INGREDIENT":
                from apps.inventory.services.stock_movement_service import waste_stock
                try:
                    waste_stock(
                        warehouse_id=order.branch.default_warehouse_id,
                        stock_item_id=item.product.ingredient_stock_item_id,
                        quantity=item.product.ingredient_quantity * item.quantity,
                        reference=f"cancel_item_{item.id}",
                        notes=f"İptal edilen hazır ürün: {item.product.name} (Order {order.id})",
                        performed_by=item.updated_by if hasattr(item, 'updated_by') else None,
                    )
                except Exception as exc:
                    logger.warning("waste_stock failed for item %s: %s", item.id, exc)
                item.waste_recorded = True

        before_state = {"status": item.status}
        item.status = OrderStatus.CANCELLED
        item.cancel_reason_code, item.cancel_reason_text = reason_code, reason_text
        item.save(update_fields=['status', 'cancel_reason_code', 'cancel_reason_text', 'updated_at', 'waste_recorded'])

        if item.parent_item_id is None:
            item.components.exclude(status=OrderStatus.CANCELLED).update(
                status=OrderStatus.CANCELLED,
                cancel_reason_code=reason_code,
                cancel_reason_text=reason_text,
                updated_at=timezone.now(),
            )
        
        record_audit(
            action='order_item.cancelled',
            target_instance=item,
            before_json=before_state,
            after_json={"status": item.status},
            metadata={
                "reason_code": reason_code,
                "reason_text": reason_text,
                **({"source": SMART_TABLE_CANCEL_SOURCE} if cancel_source == SMART_TABLE_CANCEL_SOURCE else {}),
            },
        )

        active_items = order.items.exclude(status=OrderStatus.CANCELLED)
        order.total_amount = active_items.aggregate(total=Sum('total_price'))['total'] or ZERO_MONEY

        if item.parent_item_id is None and order.stock_tracking_mode == "PRODUCT":
            from apps.production_planning.services.portion_service import PortionService
            PortionService.bulk_reverse_portions(
                branch_id=order.branch_id,
                products_with_qty=[
                    (item.product_id, item.quantity * item.portion_multiplier),
                ],
            )
        elif order.stock_tracking_mode == "INGREDIENT":
            from apps.inventory.services import InventoryService
            InventoryService.release_reservations(order, order_item_id=item.id)

        update_fields_order = ["total_amount", "updated_at"]
        if not active_items.exists():
            order.status = OrderStatus.CANCELLED
            order.cancel_reason_code = reason_code
            order.cancel_reason_text = reason_text
            update_fields_order.extend(["status", "cancel_reason_code", "cancel_reason_text"])
        order.save(update_fields=update_fields_order)

        if (
            previous_order_status not in [OrderStatus.COMPLETED, OrderStatus.CANCELLED]
            and order.status == OrderStatus.CANCELLED
        ):
            cascade_meta = {
                "reason_code": reason_code,
                "reason_text": reason_text,
                "via": "last_order_item_cancelled",
                "order_type": order.order_type,
            }
            if cancel_source == SMART_TABLE_CANCEL_SOURCE:
                cascade_meta["source"] = SMART_TABLE_CANCEL_SOURCE
            if order.takeaway_zone_id:
                cascade_meta["takeaway_zone_id"] = str(order.takeaway_zone_id)
            record_audit(
                action='order.cancelled',
                target_instance=order,
                before_json={"status": previous_order_status},
                after_json={"status": order.status},
                metadata=cascade_meta,
            )

        if order.status == OrderStatus.CANCELLED and order.table_id:
            from ..order_scope import OPEN_ORDER_STATUSES

            if not Order.objects.filter(
                table_id=order.table_id,
                status__in=OPEN_ORDER_STATUSES,
            ).exists():
                TableService.close_table(order.table_id)
        return item, order

    @staticmethod
    def _copy_item_modifiers(source_item: OrderItem, target_item: OrderItem) -> None:
        for mod in source_item.modifiers.all():
            OrderItemModifier.objects.create(
                order_item=target_item,
                modifier=mod.modifier,
                price=mod.price,
            )

    @staticmethod
    def _create_pending_delta_line(parent_item: OrderItem, delta: int) -> OrderItem:
        modifier_sum = parent_item.modifiers.aggregate(total=Sum('price'))['total'] or ZERO_MONEY
        new_item = OrderItem.objects.create(
            order=parent_item.order,
            product=parent_item.product,
            variant=parent_item.variant,
            quantity=delta,
            unit_price=parent_item.unit_price,
            total_price=(parent_item.unit_price + modifier_sum) * delta,
            status=OrderStatus.PENDING,
            station_id=parent_item.station_id,
            unit_name=parent_item.unit_name or '',
            portion_multiplier=parent_item.portion_multiplier,
            notes=parent_item.notes or '',
            scheduled_start_time=timezone.now(),
        )
        ItemService._copy_item_modifiers(parent_item, new_item)
        return new_item

    @staticmethod
    def _resend_delivered_quantity_delta(item: OrderItem, delta: int) -> list[OrderItem]:
        """Teslim edilmiş kalemde artan adedi mutfağa PENDING olarak açar."""
        if delta <= 0:
            return []

        created: list[OrderItem] = []
        now = timezone.now()
        active_components = list(item.components.exclude(status=OrderStatus.CANCELLED))

        if active_components:
            for comp in active_components:
                created.append(
                    OrderItem.objects.create(
                        order=item.order,
                        product=comp.product,
                        parent_item=item,
                        quantity=delta,
                        portion_multiplier=comp.portion_multiplier,
                        unit_name=comp.unit_name,
                        unit_price=ZERO_MONEY,
                        total_price=ZERO_MONEY,
                        status=OrderStatus.PENDING,
                        scheduled_start_time=now,
                        station_id=comp.station_id,
                    )
                )
            if item.status == OrderStatus.DELIVERED:
                item.status = OrderStatus.PREPARING
            return created

        created.append(ItemService._create_pending_delta_line(item, delta))
        return created

    @staticmethod
    def _kitchen_resend_signature_filter(item: OrderItem, qs):
        qs = qs.filter(product_id=item.product_id, variant_id=item.variant_id)
        if item.unit_name:
            qs = qs.filter(unit_name=item.unit_name)
        else:
            qs = qs.filter(Q(unit_name__isnull=True) | Q(unit_name=''))
        notes_val = item.notes or ''
        if notes_val:
            qs = qs.filter(notes=notes_val)
        else:
            qs = qs.filter(Q(notes__isnull=True) | Q(notes=''))
        return qs

    @staticmethod
    def _pending_kitchen_resend_sibling_qty(item: OrderItem) -> int:
        """Teslim edilmiş ana kalemle aynı ürün imzasına sahip bekleyen mutfak delta adedi."""
        if item.parent_item_id is not None:
            return 0
        qs = ItemService._kitchen_resend_signature_filter(
            item,
            item.order.items.filter(
                status__in=[OrderStatus.PENDING, OrderStatus.PREPARING],
                parent_item__isnull=True,
            ).exclude(id=item.id),
        )
        total = qs.aggregate(total=Sum('quantity'))['total']
        return int(total or 0)

    @staticmethod
    @transaction.atomic
    def update_item_quantity(item, new_qty, *, resend_delta_to_kitchen=False):
        """Kalem miktarını günceller. Teslim edilmiş kalemlerde artış mutfağa delta olarak gidebilir."""
        old_qty = int(item.quantity)
        new_qty = int(new_qty)
        if new_qty <= 0:
            raise OrderValidationError(_("Geçersiz miktar."))

        modifier_sum = item.modifiers.aggregate(total=Sum('price'))['total'] or ZERO_MONEY
        pending_sibling_qty = ItemService._pending_kitchen_resend_sibling_qty(item)
        effective_old_qty = old_qty + pending_sibling_qty
        needs_kitchen_resend = (
            resend_delta_to_kitchen
            and item.status == OrderStatus.DELIVERED
            and item.parent_item_id is None
            and new_qty > effective_old_qty
        )

        created_pending: list[OrderItem] = []
        if needs_kitchen_resend:
            delta = new_qty - effective_old_qty
            has_components = item.components.exclude(status=OrderStatus.CANCELLED).exists()
            if has_components:
                item.quantity = new_qty
                item.total_price = (item.unit_price + modifier_sum) * new_qty
                created_pending = ItemService._resend_delivered_quantity_delta(item, delta)
                item.save(update_fields=['quantity', 'total_price', 'status', 'updated_at'])
            else:
                created_pending = ItemService._resend_delivered_quantity_delta(item, delta)
        else:
            if new_qty == old_qty:
                return item, item.order, []
            item.quantity = new_qty
            item.total_price = (item.unit_price + modifier_sum) * new_qty
            item.save(update_fields=['quantity', 'total_price', 'updated_at'])
            if item.parent_item_id is None:
                item.components.exclude(status=OrderStatus.CANCELLED).update(
                    quantity=new_qty,
                    updated_at=timezone.now(),
                )

        order = item.order
        order.total_amount = order.items.exclude(status=OrderStatus.CANCELLED).aggregate(total=Sum('total_price'))['total'] or ZERO_MONEY
        order.save(update_fields=['total_amount', 'updated_at'])
        ItemService.sync_order_status_from_items(order)

        if created_pending:
            record_audit(
                action='order_item.quantity_increased_kitchen_resend',
                target_instance=item,
                after_json={
                    'old_quantity': old_qty,
                    'effective_old_quantity': effective_old_qty,
                    'new_quantity': new_qty,
                    'delta': new_qty - effective_old_qty,
                    'pending_item_ids': [str(i.id) for i in created_pending],
                },
                metadata={'order_id': str(order.id)},
            )

        return item, order, created_pending

    @staticmethod
    def sync_order_status_from_items(order):
        """Kalem durumlarından sipariş başlık durumunu türetir."""
        active = order.items.exclude(status=OrderStatus.CANCELLED)
        if not active.exists():
            return

        has_pending_or_preparing = active.filter(
            status__in=[OrderStatus.PENDING, OrderStatus.PREPARING]
        ).exists()
        has_ready = active.filter(status=OrderStatus.READY).exists()
        has_delivered = active.filter(status=OrderStatus.DELIVERED).exists()

        if has_pending_or_preparing:
            new_status = (
                OrderStatus.PREPARING
                if active.filter(status=OrderStatus.PREPARING).exists()
                else OrderStatus.PENDING
            )
        elif has_ready:
            new_status = OrderStatus.READY
        elif has_delivered:
            new_status = OrderStatus.DELIVERED
        else:
            return
        if order.status != new_status:
            order.status = new_status
            order.save(update_fields=['status', 'updated_at'])

    @staticmethod
    def _sync_order_status_after_recall(order):
        ItemService.sync_order_status_from_items(order)

    @staticmethod
    @transaction.atomic
    def recall_item(item):
        """Servise gönderilmiş kalemi mutfağa geri çağırır (PENDING — yeni sipariş gibi)."""
        if item.status not in (OrderStatus.READY, OrderStatus.DELIVERED):
            raise OrderValidationError(_("Yalnızca servise gönderilmiş kalemler geri çağrılabilir."))

        from ..selectors import get_kds_recall_window_minutes

        window_start = timezone.now() - timedelta(minutes=get_kds_recall_window_minutes())
        if item.updated_at < window_start:
            raise OrderValidationError(_("Geri çağırma süresi dolmuş."))

        order = item.order
        from apps.sales.models import Sale

        if (
            Sale.objects.filter(order_id=order.pk).exists()
            or order.status in (OrderStatus.COMPLETED, OrderStatus.CANCELLED)
        ):
            raise OrderValidationError(_("Hesabı kapanmış veya tamamlanmış sipariş geri çağrılamaz."))

        before_state = {"status": item.status}
        item.status = OrderStatus.PENDING
        item.scheduled_start_time = timezone.now()
        item.firing_forced_at = None
        item.save(update_fields=['status', 'scheduled_start_time', 'firing_forced_at', 'updated_at'])

        if item.parent_item_id is None:
            item.components.filter(
                status__in=[OrderStatus.READY, OrderStatus.DELIVERED],
            ).update(
                status=OrderStatus.PENDING,
                scheduled_start_time=timezone.now(),
                firing_forced_at=None,
                updated_at=timezone.now(),
            )

        ItemService._sync_order_status_after_recall(order)

        record_audit(
            action='order_item.recalled',
            target_instance=item,
            before_json=before_state,
            after_json={"status": item.status},
            metadata={"order_id": str(order.id), "table_id": str(order.table_id) if order.table_id else None},
        )
        return item, order
