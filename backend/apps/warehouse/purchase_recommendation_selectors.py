"""Satın alma öneri motoru — toplu veri selector'ları."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import DecimalField, F, Q, QuerySet, Sum
from django.db.models.functions import Coalesce, Greatest
from django.utils import timezone

from apps.inventory.models import StockItem, StockMovement, StockMovementType
from apps.inventory.selectors import get_active_stock_items
from apps.inventory.stock_minimum import MINIMUM_UNLIMITED_SENTINEL
from apps.warehouse.models import PurchaseOrderItem, PurchaseOrderStatus

from core.decimal_constants import ZERO_QTY


def get_tracked_stock_items_qs(
    warehouse_id: str,
    *,
    category_id: str | None = None,
    search: str | None = None,
    only_candidates: bool = False,
    consumption_since: datetime | None = None,
) -> QuerySet[StockItem]:
    """
    Depo için izlenen stok kalemleri (minimum -1 olanlar hariç).
    only_candidates=True ise tüketim / düşük stok / yoldaki sipariş adaylarına daraltır.
    """
    qs = get_active_stock_items(warehouse_id=warehouse_id, category_id=category_id).filter(
        effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL,
    )

    q_raw = (search or '').strip()
    if q_raw:
        qs = qs.filter(Q(name__icontains=q_raw) | Q(sku__icontains=q_raw))

    if not only_candidates or consumption_since is None:
        return qs.order_by('name', 'id')

    consumption_ids = StockMovement.objects.filter(
        warehouse_id=warehouse_id,
        movement_type__in=[StockMovementType.OUT, StockMovementType.WASTE],
        created_at__gte=consumption_since,
        is_active=True,
    ).values_list('stock_item_id', flat=True).distinct()

    in_transit_ids = PurchaseOrderItem.objects.filter(
        purchase_order__warehouse_id=warehouse_id,
        purchase_order__status__in=[
            PurchaseOrderStatus.ORDERED,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
        ],
        is_active=True,
    ).annotate(
        remaining=Greatest(
            F('quantity') - F('received_quantity'),
            ZERO_QTY,
            output_field=DecimalField(max_digits=12, decimal_places=6),
        ),
    ).filter(remaining__gt=ZERO_QTY).values_list('stock_item_id', flat=True).distinct()

    return qs.filter(
        Q(id__in=consumption_ids)
        | Q(is_low_stock=True)
        | Q(id__in=in_transit_ids),
    ).order_by('name', 'id')


def get_consumption_totals(
    warehouse_id: str,
    since: datetime,
    stock_item_ids: list | None = None,
) -> dict[str, Decimal]:
    """Depo × kalem bazında OUT+WASTE tüketim toplamı."""
    movs = StockMovement.objects.filter(
        warehouse_id=warehouse_id,
        movement_type__in=[StockMovementType.OUT, StockMovementType.WASTE],
        created_at__gte=since,
        is_active=True,
    )
    if stock_item_ids is not None:
        if not stock_item_ids:
            return {}
        movs = movs.filter(stock_item_id__in=stock_item_ids)

    rows = movs.values('stock_item_id').annotate(
        total=Coalesce(Sum('quantity'), ZERO_QTY),
    )
    return {str(r['stock_item_id']): r['total'] or ZERO_QTY for r in rows}


def get_in_transit_po_totals(
    warehouse_id: str,
    stock_item_ids: list | None = None,
) -> dict[str, Decimal]:
    """ORDERED / PARTIALLY_RECEIVED PO kalemlerinde kalan miktar."""
    items = PurchaseOrderItem.objects.filter(
        purchase_order__warehouse_id=warehouse_id,
        purchase_order__status__in=[
            PurchaseOrderStatus.ORDERED,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
        ],
        is_active=True,
    )
    if stock_item_ids is not None:
        if not stock_item_ids:
            return {}
        items = items.filter(stock_item_id__in=stock_item_ids)

    rows = items.values('stock_item_id').annotate(
        in_transit=Coalesce(
            Sum(F('quantity') - F('received_quantity')),
            ZERO_QTY,
        ),
    )
    out: dict[str, Decimal] = {}
    for r in rows:
        qty = r['in_transit'] or ZERO_QTY
        if qty > ZERO_QTY:
            out[str(r['stock_item_id'])] = qty
    return out


def consumption_window_start(weeks: int) -> datetime:
    """Hafta penceresi başlangıcı (timezone-aware)."""
    weeks = max(1, min(int(weeks), 52))
    today = timezone.now().date()
    start_date = today - timedelta(days=weeks * 7)
    return timezone.make_aware(datetime.combine(start_date, time.min))
