"""Smart Firing v2 — istasyon kuyruğu metrikleri ve lead time buffer.

NOT: Tüm ayar sabitleri modül seviyesinde bir kere okunur (``getattr(settings, ...)``
her çağrıda tekrarlanmaz). Değişirlerse worker restart gerekir.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from django.db.models import Count
from django.conf import settings
from django.utils import timezone

from apps.branches.models import KitchenStation

from .models import OrderItem, OrderStatus, ProductStationTimingStats

# ── Modül seviyesinde bir kere okunan ayarlar ─────────────────────────────
_UI_BUSY_THRESHOLD     = int(getattr(settings, 'SMART_FIRING_UI_BUSY_THRESHOLD', 15))
_BACKLOG_FACTOR        = int(getattr(settings, 'SMART_FIRING_BACKLOG_MINUTE_FACTOR', 2))
_QUEUE_DEPTH_THRESHOLD = int(getattr(settings, 'SMART_FIRING_QUEUE_DEPTH_THRESHOLD', 8))
_QUEUE_BUFFER_CAP      = int(getattr(settings, 'SMART_FIRING_QUEUE_BUFFER_CAP', 30))
_MIN_SAMPLES           = int(getattr(settings, 'SMART_FIRING_LEARNED_MIN_SAMPLES', 5))


def get_ui_busy_threshold_minutes() -> int:
    """POS/mobil yoğun mutfak gösterim eşiği (dk)."""
    return _UI_BUSY_THRESHOLD


def get_station_queue_metrics(branch_id, station_id) -> dict[str, Any]:
    """
    Bir şube ve mutfak istasyonunda aktif (PENDING + PREPARING) sipariş kalemi sayısı.

    İptal edilmiş kalemler hariç; CANCELLED dışlanır.
    """
    if not station_id:
        return {
            'active_items_count': 0,
            'estimated_backlog_minutes': 0,
            'computed_at': timezone.now(),
        }
    active_items_count = OrderItem.objects.filter(
        branch_id=branch_id,
        station_id=station_id,
        status__in=[OrderStatus.PENDING, OrderStatus.PREPARING],
    ).count()
    return {
        'active_items_count': active_items_count,
        'estimated_backlog_minutes': active_items_count * _BACKLOG_FACTOR,
        'computed_at': timezone.now(),
    }


def batch_station_queue_metrics(branch_id, station_ids) -> dict[str, dict[str, Any]]:
    """Tek sorguda birden fazla istasyon için kuyruk metrikleri."""
    ids = {sid for sid in station_ids if sid}
    if not ids:
        return {}
    computed_at = timezone.now()
    counts = {
        str(row['station_id']): row['active_items_count']
        for row in OrderItem.objects.filter(
            branch_id=branch_id,
            station_id__in=ids,
            status__in=[OrderStatus.PENDING, OrderStatus.PREPARING],
        )
        .values('station_id')
        .annotate(active_items_count=Count('id'))
    }
    out: dict[str, dict[str, Any]] = {}
    for sid in ids:
        key = str(sid)
        n = counts.get(key, 0)
        out[key] = {
            'active_items_count': n,
            'estimated_backlog_minutes': n * _BACKLOG_FACTOR,
            'computed_at': computed_at,
        }
    return out


def _compute_buffer_from_counts(
    n: int,
    extra: int,
) -> int:
    """Salt matematik: kuyruk sayısı ve extra buffer'dan buffer dakikası hesapla."""
    backlog_part = max(0, n - _QUEUE_DEPTH_THRESHOLD) * _BACKLOG_FACTOR
    backlog_part = min(backlog_part, _QUEUE_BUFFER_CAP)
    total = extra + backlog_part
    upper = _QUEUE_BUFFER_CAP + extra
    return int(max(0, min(upper, total)))


def compute_queue_buffer_minutes(
    branch_id,
    station_id,
    *,
    station_row: KitchenStation | None = None,
) -> int:
    """
    Tek istasyon için buffer dakikası (2 sorgu: KitchenStation + OrderItem COUNT).

    Birden çok istasyon için ``batch_compute_queue_buffers()`` kullanın.
    """
    if not station_id:
        return 0
    if station_row is None:
        try:
            station_row = KitchenStation.objects.only('id', 'smart_firing_extra_buffer_minutes').get(
                id=station_id, branch_id=branch_id
            )
        except KitchenStation.DoesNotExist:
            station_row = None
    extra = int(station_row.smart_firing_extra_buffer_minutes or 0) if station_row else 0
    metrics = get_station_queue_metrics(branch_id, station_id)
    return _compute_buffer_from_counts(metrics['active_items_count'], extra)


def batch_compute_queue_buffers(
    branch_id,
    station_ids: set,
) -> dict[str, int]:
    """
    **Toplu buffer hesaplama — N istasyon için 2 sorgu (N yerine).**

    ``compute_queue_buffer_minutes`` teker teker çağrıldığında her istasyon
    için **2 sorgu** gider (KitchenStation.get + OrderItem.count).
    Bu fonksiyon tüm istasyonları **tek KitchenStation sorgusu** ve
    **tek OrderItem COUNT+GROUP BY** ile hesaplar.

    Dönüş: ``{station_id_str: buffer_minutes, ...}``
    """
    ids = {sid for sid in station_ids if sid}
    if not ids:
        return {}

    # 1) Tüm istasyonların extra_buffer değerlerini tek sorguda al
    station_extra: dict[str, int] = {}
    for row in KitchenStation.objects.filter(
        id__in=ids, branch_id=branch_id
    ).only('id', 'smart_firing_extra_buffer_minutes').iterator():
        station_extra[str(row.id)] = int(row.smart_firing_extra_buffer_minutes or 0)

    # 2) Tüm istasyonların kuyruk sayılarını tek sorguda al
    counts: dict[str, int] = {}
    for row in OrderItem.objects.filter(
        branch_id=branch_id,
        station_id__in=ids,
        status__in=[OrderStatus.PENDING, OrderStatus.PREPARING],
    ).values('station_id').annotate(cnt=Count('id')):
        counts[str(row['station_id'])] = row['cnt']

    # 3) Memory'de birleştir
    out: dict[str, int] = {}
    for sid in ids:
        key = str(sid)
        n = counts.get(key, 0)
        extra = station_extra.get(key, 0)
        out[key] = _compute_buffer_from_counts(n, extra)
    return out


def resolve_recipe_lead_minutes(product, quantity: int = 1) -> int:
    """Reçete porsiyon başına süre × miktar.

    Dönüş değeri anlamı:
      * **0** → reçete yok veya porsiyon hazırlık/pişirme süresi girilmemiş (hemen gönder).
      * **>0** → quantity × (prep_time_per_serving + cook_time_per_serving).

    ``prep_time_minutes`` / ``cook_time_minutes`` **bilgi amaçlıdır**,
    hesaplamaya katılmaz.
    """
    recipe = getattr(product, 'recipe', None)
    if not (product and recipe):
        return 0
    per_serving = int(recipe.prep_time_per_serving + recipe.cook_time_per_serving)
    if per_serving <= 0:
        return 0
    return max(1, quantity) * per_serving


def combined_component_lead_quantity(parent_quantity: int, combined_item) -> int:
    """Birleşik menü satırı için alt bileşen lead miktarı."""
    from decimal import Decimal

    um = (
        Decimal(str(combined_item.product_unit.multiplier))
        if combined_item.product_unit_id
        else Decimal('1')
    )
    raw = Decimal(str(parent_quantity)) * Decimal(str(combined_item.quantity)) * um
    if raw <= 0:
        return 0
    qty = int(raw)
    return max(1, qty)


def product_has_actionable_recipe_timing(product) -> bool:
    """Reçete bağlı ve porsiyon hazırlık/pişirme süresi > 0."""
    return resolve_recipe_lead_minutes(product, quantity=1) > 0


def resolve_combined_static_lead_minutes(product, quantity: int = 1) -> int:
    """
    Birleşik ürün statik hazırlık süresi (dk).

    Parent'ın kendi reçetesi varsa parent süresi; yoksa alt bileşen sürelerinin toplamı.
    """
    if not (product and getattr(product, 'is_combined', False)):
        return 0
    if getattr(product, 'recipe', None):
        return resolve_recipe_lead_minutes(product, quantity=quantity)

    total = 0
    for ci in product.combined_items.all():
        comp = ci.product
        if not comp:
            continue
        comp_qty = combined_component_lead_quantity(quantity, ci)
        if comp_qty <= 0:
            continue
        total += resolve_recipe_lead_minutes(comp, quantity=comp_qty)
    return total


def effective_combined_lead_minutes(
    branch_id,
    product,
    quantity: int = 1,
    *,
    stations_by_id: dict | None = None,
) -> tuple[int, dict]:
    """
    Parent reçetesi olmayan birleşik ürün: alt bileşen süre toplamı + max istasyon buffer.

    Dönüş: (effective_lead, {station_id: buffer_minutes})
    """
    static_total = resolve_combined_static_lead_minutes(product, quantity=quantity)
    if static_total <= 0:
        return 0, {}

    buffers: dict = {}
    for ci in product.combined_items.all():
        comp = ci.product
        if not comp or not product_has_actionable_recipe_timing(comp):
            continue
        sid = getattr(getattr(comp.category, 'station', None), 'id', None)
        if not sid:
            continue
        comp_qty = combined_component_lead_quantity(quantity, ci)
        if comp_qty <= 0:
            continue
        _eff, buf = effective_lead_minutes(
            branch_id,
            comp,
            sid,
            quantity=comp_qty,
            station_row=(stations_by_id or {}).get(sid),
        )
        del _eff
        buffers[sid] = max(buffers.get(sid, 0), buf)

    max_buf = max(buffers.values()) if buffers else 0
    return static_total + max_buf, buffers


def learned_ema_minutes(branch_id, product_id, station_id) -> tuple[float | None, int]:
    """(ema, sample_count) — yeterli örnek yoksa (None, count)."""
    if not station_id:
        return None, 0
    try:
        row = ProductStationTimingStats.objects.get(
            branch_id=branch_id,
            product_id=product_id,
            station_id=station_id,
        )
    except ProductStationTimingStats.DoesNotExist:
        return None, 0
    if row.sample_count < _MIN_SAMPLES:
        return None, row.sample_count
    return float(row.ema_minutes), row.sample_count


def base_lead_minutes(branch_id, product, static_lead: int, station_id) -> int:
    """Öğrenilmiş EMA varsa max(statik, ema) ile süreyi güvenli tarafta tut."""
    ema, _n = learned_ema_minutes(branch_id, product.id, station_id)
    if ema is None:
        return static_lead
    return max(static_lead, int(round(ema)))


def effective_lead_minutes(
    branch_id,
    product,
    station_id,
    quantity: int = 1,
    *,
    station_row: KitchenStation | None = None,
) -> tuple[int, int]:
    """(effective_lead, queue_buffer) — queue_buffer ayrı döner (POS bildirimi için).

    ``quantity``: sipariş kalemi adedi; porsiyon başına süre hesaplamasında kullanılır.
    """
    static_lead = resolve_recipe_lead_minutes(product, quantity=quantity)
    base = base_lead_minutes(branch_id, product, static_lead, station_id)
    buf = compute_queue_buffer_minutes(branch_id, station_id, station_row=station_row)
    return base + buf, buf


def compute_firing_state(item, *, now: datetime | None = None) -> str | None:
    """Salt okunur firing_state — Serializer ile uyumlu."""
    now = now or timezone.now()
    if item.status == OrderStatus.PREPARING and item.firing_forced_at:
        return 'forced_start'
    if item.status != OrderStatus.PENDING:
        return None
    st = item.scheduled_start_time
    if not st:
        return 'late'
    diff = (now - st).total_seconds()
    if diff < -60:
        return 'scheduled'
    if diff <= 60:
        return 'due'
    return 'late'


def kitchen_queue_notice_for_cart(branch_id, station_ids: set, *, station_buffers: dict) -> dict | None:
    """
    POS toast — sepetteki istasyonların max buffer'ı UI yoğunluk eşiğini aşıyorsa.
    """
    del branch_id  # station_buffers zaten hesaplanmış buffer değerlerini taşır
    if not station_ids:
        return None
    extra = max(station_buffers.values()) if station_buffers else 0
    ui_threshold = get_ui_busy_threshold_minutes()
    if extra < ui_threshold:
        return None
    return {
        'show': True,
        'extra_minutes': int(extra),
        'message_key': 'kitchen_busy_eta',
        'busy_threshold_minutes': ui_threshold,
    }
