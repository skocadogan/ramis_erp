"""POS paket sanal masa kimlikleri: ``tw-new__{zone_id}``, ``tw-ord__{order_id}``."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from django.db.models import Q
from django.utils.translation import gettext as _

NEW_SLOT_PREFIX = "tw-new__"
TAKEAWAY_ORDER_PREFIX = "tw-ord__"


@dataclass(frozen=True)
class VirtualTableRef:
    kind: str  # new_slot | takeaway_order
    zone_id: str | None = None
    order_id: str | None = None


def parse_virtual_table_id(table_id: str | None) -> VirtualTableRef | None:
    if not table_id or not isinstance(table_id, str):
        return None
    tid = table_id.strip()
    if tid.startswith(NEW_SLOT_PREFIX):
        zone_part = tid[len(NEW_SLOT_PREFIX) :]
        try:
            UUID(zone_part)
        except ValueError:
            return None
        return VirtualTableRef(kind="new_slot", zone_id=zone_part)
    if tid.startswith(TAKEAWAY_ORDER_PREFIX):
        order_part = tid[len(TAKEAWAY_ORDER_PREFIX) :]
        try:
            UUID(order_part)
        except ValueError:
            return None
        return VirtualTableRef(kind="takeaway_order", order_id=order_part)
    return None


def is_virtual_table_id(table_id: str | None) -> bool:
    return parse_virtual_table_id(table_id) is not None


def order_filter_q_for_table_scope(table_id: str) -> Q:
    """Sipariş sorgularında fizik masa veya sanal paket masası."""
    ref = parse_virtual_table_id(table_id)
    if ref is None:
        return Q(table_id=table_id)
    if ref.kind == "new_slot":
        return Q(pk__in=[])
    if ref.kind == "takeaway_order":
        return Q(pk=ref.order_id)
    return Q(pk__in=[])


def branch_id_for_table_scope(table_id: str):
    """``complete_table`` / ``cancel_table`` şube çözümlemesi."""
    from apps.orders.models import Order

    ref = parse_virtual_table_id(table_id)
    if ref is None:
        row = Order.objects.filter(table_id=table_id).values_list("branch_id", flat=True).first()
        return str(row) if row else None
    if ref.kind == "takeaway_order":
        row = Order.objects.filter(pk=ref.order_id).values_list("branch_id", flat=True).first()
        return str(row) if row else None
    if ref.kind == "new_slot":
        from .models import Zone

        row = Zone.objects.filter(pk=ref.zone_id).values_list("branch_id", flat=True).first()
        return str(row) if row else None
    return None


def virtual_table_detail_payload(table_id: str) -> dict | None:
    """``GET /tables/{id}/`` — sanal satır (TableListSerializer uyumlu)."""
    ref = parse_virtual_table_id(table_id)
    if not ref:
        return None

    from apps.orders.models import Order, OrderStatus, OrderType
    from .models import TableStatus, Zone
    from .selectors import takeaway_virtual_tables_payload

    if ref.kind == "new_slot":
        zone = (
            Zone.objects.filter(pk=ref.zone_id, is_active=True, is_takeaway=True)
            .select_related("branch")
            .first()
        )
        if not zone:
            return None
        return {
            "id": f"{NEW_SLOT_PREFIX}{zone.id}",
            "name": "__NEW_TAKEAWAY_SLOT__",
            "table_number": 0,
            "zone": str(zone.id),
            "zone_name": zone.name,
            "branch_name": zone.branch.name,
            "branch_id": str(zone.branch_id),
            "capacity": 1,
            "min_capacity": 1,
            "size": "MEDIUM",
            "shape": "SQUARE",
            "status": TableStatus.FREE,
            "position_x": None,
            "position_y": None,
            "reservation_info": None,
            "reservation_scheduled_at": None,
            "reservation_party_size": None,
            "is_active": True,
            "active_order": None,
            "active_orders": [],
            "pos_occupied_flow": None,
            "virtual_kind": "new_slot",
            "linked_order_id": None,
        }

    if ref.kind == "takeaway_order":
        order = (
            Order.objects.filter(
                pk=ref.order_id,
                order_type=OrderType.TAKEAWAY,
                table__isnull=True,
            )
            .select_related("takeaway_zone", "takeaway_zone__branch", "branch")
            .first()
        )
        if not order:
            return None
        branch_id = str(order.branch_id)
        for row in takeaway_virtual_tables_payload(branch_id):
            if row.get("id") == table_id:
                return row
        z = order.takeaway_zone
        if z is None:
            return None
        ao = {
            "id": str(order.id),
            "total_amount": str(order.total_amount),
            "created_at": order.created_at,
            "status": order.status,
        }
        pending_line = frozenset(
            {OrderStatus.PENDING, OrderStatus.PREPARING, OrderStatus.READY}
        )
        flow = "SETTLE"
        for item in order.items.all():
            if item.parent_item_id:
                continue
            if item.status in pending_line:
                flow = "KITCHEN"
                break
        return {
            "id": table_id,
            "name": (order.order_number or str(order.id)[-8:]).strip(),
            "table_number": 0,
            "zone": str(z.id),
            "zone_name": z.name,
            "branch_name": z.branch.name,
            "branch_id": str(z.branch_id),
            "capacity": 1,
            "min_capacity": 1,
            "size": "MEDIUM",
            "shape": "SQUARE",
            "status": TableStatus.OCCUPIED,
            "position_x": None,
            "position_y": None,
            "reservation_info": None,
            "reservation_scheduled_at": None,
            "reservation_party_size": None,
            "is_active": True,
            "active_order": ao,
            "active_orders": [ao],
            "pos_occupied_flow": flow,
            "virtual_kind": "takeaway_order",
            "linked_order_id": str(order.id),
        }
    return None


def resolve_takeaway_table_id_for_create(table_id: str | None, *, branch_id, order_type: str):
    """
    Sipariş oluşturma: sanal ``tw-new__`` → ``table_id=None``, ``takeaway_zone_id`` dolu.
    Dönüş: (table_id, takeaway_zone_id_override | None)
    """
    ref = parse_virtual_table_id(table_id)
    if not ref:
        return table_id, None
    if ref.kind == "new_slot":
        if order_type != "TAKEAWAY":
            raise ValueError(_("Sanal paket masası yalnızca paket siparişi için kullanılabilir."))
        from .models import Zone

        if not Zone.objects.filter(
            pk=ref.zone_id, branch_id=branch_id, is_active=True, is_takeaway=True
        ).exists():
            raise ValueError(_("Geçersiz paket bölgesi."))
        return None, ref.zone_id
    if ref.kind == "takeaway_order":
        raise ValueError(_("Açık paket siparişine yeni satır bu uçtan eklenemez."))
    return table_id, None
