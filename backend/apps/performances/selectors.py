from django.db.models import Avg, Count, Max, Min, Q

from .models import WaiterCallLog, WaiterCallStatus
from .query_filters import apply_branch_filter, apply_called_at_range


def get_waiter_call_logs_queryset(
    *,
    branch_id=None,
    start_date=None,
    end_date=None,
    staff_id=None,
    status=None,
):
    qs = (
        WaiterCallLog.objects.select_related('branch', 'table', 'dismissed_by')
        .order_by('-called_at')
    )
    qs = apply_branch_filter(qs, branch_id)
    qs = apply_called_at_range(qs, start_date, end_date)
    if staff_id:
        qs = qs.filter(dismissed_by_id=staff_id)
    if status and status in WaiterCallStatus.values:
        qs = qs.filter(status=status)
    return qs


def aggregate_waiter_call_totals(queryset):
    agg = queryset.order_by().aggregate(
        total_calls=Count('id'),
        dismissed_calls=Count('id', filter=Q(status=WaiterCallStatus.DISMISSED)),
        pending_calls=Count('id', filter=Q(status=WaiterCallStatus.PENDING)),
        avg_response_seconds=Avg(
            'response_seconds',
            filter=Q(status=WaiterCallStatus.DISMISSED, response_seconds__isnull=False),
        ),
    )
    return {
        'total_calls': agg['total_calls'] or 0,
        'dismissed_calls': agg['dismissed_calls'] or 0,
        'pending_calls': agg['pending_calls'] or 0,
        'avg_response_seconds': round(float(agg['avg_response_seconds'] or 0), 1),
    }


def staff_waiter_call_performance(queryset):
    """Personel bazlı çağrı performansı — grafik ve özet tablo."""
    rows = (
        queryset.filter(status=WaiterCallStatus.DISMISSED, dismissed_by__isnull=False)
        .values('dismissed_by_id', 'dismissed_by__first_name', 'dismissed_by__last_name', 'dismissed_by__username')
        .annotate(
            call_count=Count('id'),
            avg_response_seconds=Avg('response_seconds'),
            min_response_seconds=Min('response_seconds'),
            max_response_seconds=Max('response_seconds'),
        )
        .order_by('-call_count', 'dismissed_by__first_name')
    )
    result = []
    for row in rows:
        first = (row.get('dismissed_by__first_name') or '').strip()
        last = (row.get('dismissed_by__last_name') or '').strip()
        username = row.get('dismissed_by__username') or ''
        name = f"{first} {last}".strip() or username
        result.append({
            'staff_id': row['dismissed_by_id'],
            'staff_name': name,
            'call_count': row['call_count'],
            'avg_response_seconds': round(float(row['avg_response_seconds'] or 0), 1),
            'min_response_seconds': row['min_response_seconds'],
            'max_response_seconds': row['max_response_seconds'],
        })
    return result
