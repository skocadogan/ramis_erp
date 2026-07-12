from decimal import Decimal

from django.db.models import QuerySet, Sum, Count, F, Value, OuterRef, Subquery, DecimalField, Q, Case, When, BooleanField
from django.db.models.functions import Coalesce, ExtractDay
from django.utils.dateparse import parse_date

from core.decimal_constants import ZERO_MONEY, ZERO_QTY

from .models import StockItem, StockMovement, Supplier, StockCategory
from .stock_minimum import (
    ZERO_QTY,
    q_low_stock_stock_item_vs_annotated_current,
    q_low_stock_vs_effective_minimum,
    q_low_stock_warehouse_level,
    quantity_at_warehouse_level,
)


def get_category(category_id: str) -> StockCategory | None:
    """ID ile tek bir kategori getirir."""
    try:
        return StockCategory.objects.get(id=category_id, is_active=True)
    except (StockCategory.DoesNotExist, ValueError, TypeError):
        return None


def get_warehouse(warehouse_id: str):
    """Warehouse app'teki get_warehouse selector'ına proxy."""
    from apps.warehouse import selectors as wh_selectors
    return wh_selectors.get_warehouse(warehouse_id)


def get_warehouse_quantity(stock_item_id, warehouse_id=None):
    """Belirli bir depodaki stok miktarını getirir."""
    from apps.warehouse.models import WarehouseStockLevel
    
    qs = WarehouseStockLevel.objects.filter(
        stock_item_id=stock_item_id,
        is_active=True
    )
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    
    level = qs.first()
    return quantity_at_warehouse_level(level)


def get_stock_item_quantities(warehouse_id=None, limit_warehouse_ids=None):
    """Her StockItem için fiziksel ve rezerve miktarları hesaplayan subquery'ler."""
    from apps.warehouse.models import WarehouseStockLevel
    from .models import StockReservation, StockReservationStatus
    
    # Fiziksel Stok Subquery
    physical_qs = WarehouseStockLevel.objects.filter(
        stock_item_id=OuterRef('pk'),
        is_active=True
    )
    if warehouse_id:
        physical_qs = physical_qs.filter(warehouse_id=warehouse_id)
    elif limit_warehouse_ids is not None:
        physical_qs = physical_qs.filter(warehouse_id__in=limit_warehouse_ids)
    
    physical_sub = Coalesce(
        Subquery(
            physical_qs.values('stock_item_id').annotate(
                total=Sum('quantity')
            ).values('total'),
            output_field=DecimalField(max_digits=12, decimal_places=3)
        ),
        Value(ZERO_QTY)
    )

    # Rezervasyon Subquery
    res_qs = StockReservation.objects.filter(
        stock_item_id=OuterRef('pk'),
        status=StockReservationStatus.RESERVED
    )
    if warehouse_id:
        res_qs = res_qs.filter(warehouse_id=warehouse_id)
    elif limit_warehouse_ids is not None:
        res_qs = res_qs.filter(warehouse_id__in=limit_warehouse_ids)

    reserved_sub = Coalesce(
        Subquery(
            res_qs.values('stock_item_id').annotate(
                total=Sum('quantity')
            ).values('total'),
            output_field=DecimalField(max_digits=12, decimal_places=3)
        ),
        Value(ZERO_QTY)
    )
    
    return physical_sub, reserved_sub



def get_stock_item_effective_minimum(warehouse_id=None):
    """Her StockItem için geçerli minimum miktarı hesaplayan subquery (depo bazlı öncelikli)."""
    from apps.warehouse.models import WarehouseStockLevel
    
    if not warehouse_id:
        return F('minimum_quantity')

    # Depo seviyesindeki minimum_quantity subquery
    qs = WarehouseStockLevel.objects.filter(
        stock_item_id=OuterRef('pk'),
        warehouse_id=warehouse_id,
        is_active=True
    )
    
    return Coalesce(
        Subquery(
            qs.values('minimum_quantity')[:1],
            output_field=DecimalField(max_digits=12, decimal_places=6)
        ),
        F('minimum_quantity') # Fallback to StockItem.minimum_quantity
    )




def get_active_stock_items(
    warehouse_id=None,
    category_id=None,
    limit_warehouse_ids=None,
    supplier_id=None,
) -> QuerySet[StockItem]:
    """Aktif stok kalemlerini getirir. Warehouse ID ile filtreleme yapılabilir."""
    qs = StockItem.objects.filter(is_active=True).select_related('category')
    
    # Her stock item için WarehouseStockLevel'dan fiziksel ve rezerve miktarları al
    physical_sub, reserved_sub = get_stock_item_quantities(
        warehouse_id=warehouse_id,
        limit_warehouse_ids=None if warehouse_id else limit_warehouse_ids,
    )
    
    qs = qs.annotate(
        physical_quantity=physical_sub,
        reserved_quantity=reserved_sub,
        current_quantity=F('physical_quantity') - F('reserved_quantity'), # Available
        effective_minimum=get_stock_item_effective_minimum(
            warehouse_id=warehouse_id
        )
    )
    
    qs = qs.annotate(
        is_low_stock=Case(
            When(q_low_stock_vs_effective_minimum(), then=Value(True)),
            default=Value(False),
            output_field=BooleanField(),
        )
    )

    
    if category_id:
        from .models import StockCategory
        category_ids = [category_id]
        to_check = [category_id]
        while to_check:
            sub = StockCategory.objects.filter(parent_id__in=to_check).values_list('id', flat=True)
            if not sub:
                break
            category_ids.extend(sub)
            to_check = list(sub)
        qs = qs.filter(category_id__in=category_ids)

    if supplier_id:
        qs = qs.filter(suppliers__id=supplier_id).distinct()
    
    return qs


def get_low_stock_items(
    warehouse_id=None,
    category_id=None,
    limit_warehouse_ids=None,
) -> QuerySet[StockItem]:
    """Düşük stok kalemlerini getirir — 60s cache ile (RAPOR-3 O-6)."""
    from django.core.cache import cache
    import hashlib

    wh_key = warehouse_id or 'all'
    cat_key = category_id or 'all'
    limit_key = hashlib.md5(str(limit_warehouse_ids).encode()).hexdigest()[:8] if limit_warehouse_ids else 'none'
    cache_key = f'low_stock_items:{wh_key}:{cat_key}:{limit_key}'

    cached = cache.get(cache_key)
    if cached is not None:
        item_ids = cached
        qs = StockItem.objects.filter(is_active=True, id__in=item_ids).select_related('category')
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs

    qs = StockItem.objects.filter(is_active=True).select_related('category')
    qs = qs.annotate(
        current_quantity=get_stock_item_quantities(
            warehouse_id=warehouse_id,
            limit_warehouse_ids=None if warehouse_id else limit_warehouse_ids,
        )
    )
    qs = qs.filter(q_low_stock_stock_item_vs_annotated_current())

    if category_id:
        qs = qs.filter(category_id=category_id)

    cache.set(cache_key, list(qs.values_list('id', flat=True)), timeout=60)
    return qs


def get_stock_item_by_sku(sku: str) -> StockItem | None:
    """SKU ile stok kalemi getirir."""
    try:
        return StockItem.objects.select_related('category').get(sku=sku, is_active=True)
    except StockItem.DoesNotExist:
        return None


def get_stock_item(stock_item_id: str) -> StockItem | None:
    """ID ile stok kalemi getirir."""
    try:
        return StockItem.objects.select_related('category').get(id=stock_item_id, is_active=True)
    except (StockItem.DoesNotExist, ValueError, TypeError):
        return None


def get_stock_movements(
    stock_item_id=None,
    warehouse_id=None,
    movement_type: str | None = None,
    movement_types: list[str] | None = None,
    start_date=None,
    end_date=None,
    reason_code: str | None = None,
    supplier_id=None,
    active_only: bool = True,
) -> QuerySet[StockMovement]:
    """Stok hareketlerini filtreler."""
    qs = StockMovement.objects.select_related(
        'stock_item', 'performed_by', 'supplier', 'warehouse',
    ).prefetch_related('lot_consumptions')
    if active_only:
        qs = qs.filter(is_active=True)
    if stock_item_id:
        qs = qs.filter(stock_item_id=stock_item_id)
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)
    if movement_types:
        qs = qs.filter(movement_type__in=movement_types)
    elif movement_type:
        qs = qs.filter(movement_type=movement_type)
    if start_date:
        parsed_start = start_date if not isinstance(start_date, str) else parse_date(start_date.strip())
        if parsed_start:
            qs = qs.filter(created_at__date__gte=parsed_start)
    if end_date:
        parsed_end = end_date if not isinstance(end_date, str) else parse_date(end_date.strip())
        if parsed_end:
            qs = qs.filter(created_at__date__lte=parsed_end)
    if reason_code:
        qs = qs.filter(reference=reason_code)
    if supplier_id:
        qs = qs.filter(supplier_id=supplier_id)
    return qs.order_by('-created_at')


def get_stock_summary(warehouse_id=None, category_id=None, limit_warehouse_ids=None) -> dict:
    """Stok özet istatistiklerini döndürür (Optimize edildi)."""
    from apps.warehouse.models import WarehouseStockLevel
    from .stock_minimum import q_low_stock_warehouse_level
    
    # 1. Base query for levels
    levels_qs = WarehouseStockLevel.objects.filter(is_active=True)
    
    if warehouse_id:
        levels_qs = levels_qs.filter(warehouse_id=warehouse_id)
    elif limit_warehouse_ids is not None:
        levels_qs = levels_qs.filter(warehouse_id__in=limit_warehouse_ids)
        
    if category_id:
        from .models import StockCategory
        category_ids = [category_id]
        to_check = [category_id]
        while to_check:
            sub = StockCategory.objects.filter(parent_id__in=to_check).values_list('id', flat=True)
            if not sub:
                break
            category_ids.extend(sub)
            to_check = list(sub)
        levels_qs = levels_qs.filter(stock_item__category_id__in=category_ids)

    # 2. Aggregates (Value, Items, Low Stock Count)
    # Note: low_stock_count logic should ideally match get_active_stock_items logic.
    # If warehouse_id is filtered, we can count low stock levels directly.
    # Otherwise, it's better to use the specific q_low_stock_warehouse_level.
    
    # 2. Aggregates (Value, Items, Low Stock Count)
    from .models import StockReservation, StockReservationStatus
    
    # Rezervasyonlar
    res_qs = StockReservation.objects.filter(status=StockReservationStatus.RESERVED)
    if warehouse_id:
        res_qs = res_qs.filter(warehouse_id=warehouse_id)
    elif limit_warehouse_ids is not None:
        res_qs = res_qs.filter(warehouse_id__in=limit_warehouse_ids)

    res_agg = res_qs.aggregate(total_res=Coalesce(Sum('quantity'), Value(ZERO_QTY)))
    total_reserved = res_agg['total_res']

    agg = levels_qs.aggregate(
        total_value=Coalesce(
            Sum(F('quantity') * F('stock_item__last_purchase_price')), Value(ZERO_QTY)
        ),
        approximate_stock_value=Coalesce(
            Sum(F('quantity') * F('stock_item__average_cost')), ZERO_MONEY
        ),
        total_items_physical=Coalesce(Sum('quantity'), Value(ZERO_QTY)),
        low_stock_count=Count('stock_item_id', filter=q_low_stock_warehouse_level(), distinct=True),
        unique_items_count=Count('stock_item_id', distinct=True)
    )
    
    return {
        'total_items': agg['unique_items_count'] or 0,
        'total_value': agg['total_value'],
        'approximate_stock_value': agg['approximate_stock_value'],
        'low_stock_count': agg['low_stock_count'] or 0,
        'total_items_qty': agg['total_items_physical'] - total_reserved, # Available Qty
        'total_reserved_qty': total_reserved
    }


def get_detailed_fefo_inventory_report(
    warehouse_id=None,
    category_id=None,
    limit_warehouse_ids=None,
    search=None,
    stock_item_id=None,
    stock_status=None,
    include_lot_details=True,
) -> QuerySet[StockItem]:
    """
    FEFO (First-Expired-First-Out) mantığına göre detaylı envanter raporu için verileri getirir.
    include_lot_details=True ise her StockItem nesnesi 'active_lots' prefetch içerir (detay/modal).
    include_lot_details=False ise yalnızca toplam miktar/değer annotate edilir (liste API).
    """
    from decimal import Decimal
    from .models import StockLot
    from django.db.models import Q, Sum, F, DecimalField, ExpressionWrapper, Value
    from django.db.models.functions import Coalesce
    
    # Aktif stok kalemlerini getir
    qs = StockItem.objects.filter(is_active=True).select_related('category')
    
    if search:
        qs = qs.filter(
            Q(name__icontains=search) | 
            Q(sku__icontains=search) | 
            Q(barcode__icontains=search)
        )
    
    if category_id:
        qs = qs.filter(category_id=category_id)
    
    if stock_item_id:
        qs = qs.filter(id=stock_item_id)
        
    if stock_status:
        from .stock_minimum import MINIMUM_UNLIMITED_SENTINEL
        if stock_status == 'normal':
            qs = qs.filter(Q(current_quantity__gt=F('effective_minimum')) | Q(effective_minimum=MINIMUM_UNLIMITED_SENTINEL))
        elif stock_status == 'low':
            qs = qs.filter(Q(current_quantity__lt=F('effective_minimum')) & Q(current_quantity__gt=0) & Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL))
        elif stock_status == 'critical':
            qs = qs.filter(Q(current_quantity__lte=0) & Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL))
        elif stock_status == 'warning':
            qs = qs.filter(Q(current_quantity=F('effective_minimum')) & Q(effective_minimum__gt=MINIMUM_UNLIMITED_SENTINEL))

    lot_filter = Q(lots__quantity__gt=0, lots__is_active=True)
    if warehouse_id:
        lot_filter &= Q(lots__warehouse_id=warehouse_id)
    elif limit_warehouse_ids is not None:
        lot_filter &= Q(lots__warehouse_id__in=limit_warehouse_ids)

    if not include_lot_details:
        value_expr = ExpressionWrapper(
            F('lots__quantity') * F('lots__unit_price'),
            output_field=DecimalField(max_digits=20, decimal_places=6),
        )
        qs = qs.annotate(
            fefo_total_quantity=Coalesce(
                Sum('lots__quantity', filter=lot_filter),
                Value(Decimal('0')),
                output_field=DecimalField(max_digits=12, decimal_places=6),
            ),
            fefo_total_value=Coalesce(
                Sum(value_expr, filter=lot_filter),
                Value(Decimal('0')),
                output_field=DecimalField(max_digits=20, decimal_places=6),
            ),
        ).filter(fefo_total_quantity__gt=0).distinct().order_by('name', 'sku')
        return qs
        
    # Sadece yetkili/seçili depolardaki lotları filtrele
    lots_qs = StockLot.objects.filter(quantity__gt=0, is_active=True).order_by(
        F('expiry_date').asc(nulls_last=True),
        'received_at'
    )
    
    if warehouse_id:
        lots_qs = lots_qs.filter(warehouse_id=warehouse_id)
    elif limit_warehouse_ids is not None:
        lots_qs = lots_qs.filter(warehouse_id__in=limit_warehouse_ids)
        
    # Prefetch ile lotları ekle
    from django.db.models import Prefetch
    qs = qs.prefetch_related(
        Prefetch('lots', queryset=lots_qs, to_attr='active_lots')
    )
    
    return qs


def get_expiring_lots_qs(
    warehouse_id=None,
    warehouse_ids: list[str] | None = None,
    days_ahead: int = 3,
):
    """SKT'si belirtilen gün içinde dolacak (veya geçmiş) aktif lotları döndürür."""
    from datetime import timedelta
    from django.utils import timezone
    from .models import StockLot

    cutoff = timezone.now().date() + timedelta(days=days_ahead)
    qs = StockLot.objects.filter(
        expiry_date__isnull=False,
        expiry_date__lte=cutoff,
        quantity__gt=0,
        is_active=True,
    ).select_related('stock_item', 'warehouse').order_by('expiry_date', 'received_at')

    if warehouse_ids is not None:
        if not warehouse_ids:
            return qs.none()
        qs = qs.filter(warehouse_id__in=warehouse_ids)
    elif warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)

    return qs


def get_expired_lots_qs(
    warehouse_id=None,
    warehouse_ids: list[str] | None = None,
):
    """SKT'si geçmiş ve hâlâ stokta bulunan lotları döndürür."""
    from django.utils import timezone
    from .models import StockLot

    qs = StockLot.objects.filter(
        expiry_date__isnull=False,
        expiry_date__lt=timezone.now().date(),
        quantity__gt=0,
        is_active=True,
    ).select_related('stock_item', 'warehouse').order_by('expiry_date', 'received_at')

    if warehouse_ids is not None:
        if not warehouse_ids:
            return qs.none()
        qs = qs.filter(warehouse_id__in=warehouse_ids)
    elif warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)

    return qs


def compute_expiry_summary(
    warehouse_id=None,
    limit_warehouse_ids: list[str] | None = None,
):
    """Widget için SKT risk sayaçları — tek sorgu seti ile count."""
    from django.utils import timezone
    from datetime import timedelta
    from django.db.models import Q, Count
    from .models import StockLot

    today = timezone.now().date()
    base = StockLot.objects.filter(
        expiry_date__isnull=False,
        quantity__gt=0,
        is_active=True,
    )
    if warehouse_id:
        base = base.filter(warehouse_id=warehouse_id)
    elif limit_warehouse_ids is not None:
        if not limit_warehouse_ids:
            return {'within_3_days': 0, 'within_7_days': 0, 'expired': 0}
        base = base.filter(warehouse_id__in=limit_warehouse_ids)

    agg = base.aggregate(
        within_3_days=Count(
            'id',
            filter=Q(expiry_date__lte=today + timedelta(days=3)),
        ),
        within_7_days=Count(
            'id',
            filter=Q(expiry_date__lte=today + timedelta(days=7)),
        ),
        expired=Count(
            'id',
            filter=Q(expiry_date__lt=today),
        ),
    )
    return {
        'within_3_days': agg['within_3_days'] or 0,
        'within_7_days': agg['within_7_days'] or 0,
        'expired': agg['expired'] or 0,
    }


def get_supplier(supplier_id: str) -> Supplier | None:
    """ID ile tedarikçi getirir."""
    try:
        return Supplier.objects.get(id=supplier_id)
    except Supplier.DoesNotExist:
        return None


def get_suppliers(active_only: bool = True) -> QuerySet[Supplier]:
    """Tedarikçileri getirir."""
    qs = Supplier.objects.prefetch_related('stock_items')
    if active_only:
        qs = qs.filter(is_active=True)
    return qs


def get_supplier_performance(supplier_id, days: int = 30) -> dict:
    """Tedarikçi performans metrikleri (son N gün) — DB aggregate ile optimize edildi (RAPOR-3 O-5)."""
    from datetime import timedelta
    from django.utils import timezone
    from django.db.models import Avg, Q
    from apps.warehouse.models import GoodsReceiving, GoodsReceivingItem

    since = timezone.now().date() - timedelta(days=max(days, 1) - 1)

    receivings = GoodsReceiving.objects.filter(
        supplier_id=supplier_id,
        is_active=True,
        received_date__gte=since,
    ).select_related("purchase_order")

    receiving_ids = list(receivings.values_list("id", flat=True))
    items = GoodsReceivingItem.objects.filter(goods_receiving_id__in=receiving_ids)

    agg = items.aggregate(received=Sum("received_quantity"), rejected=Sum("rejected_quantity"))
    received = agg["received"] or ZERO_QTY
    rejected = agg["rejected"] or ZERO_QTY

    lead_agg = receivings.filter(
        purchase_order__order_date__isnull=False,
        received_date__isnull=False,
    ).aggregate(
        avg_lead_days=Avg(
            ExtractDay(F('received_date') - F('purchase_order__order_date'))
        )
    )
    avg_lead = lead_agg['avg_lead_days']

    on_time_agg = receivings.filter(
        purchase_order__expected_date__isnull=False,
    ).aggregate(
        on_time_total=Sum(Value(1)),
        on_time_ok=Sum(
            Value(1),
            filter=Q(received_date__isnull=False)
            & Q(received_date__lte=F('purchase_order__expected_date')),
        ),
    )
    on_time_total = on_time_agg['on_time_total'] or 0
    on_time_ok = on_time_agg['on_time_ok'] or 0

    on_time_rate = (on_time_ok / on_time_total) if on_time_total else None
    rejection_rate = (rejected / received) if received else ZERO_QTY

    return {
        "days": days,
        "since": since.isoformat(),
        "receivings_count": receivings.count(),
        "received_total": float(received),
        "rejected_total": float(rejected),
        "rejection_rate": float(rejection_rate),
        "avg_lead_days": avg_lead,
        "on_time_rate": on_time_rate,
    }
def get_stock_item_warehouse_levels(stock_item_id, user=None) -> list:
    """
    Bir stok kaleminin depolar bazındaki mevcut stok seviyelerini ve
    koşullu (düşük stok vb.) durumlarını döndürür.
    """
    from apps.warehouse.models import WarehouseStockLevel
    from core.branch_scope import user_accessible_warehouse_id_strings

    qs = WarehouseStockLevel.objects.filter(
        stock_item_id=stock_item_id,
        is_active=True,
    ).select_related('warehouse')

    if user:
        allowed_wh = user_accessible_warehouse_id_strings(user)
        if allowed_wh is not None:
            qs = qs.filter(warehouse_id__in=list(allowed_wh))

    levels = qs.order_by('warehouse__code', 'warehouse__name')
    return [
        {
            'warehouse_id': str(lvl.warehouse_id),
            'warehouse_code': lvl.warehouse.code,
            'warehouse_name': lvl.warehouse.name,
            'quantity': lvl.quantity,
            'minimum_quantity': lvl.minimum_quantity,
            'is_low_stock': lvl.is_low_stock,
        }
        for lvl in levels
    ]


def get_production_reserved_quantity(stock_item_id, warehouse_id=None) -> Decimal:
    """Üretim tarafından bloke edilmiş toplam miktar.

    ProductionPlan.approve() ile oluşturulan ACTIVE durumundaki
    rezervasyonların toplamını döndürür.
    """
    from .models import ProductionReservation

    qs = ProductionReservation.objects.filter(
        stock_item_id=stock_item_id,
        status='ACTIVE',
        is_active=True,
    )
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)

    result = qs.aggregate(total=Sum('quantity'))
    return result['total'] or ZERO_QTY


def get_production_reserved_subquery(warehouse_id=None):
    """Her StockItem için üretim rezervasyonu toplamını hesaplayan subquery.

    get_stock_item_quantities() ile benzer şekilde annotate amaçlı kullanılır.
    Dönen değer: Coalesce(Subquery(...), Value(0))
    """
    from .models import ProductionReservation

    qs = ProductionReservation.objects.filter(
        stock_item_id=OuterRef('pk'),
        status='ACTIVE',
        is_active=True,
    )
    if warehouse_id:
        qs = qs.filter(warehouse_id=warehouse_id)

    return Coalesce(
        Subquery(
            qs.values('stock_item_id').annotate(
                total=Sum('quantity')
            ).values('total'),
            output_field=DecimalField(max_digits=12, decimal_places=6),
        ),
        Value(ZERO_QTY),
    )
