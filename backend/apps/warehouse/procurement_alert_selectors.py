"""Satın alma uyarı selector'ları — geciken PO ve tedarikçi teslimat uyarıları."""

from __future__ import annotations

from django.utils import timezone

from apps.inventory.selectors import get_supplier_performance
from apps.warehouse.models import PurchaseOrder, PurchaseOrderStatus


OPEN_PO_STATUSES = (
    PurchaseOrderStatus.ORDERED,
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
)


def _overdue_po_queryset(*, warehouse_ids=None, branch_id=None, supplier_id=None):
    today = timezone.now().date()
    qs = PurchaseOrder.objects.filter(
        is_active=True,
        status__in=OPEN_PO_STATUSES,
        expected_date__isnull=False,
        expected_date__lt=today,
    ).select_related('supplier', 'warehouse')

    if warehouse_ids is not None:
        qs = qs.filter(warehouse_id__in=warehouse_ids)
    if branch_id:
        qs = qs.filter(warehouse__branches__id=branch_id, warehouse__branches__is_active=True)
    if supplier_id:
        qs = qs.filter(supplier_id=supplier_id)
    return qs.distinct().order_by('expected_date', '-created_at')


def _serialize_overdue_po(po: PurchaseOrder, *, today, days_overdue: int) -> dict:
    return {
        'po_id': str(po.id),
        'order_number': po.order_number,
        'supplier_id': str(po.supplier_id),
        'supplier_name': po.supplier.name if po.supplier_id else '',
        'warehouse_id': str(po.warehouse_id),
        'warehouse_name': po.warehouse.name if po.warehouse_id else '',
        'expected_date': po.expected_date.isoformat(),
        'days_overdue': days_overdue,
        'status': po.status,
    }


def get_overdue_purchase_orders(
    *,
    warehouse_ids=None,
    branch_id=None,
    supplier_id=None,
    days_overdue_min: int = 1,
) -> list[dict]:
    """Beklenen tarihi geçmiş açık satın alma siparişleri."""
    today = timezone.now().date()
    min_days = max(days_overdue_min, 1)
    qs = _overdue_po_queryset(
        warehouse_ids=warehouse_ids,
        branch_id=branch_id,
        supplier_id=supplier_id,
    )

    rows: list[dict] = []
    for po in qs:
        days_overdue = (today - po.expected_date).days
        if days_overdue < min_days:
            continue
        rows.append(_serialize_overdue_po(po, today=today, days_overdue=days_overdue))
    return rows


def get_overdue_purchase_orders_count(
    *,
    warehouse_ids=None,
    branch_id=None,
) -> int:
    """Özet sayaç — tam liste materialize etmeden DB count."""
    return _overdue_po_queryset(
        warehouse_ids=warehouse_ids,
        branch_id=branch_id,
    ).count()


def _supplier_severity(*, overdue_count: int, on_time_rate: float | None) -> str:
    if overdue_count >= 2:
        return 'critical'
    if on_time_rate is not None and on_time_rate < 0.7:
        return 'critical'
    if overdue_count >= 1:
        return 'warning'
    return 'ok'


def get_supplier_delivery_alerts(
    *,
    warehouse_ids=None,
    branch_id=None,
    lookback_days: int = 90,
    overdue_rows: list[dict] | None = None,
) -> list[dict]:
    """Geciken PO'ları tedarikçi bazında grupla ve performans metrikleriyle birleştir."""
    if overdue_rows is None:
        overdue_rows = get_overdue_purchase_orders(
            warehouse_ids=warehouse_ids,
            branch_id=branch_id,
        )
    if not overdue_rows:
        return []

    grouped: dict[str, dict] = {}
    for row in overdue_rows:
        sid = row['supplier_id']
        if sid not in grouped:
            grouped[sid] = {
                'supplier_id': sid,
                'supplier_name': row['supplier_name'],
                'overdue_count': 0,
                'max_days_overdue': 0,
            }
        grouped[sid]['overdue_count'] += 1
        grouped[sid]['max_days_overdue'] = max(
            grouped[sid]['max_days_overdue'],
            row['days_overdue'],
        )

    alerts: list[dict] = []
    for supplier_id, data in grouped.items():
        on_time_rate = None
        # Tek gecikmede on_time_rate kritiklik için gerekli; 2+ gecikmede zaten critical.
        if data['overdue_count'] == 1:
            try:
                perf = get_supplier_performance(supplier_id, days=lookback_days)
                on_time_rate = perf.get('on_time_rate')
            except (ValueError, TypeError):
                pass
        severity = _supplier_severity(
            overdue_count=data['overdue_count'],
            on_time_rate=on_time_rate,
        )
        if severity == 'ok':
            continue
        alerts.append({
            'supplier_id': supplier_id,
            'supplier_name': data['supplier_name'],
            'overdue_count': data['overdue_count'],
            'max_days_overdue': data['max_days_overdue'],
            'on_time_rate': on_time_rate,
            'severity': severity,
        })

    alerts.sort(key=lambda x: (-x['overdue_count'], -x['max_days_overdue']))
    return alerts


def build_procurement_alerts_payload(
    *,
    warehouse_ids=None,
    branch_id=None,
    supplier_id=None,
    lookback_days: int = 90,
) -> dict:
    overdue_orders = get_overdue_purchase_orders(
        warehouse_ids=warehouse_ids,
        branch_id=branch_id,
        supplier_id=supplier_id,
    )
    supplier_alerts = get_supplier_delivery_alerts(
        warehouse_ids=warehouse_ids,
        branch_id=branch_id,
        lookback_days=lookback_days,
        overdue_rows=overdue_orders,
    )
    return {
        'overdue_orders_count': len(overdue_orders),
        'overdue_orders': overdue_orders,
        'supplier_alerts': supplier_alerts,
    }
