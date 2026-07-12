"""Dashboard analitik seçicileri (satış / sipariş verisi)."""
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from core.decimal_constants import ZERO_MONEY, ZERO_QTY
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import ExtractHour, TruncDate
from django.utils import timezone
from apps.branches.models import BranchTarget
from apps.orders.models import OrderItem, OrderStatus
from apps.sales.models import Sale, SalePayment
from apps.inventory.models import StockMovement, StockMovementType
from apps.warehouse.models import WarehouseStockLevel


def invalidate_dashboard_cache(branch_id=None):
    """
    Satış verisi değiştiğinde dashboard cache'ini geçersiz kılar.
    Sıcak veri tazeleme: satış tamamlandıktan hemen sonra çağrılmalıdır.
    """
    from django.core.cache import cache
    today = timezone.now().date()
    yesterday = today - timedelta(days=1)
    next_week = today + timedelta(days=7)

    # Today's and recent dates for dashboard summary
    for target_date in [yesterday, today, next_week]:
        # Branch-specific key
        if branch_id is not None:
            branch_key = sorted([str(branch_id)])
            cache.delete(f"dash_summary_{branch_key}_{target_date}_{target_date}")
            cache.delete(f"inv_dash_summary_{branch_key}_{target_date - timedelta(days=6)}_{target_date}")
        # All-branches key
        cache.delete(f"dash_summary_all_{target_date}_{target_date}")
        cache.delete(f"inv_dash_summary_all_{target_date - timedelta(days=6)}_{target_date}")


def _sale_qs(branch_ids: list[str] | None):
    """
    ``branch_ids``:
    - ``None`` — şube filtresi yok (tüm satışlar; yalnızca süper kullanıcı akışı).
    - ``[]`` — erişilebilir şube yok.
    - ``[...]`` — ``branch_id__in``.
    """
    qs = Sale.objects.filter(is_deleted=False)
    if branch_ids is not None:
        if not branch_ids:
            return qs.none()
        return qs.filter(branch_id__in=branch_ids)
    return qs


def _pct_change(curr: float, prev: float) -> float:
    if prev == 0:
        return 100.0 if curr > 0 else 0.0
    return round((curr - prev) / prev * 100.0, 2)


def get_top_selling_products(
    branch_ids: list[str] | None = None,
    limit: int = 10,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    start = start_date or timezone.now().date()
    end = end_date or start
    qs = OrderItem.objects.filter(
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date__gte=start,
        order__sale__paid_at__date__lte=end,
        parent_item__isnull=True,
        status=OrderStatus.COMPLETED,
    )
    if branch_ids is not None:
        if not branch_ids:
            return []
        qs = qs.filter(order__branch_id__in=branch_ids)
    rows = (
        qs.values("product_id", "product__name")
        .annotate(qty=Sum(F("quantity") * F("portion_multiplier")), revenue=Sum("total_price"))
        .order_by("-qty")[:limit]
    )
    return [
        {
            "product_id": str(r["product_id"]),
            "name": r["product__name"],
            "quantity": float(r["qty"] or 0),
            "revenue": float(r["revenue"] or 0),
        }
        for r in rows
    ]


def get_category_sales_breakdown(
    branch_ids: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[dict[str, Any]]:
    start = start_date or timezone.now().date()
    end = end_date or start
    qs = OrderItem.objects.filter(
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date__gte=start,
        order__sale__paid_at__date__lte=end,
        parent_item__isnull=True,
        status=OrderStatus.COMPLETED,
    )
    if branch_ids is not None:
        if not branch_ids:
            return []
        qs = qs.filter(order__branch_id__in=branch_ids)
    rows = qs.values("product__category__name").annotate(revenue=Sum("total_price")).order_by("-revenue")
    return [
        {"category": r["product__category__name"] or "—", "revenue": float(r["revenue"] or 0)}
        for r in rows
    ]


def get_payment_breakdown_for_range(
    branch_ids: list[str] | None = None,
    start: date | None = None,
    end: date | None = None,
):
    start_d = start or timezone.now().date()
    end_d = end or start_d
    sp = SalePayment.objects.filter(
        sale__is_deleted=False,
        sale__paid_at__date__gte=start_d,
        sale__paid_at__date__lte=end_d,
    )
    if branch_ids is not None:
        if not branch_ids:
            return {"CASH": 0.0, "CARD": 0.0, "OTHER": 0.0}
        sp = sp.filter(sale__branch_id__in=branch_ids)
    rows = sp.values("payment_method").annotate(total=Sum("amount"))
    from apps.sales.payment_utils import aggregation_bucket

    out = {"CASH": ZERO_MONEY, "CARD": ZERO_MONEY, "OTHER": ZERO_MONEY}
    for r in rows:
        bucket = aggregation_bucket(r["payment_method"])
        out[bucket] = out.get(bucket, ZERO_MONEY) + (r["total"] or ZERO_MONEY)
    return {k: float(v) for k, v in out.items()}


def get_hourly_revenue(branch_ids: list[str] | None = None, ref_date: date | None = None) -> list[dict[str, Any]]:
    d = ref_date or timezone.now().date()
    start = timezone.make_aware(datetime.combine(d, time.min))
    end = timezone.make_aware(datetime.combine(d, time.max))

    qs = Sale.objects.filter(
        is_deleted=False,
        paid_at__gte=start,
        paid_at__lte=end,
    )
    if branch_ids is not None:
        if not branch_ids:
            return []
        qs = qs.filter(branch_id__in=branch_ids)

    rows = (
        qs.annotate(hour=ExtractHour("paid_at"))
        .values("hour")
        .annotate(revenue=Sum("total_amount"))
        .order_by("hour")
    )
    return [{"hour": r["hour"], "revenue": float(r["revenue"] or 0)} for r in rows]
 
 
def get_dashboard_anomalies(branch_ids: list[str] | None = None) -> list[dict[str, Any]]:
    """
    Basit kural tabanlı anomali tespiti.
    Bugünkü kategori satışlarını son 4 haftanın aynı günündeki ortalamayla kıyaslar.
    %30 ve üzeri düşüşleri uyarı olarak döner.
    """
    today = timezone.now().date()
    past_dates = [today - timedelta(days=7 * i) for i in range(1, 5)]

    # Bugünkü veriler
    today_qs = OrderItem.objects.filter(
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date=today,
        status=OrderStatus.COMPLETED,
        parent_item__isnull=True,
    )
    if branch_ids is not None:
        if not branch_ids:
            return []
        today_qs = today_qs.filter(order__branch_id__in=branch_ids)

    today_rows = today_qs.values("product__category__name").annotate(rev=Sum("total_price"))
    today_map = {r["product__category__name"] or "—": float(r["rev"] or 0) for r in today_rows}

    # Geçmiş veriler (tek sorgu)
    hist_qs = OrderItem.objects.filter(
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date__in=past_dates,
        status=OrderStatus.COMPLETED,
        parent_item__isnull=True,
    )
    if branch_ids is not None:
        hist_qs = hist_qs.filter(order__branch_id__in=branch_ids)

    hist_rows = hist_qs.values("product__category__name").annotate(total_rev=Sum("total_price"))
    
    anomalies = []
    for h in hist_rows:
        cat = h["product__category__name"] or "—"
        hist_avg = float(h["total_rev"] or 0) / 4.0
        
        # Sadece anlamlı hacmi olan kategorileri inceleyelim (örn. ortalaması > 100 TL)
        if hist_avg > 100:
            current_rev = today_map.get(cat, 0.0)
            diff_pct = _pct_change(current_rev, hist_avg)
            
            if diff_pct <= -35: # %35 ve üzeri düşüş ciddidir
                anomalies.append({
                    "severity": "warning",
                    "title": f"{cat} Satışlarında Düşüş",
                    "description": f"Bugün {cat} kategorisi satışı, son 4 haftanın ortalamasından %{abs(int(diff_pct))} daha düşük.",
                    "type": "category_drop",
                    "meta": {"category": cat, "drop_pct": diff_pct}
                })
                
    return anomalies


def get_target_stats(branch_ids: list[str] | None = None) -> dict[str, Any]:
    """
    Şube bazlı aylık hedef gerçekleşme durumunu döner.
    """
    now = timezone.now()
    first_day_of_month = now.date().replace(day=1)
    
    qs_rev = OrderItem.objects.filter(
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date__gte=first_day_of_month,
        status=OrderStatus.COMPLETED,
        parent_item__isnull=True,
    )
    if branch_ids:
        qs_rev = qs_rev.filter(order__branch_id__in=branch_ids)

    current_month_rev = qs_rev.aggregate(rev=Sum("total_price"))["rev"] or 0
    
    # Bu aya ait hedefleri çek
    targets_qs = BranchTarget.objects.filter(month=now.month, year=now.year)
    if branch_ids:
        targets_qs = targets_qs.filter(branch_id__in=branch_ids)
        
    total_target = targets_qs.aggregate(total=Sum("target_revenue"))["total"] or 0
    
    percentage = 0
    if total_target > 0:
        percentage = round((float(current_month_rev) / float(total_target)) * 100, 1)
        
    return {
        "month_revenue": float(current_month_rev),
        "target_revenue": float(total_target),
        "percentage": percentage
    }


def _dashboard_cache_timeout() -> int:
    from django.conf import settings
    base = getattr(settings, 'DASHBOARD_CACHE_TIMEOUT', 120)
    # Thundering herd önleme: ±%10 jitter ekle
    import random
    jitter = random.randint(-max(1, base // 10), max(1, base // 10))
    return max(10, base + jitter)


def get_dashboard_summary(
    branch_ids: list[str] | None = None, 
    start_date: date | None = None, 
    end_date: date | None = None
) -> dict[str, Any]:
    from django.core.cache import cache
    from apps.shifts.selectors import get_active_shift

    end = end_date or timezone.now().date()
    start = start_date or end

    # Cache Key generation
    branch_key = sorted(branch_ids) if branch_ids else "all"
    cache_key = f"dash_summary_{branch_key}_{start}_{end}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    start_dt = timezone.make_aware(datetime.combine(start, time.min))
    end_dt = timezone.make_aware(datetime.combine(end, time.max))

    def range_rev_cnt(s, e):
        # Belirli bir aralıktaki toplamları Sale tablosu üzerinden (Net Ciro) döner
        qs = Sale.objects.filter(is_deleted=False)
        if branch_ids is not None:
            if not branch_ids:
                return ZERO_MONEY, 0
            qs = qs.filter(branch_id__in=branch_ids)
            
        if s:
            qs = qs.filter(paid_at__date__gte=s)
        if e:
            qs = qs.filter(paid_at__date__lte=e)
            
        agg = qs.aggregate(
            rev=Sum("total_amount"), 
            cnt=Count("id")
        )
        rev = agg["rev"] or ZERO_MONEY
        cnt = agg["cnt"] or 0
        return rev, cnt

    # Mevcut periyot verileri
    t_rev, t_cnt = range_rev_cnt(start, end)

    # Karşılaştırma periyodu (Önceki aynı uzunluktaki periyot)
    p_days = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = start - timedelta(days=p_days)
    
    y_rev, y_cnt = range_rev_cnt(prev_start, prev_end)
    
    avg = (t_rev / t_cnt) if t_cnt else ZERO_MONEY
    y_avg = (y_rev / y_cnt) if y_cnt else ZERO_MONEY

    shift = None
    if branch_ids is not None and len(branch_ids) == 1:
        shift = get_active_shift(branch_ids[0])
    elif branch_ids is None:
        shift = None

    active_shift_data = None
    if shift:
        active_shift_data = {
            "id": str(shift.id),
            "opened_at": shift.opened_at.isoformat(),
            "opening_cash": float(shift.opening_cash),
            "branch_id": str(shift.branch_id),
        }

    # Şube bazlı ciro kırılımı (birden fazla şube varsa anlamlı)
    branch_revenue_list = []
    if branch_ids is None or len(branch_ids) > 1:
        qs_br = _sale_qs(branch_ids).filter(paid_at__date__gte=start, paid_at__date__lte=end)
        br_rows = (
            qs_br.values("branch_id", "branch__name")
            .annotate(revenue=Sum("total_amount"))
            .order_by("-revenue")
        )
        branch_revenue_list = [
            {
                "branch_id": str(r["branch_id"]),
                "branch_name": r["branch__name"],
                "revenue": float(r["revenue"] or 0),
            }
            for r in br_rows
        ]

    from django.utils.dateparse import parse_date
    spark_start = end - timedelta(days=29)
    qs_spark = (
        Sale.objects.filter(
            is_deleted=False,
            paid_at__date__gte=spark_start,
            paid_at__date__lte=end,
        )
    )
    if branch_ids is not None:
        qs_spark = qs_spark.filter(branch_id__in=branch_ids)

    spark_rows = (
        qs_spark.annotate(day=TruncDate("paid_at"))
        .values("day")
        .annotate(revenue=Sum("total_amount"), cnt=Count("id"))
        .order_by("day")
    )
    spark_by_day = {}
    for r in spark_rows:
        raw = r["day"]
        if raw is None:
            continue
        if isinstance(raw, date):
            dkey = raw
        elif hasattr(raw, "date"):
            dkey = raw.date()
        else:
            dkey = parse_date(str(raw)[:10])
            if not dkey:
                continue
        spark_by_day[dkey] = {"rev": float(r["revenue"] or 0), "cnt": r["cnt"] or 0}

    rev_sparkline = []
    cnt_sparkline = []
    cur_d = spark_start
    while cur_d <= end:
        d_val = spark_by_day.get(cur_d, {"rev": 0.0, "cnt": 0})
        rev_sparkline.append({"date": cur_d.isoformat(), "value": d_val["rev"]})
        cnt_sparkline.append({"date": cur_d.isoformat(), "value": d_val["cnt"]})
        cur_d += timedelta(days=1)

    res = {
        "reference_date": end.isoformat(),
        "revenue": {
            "today": float(t_rev),
            "yesterday": float(y_rev),
            "change_pct": _pct_change(float(t_rev), float(y_rev)),
            "sparkline_data": rev_sparkline,
        },
        "order_count": {
            "today": t_cnt,
            "yesterday": y_cnt,
            "change_pct": _pct_change(float(t_cnt), float(y_cnt)),
            "sparkline_data": cnt_sparkline,
        },
        "avg_order_value": float(avg),
        "avg_order_value_yesterday": float(y_avg),
        "top_products": get_top_selling_products(branch_ids, limit=10, start_date=start, end_date=end),
        "category_breakdown": get_category_sales_breakdown(
            branch_ids, start_date=start, end_date=end
        ),
        "hourly_revenue": get_hourly_revenue(branch_ids, ref_date=end),
        "payment_breakdown": get_payment_breakdown_for_range(branch_ids, start, end),
        "anomalies": get_dashboard_anomalies(branch_ids) if start == end and end == timezone.now().date() else [],
        "target_stats": get_target_stats(branch_ids),
        "active_shift": active_shift_data,
        "branch_revenue": branch_revenue_list,
    }
    cache.set(cache_key, res, _dashboard_cache_timeout())
    return res


def get_revenue_chart_data(
    branch_ids: list[str] | None = None, 
    start_date: date | None = None, 
    end_date: date | None = None
) -> list[dict[str, Any]]:
    """
    Günlük gelir noktaları. [start_date, end_date] aralığı.
    """
    from django.utils.dateparse import parse_date

    end = end_date or timezone.now().date()
    start = start_date or (end - timedelta(days=6))
    
    qs = Sale.objects.filter(
        is_deleted=False,
        paid_at__date__gte=start,
        paid_at__date__lte=end,
    )
    if branch_ids is not None:
        if not branch_ids:
            qs = qs.none()
        else:
            qs = qs.filter(branch_id__in=branch_ids)

    qs = (
        qs.annotate(day=TruncDate("paid_at"))
        .values("day")
        .annotate(revenue=Sum("total_amount"))
        .order_by("day")
    )
    by_day: dict[date, float] = {}
    for r in qs:
        raw = r["day"]
        if raw is None:
            continue
        if isinstance(raw, date):
            dkey = raw
        elif hasattr(raw, "date"):
            dkey = raw.date()
        else:
            dkey = parse_date(str(raw)[:10])
            if not dkey:
                continue
        by_day[dkey] = float(r["revenue"] or 0)

    out = []
    cur = start
    while cur <= end:
        out.append({"date": cur.isoformat(), "revenue": by_day.get(cur, 0.0)})
        cur += timedelta(days=1)
    return out


# ──────────────────────────────────────────────────
# Depo / Stok Analitikleri
# ──────────────────────────────────────────────────
def get_inventory_dashboard_summary(
    branch_ids: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    top_limit: int = 10,
) -> dict[str, Any]:
    """
    Dashboard için stok analitik özeti.
    - low_stock_count: minimum altı stok seviyeleri (şube bazlı depolar)
    - stock_value: envanter değeri (quantity * average_cost)
    - consumption_top: OUT + WASTE toplam tüketim ilk N
    - waste_ratio: WASTE / (OUT+WASTE)
    """
    from django.db.models.functions import Coalesce

    from apps.inventory.stock_minimum import q_low_stock_warehouse_level

    today = timezone.now().date()
    s = start_date or (today - timedelta(days=6))
    e = end_date or today

    from django.core.cache import cache
    branch_key = sorted(branch_ids) if branch_ids else "all"
    cache_key = f"inv_dash_summary_{branch_key}_{s}_{e}"
    cached_data = cache.get(cache_key)
    if cached_data:
        return cached_data

    levels = WarehouseStockLevel.objects.filter(is_active=True)
    warehouse_ids: list | None = None
    if branch_ids is not None:
        if not branch_ids:
            return {
                "range": {"start_date": s.isoformat(), "end_date": e.isoformat()},
                "low_stock_count": 0,
                "stock_value": 0.0,
                "warehouse_values": [],
                "waste_ratio": 0.0,
                "consumption_top": [],
                "waste_top": [],
            }
        from apps.warehouse.models import Warehouse

        warehouse_ids = list(
            Warehouse.objects.filter(branches__id__in=branch_ids, is_active=True)
            .values_list("id", flat=True)
            .distinct()
        )
        if not warehouse_ids:
            return {
                "range": {"start_date": s.isoformat(), "end_date": e.isoformat()},
                "low_stock_count": 0,
                "stock_value": 0.0,
                "warehouse_values": [],
                "waste_ratio": 0.0,
                "consumption_top": [],
                "waste_top": [],
            }
        levels = levels.filter(warehouse_id__in=warehouse_ids)

    low_stock_count = levels.filter(q_low_stock_warehouse_level()).count()

    stock_value = levels.aggregate(
        total=Coalesce(Sum(F("quantity") * F("stock_item__average_cost")), ZERO_MONEY)
    )["total"]

    warehouse_values_qs = (
        levels.values("warehouse_id", "warehouse__name", "warehouse__code")
        .annotate(value=Coalesce(Sum(F("quantity") * F("stock_item__average_cost")), ZERO_MONEY))
        .order_by("-value")
    )
    warehouse_values = [
        {
            "warehouse_id": str(r["warehouse_id"]),
            "warehouse_name": r["warehouse__name"],
            "warehouse_code": r["warehouse__code"],
            "value": float(r["value"] or 0),
        }
        for r in warehouse_values_qs
    ]

    s_dt = timezone.make_aware(datetime.combine(s, time.min))
    e_dt = timezone.make_aware(datetime.combine(e, time.max))

    movs = StockMovement.objects.filter(
        warehouse__isnull=False,
        movement_type__in=[StockMovementType.OUT, StockMovementType.WASTE],
        created_at__gte=s_dt,
        created_at__lte=e_dt,
    ).select_related("stock_item", "warehouse")
    if branch_ids is not None:
        if not branch_ids:
            movs = movs.none()
        elif warehouse_ids is not None:
            movs = movs.filter(warehouse_id__in=warehouse_ids)
        else:
            movs = movs.filter(warehouse__branches__id__in=branch_ids)

    totals = movs.aggregate(
        out_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.OUT)), ZERO_QTY),
        waste_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.WASTE)), ZERO_QTY),
    )
    out_qty = totals["out_qty"] or ZERO_QTY
    waste_qty = totals["waste_qty"] or ZERO_QTY
    denom = out_qty + waste_qty
    waste_ratio = float((waste_qty / denom) if denom else ZERO_QTY)

    top_rows = (
        movs.values("stock_item_id", "stock_item__name", "stock_item__sku", "stock_item__unit")
        .annotate(consumed=Sum("quantity"))
        .order_by("-consumed")[:top_limit]
    )
    consumption_top = [
        {
            "stock_item_id": str(r["stock_item_id"]),
            "name": r["stock_item__name"],
            "sku": r["stock_item__sku"],
            "unit": r["stock_item__unit"],
            "consumed": float(r["consumed"] or 0),
        }
        for r in top_rows
    ]

    waste_rows = (
        movs.filter(movement_type=StockMovementType.WASTE)
        .values("stock_item_id", "stock_item__name", "stock_item__sku", "stock_item__unit")
        .annotate(waste=Sum("quantity"))
        .order_by("-waste")[:top_limit]
    )
    waste_top = [
        {
            "stock_item_id": str(r["stock_item_id"]),
            "name": r["stock_item__name"],
            "sku": r["stock_item__sku"],
            "unit": r["stock_item__unit"],
            "waste": float(r["waste"] or 0),
        }
        for r in waste_rows
    ]

    res = {
        "range": {"start_date": s.isoformat(), "end_date": e.isoformat()},
        "low_stock_count": low_stock_count,
        "stock_value": float(stock_value or 0),
        "warehouse_values": warehouse_values,
        "waste_ratio": waste_ratio,
        "consumption_top": consumption_top,
        "waste_top": waste_top,
    }
    cache.set(cache_key, res, _dashboard_cache_timeout())
    return res


def get_product_sales_analytics(
    branch_ids: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    product_id: str | None = None,
) -> dict[str, Any]:
    """
    Ürün bazlı detaylı satış analitiği.
    - products: ürünlerin toplam satış miktarı ve cirosu
    - daily_trends: ilk 5 ürün için (veya seçilen ürün için) günlük satış trendi
    """
    start = start_date or timezone.now().date()
    end = end_date or start

    base_qs = OrderItem.objects.filter(
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date__gte=start,
        order__sale__paid_at__date__lte=end,
        parent_item__isnull=True,
        status=OrderStatus.COMPLETED,
    )
    if branch_ids is not None:
        if not branch_ids:
            return {"products": [], "daily_trends": []}
        base_qs = base_qs.filter(order__branch_id__in=branch_ids)

    if product_id:
        base_qs = base_qs.filter(product_id=product_id)

    # 1. Ürün Toplamları
    product_rows = (
        base_qs.values("product_id", "product__name", "product__category__name")
        .annotate(
            total_qty=Sum(F("quantity") * F("portion_multiplier")),
            total_revenue=Sum("total_price")
        )
        .order_by("-total_qty")
    )

    # 2. Günlük Trend (İlk 5 Ürün İçin veya seçili ürün için)
    if product_id:
        top_ids = [product_id]
    else:
        top_ids = [r["product_id"] for r in product_rows[:5]]

    daily_rows = (
        base_qs.filter(product_id__in=top_ids)
        .annotate(day=TruncDate("order__sale__paid_at"))
        .values("day", "product_id", "product__name")
        .annotate(qty=Sum(F("quantity") * F("portion_multiplier")))
        .order_by("day")
    )

    daily_map = {}
    for r in daily_rows:
        raw = r["day"]
        dkey = raw.isoformat() if isinstance(raw, date) else str(raw)[:10]
        if dkey not in daily_map:
            daily_map[dkey] = {}
        daily_map[dkey][r["product__name"]] = float(r["qty"] or 0)

    daily_trends = []
    # Eksik günleri de eklemek için tarih aralığında dönelim (opsiyonel ama daha iyi görünür)
    cur = start
    while cur <= end:
        dstr = cur.isoformat()
        row = {"date": dstr}
        row.update(daily_map.get(dstr, {}))
        daily_trends.append(row)
        cur += timedelta(days=1)

    return {
        "products": [
            {
                "id": str(r["product_id"]),
                "name": r["product__name"],
                "category": r["product__category__name"] or "—",
                "quantity": float(r["total_qty"] or 0),
                "revenue": float(r["total_revenue"] or 0),
            }
            for r in product_rows
        ],
        "daily_trends": daily_trends
    }


_MENU_CLASS_STAR = "STAR"
_MENU_CLASS_PLOWHORSE = "PLOWHORSE"
_MENU_CLASS_PUZZLE = "PUZZLE"
_MENU_CLASS_DOG = "DOG"
_MENU_CLASSES = (
    _MENU_CLASS_STAR,
    _MENU_CLASS_PLOWHORSE,
    _MENU_CLASS_PUZZLE,
    _MENU_CLASS_DOG,
)
_ACTUAL_COVERAGE_NONE = "NONE"
_ACTUAL_COVERAGE_PARTIAL = "PARTIAL"
_ACTUAL_COVERAGE_FULL = "FULL"
_VARIANCE_MOVEMENT_TYPES = (
    StockMovementType.WASTE,
    StockMovementType.CANCEL,
    StockMovementType.RETURN,
    StockMovementType.DISPOSAL,
    StockMovementType.ADJUSTMENT,
)
_QTY6 = Decimal("0.000001")
_MONEY2 = Decimal("0.01")


def _to_decimal(value: Any, fallback: Decimal = ZERO_QTY) -> Decimal:
    if value is None:
        return fallback
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return fallback


def _quantize_money(value: Decimal) -> Decimal:
    return value.quantize(_MONEY2, rounding=ROUND_HALF_UP)


def _quantize_qty(value: Decimal) -> Decimal:
    return value.quantize(_QTY6, rounding=ROUND_HALF_UP)


def _resolve_branch_warehouse_map(branch_ids: set[str]) -> dict[str, Any]:
    from apps.warehouse.models import Warehouse, WarehouseType

    if not branch_ids:
        return {}

    warehouses = (
        Warehouse.objects.filter(is_active=True, branches__id__in=branch_ids)
        .prefetch_related("branches")
        .distinct()
    )
    kitchen_by_branch: dict[str, Any] = {}
    default_by_branch: dict[str, Any] = {}
    any_default = warehouses.filter(is_default=True).order_by("name").first()

    for warehouse in warehouses:
        branch_id_list = [str(branch.id) for branch in warehouse.branches.all()]
        for branch_id in branch_id_list:
            if warehouse.warehouse_type == WarehouseType.KITCHEN and branch_id not in kitchen_by_branch:
                kitchen_by_branch[branch_id] = warehouse
            if warehouse.is_default and branch_id not in default_by_branch:
                default_by_branch[branch_id] = warehouse

    resolved: dict[str, Any] = {}
    for branch_id in branch_ids:
        resolved[branch_id] = kitchen_by_branch.get(branch_id) or default_by_branch.get(branch_id) or any_default
    return resolved


def _resolve_product_warehouse_id(product, branch_id: str, branch_warehouse_map: dict[str, Any]) -> str | None:
    station = getattr(getattr(product, "category", None), "station", None)
    station_branch_id = str(station.branch_id) if getattr(station, "branch_id", None) else None
    if station is not None and station_branch_id == str(branch_id) and getattr(station, "warehouse_id", None):
        return str(station.warehouse_id)
    fallback = branch_warehouse_map.get(str(branch_id))
    if fallback is None:
        return None
    return str(getattr(fallback, "id", fallback))


def _estimate_product_unit_cost(
    product,
    warehouse_id: str | None,
    *,
    price_cache: dict,
    product_cache: dict[tuple[str, str | None], tuple[Decimal | None, str | None]],
) -> tuple[Decimal | None, str | None]:
    from apps.production_planning.services.approximate_cost_service import (
        compute_fefo_cost_per_serving,
    )

    cache_key = (str(product.id), warehouse_id)
    cached = product_cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        recipe = product.recipe
    except Exception:
        recipe = None

    result: tuple[Decimal | None, str | None] = (None, None)
    if recipe is not None:
        if warehouse_id:
            fefo_cost = _quantize_money(
                _to_decimal(
                    compute_fefo_cost_per_serving(
                        recipe,
                        warehouse_id,
                        price_cache=price_cache,
                    ),
                    ZERO_MONEY,
                )
            )
            if fefo_cost > ZERO_MONEY:
                result = (fefo_cost, "RECIPE_FEFO_ESTIMATE")
        if result[0] is None:
            fallback_cost = _quantize_money(_to_decimal(recipe.cost_per_serving, ZERO_MONEY))
            if fallback_cost > ZERO_MONEY:
                result = (fallback_cost, "RECIPE_LAST_COST")

    if result[0] is None and getattr(product, "is_combined", False):
        combined_total = ZERO_MONEY
        combined_source = "RECIPE_FEFO_ESTIMATE"
        combined_items = list(
            product.combined_items.all().select_related(
                "product__category__station__warehouse",
                "product_unit",
            )
        )
        if combined_items:
            for item in combined_items:
                child_cost, child_source = _estimate_product_unit_cost(
                    item.product,
                    warehouse_id,
                    price_cache=price_cache,
                    product_cache=product_cache,
                )
                if child_cost is None:
                    combined_total = ZERO_MONEY
                    combined_source = None
                    break
                multiplier = Decimal("1")
                if item.product_unit_id and getattr(item, "product_unit", None) is not None:
                    multiplier = _to_decimal(item.product_unit.multiplier, Decimal("1"))
                component_qty = _to_decimal(item.quantity, Decimal("1")) * multiplier
                combined_total += child_cost * component_qty
                if child_source != "RECIPE_FEFO_ESTIMATE":
                    combined_source = "RECIPE_LAST_COST"
            if combined_source and combined_total > ZERO_MONEY:
                result = (_quantize_money(combined_total), combined_source)

    product_cache[cache_key] = result
    return result


def _build_combined_components_payload(product) -> list[dict[str, Any]]:
    if not getattr(product, "is_combined", False):
        return []
    components: list[dict[str, Any]] = []
    for item in product.combined_items.all():
        if not getattr(item, "is_active", True):
            continue
        comp_product = item.product
        if comp_product is None:
            continue
        unit_multiplier = Decimal("1")
        unit_name = None
        unit_id = None
        if item.product_unit_id and getattr(item, "product_unit", None) is not None:
            unit_multiplier = _to_decimal(item.product_unit.multiplier, Decimal("1"))
            unit_name = item.product_unit.name
            unit_id = str(item.product_unit_id)
        qty = _to_decimal(item.quantity, Decimal("1"))
        effective_qty = _quantize_qty(qty * unit_multiplier)
        components.append(
            {
                "product_id": str(comp_product.id),
                "product_name": comp_product.name,
                "quantity": float(qty),
                "effective_quantity": float(effective_qty),
                "product_unit_id": unit_id,
                "product_unit_name": unit_name,
                "product_unit_multiplier": float(unit_multiplier),
            }
        )
    return components


def _mode_coverage(mode_counts: dict[str, int]) -> str:
    has_ing = mode_counts.get("INGREDIENT", 0) > 0
    has_prod = mode_counts.get("PRODUCT", 0) > 0
    if has_ing and has_prod:
        return "MIXED"
    if has_ing:
        return "INGREDIENT"
    return "PRODUCT"


def _menu_class_for_metrics(
    *,
    sold_qty: Decimal,
    unit_profit: Decimal,
    avg_qty: Decimal,
    avg_profit: Decimal,
) -> str:
    is_popular = sold_qty >= avg_qty
    is_profitable = unit_profit >= avg_profit
    if is_popular and is_profitable:
        return _MENU_CLASS_STAR
    if is_popular:
        return _MENU_CLASS_PLOWHORSE
    if is_profitable:
        return _MENU_CLASS_PUZZLE
    return _MENU_CLASS_DOG


_ACTION_INCREASE_PRICE = "INCREASE_PRICE"
_ACTION_FEATURE = "FEATURE"
_ACTION_REMOVE_FROM_MENU = "REMOVE_FROM_MENU"
_ACTION_COST_INCREASED = "COST_INCREASED"
_MENU_ENGINEERING_ACTIONS = (
    _ACTION_INCREASE_PRICE,
    _ACTION_FEATURE,
    _ACTION_REMOVE_FROM_MENU,
    _ACTION_COST_INCREASED,
)
_COST_INCREASE_THRESHOLD = Decimal("1.05")


def _primary_menu_class_for_actions(row: dict[str, Any]) -> str | None:
    if row.get("actual_coverage") == _ACTUAL_COVERAGE_FULL and row.get("actual_menu_class"):
        return row["actual_menu_class"]
    return row.get("menu_class")


def _compute_action_recommendations(row: dict[str, Any]) -> list[str]:
    actions: list[str] = []
    menu_class = _primary_menu_class_for_actions(row)

    if menu_class == _MENU_CLASS_STAR:
        actions.append(_ACTION_FEATURE)
    elif menu_class == _MENU_CLASS_PLOWHORSE:
        actions.append(_ACTION_INCREASE_PRICE)
    elif menu_class == _MENU_CLASS_PUZZLE:
        actions.append(_ACTION_FEATURE)
    elif menu_class == _MENU_CLASS_DOG:
        actions.append(_ACTION_REMOVE_FROM_MENU)

    estimated_unit_cost = row.get("estimated_unit_cost")
    actual_unit_cost = row.get("actual_unit_cost")
    if (
        row.get("actual_coverage") == _ACTUAL_COVERAGE_FULL
        and estimated_unit_cost is not None
        and actual_unit_cost is not None
        and _to_decimal(actual_unit_cost, ZERO_MONEY)
        > _to_decimal(estimated_unit_cost, ZERO_MONEY) * _COST_INCREASE_THRESHOLD
    ):
        if _ACTION_COST_INCREASED not in actions:
            actions.append(_ACTION_COST_INCREASED)

    return actions


def _build_action_summary(products: list[dict[str, Any]]) -> dict[str, int]:
    summary = {action: 0 for action in _MENU_ENGINEERING_ACTIONS}
    for row in products:
        for action in row.get("action_recommendations") or []:
            if action in summary:
                summary[action] += 1
    return summary


def _build_empty_menu_engineering_result(
    *,
    branch_ids: list[str] | None,
    start: date,
    end: date,
    top_limit: int,
) -> dict[str, Any]:
    empty_summary = {
        "total_products": 0,
        "classified_products": 0,
        "stars_count": 0,
        "puzzlers_count": 0,
        "plowhorses_count": 0,
        "dogs_count": 0,
        "total_estimated_profit": 0.0,
        "avg_estimated_margin_pct": 0.0,
        "popularity_threshold_qty": 0.0,
        "profit_threshold_amount": 0.0,
    }
    empty_actual_summary = {
        "total_products": 0,
        "classified_products": 0,
        "stars_count": 0,
        "puzzlers_count": 0,
        "plowhorses_count": 0,
        "dogs_count": 0,
        "total_actual_profit": 0.0,
        "avg_actual_margin_pct": 0.0,
        "popularity_threshold_qty": 0.0,
        "profit_threshold_amount": 0.0,
        "fully_costed_products": 0,
        "partial_coverage_products": 0,
        "uncovered_products": 0,
    }
    return {
        "range": {"start_date": start.isoformat(), "end_date": end.isoformat()},
        "summary": empty_summary,
        "actual_summary": empty_actual_summary,
        "products": [],
        "action_summary": _build_action_summary([]),
        "stock_variance_summary": get_stock_variance_summary(
            branch_ids=branch_ids,
            start_date=start,
            end_date=end,
            top_limit=top_limit,
        ),
    }


def get_stock_variance_summary(
    branch_ids: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    top_limit: int = 10,
) -> dict[str, Any]:
    from django.db.models.functions import Coalesce
    from apps.warehouse.models import Warehouse

    today = timezone.now().date()
    start = start_date or today
    end = end_date or start

    branch_key = sorted(branch_ids) if branch_ids else "all"
    cache_key = f"stock_variance_summary_{branch_key}_{start}_{end}_{top_limit}"
    from django.core.cache import cache

    cached = cache.get(cache_key)
    if cached:
        return cached

    warehouse_ids: list[Any] | None = None
    if branch_ids is not None:
        if not branch_ids:
            return {
                "range": {"start_date": start.isoformat(), "end_date": end.isoformat()},
                "totals": {},
                "top_items": [],
                "recent_movements": [],
            }
        warehouse_ids = list(
            Warehouse.objects.filter(branches__id__in=branch_ids, is_active=True)
            .values_list("id", flat=True)
            .distinct()
        )

    start_dt = timezone.make_aware(datetime.combine(start, time.min))
    end_dt = timezone.make_aware(datetime.combine(end, time.max))

    movs = (
        StockMovement.objects.filter(
            warehouse__isnull=False,
            movement_type__in=_VARIANCE_MOVEMENT_TYPES,
            created_at__gte=start_dt,
            created_at__lte=end_dt,
            is_active=True,
        )
        .select_related("stock_item", "warehouse")
    )
    if warehouse_ids is not None:
        movs = movs.filter(warehouse_id__in=warehouse_ids)

    totals = movs.aggregate(
        waste_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.WASTE)), ZERO_QTY),
        cancel_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.CANCEL)), ZERO_QTY),
        return_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.RETURN)), ZERO_QTY),
        disposal_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.DISPOSAL)), ZERO_QTY),
        adjustment_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.ADJUSTMENT)), ZERO_QTY),
        variance_cost=Coalesce(
            Sum(F("quantity") * F("unit_price")),
            ZERO_MONEY,
        ),
    )
    total_qty = sum(
        (
            _to_decimal(totals.get("waste_qty")),
            _to_decimal(totals.get("cancel_qty")),
            _to_decimal(totals.get("return_qty")),
            _to_decimal(totals.get("disposal_qty")),
            _to_decimal(totals.get("adjustment_qty")),
        ),
        ZERO_QTY,
    )

    top_items_qs = (
        movs.values("stock_item_id", "stock_item__name", "stock_item__sku", "stock_item__unit")
        .annotate(
            total_qty=Sum("quantity"),
            total_cost=Coalesce(Sum(F("quantity") * F("unit_price")), ZERO_MONEY),
            waste_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.WASTE)), ZERO_QTY),
            cancel_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.CANCEL)), ZERO_QTY),
            return_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.RETURN)), ZERO_QTY),
            disposal_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.DISPOSAL)), ZERO_QTY),
            adjustment_qty=Coalesce(Sum("quantity", filter=Q(movement_type=StockMovementType.ADJUSTMENT)), ZERO_QTY),
        )
        .order_by("-total_cost", "-total_qty")[:top_limit]
    )
    top_items = [
        {
            "stock_item_id": str(row["stock_item_id"]),
            "name": row["stock_item__name"],
            "sku": row["stock_item__sku"],
            "unit": row["stock_item__unit"],
            "total_qty": float(row["total_qty"] or 0),
            "total_cost": float(row["total_cost"] or 0),
            "waste_qty": float(row["waste_qty"] or 0),
            "cancel_qty": float(row["cancel_qty"] or 0),
            "return_qty": float(row["return_qty"] or 0),
            "disposal_qty": float(row["disposal_qty"] or 0),
            "adjustment_qty": float(row["adjustment_qty"] or 0),
        }
        for row in top_items_qs
    ]

    recent_movements = [
        {
            "movement_id": str(movement.id),
            "stock_item_id": str(movement.stock_item_id),
            "stock_item_name": movement.stock_item.name,
            "warehouse_id": str(movement.warehouse_id),
            "warehouse_name": movement.warehouse.name if movement.warehouse else "",
            "movement_type": movement.movement_type,
            "quantity": float(movement.quantity or 0),
            "unit_price": float(movement.unit_price or 0),
            "total_cost": float((_to_decimal(movement.quantity) * _to_decimal(movement.unit_price)).quantize(_MONEY2, rounding=ROUND_HALF_UP)),
            "reference": movement.reference or "",
            "created_at": movement.created_at.isoformat(),
        }
        for movement in movs.order_by("-created_at")[:top_limit]
    ]

    result = {
        "range": {"start_date": start.isoformat(), "end_date": end.isoformat()},
        "totals": {
            "waste_qty": float(totals.get("waste_qty") or 0),
            "cancel_qty": float(totals.get("cancel_qty") or 0),
            "return_qty": float(totals.get("return_qty") or 0),
            "disposal_qty": float(totals.get("disposal_qty") or 0),
            "adjustment_qty": float(totals.get("adjustment_qty") or 0),
            "total_variance_qty": float(total_qty),
            "total_variance_cost": float(totals.get("variance_cost") or 0),
        },
        "top_items": top_items,
        "recent_movements": recent_movements,
    }
    cache.set(cache_key, result, _dashboard_cache_timeout())
    return result


def get_menu_engineering_analytics(
    branch_ids: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    product_id: str | None = None,
    category_id: str | None = None,
    menu_class: str | None = None,
    top_limit: int = 10,
) -> dict[str, Any]:
    from apps.menu.models import CombinedProductItem, Product
    from apps.inventory.models import OrderItemIngredientCost
    from django.db.models import Prefetch

    start = start_date or timezone.now().date()
    end = end_date or start
    branch_key = sorted(branch_ids) if branch_ids else "all"
    cache_key = (
        f"menu_engineering_{branch_key}_{start}_{end}_{product_id or 'all'}_"
        f"{category_id or 'all'}_{menu_class or 'all'}_{top_limit}"
    )
    from django.core.cache import cache

    cached = cache.get(cache_key)
    if cached:
        return cached

    base_qs = OrderItem.objects.filter(
        order__sale__isnull=False,
        order__sale__is_deleted=False,
        order__sale__paid_at__date__gte=start,
        order__sale__paid_at__date__lte=end,
        parent_item__isnull=True,
        status=OrderStatus.COMPLETED,
    )
    if branch_ids is not None:
        if not branch_ids:
            return _build_empty_menu_engineering_result(
                branch_ids=branch_ids,
                start=start,
                end=end,
                top_limit=top_limit,
            )
        base_qs = base_qs.filter(order__branch_id__in=branch_ids)
    if product_id:
        base_qs = base_qs.filter(product_id=product_id)
    if category_id:
        base_qs = base_qs.filter(product__category_id=category_id)

    aggregate_rows = list(
        base_qs.values(
            "product_id",
            "product__name",
            "product__category_id",
            "product__category__name",
            "order__branch_id",
            "order__stock_tracking_mode",
        )
        .annotate(
            sold_qty=Sum(F("quantity") * F("portion_multiplier")),
            revenue=Sum("total_price"),
        )
        .order_by("product__name")
    )

    product_ids = {row["product_id"] for row in aggregate_rows}
    products_by_id = {
        product.id: product
        for product in Product.objects.filter(id__in=product_ids, is_active=True)
        .select_related("category__station__warehouse")
        .prefetch_related(
            Prefetch(
                "combined_items",
                queryset=CombinedProductItem.objects.filter(is_active=True).select_related(
                    "product__category__station__warehouse",
                    "product_unit",
                ),
            ),
        )
    }
    branch_id_set = {str(row["order__branch_id"]) for row in aggregate_rows if row["order__branch_id"]}
    branch_warehouse_map = _resolve_branch_warehouse_map(branch_id_set)
    price_cache: dict = {}
    product_cost_cache: dict[tuple[str, str | None], tuple[Decimal | None, str | None]] = {}
    product_buckets: dict[str, dict[str, Any]] = {}

    for row in aggregate_rows:
        pid = row["product_id"]
        product = products_by_id.get(pid)
        if product is None:
            continue
        pid_str = str(pid)
        sold_qty = _to_decimal(row["sold_qty"], ZERO_QTY)
        revenue = _quantize_money(_to_decimal(row["revenue"], ZERO_MONEY))
        branch_id = str(row["order__branch_id"])
        resolved_warehouse_id = _resolve_product_warehouse_id(product, branch_id, branch_warehouse_map)
        unit_cost, cost_source = _estimate_product_unit_cost(
            product,
            resolved_warehouse_id,
            price_cache=price_cache,
            product_cache=product_cost_cache,
        )

        bucket = product_buckets.setdefault(
            pid_str,
            {
                "product_id": pid_str,
                "product_name": row["product__name"],
                "category_id": str(row["product__category_id"]) if row["product__category_id"] else None,
                "category_name": row["product__category__name"] or "—",
                "is_combined": getattr(product, "is_combined", False),
                "combined_components": _build_combined_components_payload(product),
                "sold_qty": ZERO_QTY,
                "revenue": ZERO_MONEY,
                "estimated_food_cost": ZERO_MONEY,
                "mode_counts": defaultdict(int),
                "branch_count": 0,
                "missing_cost": False,
                "cost_source": "RECIPE_FEFO_ESTIMATE",
            },
        )
        bucket["sold_qty"] += sold_qty
        bucket["revenue"] += revenue
        bucket["branch_count"] += 1
        bucket["mode_counts"][row["order__stock_tracking_mode"] or "PRODUCT"] += 1
        if unit_cost is None:
            bucket["missing_cost"] = True
        else:
            bucket["estimated_food_cost"] += _quantize_money(unit_cost * sold_qty)
            if cost_source != "RECIPE_FEFO_ESTIMATE":
                bucket["cost_source"] = "RECIPE_LAST_COST"

    ledger_qs = OrderItemIngredientCost.objects.filter(
        order_item__order__sale__isnull=False,
        order_item__order__sale__is_deleted=False,
        order_item__order__sale__paid_at__date__gte=start,
        order_item__order__sale__paid_at__date__lte=end,
        order_item__parent_item__isnull=True,
        order_item__status=OrderStatus.COMPLETED,
    )
    if branch_ids is not None:
        ledger_qs = ledger_qs.filter(order_item__order__branch_id__in=branch_ids)
    if product_id:
        ledger_qs = ledger_qs.filter(product_id=product_id)
    if category_id:
        ledger_qs = ledger_qs.filter(product__category_id=category_id)

    actual_cost_map = {
        str(row["product_id"]): {
            "actual_food_cost": _quantize_money(_to_decimal(row["actual_food_cost"], ZERO_MONEY)),
            "actual_cost_entries": int(row["actual_cost_entries"] or 0),
        }
        for row in ledger_qs.values("product_id").annotate(
            actual_food_cost=Sum("line_cost_snapshot"),
            actual_cost_entries=Count("id"),
        )
    }
    covered_order_item_ids = list(
        ledger_qs.values_list("order_item_id", flat=True).distinct()
    )
    covered_qty_map = {
        str(row["product_id"]): {
            "actual_covered_qty": _quantize_qty(_to_decimal(row["actual_covered_qty"], ZERO_QTY)),
            "actual_covered_order_items": int(row["actual_covered_order_items"] or 0),
        }
        for row in OrderItem.objects.filter(id__in=covered_order_item_ids).values("product_id").annotate(
            actual_covered_qty=Sum(F("quantity") * F("portion_multiplier")),
            actual_covered_order_items=Count("id"),
        )
    }

    products_payload: list[dict[str, Any]] = []
    classifiable_metrics: list[tuple[Decimal, Decimal]] = []
    for bucket in product_buckets.values():
        sold_qty = _quantize_qty(bucket["sold_qty"])
        revenue = _quantize_money(bucket["revenue"])
        estimated_food_cost = _quantize_money(bucket["estimated_food_cost"])
        has_cost = sold_qty > ZERO_QTY and not bucket["missing_cost"]

        avg_sell_price = _quantize_money(revenue / sold_qty) if sold_qty > ZERO_QTY else ZERO_MONEY
        estimated_unit_cost = (
            _quantize_money(estimated_food_cost / sold_qty)
            if sold_qty > ZERO_QTY and has_cost
            else None
        )
        estimated_gross_profit = (
            _quantize_money(revenue - estimated_food_cost)
            if has_cost
            else None
        )
        estimated_margin_pct = (
            round(float((estimated_gross_profit / revenue) * Decimal("100")), 2)
            if has_cost and revenue > ZERO_MONEY and estimated_gross_profit is not None
            else None
        )
        profit_index = (
            _quantize_money(avg_sell_price - estimated_unit_cost)
            if estimated_unit_cost is not None
            else None
        )
        stock_mode = _mode_coverage(bucket["mode_counts"])
        variance_coverage = "STOCK_ONLY" if stock_mode != "PRODUCT" and has_cost else "NONE"
        recipe_status = "HAS_RECIPE" if has_cost else "NO_RECIPE"
        actual_cost_bucket = actual_cost_map.get(bucket["product_id"], {})
        covered_bucket = covered_qty_map.get(bucket["product_id"], {})
        actual_covered_qty = covered_bucket.get("actual_covered_qty", ZERO_QTY)
        if actual_covered_qty <= ZERO_QTY:
            actual_coverage = _ACTUAL_COVERAGE_NONE
        elif actual_covered_qty + _QTY6 >= sold_qty:
            actual_coverage = _ACTUAL_COVERAGE_FULL
        else:
            actual_coverage = _ACTUAL_COVERAGE_PARTIAL
        actual_food_cost_raw = actual_cost_bucket.get("actual_food_cost", ZERO_MONEY)
        actual_food_cost = actual_food_cost_raw if actual_coverage == _ACTUAL_COVERAGE_FULL else None
        actual_unit_cost = (
            _quantize_money(actual_food_cost_raw / sold_qty)
            if sold_qty > ZERO_QTY and actual_coverage == _ACTUAL_COVERAGE_FULL
            else None
        )
        actual_gross_profit = (
            _quantize_money(revenue - actual_food_cost_raw)
            if actual_coverage == _ACTUAL_COVERAGE_FULL
            else None
        )
        actual_margin_pct = (
            round(float((actual_gross_profit / revenue) * Decimal("100")), 2)
            if actual_coverage == _ACTUAL_COVERAGE_FULL and revenue > ZERO_MONEY and actual_gross_profit is not None
            else None
        )
        actual_profit_index = (
            _quantize_money(avg_sell_price - actual_unit_cost)
            if actual_unit_cost is not None
            else None
        )

        row_payload = {
            "product_id": bucket["product_id"],
            "product_name": bucket["product_name"],
            "category_id": bucket["category_id"],
            "category_name": bucket["category_name"],
            "is_combined": bucket["is_combined"],
            "combined_components": bucket["combined_components"],
            "sold_qty": float(sold_qty),
            "revenue": float(revenue),
            "avg_sell_price": float(avg_sell_price),
            "estimated_unit_cost": float(estimated_unit_cost) if estimated_unit_cost is not None else None,
            "estimated_food_cost": float(estimated_food_cost) if has_cost else None,
            "estimated_gross_profit": float(estimated_gross_profit) if estimated_gross_profit is not None else None,
            "estimated_margin_pct": estimated_margin_pct,
            "profit_index": float(profit_index) if profit_index is not None else None,
            "popularity_index": None,
            "menu_class": None,
            "actual_unit_cost": float(actual_unit_cost) if actual_unit_cost is not None else None,
            "actual_food_cost": float(actual_food_cost) if actual_food_cost is not None else None,
            "actual_gross_profit": float(actual_gross_profit) if actual_gross_profit is not None else None,
            "actual_margin_pct": actual_margin_pct,
            "actual_profit_index": float(actual_profit_index) if actual_profit_index is not None else None,
            "actual_popularity_index": None,
            "actual_menu_class": None,
            "actual_coverage": actual_coverage,
            "actual_covered_qty": float(actual_covered_qty),
            "actual_cost_entries": int(actual_cost_bucket.get("actual_cost_entries", 0)),
            "recipe_status": recipe_status,
            "cost_source": bucket["cost_source"] if has_cost else None,
            "stock_tracking_mode_coverage": stock_mode,
            "variance_coverage": variance_coverage,
            "diagnostics": {
                "branch_count": bucket["branch_count"],
                "missing_cost": bucket["missing_cost"],
                "actual_covered_order_items": int(covered_bucket.get("actual_covered_order_items", 0)),
            },
        }
        if profit_index is not None:
            classifiable_metrics.append((sold_qty, profit_index))
        products_payload.append(row_payload)

    if classifiable_metrics:
        qty_sum = sum((item[0] for item in classifiable_metrics), ZERO_QTY)
        profit_sum = sum((item[1] for item in classifiable_metrics), ZERO_MONEY)
        avg_qty = _quantize_qty(qty_sum / Decimal(len(classifiable_metrics)))
        avg_profit = _quantize_money(profit_sum / Decimal(len(classifiable_metrics)))
    else:
        avg_qty = ZERO_QTY
        avg_profit = ZERO_MONEY

    class_counts = {
        _MENU_CLASS_STAR: 0,
        _MENU_CLASS_PLOWHORSE: 0,
        _MENU_CLASS_PUZZLE: 0,
        _MENU_CLASS_DOG: 0,
    }
    total_estimated_profit = ZERO_MONEY
    margin_sum = Decimal("0")
    margin_count = 0
    actual_classifiable_metrics: list[tuple[Decimal, Decimal]] = []
    actual_coverage_counts = {
        _ACTUAL_COVERAGE_FULL: 0,
        _ACTUAL_COVERAGE_PARTIAL: 0,
        _ACTUAL_COVERAGE_NONE: 0,
    }
    for row in products_payload:
        if row["profit_index"] is not None:
            menu_label = _menu_class_for_metrics(
                sold_qty=_to_decimal(row["sold_qty"], ZERO_QTY),
                unit_profit=_to_decimal(row["profit_index"], ZERO_MONEY),
                avg_qty=avg_qty,
                avg_profit=avg_profit,
            )
            row["menu_class"] = menu_label
            row["popularity_index"] = (
                round(float(_to_decimal(row["sold_qty"], ZERO_QTY) / avg_qty), 2)
                if avg_qty > ZERO_QTY
                else 0.0
            )
            class_counts[menu_label] += 1
            total_estimated_profit += _to_decimal(row["estimated_gross_profit"], ZERO_MONEY)
            if row["estimated_margin_pct"] is not None:
                margin_sum += Decimal(str(row["estimated_margin_pct"]))
                margin_count += 1
        actual_coverage_counts[row["actual_coverage"]] += 1
        if row["actual_profit_index"] is not None:
            actual_classifiable_metrics.append(
                (_to_decimal(row["sold_qty"], ZERO_QTY), _to_decimal(row["actual_profit_index"], ZERO_MONEY))
            )

    if actual_classifiable_metrics:
        actual_qty_sum = sum((item[0] for item in actual_classifiable_metrics), ZERO_QTY)
        actual_profit_sum = sum((item[1] for item in actual_classifiable_metrics), ZERO_MONEY)
        actual_avg_qty = _quantize_qty(actual_qty_sum / Decimal(len(actual_classifiable_metrics)))
        actual_avg_profit = _quantize_money(actual_profit_sum / Decimal(len(actual_classifiable_metrics)))
    else:
        actual_avg_qty = ZERO_QTY
        actual_avg_profit = ZERO_MONEY

    actual_class_counts = {
        _MENU_CLASS_STAR: 0,
        _MENU_CLASS_PLOWHORSE: 0,
        _MENU_CLASS_PUZZLE: 0,
        _MENU_CLASS_DOG: 0,
    }
    total_actual_profit = ZERO_MONEY
    actual_margin_sum = Decimal("0")
    actual_margin_count = 0
    for row in products_payload:
        if row["actual_profit_index"] is not None:
            actual_menu_label = _menu_class_for_metrics(
                sold_qty=_to_decimal(row["sold_qty"], ZERO_QTY),
                unit_profit=_to_decimal(row["actual_profit_index"], ZERO_MONEY),
                avg_qty=actual_avg_qty,
                avg_profit=actual_avg_profit,
            )
            row["actual_menu_class"] = actual_menu_label
            row["actual_popularity_index"] = (
                round(float(_to_decimal(row["sold_qty"], ZERO_QTY) / actual_avg_qty), 2)
                if actual_avg_qty > ZERO_QTY
                else 0.0
            )
            actual_class_counts[actual_menu_label] += 1
            total_actual_profit += _to_decimal(row["actual_gross_profit"], ZERO_MONEY)
            if row["actual_margin_pct"] is not None:
                actual_margin_sum += Decimal(str(row["actual_margin_pct"]))
                actual_margin_count += 1

    for row in products_payload:
        row["action_recommendations"] = _compute_action_recommendations(row)

    filtered_products = products_payload
    if menu_class in _MENU_CLASSES:
        filtered_products = [
            row
            for row in filtered_products
            if row["menu_class"] == menu_class or row["actual_menu_class"] == menu_class
        ]
    filtered_products = sorted(
        filtered_products,
        key=lambda row: (
            row["menu_class"] not in (_MENU_CLASS_STAR, _MENU_CLASS_PUZZLE),
            -(row["estimated_gross_profit"] or 0),
            -(row["revenue"] or 0),
            row["product_name"],
        ),
    )

    result = {
        "range": {"start_date": start.isoformat(), "end_date": end.isoformat()},
        "summary": {
            "total_products": len(products_payload),
            "classified_products": len(classifiable_metrics),
            "stars_count": class_counts[_MENU_CLASS_STAR],
            "puzzlers_count": class_counts[_MENU_CLASS_PUZZLE],
            "plowhorses_count": class_counts[_MENU_CLASS_PLOWHORSE],
            "dogs_count": class_counts[_MENU_CLASS_DOG],
            "total_estimated_profit": float(_quantize_money(total_estimated_profit)),
            "avg_estimated_margin_pct": round(float(margin_sum / Decimal(margin_count)), 2) if margin_count else 0.0,
            "popularity_threshold_qty": float(avg_qty),
            "profit_threshold_amount": float(avg_profit),
        },
        "actual_summary": {
            "total_products": len(products_payload),
            "classified_products": len(actual_classifiable_metrics),
            "stars_count": actual_class_counts[_MENU_CLASS_STAR],
            "puzzlers_count": actual_class_counts[_MENU_CLASS_PUZZLE],
            "plowhorses_count": actual_class_counts[_MENU_CLASS_PLOWHORSE],
            "dogs_count": actual_class_counts[_MENU_CLASS_DOG],
            "total_actual_profit": float(_quantize_money(total_actual_profit)),
            "avg_actual_margin_pct": round(float(actual_margin_sum / Decimal(actual_margin_count)), 2) if actual_margin_count else 0.0,
            "popularity_threshold_qty": float(actual_avg_qty),
            "profit_threshold_amount": float(actual_avg_profit),
            "fully_costed_products": actual_coverage_counts[_ACTUAL_COVERAGE_FULL],
            "partial_coverage_products": actual_coverage_counts[_ACTUAL_COVERAGE_PARTIAL],
            "uncovered_products": actual_coverage_counts[_ACTUAL_COVERAGE_NONE],
        },
        "products": filtered_products,
        "action_summary": _build_action_summary(products_payload),
        "stock_variance_summary": get_stock_variance_summary(
            branch_ids=branch_ids,
            start_date=start,
            end_date=end,
            top_limit=top_limit,
        ),
    }
    cache.set(cache_key, result, _dashboard_cache_timeout())
    return result
