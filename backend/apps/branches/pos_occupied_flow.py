"""POS masa kartı `pos_occupied_flow` (KITCHEN / SETTLE) hesaplama."""

from __future__ import annotations

from apps.orders.models import OrderStatus, OrderType


_PENDING_LINE = frozenset(
    {
        OrderStatus.PENDING,
        OrderStatus.PREPARING,
        OrderStatus.READY,
    }
)


def order_item_blocks_settle(item, *, order_type: str | None = None) -> bool:
    """
    True → kart turuncu BEKLEYEN (KITCHEN).

    Paket (TAKEAWAY): READY + waiter_acknowledged_at → mutfak bildiriminde
    görüldü; hesap/teslim alma (SETTLE) aşamasına geçer.
    Masa siparişinde READY her zaman KITCHEN kalır (teslim = DELIVERED).
    """
    if getattr(item, "parent_item_id", None):
        return False
    st = item.status
    if st not in _PENDING_LINE:
        return False
    if (
        st == OrderStatus.READY
        and order_type == OrderType.TAKEAWAY
        and getattr(item, "waiter_acknowledged_at", None)
    ):
        return False
    return True


def top_level_items(order):
    cache = getattr(order, "_prefetched_objects_cache", None) or {}
    items = cache.get("items")
    if items is not None:
        return [i for i in items if i.parent_item_id is None]
    return list(order.items.filter(parent_item__isnull=True))


def flow_for_order(order) -> str:
    """Tek sipariş için KITCHEN | SETTLE."""
    ot = getattr(order, "order_type", None)
    for item in top_level_items(order):
        if order_item_blocks_settle(item, order_type=ot):
            return "KITCHEN"
    return "SETTLE"


def flow_for_orders(orders) -> str:
    """Birden fazla açık sipariş (fizik masa)."""
    if not orders:
        return "SETTLE"
    for order in orders:
        if flow_for_order(order) == "KITCHEN":
            return "KITCHEN"
    return "SETTLE"
