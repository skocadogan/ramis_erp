from core.decimal_constants import ZERO_QTY
from django.db.models import QuerySet, Sum, F, Value, Count, Q
from django.db.models.functions import Coalesce
from apps.inventory.stock_minimum import ZERO_QTY, q_low_stock_warehouse_level

from .models import (
    Warehouse,
    WarehouseStockLevel,
    PurchaseOrder,
    PurchaseOrderStatus,
    GoodsReceiving,
    WarehouseTransfer,
    StockCounting,
    DeficiencyReport,
)
from .procurement_alert_selectors import get_overdue_purchase_orders_count


def get_warehouses(branch_id=None, active_only=True) -> QuerySet[Warehouse]:
    """Depoları getirir."""
    qs = Warehouse.objects.prefetch_related('branches').select_related('manager')
    if active_only:
        qs = qs.filter(is_active=True)
    if branch_id:
        qs = qs.filter(branches__id=branch_id)
    return qs


def get_warehouse(warehouse_id: str) -> Warehouse | None:
    """ID ile tek bir depo getirir."""
    try:
        return Warehouse.objects.get(id=warehouse_id, is_active=True)
    except (Warehouse.DoesNotExist, ValueError, TypeError):
        return None


def get_warehouse_stock_levels(
    warehouse_id,
    low_stock_only=False,
    search: str | None = None,
) -> QuerySet[WarehouseStockLevel]:
    """Bir deponun stok seviyelerini getirir."""
    qs = WarehouseStockLevel.objects.filter(
        warehouse_id=warehouse_id,
        is_active=True,
        stock_item__is_active=True,
    ).select_related('stock_item', 'stock_item__category', 'warehouse')
    if low_stock_only:
        qs = qs.filter(q_low_stock_warehouse_level())
    q_raw = (search or '').strip()
    if q_raw:
        qs = qs.filter(
            Q(stock_item__name__icontains=q_raw)
            | Q(stock_item__sku__icontains=q_raw),
        )
    # Sayfalı API için deterministik sıra (OFFSET tutarlılığı)
    return qs.order_by('stock_item__name', 'stock_item_id')


def get_warehouse_summary(warehouse_id) -> dict:
    """Depo özet istatistiklerini döndürür."""
    levels = WarehouseStockLevel.objects.filter(
        warehouse_id=warehouse_id,
        is_active=True,
        stock_item__is_active=True,
    )
    agg = levels.aggregate(
        total_items=Count('id'),
        total_value=Coalesce(
            Sum(F('quantity') * F('stock_item__last_purchase_price')),
            Value(ZERO_QTY),
        ),
        low_stock_count=Count('id', filter=q_low_stock_warehouse_level()),
    )
    return agg


def get_purchase_orders(
    warehouse_id=None, supplier_id=None, status=None,
    stock_item_id=None,
    start_date=None, end_date=None,
    overdue=None,
) -> QuerySet[PurchaseOrder]:
    """Satın alma siparişlerini filtreler."""
    qs = PurchaseOrder.objects.filter(
        is_active=True,
    ).select_related(
        'supplier', 'warehouse', 'created_by', 'approved_by',
    ).prefetch_related('items__stock_item')
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    if supplier_id:
        qs = qs.filter(supplier_id=supplier_id)
    if status:
        qs = qs.filter(status=status)
    if overdue:
        from django.utils import timezone
        today = timezone.now().date()
        qs = qs.filter(
            status__in=[
                PurchaseOrderStatus.ORDERED,
                PurchaseOrderStatus.PARTIALLY_RECEIVED,
            ],
            expected_date__isnull=False,
            expected_date__lt=today,
        )
    if stock_item_id:
        qs = qs.filter(
            items__stock_item_id=stock_item_id,
            items__is_active=True,
        ).distinct()
    if start_date:
        qs = qs.filter(order_date__gte=start_date)
    if end_date:
        qs = qs.filter(order_date__lte=end_date)
    return qs.order_by('-created_at')


def get_goods_receivings(
    warehouse_id=None, supplier_id=None, purchase_order_id=None, status=None,
    start_date=None, end_date=None,
) -> QuerySet[GoodsReceiving]:
    """Mal kabul işlemlerini filtreler."""
    qs = GoodsReceiving.objects.filter(
        is_active=True,
    ).select_related(
        'supplier', 'warehouse', 'purchase_order', 'received_by', 'inspected_by',
    ).prefetch_related('items__stock_item')
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    if supplier_id:
        qs = qs.filter(supplier_id=supplier_id)
    if purchase_order_id:
        qs = qs.filter(purchase_order_id=purchase_order_id)
    if status:
        qs = qs.filter(status=status)
    if start_date:
        qs = qs.filter(received_date__gte=start_date)
    if end_date:
        qs = qs.filter(received_date__lte=end_date)
    return qs.order_by('-created_at')


def get_transfers(
    source_warehouse_id=None, target_warehouse_id=None,
    status=None, start_date=None, end_date=None,
) -> QuerySet[WarehouseTransfer]:
    """Depolar arası transferleri filtreler."""
    qs = WarehouseTransfer.objects.filter(
        is_active=True,
    ).select_related(
        'source_warehouse', 'target_warehouse', 'requested_by', 'approved_by',
    ).prefetch_related('items__stock_item')
    if source_warehouse_id:
        qs = qs.filter(source_warehouse_id=source_warehouse_id)
    if target_warehouse_id:
        qs = qs.filter(target_warehouse_id=target_warehouse_id)
    if status:
        qs = qs.filter(status=status)
    if start_date:
        qs = qs.filter(transfer_date__gte=start_date)
    if end_date:
        qs = qs.filter(transfer_date__lte=end_date)
    return qs.order_by('-created_at')


def get_stock_countings(
    warehouse_id=None, status=None,
) -> QuerySet[StockCounting]:
    """Stok sayımlarını filtreler."""
    qs = StockCounting.objects.filter(
        is_active=True,
    ).select_related(
        'warehouse', 'counted_by', 'approved_by',
    ).prefetch_related('items__stock_item')
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    if status:
        qs = qs.filter(status=status)
    return qs.order_by('-created_at')


def get_deficiency_reports(
    *,
    warehouse_id=None,
    branch_id=None,
    kitchen_station_id=None,
    status=None,
) -> QuerySet[DeficiencyReport]:
    """Eksik listesi raporlarını filtreler (hedef depo = mutfak deposu)."""
    qs = DeficiencyReport.objects.filter(is_active=True)
    if warehouse_id:
        qs = qs.filter(target_warehouse_id=warehouse_id)
    if branch_id:
        qs = qs.filter(kitchen_station__branch_id=branch_id)
    if kitchen_station_id:
        qs = qs.filter(kitchen_station_id=kitchen_station_id)
    if status:
        qs = qs.filter(status=status)
    return qs.order_by('-created_at')


def get_all_warehouses_summary(branch_id=None, user=None) -> dict:
    """Kullanıcının erişebildiği depoların özet bilgisini döndürür."""
    from core.branch_scope import filter_queryset_by_accessible_warehouses

    qs = get_warehouses(branch_id=branch_id)
    if user is not None:
        qs = filter_queryset_by_accessible_warehouses(qs, user, warehouse_id_field="id")

    return {
        'total_warehouses': qs.count(),
        'pending_orders': PurchaseOrder.objects.filter(
            is_active=True,
            status__in=['DRAFT', 'PENDING', 'APPROVED', 'ORDERED'],
            warehouse__in=qs,
        ).count(),
        'overdue_orders': get_overdue_purchase_orders_count(
            warehouse_ids=list(qs.values_list('id', flat=True)),
        ),
        'pending_receivings': GoodsReceiving.objects.filter(
            is_active=True,
            status='PENDING',
            warehouse__in=qs,
        ).count(),
        'active_transfers': WarehouseTransfer.objects.filter(
            is_active=True,
            status='IN_TRANSIT',
        ).filter(
            Q(source_warehouse__in=qs) | Q(target_warehouse__in=qs),
        ).count(),
        'pending_countings': StockCounting.objects.filter(
            is_active=True,
            status__in=['DRAFT', 'IN_PROGRESS', 'COMPLETED'],
            warehouse__in=qs,
        ).count(),
    }
