from django.db.models import Q, Sum, Case, When, F, DateTimeField
from django.utils.translation import gettext as _

from apps.orders.cancellation_reasons import (
    SALE_VOID_REASON_CODE,
    format_cancellation_reason_display,
    get_cancellation_reason_label,
)
from apps.orders.models import OrderItem, OrderStatus

__all__ = ['format_cancellation_reason_display']


def get_cancellations_queryset(
    *,
    branch_id=None,
    start_date=None,
    end_date=None,
    product_id=None,
    search=None,
    table_id=None,
):
    """
    İptal edilen kalemler ve soft-delete edilmiş satışlara bağlı iade kalemleri.
    Ana satır kalemleri (parent_item IS NULL) döner.
    """
    cancelled_q = Q(status=OrderStatus.CANCELLED)
    return_q = Q(
        status=OrderStatus.COMPLETED,
        order__sale__is_deleted=True,
    )
    qs = (
        OrderItem.objects.filter(parent_item__isnull=True)
        .filter(cancelled_q | return_q)
        .select_related(
            'product',
            'order',
            'order__branch',
            'order__table',
            'order__sale',
            'order__sale__created_by',
        )
        .annotate(
            sort_at=Case(
                When(status=OrderStatus.CANCELLED, then=F('updated_at')),
                default=F('order__sale__deleted_at'),
                output_field=DateTimeField(),
            )
        )
        .order_by('-sort_at')
    )

    if branch_id:
        qs = qs.filter(order__branch_id=branch_id)
    if product_id:
        qs = qs.filter(product_id=product_id)
    if start_date:
        qs = qs.filter(
            Q(status=OrderStatus.CANCELLED, updated_at__date__gte=start_date)
            | Q(
                status=OrderStatus.COMPLETED,
                order__sale__is_deleted=True,
                order__sale__deleted_at__date__gte=start_date,
            )
        )
    if end_date:
        qs = qs.filter(
            Q(status=OrderStatus.CANCELLED, updated_at__date__lte=end_date)
            | Q(
                status=OrderStatus.COMPLETED,
                order__sale__is_deleted=True,
                order__sale__deleted_at__date__lte=end_date,
            )
        )
    if table_id:
        from apps.sales.selectors import TAKEAWAY_SALES_TABLE_FILTER

        if str(table_id) == TAKEAWAY_SALES_TABLE_FILTER:
            qs = qs.filter(order__order_type="TAKEAWAY")
        else:
            qs = qs.filter(order__table_id=table_id)
    if search:
        term = search.strip()
        if term:
            qs = qs.filter(
                Q(product__name__icontains=term)
                | Q(order__table__name__icontains=term)
                | Q(cancel_reason_text__icontains=term)
                | Q(order__sale__created_by__username__icontains=term)
            )

    return qs


def aggregate_cancellation_totals(queryset):
    """İptal/iade kalemleri için adet ve tutar toplamları."""
    result = queryset.aggregate(
        count=Sum('quantity'),
        amount=Sum('total_price'),
    )
    return {
        'item_count': int(result['count'] or 0),
        'total_amount': float(result['amount'] or 0),
    }


def resolve_cancellation_actors(items):
    """
    Audit kayıtlarından iptal eden kullanıcıları toplu çözümler.
    Dönüş: {order_item_id_str: {'id', 'name'}}
    """
    from apps.audit.models import AuditLog

    if not items:
        return {}

    item_ids = [str(i.id) for i in items]
    order_ids = list({str(i.order_id) for i in items})

    item_actor = {}
    order_actor = {}

    logs = (
        AuditLog.objects.filter(
            Q(action='order_item.cancelled', target_id__in=item_ids)
            | Q(action='order.cancelled', target_id__in=order_ids)
        )
        .select_related('actor')
        .order_by('-created_at')
    )

    for log in logs:
        if log.action == 'order_item.cancelled' and log.target_id not in item_actor:
            item_actor[log.target_id] = log
        elif log.action == 'order.cancelled' and log.target_id not in order_actor:
            order_actor[log.target_id] = log

    resolved = {}
    for item in items:
        item_key = str(item.id)
        log = item_actor.get(item_key) or order_actor.get(str(item.order_id))
        if log and log.actor:
            resolved[item_key] = {
                'id': str(log.actor_id),
                'name': log.actor.get_full_name() or log.actor.username,
            }
        elif item.status == OrderStatus.COMPLETED and getattr(item.order, 'sale', None):
            sale = item.order.sale
            if sale.created_by:
                resolved[item_key] = {
                    'id': str(sale.created_by_id),
                    'name': sale.created_by.get_full_name() or sale.created_by.username,
                }
    return resolved


def table_label_for_order(order):
    if order.table:
        return order.table.name
    if order.order_type == 'TAKEAWAY':
        return str(_('Paket Satış'))
    return None


def record_type_for_item(item):
    if item.status == OrderStatus.CANCELLED:
        return 'CANCELLATION'
    return 'RETURN'


def event_at_for_item(item):
    if item.status == OrderStatus.CANCELLED:
        return item.updated_at
    sale = getattr(item.order, 'sale', None)
    return sale.deleted_at if sale and sale.deleted_at else item.updated_at


def reason_for_item(item):
    if item.status == OrderStatus.CANCELLED:
        return item.cancel_reason_code, item.cancel_reason_text
    return SALE_VOID_REASON_CODE, get_cancellation_reason_label(SALE_VOID_REASON_CODE)
