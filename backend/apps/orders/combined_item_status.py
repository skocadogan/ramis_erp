"""Birleşik ürün ana/alt kalem durum senkronizasyonu (KDS + mutfak bildirimleri)."""


from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from .models import OrderItem, OrderStatus

_KDS_ACTIVE_STATUSES = (
    OrderStatus.PENDING,
    OrderStatus.PREPARING,
    OrderStatus.READY,
)

_COMPONENT_DONE_STATUSES = (
    OrderStatus.READY,
    OrderStatus.DELIVERED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
)

_TERMINAL_STATUSES = (
    OrderStatus.DELIVERED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
)


def order_item_has_active_components_subquery():
    """Ana kalem altında iptal dışı en az bir alt bileşen var mı."""
    return OrderItem.objects.filter(parent_item_id=OuterRef('pk')).exclude(
        status=OrderStatus.CANCELLED,
    )


def filter_kds_actionable_order_items(qs):
    """
    KDS listesinde gerçekten işlenen satırlar: alt bileşenler veya altı olmayan üst kalemler.
    Birleşik ürün kabuğu (yalnızca parent) tek başına siparişi aktif tutmamalı.
    Ana satır teslim edilmişken alt kalemler READY kalmış (eski kayıt) ekranda görünmez.
    """
    has_components = order_item_has_active_components_subquery()
    return qs.filter(
        Q(parent_item__isnull=False)
        & ~Q(parent_item__status__in=_TERMINAL_STATUSES)
        | (Q(parent_item__isnull=True) & ~Exists(has_components)),
    )


def kds_active_item_status_filter():
    """``get_kds_active_orders`` için Exists alt sorgusu."""
    return filter_kds_actionable_order_items(
        OrderItem.objects.filter(
            order_id=OuterRef('pk'),
            status__in=_KDS_ACTIVE_STATUSES,
        )
    )


def sync_combined_item_status_after_update(item: OrderItem) -> list[OrderItem]:
    """
    Durum güncellemesi sonrası ana/alt kalemleri hizalar.
    Dönüş: ek yayın/KDS yenilemesi gereken güncellenmiş kalemler (ana satır dahil).
    """
    extra: list[OrderItem] = []
    now = timezone.now()

    if item.parent_item_id and item.status == OrderStatus.READY:
        parent = item.parent_item
        unfinished = parent.components.exclude(status__in=_COMPONENT_DONE_STATUSES).exclude(
            id=item.id
        )
        if not unfinished.exists() and parent.status != OrderStatus.READY:
            parent.status = OrderStatus.READY
            parent.save(update_fields=['status', 'updated_at'])
            extra.append(parent)

    if item.parent_item_id and item.status == OrderStatus.DELIVERED:
        parent = item.parent_item
        unfinished = parent.components.exclude(status__in=_TERMINAL_STATUSES).exclude(id=item.id)
        if not unfinished.exists() and parent.status != OrderStatus.DELIVERED:
            parent.status = OrderStatus.DELIVERED
            parent.save(update_fields=['status', 'updated_at'])
            extra.append(parent)

    if item.parent_item_id is None and item.status == OrderStatus.DELIVERED:
        pending_components = list(
            item.components.exclude(status=OrderStatus.CANCELLED).exclude(
                status=OrderStatus.DELIVERED,
            )
        )
        if pending_components:
            OrderItem.objects.filter(
                id__in=[c.id for c in pending_components],
            ).update(status=OrderStatus.DELIVERED, updated_at=now)
            for comp in pending_components:
                comp.status = OrderStatus.DELIVERED
                extra.append(comp)

    return extra
