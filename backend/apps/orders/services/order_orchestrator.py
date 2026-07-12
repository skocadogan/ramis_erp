import logging

from rest_framework import status

from apps.audit.services import record_audit
from core.ws_deferred import schedule_kds_refresh

from ..serializers import OrderMinimalSerializer
from ..idempotency import (
    build_complete_table_envelope,
    build_order_complete_envelope,
    build_order_create_envelope,
)
from . import OrderService, OrderValidationError

logger = logging.getLogger(__name__)


class OrderOrchestrator:
    """
    Sipariş oluşturma, tamamlama ve masa tamamlama işlemlerinin
    audit kaydı, WS broadcast ve response envelope oluşturma
    aşamalarını birleştiren orkestratör.
    """

    @staticmethod
    def perform_create(branch_id, table_id, order_type, user, notes, items_data,
                       stock_tracking_mode, customer_id, skip_station_stock_check,
                       idem_key, request_data):
        try:
            order = OrderService.create_order(
                branch_id=branch_id,
                table_id=table_id,
                order_type=order_type,
                user=user,
                notes=notes,
                items_data=items_data,
                stock_tracking_mode=stock_tracking_mode,
                customer_id=customer_id,
                skip_station_stock_check=skip_station_stock_check,
            )
        except OrderValidationError:
            raise

        order_data = OrderMinimalSerializer(order).data
        if idem_key:
            body = build_order_create_envelope(order_data, key=idem_key, replay=False)
        else:
            body = order_data
        record_audit(
            action='order.created',
            target_instance=order,
            after_json={'status': order.status, 'order_number': order.order_number},
            metadata={
                'idempotency_key': idem_key,
                'order_type': order.order_type,
                'stock_tracking_mode': order.stock_tracking_mode,
                'offline_sync': bool(request_data.get('_offline_sync')),
            },
        )
        schedule_kds_refresh(
            order.branch_id,
            "order_created",
            order_id=str(order.id),
            table_id=str(order.table_id) if order.table_id else None,
        )
        return body, status.HTTP_201_CREATED, str(order.id)

    @staticmethod
    def perform_complete(order, payment_method, user, payments, shift, pos_terminal,
                         allow_negative_stock, idem_key):
        OrderService.complete_order(
            order,
            payment_method,
            user,
            payments=payments,
            shift=shift,
            pos_terminal=pos_terminal,
            allow_negative_stock=allow_negative_stock,
        )
        order.refresh_from_db()
        sale_id = None
        if hasattr(order, 'sale'):
            try:
                sale_id = str(order.sale.id)
            except Exception:
                sale_id = None
        order_data = OrderMinimalSerializer(order).data
        if idem_key:
            body = build_order_complete_envelope(order_data, sale_id, key=idem_key, replay=False)
        else:
            body = order_data
        record_audit(
            action='order.completed',
            target_instance=order,
            after_json={'status': order.status},
            metadata={
                'idempotency_key': idem_key,
                'payment_method': str(payment_method),
                'pos_terminal_id': str(pos_terminal.id) if pos_terminal else None,
                'shift_id': str(shift.id) if shift else None,
            },
        )
        if sale_id:
            record_audit(
                action='sale.created',
                target_type='sales.sale',
                target_id=sale_id,
                branch=order.branch,
                metadata={'order_id': str(order.id), 'idempotency_key': idem_key},
            )
        schedule_kds_refresh(
            order.branch_id,
            "order_completed",
            order_id=str(order.id),
            table_id=str(order.table_id) if order.table_id else None,
        )
        return body, status.HTTP_200_OK, str(order.id)

    @staticmethod
    def perform_complete_table(table_id, payment_method, user, branch_id, shift,
                               pos_terminal, allow_negative_stock, payments,
                               idem_key, eff_branch_id):
        order_ids = OrderService.complete_table(
            table_id=table_id,
            payment_method=payment_method,
            user=user,
            branch_id=branch_id,
            shift=shift,
            pos_terminal=pos_terminal,
            allow_negative_stock=allow_negative_stock,
            payments=payments,
        )
        if idem_key:
            body = build_complete_table_envelope(len(order_ids), order_ids, key=idem_key, replay=False)
        else:
            body = {'completed_count': len(order_ids)}
        record_audit(
            action='order.completed',
            target_type='branches.table',
            target_id=str(table_id),
            metadata={
                'idempotency_key': idem_key,
                'completed_count': len(order_ids),
                'order_ids': order_ids,
                'payment_method': str(payment_method),
            },
        )
        schedule_kds_refresh(eff_branch_id, "complete_table", table_id=str(table_id), order_ids=order_ids)
        return body, status.HTTP_200_OK, str(table_id)
