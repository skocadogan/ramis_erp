"""Garson sipariş satış analitiği — sorgu ve özet hesapları."""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Sum
from django.db.models.functions import TruncDate

from apps.audit.models import AuditLog
from apps.orders.cancellation_reasons import format_cancellation_reason_display
from apps.orders.models import Order, OrderStatus

from .query_filters import apply_branch_filter, apply_called_at_range

User = get_user_model()

MOBILE_UA_MARKERS = ('okhttp', 'reactnative', 'expo', 'cfnetwork', 'dalvik')
WEB_UA_MARKERS = ('mozilla', 'chrome', 'safari', 'firefox', 'edg/')


def classify_order_channel(user_agent: str | None) -> str:
    if not user_agent:
        return 'unknown'
    ua = user_agent.lower()
    if any(marker in ua for marker in MOBILE_UA_MARKERS):
        return 'mobile'
    if any(marker in ua for marker in WEB_UA_MARKERS):
        return 'web'
    return 'unknown'


def _waiter_user_ids_subquery():
    return User.objects.filter(
        roles__permissions__code='waiter.access',
    ).values_list('id', flat=True).distinct()


def get_waiter_orders_queryset(
    *,
    branch_id=None,
    start_date=None,
    end_date=None,
    staff_id=None,
    status=None,
):
    qs = (
        Order.objects.filter(user_id__in=_waiter_user_ids_subquery())
        .select_related('branch', 'table', 'table__zone', 'user')
        .order_by('-created_at')
    )
    qs = apply_branch_filter(qs, branch_id)
    qs = apply_called_at_range(qs, start_date, end_date, field='created_at')
    if staff_id:
        qs = qs.filter(user_id=staff_id)
    if status and status in OrderStatus.values:
        qs = qs.filter(status=status)
    return qs


def build_order_channel_map(order_ids) -> dict[str, str]:
    """Sipariş id → kanal (mobile / web / unknown) — order.created audit kaydından."""
    if not order_ids:
        return {}
    str_ids = [str(oid) for oid in order_ids]
    audits = AuditLog.objects.filter(
        action='order.created',
        target_type='orders.order',
        target_id__in=str_ids,
    ).values('target_id', 'user_agent')
    return {
        row['target_id']: classify_order_channel(row.get('user_agent'))
        for row in audits
    }


def _staff_display_name(user) -> str:
    if not user:
        return '—'
    name = user.get_full_name()
    return (name.strip() or user.username) if name else user.username


def aggregate_waiter_order_totals(queryset, channel_by_order: dict[str, str]):
    total_orders = queryset.count()
    cancelled_orders = queryset.filter(status=OrderStatus.CANCELLED).count()
    active_qs = queryset.exclude(status=OrderStatus.CANCELLED)
    agg = active_qs.aggregate(
        total_sales=Sum('total_amount'),
        avg_amount=Avg('total_amount'),
    )
    mobile_orders = web_orders = unknown_orders = 0
    for oid in queryset.values_list('id', flat=True):
        ch = channel_by_order.get(str(oid), 'unknown')
        if ch == 'mobile':
            mobile_orders += 1
        elif ch == 'web':
            web_orders += 1
        else:
            unknown_orders += 1

    total_sales = agg['total_sales'] or Decimal('0')
    avg_amount = agg['avg_amount'] or Decimal('0')
    return {
        'total_orders': total_orders,
        'cancelled_orders': cancelled_orders,
        'active_orders': total_orders - cancelled_orders,
        'total_sales_amount': str(total_sales.quantize(Decimal('0.01'))),
        'avg_order_amount': float(round(avg_amount, 2)),
        'mobile_orders': mobile_orders,
        'web_orders': web_orders,
        'unknown_channel_orders': unknown_orders,
    }


def aggregate_cancellation_reasons(queryset):
    rows = (
        queryset.filter(status=OrderStatus.CANCELLED)
        .exclude(cancel_reason_code__isnull=True, cancel_reason_text__isnull=True)
        .values('cancel_reason_code', 'cancel_reason_text')
        .annotate(count=Count('id'))
        .order_by('-count')
    )
    result = []
    for row in rows:
        label = format_cancellation_reason_display(
            code=row.get('cancel_reason_code'),
            text=row.get('cancel_reason_text'),
        )
        result.append({
            'code': row.get('cancel_reason_code') or 'OTHER',
            'label': label or row.get('cancel_reason_code') or '—',
            'count': row['count'],
        })
    return result


def staff_waiter_order_performance(queryset, channel_by_order: dict[str, str]):
    orders = list(queryset)
    by_staff: dict[int, list] = defaultdict(list)
    for order in orders:
        if order.user_id:
            by_staff[order.user_id].append(order)

    result = []
    for staff_id, staff_orders in by_staff.items():
        user = staff_orders[0].user
        cancelled = [o for o in staff_orders if o.status == OrderStatus.CANCELLED]
        active = [o for o in staff_orders if o.status != OrderStatus.CANCELLED]

        total_amount = sum((o.total_amount or Decimal('0')) for o in active)
        order_count = len(staff_orders)
        avg_amount = float(total_amount / len(active)) if active else 0.0

        table_ids = {o.table_id for o in active if o.table_id}
        mobile_count = web_count = unknown_count = 0
        for o in staff_orders:
            ch = channel_by_order.get(str(o.id), 'unknown')
            if ch == 'mobile':
                mobile_count += 1
            elif ch == 'web':
                web_count += 1
            else:
                unknown_count += 1

        day_counts: dict[date, int] = defaultdict(int)
        for o in staff_orders:
            if o.created_at:
                day_counts[o.created_at.date()] += 1
        busiest_day = None
        busiest_day_count = 0
        if day_counts:
            busiest_day, busiest_day_count = max(day_counts.items(), key=lambda x: x[1])

        table_totals: dict[str, tuple[str, str, Decimal]] = {}
        for o in active:
            if not o.table_id:
                continue
            key = str(o.table_id)
            name = o.table.name if o.table else '—'
            zone = o.table.zone.name if o.table and o.table.zone else ''
            prev = table_totals.get(key, (name, zone, Decimal('0')))
            table_totals[key] = (name, zone, prev[2] + (o.total_amount or Decimal('0')))

        top_table_id = top_table_name = top_table_zone = None
        top_table_amount = Decimal('0')
        if table_totals:
            top_key = max(table_totals.keys(), key=lambda k: table_totals[k][2])
            top_table_id = top_key
            top_table_name, top_table_zone, top_table_amount = table_totals[top_key]

        cancel_reason_counts: dict[str, int] = defaultdict(int)
        cancel_reason_labels: dict[str, str] = {}
        for o in cancelled:
            label = format_cancellation_reason_display(
                code=o.cancel_reason_code,
                text=o.cancel_reason_text,
            ) or '—'
            code = o.cancel_reason_code or 'OTHER'
            cancel_reason_counts[code] += 1
            cancel_reason_labels[code] = label

        result.append({
            'staff_id': staff_id,
            'staff_name': _staff_display_name(user),
            'order_count': order_count,
            'active_order_count': len(active),
            'cancelled_count': len(cancelled),
            'total_amount': str(total_amount.quantize(Decimal('0.01'))),
            'avg_order_amount': round(avg_amount, 2),
            'table_count': len(table_ids),
            'busiest_day': busiest_day.isoformat() if busiest_day else None,
            'busiest_day_order_count': busiest_day_count,
            'top_table_id': top_table_id,
            'top_table_name': top_table_name,
            'top_table_zone': top_table_zone,
            'top_table_amount': str(top_table_amount.quantize(Decimal('0.01'))),
            'mobile_order_count': mobile_count,
            'web_order_count': web_count,
            'unknown_channel_count': unknown_count,
            'cancel_reasons': [
                {
                    'code': code,
                    'label': cancel_reason_labels.get(code, code),
                    'count': cnt,
                }
                for code, cnt in sorted(
                    cancel_reason_counts.items(),
                    key=lambda x: -x[1],
                )
            ],
        })

    result.sort(key=lambda r: (-r['order_count'], r['staff_name']))
    return result


def daily_order_counts_for_chart(queryset):
    rows = (
        queryset.exclude(status=OrderStatus.CANCELLED)
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(
            order_count=Count('id'),
            sales_total=Sum('total_amount'),
        )
        .order_by('day')
    )
    return [
        {
            'date': row['day'].isoformat() if row['day'] else None,
            'order_count': row['order_count'],
            'sales_total': str((row['sales_total'] or Decimal('0')).quantize(Decimal('0.01'))),
        }
        for row in rows
    ]
