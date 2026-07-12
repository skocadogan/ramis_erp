from datetime import timedelta

from django.conf import settings
from django.db.models import Count, Exists, Prefetch, Q
from django.utils import timezone

from .combined_item_status import kds_active_item_status_filter
from .models import Order, OrderItem, OrderStatus, OrderType


def get_kds_recall_window_minutes() -> int:
    return max(1, min(120, int(getattr(settings, 'KDS_RECALL_WINDOW_MINUTES', 15))))


def get_kds_recallable_items_qs(*, branch_id=None, station_id=None):
    """
    KDS geri çağır drawer: servise gönderilmiş (READY/DELIVERED) kalemler.
    Süre dışı, hesabı kapanmış veya iptal/tamamlanmış siparişler hariç.
    """
    window_start = timezone.now() - timedelta(minutes=get_kds_recall_window_minutes())
    qs = (
        OrderItem.objects.filter(
            status__in=[OrderStatus.READY, OrderStatus.DELIVERED],
            parent_item__isnull=True,
            updated_at__gte=window_start,
            order__sale__isnull=True,
        )
        .exclude(order__status__in=[OrderStatus.COMPLETED, OrderStatus.CANCELLED])
        .select_related(
            'product',
            'product__category',
            'variant',
            'station',
            'order',
            'order__table',
            'order__table__zone',
        )
        .prefetch_related('modifiers', 'modifiers__modifier')
        .order_by('-updated_at')
    )
    if branch_id:
        qs = qs.filter(order__branch_id=branch_id)
    if station_id:
        qs = qs.filter(Q(station_id=station_id) | Q(station_id__isnull=True))
    return qs


def get_kds_active_orders(branch_id=None, station_id=None):
    """
    KDS ekranı için aktif siparişleri döner.

    Yalnızca mutfakta işlenen kalemler (PENDING / PREPARING / READY).
    Servis edilmiş (DELIVERED) sipariş POS'tan iptal edildiğinde tekrar listelenmez;
    iptal duyurusu yalnızca zaten KDS state'inde olan siparişler için istemci tarafında
    (WebSocket + kısa grace) gösterilir.
    """
    # Alt prefetch queryset'i tanımla
    items_qs = OrderItem.objects.select_related(
        'product',
        'product__category',
        'station',
        'parent_item',
        'parent_item__product',
        'parent_item__product__category',
    ).prefetch_related(
        'product__combined_items',
        'product__combined_items__product',
        'product__combined_items__product_unit',
        'components',
        'components__product',
        'modifiers',
        'modifiers__modifier'
    )

    if station_id:
        items_qs = items_qs.filter(Q(station_id=station_id) | Q(station_id__isnull=True))

    qs = (
        Order.objects.filter(Exists(kds_active_item_status_filter()))
        .exclude(status=OrderStatus.COMPLETED)
        .exclude(sale__isnull=False)
        .distinct()
        .select_related('table', 'table__zone', 'table__zone__branch', 'user', 'branch')
        .prefetch_related(Prefetch('items', queryset=items_qs))
        .order_by('created_at')
    )

    if branch_id:
        qs = qs.filter(branch_id=branch_id)

    # Ürün kategorisinde istasyon yoksa kalem station_id=NULL olur; bu kalemler her
    # mutfak istasyonu ekranında görünmeli (menü: "tüm KDS'e düşer").
    if station_id:
        qs = qs.filter(
            Q(items__station_id=station_id) | Q(items__station_id__isnull=True)
        ).distinct()

    return qs


def get_kds_peer_pending_qs(exclude_station_id):
    """
    Açık masalı siparişlerde, verilen KDS istasyonu **dışındaki** mutfak istasyonlarında
    hâlâ PENDING / PREPARING aşamasında bekleyen satırlar (station_id dolu, NULL ortak
    satırlar hariç — çünkü her ekranda zaten listelenir).
    """
    if not exclude_station_id:
        return OrderItem.objects.none()
    return (
        OrderItem.objects.filter(
            order__order_type=OrderType.TABLE,
            order__table__isnull=False,
            order__sale__isnull=True,
            status__in=[OrderStatus.PENDING, OrderStatus.PREPARING],
            station_id__isnull=False,
        )
        .exclude(station_id=exclude_station_id)
        .exclude(order__status=OrderStatus.COMPLETED)
        .exclude(order__status=OrderStatus.CANCELLED)
        .select_related("order__table", "product", "product__category", "station")
        .order_by("order__table__name", "station__name", "id")
    )


def get_kitchen_stats(branch_id=None):
    """
    Her istasyon için bekleyen (PENDING veya PREPARING) sipariş sayılarını döner.
    Dönen veri formatı: { station_id: pending_count }
    """
    qs = OrderItem.objects.all()
    if branch_id:
        qs = qs.filter(order__branch_id=branch_id)
    
    # Sadece hazırlık aşamasındaki (Bekliyor ve Hazırlanıyor) ürünleri sayıyoruz
    stats = qs.filter(
        status__in=[OrderStatus.PENDING, OrderStatus.PREPARING]
    ).values('station_id').annotate(
        pending_count=Count('id')
    )
    
    return {str(item['station_id']): item['pending_count'] for item in stats if item['station_id']}


def get_order_for_api_response(order_id):
    """OrderSerializer için ilişkileri önceden yükler (create/complete yanıtı)."""
    item_qs = OrderItem.objects.select_related(
        "product",
        "product__category",
        "variant",
        "station",
        "order",
        "order__table",
    ).prefetch_related(
        "modifiers__modifier",
        "components__product",
        "product__combined_items__product",
        "product__combined_items__product_unit",
    )
    return (
        Order.objects.filter(pk=order_id)
        .select_related(
            "table",
            "table__zone",
            "table__zone__branch",
            "branch",
            "user",
            "discount_by",
        )
        .prefetch_related(Prefetch("items", queryset=item_qs))
        .first()
    )
