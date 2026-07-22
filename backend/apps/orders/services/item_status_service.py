from django.core.exceptions import PermissionDenied
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.response import Response

from apps.branches.waiter_scope import enforce_waiter_order_item_scope
from core.ws_deferred import schedule_kds_refresh, schedule_order_status_changed

from ..combined_item_status import sync_combined_item_status_after_update
from ..kds_item_scope import user_may_kds_line_item_by_assignment
from ..models import OrderStatus
from .item_service import ItemService
def apply_order_item_status(request, item, new_status, silent=False):
    """Durum güncellemesi. Hata halinde Response, başarıda None."""
    if new_status not in [s[0] for s in OrderStatus.choices]:
        return Response({"error": _("Invalid status")}, status=status.HTTP_400_BAD_REQUEST)

    if request.user.has_permission('waiter.access') and not request.user.has_permission('orders.view_kds'):
        if new_status != OrderStatus.DELIVERED:
            return Response(
                {
                    'error': _(
                        'Garson yalnızca hazır ürünü teslim edildi (DELIVERED) olarak işaretleyebilir.'
                    ),
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            enforce_waiter_order_item_scope(user=request.user, item=item)
        except PermissionDenied as e:
            return Response({'detail': str(e)}, status=status.HTTP_403_FORBIDDEN)

    if request.user.has_permission("orders.view_kds") and not user_may_kds_line_item_by_assignment(
        request.user, item
    ):
        return Response(
            {
                "detail": _("Bu sipariş kalemi için bu mutfak istasyonunda yetkiniz yok."),
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    previous_item_status = item.status
    previous_order_status = item.order.status
    item.status = new_status
    if new_status != OrderStatus.READY and item.waiter_acknowledged_at is not None:
        item.waiter_acknowledged_at = None
        item.save(update_fields=['status', 'waiter_acknowledged_at', 'updated_at'])
    else:
        item.save()

    order = item.order
    ItemService.sync_order_status_from_items(order)

    if silent:
        return None


    _status_ws = {
        "event": "status_update",
        "order_id": str(order.id),
        "item_status": str(item.status),
        **({"table_id": str(order.table_id)} if order.table_id else {}),
    }

    for synced in sync_combined_item_status_after_update(item):
        schedule_order_status_changed(
            str(order.branch_id),
            {**_status_ws, "item_id": str(synced.id), "item_status": str(synced.status)},
        )
        schedule_kds_refresh(
            order.branch_id,
            "item_status",
            item_id=str(synced.id),
            order_id=str(order.id),
        )

    schedule_order_status_changed(
        str(order.branch_id),
        {**_status_ws, "item_id": str(item.id)},
    )
    schedule_kds_refresh(order.branch_id, "item_status", item_id=str(item.id), order_id=str(order.id))
    return None


def broadcast_order_item_touch(item, *, reason: str):
    order = item.order
    _status_ws = {
        'event': 'status_update',
        'order_id': str(order.id),
        'item_id': str(item.id),
        'item_status': str(item.status),
        **({'table_id': str(order.table_id)} if order.table_id else {}),
    }
    schedule_order_status_changed(str(order.branch_id), _status_ws)
    schedule_kds_refresh(order.branch_id, reason, item_id=str(item.id), order_id=str(order.id))
