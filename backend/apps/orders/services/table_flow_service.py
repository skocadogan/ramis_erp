import logging
from django.db import transaction
from django.utils.translation import gettext as _
from apps.branches.virtual_table_ids import (
    is_virtual_table_id,
    order_filter_q_for_table_scope,
)

from ..order_scope import OPEN_ORDER_STATUSES
from ..models import Order, OrderItem, OrderStatus
from .order_core_service import OrderValidationError
from .sale_helper import build_pay_list, create_sale_for_order, distribute_table_payments

logger = logging.getLogger(__name__)

class TableFlowService:
    @staticmethod
    @transaction.atomic
    def complete_table(
        table_id,
        payment_method,
        user,
        branch_id=None,
        shift=None,
        pos_terminal=None,
        allow_negative_stock=False,
        payments=None,
    ):
        """Masadaki tüm aktif siparişleri tamamlar."""
        from apps.branches.services import TableService
        from apps.sales.models import Sale

        active_orders = list(
            Order.objects.select_for_update(nowait=True)
            .filter(
                order_filter_q_for_table_scope(table_id),
                status__in=OPEN_ORDER_STATUSES,
            )
            .order_by('created_at')
        )
        if not active_orders:
            if is_virtual_table_id(table_id):
                return []
            from apps.branches.models import Table, TableStatus
            try:
                table = Table.objects.get(pk=table_id)
                if table.status in (TableStatus.FREE, TableStatus.CLEANING):
                    return []
            except (Table.DoesNotExist, ValueError):
                pass
            raise OrderValidationError(_("Bu masada aktif sipariş bulunamadı."))

        from apps.inventory.models import StockReservation, StockReservationStatus

        orders_to_settle: list[Order] = []
        orders_pending_stock_commit: list[Order] = []
        for order in active_orders:
            if Sale.objects.filter(order_id=order.id).exists():
                if order.status not in (OrderStatus.COMPLETED, OrderStatus.CANCELLED):
                    order.status = OrderStatus.COMPLETED
                    order.save(update_fields=['status', 'updated_at'])
                if order.stock_tracking_mode == "INGREDIENT" and StockReservation.objects.filter(
                    order_item__order=order,
                    status=StockReservationStatus.RESERVED,
                ).exists():
                    orders_pending_stock_commit.append(order)
                continue
            orders_to_settle.append(order)

        if not orders_to_settle:
            from apps.inventory.services import InventoryService

            if orders_pending_stock_commit:
                pending_ids = [o.id for o in orders_pending_stock_commit]
                OrderItem.objects.filter(order_id__in=pending_ids).exclude(
                    status=OrderStatus.CANCELLED
                ).update(status=OrderStatus.COMPLETED)
                for order in orders_pending_stock_commit:
                    InventoryService.commit_reservations(
                        order,
                        performed_by=user,
                        allow_negative=allow_negative_stock,
                    )
            remaining = Order.objects.filter(
                order_filter_q_for_table_scope(table_id),
                status__in=OPEN_ORDER_STATUSES,
            ).exists()
            if not remaining and not is_virtual_table_id(table_id):
                from apps.branches.models import Table
                from apps.branches.table_cleaning import table_zone_is_takeaway

                table_row = Table.objects.select_related('zone').filter(pk=table_id).first()
                if table_row and table_zone_is_takeaway(table_row):
                    TableService.close_table(table_id)
                else:
                    TableService.start_cleaning(table_id)
            return [str(o.id) for o in orders_pending_stock_commit]

        grand_total = sum(o.total_amount for o in orders_to_settle)
        per_order_payments = None
        if payments is not None:
            table_pay_list = build_pay_list(payment_method, payments, grand_total)
            per_order_payments = distribute_table_payments(orders_to_settle, table_pay_list)
        else:
            from apps.sales.models import PaymentMethod
            if payment_method not in [m.value for m in PaymentMethod]:
                raise OrderValidationError(_("Geçersiz ödeme yöntemi."))

        order_ids = [o.id for o in orders_to_settle]
        OrderItem.objects.filter(order_id__in=order_ids).exclude(status=OrderStatus.CANCELLED).update(
            status=OrderStatus.COMPLETED
        )

        for order in orders_to_settle:
            order_payments = per_order_payments[str(order.id)] if per_order_payments else None
            create_sale_for_order(
                order=order,
                payment_method=payment_method,
                user=user,
                branch_id_override=branch_id,
                payments=order_payments,
                shift=shift,
                pos_terminal=pos_terminal,
            )

        Order.objects.filter(id__in=order_ids).update(status=OrderStatus.COMPLETED)

        from apps.inventory.services import InventoryService
        for order in orders_to_settle:
            if order.stock_tracking_mode == "INGREDIENT":
                InventoryService.commit_reservations(
                    order, performed_by=user, allow_negative=allow_negative_stock
                )
        for order in orders_pending_stock_commit:
            InventoryService.commit_reservations(
                order, performed_by=user, allow_negative=allow_negative_stock
            )

        if not Order.objects.filter(
            order_filter_q_for_table_scope(table_id),
            status__in=OPEN_ORDER_STATUSES,
        ).exists() and not is_virtual_table_id(table_id):
            from apps.branches.models import Table
            from apps.branches.table_cleaning import table_zone_is_takeaway

            table_row = Table.objects.select_related('zone').filter(pk=table_id).first()
            if table_row and table_zone_is_takeaway(table_row):
                TableService.close_table(table_id)
            else:
                TableService.start_cleaning(table_id)
        return [str(oid) for oid in order_ids]

    @staticmethod
    @transaction.atomic
    def transfer_table(from_table_id, to_table_id):
        """Masadaki aktif siparişleri başka masaya taşır."""
        from apps.branches.services import TableService
        active_orders = Order.objects.filter(table_id=from_table_id, status__in=OPEN_ORDER_STATUSES)
        if not active_orders.exists():
            raise OrderValidationError(_("Kaynak masada aktif sipariş bulunamadı."))

        active_orders.update(table_id=to_table_id)
        TableService.close_table(from_table_id)
        TableService.open_table(to_table_id)
