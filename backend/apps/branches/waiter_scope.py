"""Garson masa kapsamı: WaiterBranchAssignment (masa + atanan paket bölgeleri)."""
from __future__ import annotations

from django.core.exceptions import PermissionDenied
from django.utils.translation import gettext as _

from .models import ManagerBranchAssignment, Table, WaiterBranchAssignment


def _may_bypass_waiter_scope_as_manager(user, branch_id) -> bool:
    """
    Şube müdürü / müdür ataması: garson masa kısıtı POS ödeme vb. için uygulanmaz.
    `waiter.access` (ör. çift rol) olsa bile tam şube yetkisi önceliklidir.
    """
    if not branch_id or not user or not user.is_authenticated:
        return False
    bid = str(branch_id)
    from core.branch_scope import user_may_access_branch

    if not user_may_access_branch(user, bid):
        return False
    if user.has_permission("branches.manage_branch"):
        return True
    return ManagerBranchAssignment.objects.filter(user_id=user.pk, branch_id=bid).exists()


def _has_waiter_access(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    if hasattr(user, "has_permission"):
        return user.has_permission("waiter.access")
    return False


def get_assignment(user, branch_id) -> WaiterBranchAssignment | None:
    if not branch_id:
        return None
    return (
        WaiterBranchAssignment.objects.filter(user_id=user.pk, branch_id=branch_id)
        .prefetch_related("zones", "tables__zone")
        .first()
    )


def eligible_table_ids_for(user, branch_id) -> set[str]:
    """
    Atanan zone masaları ∪ doğrudan atanan masalar.

    Zones ve tables ikisi de boşsa → şube geneli atama (tüm aktif masalar).
    """
    assignment = get_assignment(user, branch_id)
    if assignment is None:
        return set()

    bid = str(branch_id)
    zone_ids = [
        str(z.id)
        for z in assignment.zones.all()
        if str(z.branch_id) == bid
    ]
    from_zone = set(
        Table.objects.filter(zone_id__in=zone_ids, is_active=True).values_list("id", flat=True)
    )

    direct = set()
    for t in assignment.tables.filter(is_active=True).select_related("zone"):
        if str(t.zone.branch_id) != bid:
            continue
        direct.add(t.id)

    all_ids = from_zone | direct

    # Zone ve masa ataması yoksa → şube geneli erişim (tüm aktif masalar)
    if not all_ids:
        all_ids = set(
            Table.objects.filter(zone__branch_id=bid, is_active=True)
            .values_list("id", flat=True)
        )

    return {str(i) for i in all_ids}


def eligible_takeaway_zone_ids_for(user, branch_id) -> set[str]:
    """Atanan paket bölgeleri (is_takeaway); READY bildirimi kapsamı için."""
    assignment = get_assignment(user, branch_id)
    if assignment is None:
        return set()
    bid = str(branch_id)
    return {
        str(z.id)
        for z in assignment.zones.all()
        if str(z.branch_id) == bid and getattr(z, "is_takeaway", False)
    }


def enforce_waiter_table_scope(*, user, branch_id, table_id) -> None:
    """waiter.access varsa masa kapsamında olmayı zorunlu kılar; atama yoksa PermissionDenied."""
    if getattr(user, "is_superuser", False):
        return
    if _may_bypass_waiter_scope_as_manager(user, branch_id):
        return
    if not _has_waiter_access(user):
        return
    if not branch_id or not table_id:
        return
    if get_assignment(user, branch_id) is None:
        raise PermissionDenied(_("Bu şube için garson atamanız tanımlı değil."))

    from .virtual_table_ids import parse_virtual_table_id

    ref = parse_virtual_table_id(str(table_id))
    if ref:
        if ref.kind == "new_slot":
            zones = eligible_takeaway_zone_ids_for(user, branch_id)
            if zones and ref.zone_id not in zones:
                raise PermissionDenied(_("Bu paket bölgesi garson hizmet alanınızda değil."))
            return
        if ref.kind == "takeaway_order":
            from apps.orders.models import Order

            order = Order.objects.filter(pk=ref.order_id, branch_id=branch_id).first()
            if not order:
                raise PermissionDenied(_("Bu sipariş garson hizmet alanınızda değil."))
            tz = getattr(order, "takeaway_zone_id", None)
            if tz:
                zones = eligible_takeaway_zone_ids_for(user, branch_id)
                if zones and str(tz) not in zones:
                    raise PermissionDenied(_("Bu paket bölgesi garson hizmet alanınızda değil."))
            return

    allowed = eligible_table_ids_for(user, branch_id)
    if str(table_id) not in allowed:
        raise PermissionDenied(_("Bu masa garson hizmet alanınızda değil."))


def enforce_waiter_order_item_scope(*, user, item) -> None:
    """Sipariş kalemi için siparişin masası üzerinden kapsam kontrolü."""
    if getattr(user, "is_superuser", False):
        return
    if not _has_waiter_access(user):
        return
    order = item.order
    tid = order.table_id
    if not tid:
        from apps.orders.models import OrderType

        if getattr(order, "order_type", None) == OrderType.TAKEAWAY:
            return
        raise PermissionDenied(_("Bu işlem yalnızca masa siparişleri için geçerlidir."))
    enforce_waiter_table_scope(user=user, branch_id=order.branch_id, table_id=tid)


def validate_assignment_zone_table_ids(*, branch_id, zone_ids: list, table_ids: list) -> None:
    """PUT sırasında zone/table id'lerinin şubeye ait olma kuralları."""
    from .models import Zone

    bid = str(branch_id)
    zones = Zone.objects.filter(id__in=zone_ids)
    for z in zones:
        if str(z.branch_id) != bid:
            raise ValueError(
                _("Zone %(zone_id)s bu şubeye ait değil.") % {"zone_id": z.id}
            )

    tables = Table.objects.filter(id__in=table_ids).select_related("zone")
    for t in tables:
        if str(t.zone.branch_id) != bid:
            raise ValueError(
                _("Masa %(table_id)s bu şubeye ait değil.") % {"table_id": t.id}
            )


def _ready_order_items_base_qs(branch_id):
    from apps.orders.models import OrderItem, OrderStatus

    return (
        OrderItem.objects.filter(
            status=OrderStatus.READY,
            parent_item__isnull=True,
            order__branch_id=branch_id,
        )
        .select_related(
            "product",
            "product__category",
            "variant",
            "station",
            "order",
            "order__table",
            "order__table__zone",
            "order__takeaway_zone",
        )
        .prefetch_related("modifiers", "modifiers__modifier")
        .order_by("-updated_at")
    )


def ready_order_items_qs_for_waiter(user, branch_id):
    """
    READY kalemleri: atanan masalar + atanan paket bölgelerindeki TAKEAWAY siparişler.
    Paket siparişlerde table_id null olduğundan yalnızca masa filtresi yetmez.
    """
    from django.db.models import Q
    from apps.orders.models import OrderType

    base = _ready_order_items_base_qs(branch_id)

    if getattr(user, "is_superuser", False):
        return base

    if get_assignment(user, branch_id) is None:
        return OrderItem.objects.none()

    allowed_tables = eligible_table_ids_for(user, branch_id)
    takeaway_zones = eligible_takeaway_zone_ids_for(user, branch_id)
    if not allowed_tables and not takeaway_zones:
        return OrderItem.objects.none()

    scope = Q()
    if allowed_tables:
        scope |= Q(order__table_id__in=allowed_tables)
    if takeaway_zones:
        scope |= Q(
            order__order_type=OrderType.TAKEAWAY,
            order__takeaway_zone_id__in=takeaway_zones,
        )
        scope |= Q(
            order__order_type=OrderType.TAKEAWAY,
            order__takeaway_zone__isnull=True,
        )

    return base.filter(scope)
