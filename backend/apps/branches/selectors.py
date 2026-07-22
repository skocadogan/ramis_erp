from django.db.models import Count, QuerySet, Prefetch, Q
from .models import Branch, Table, TableStatus, Zone
from apps.orders.models import Order, OrderItem, OrderStatus, OrderType
from apps.orders.order_scope import OPEN_ORDER_STATUSES

def get_branches_with_user_counts() -> QuerySet[Branch]:
    return Branch.objects.annotate(users_count=Count('users')).order_by('name', 'id')


def get_branch_users(branch_id: str) -> QuerySet:
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.filter(branch_id=branch_id, is_active=True).select_related().prefetch_related('roles')

def _active_orders_prefetch():
    top_level_items = OrderItem.objects.filter(parent_item__isnull=True).select_related(
        "product"
    )
    return (
        Order.objects.filter(
            status__in=OPEN_ORDER_STATUSES
        )
        .order_by("-created_at")
        .prefetch_related(Prefetch("items", queryset=top_level_items))
    )


def get_tables_with_active_orders(branch_id=None):
    """N+1 önleme: prefetch_related('orders') ile aktif siparişleri yükler."""
    active_orders = _active_orders_prefetch()
    
    from .models import WaiterBranchAssignment
    waiter_table_qs = WaiterBranchAssignment.objects.select_related("user")
    waiter_zone_qs = WaiterBranchAssignment.objects.select_related("user")

    queryset = Table.objects.filter(is_active=True).select_related("zone", "zone__branch")
    if branch_id:
        queryset = queryset.filter(zone__branch_id=branch_id)

    queryset = queryset.prefetch_related(
        Prefetch("orders", queryset=active_orders, to_attr="active_orders_prefetched"),
        Prefetch("waiter_assignments_by_table", queryset=waiter_table_qs),
        Prefetch("zone__waiter_assignments_by_zone", queryset=waiter_zone_qs)
    ).annotate(
        order_count=Count(
            "orders",
            filter=Q(orders__status__in=list(OPEN_ORDER_STATUSES)),
        )
    ).order_by("zone__name", "table_number")
    return queryset


def get_table_with_active_orders(table_id):
    """Tek masa için aktif sipariş snapshot'ı (WS / signal yolu)."""
    if not table_id:
        return None
    active_orders = _active_orders_prefetch()
    return (
        Table.objects.filter(is_active=True, pk=table_id)
        .select_related("zone", "zone__branch")
        .prefetch_related(
            Prefetch("orders", queryset=active_orders, to_attr="active_orders_prefetched")
        )
        .annotate(
            order_count=Count(
                "orders",
                filter=Q(orders__status__in=list(OPEN_ORDER_STATUSES)),
            )
        )
        .first()
    )

def get_floor_plan_data(zone_id):
    tables = get_tables_with_active_orders().filter(zone_id=zone_id)
    return tables

def get_zone_summary(branch_id=None):
    zones = Zone.objects.filter(is_active=True)
    if branch_id:
        zones = zones.filter(branch_id=branch_id)
        
    zones = zones.annotate(
        total_tables=Count('tables', filter=Q(tables__is_active=True)),
        free_tables=Count('tables', filter=Q(tables__is_active=True, tables__status=TableStatus.FREE)),
        occupied_tables=Count('tables', filter=Q(tables__is_active=True, tables__status=TableStatus.OCCUPIED)),
        reserved_tables=Count('tables', filter=Q(tables__is_active=True, tables__status=TableStatus.RESERVED)),
        cleaning_tables=Count('tables', filter=Q(tables__is_active=True, tables__status=TableStatus.CLEANING)),
        out_of_service_tables=Count('tables', filter=Q(tables__is_active=True, tables__status=TableStatus.OUT_OF_SERVICE)),
    )
    
    return zones


def takeaway_virtual_tables_payload(branch_id: str) -> list[dict]:
    """
    POS: Paket bölgesi için fizik masa tanımı olmadan, açık TAKEAWAY siparişlerini
    TableListSerializer alanlarıyla uyumlu sanal masa satırlarına dönüştürür.
    """
    zones = list(
        Zone.objects.filter(branch_id=branch_id, is_active=True, is_takeaway=True)
        .select_related('branch')
        .order_by('name')
    )
    out: list[dict] = []
    default_zone = zones[0] if zones else None

    from apps.branches.pos_occupied_flow import flow_for_order

    for z in zones:
        out.append(
            {
                'id': f'tw-new__{z.id}',
                'name': '__NEW_TAKEAWAY_SLOT__',
                'table_number': 0,
                'zone': str(z.id),
                'zone_name': z.name,
                'branch_name': z.branch.name,
                'branch_id': str(z.branch_id),
                'capacity': 1,
                'min_capacity': 1,
                'size': 'MEDIUM',
                'shape': 'SQUARE',
                'status': TableStatus.FREE,
                'position_x': None,
                'position_y': None,
                'reservation_info': None,
                'reservation_scheduled_at': None,
                'reservation_party_size': None,
                'is_active': True,
                'active_order': None,
                'active_orders': [],
                'pos_occupied_flow': None,
                'virtual_kind': 'new_slot',
                'linked_order_id': None,
            }
        )

    orders_qs = (
        Order.objects.filter(
            branch_id=branch_id,
            order_type=OrderType.TAKEAWAY,
            table__isnull=True,
            status__in=OPEN_ORDER_STATUSES,
        )
        .select_related('takeaway_zone', 'takeaway_zone__branch')
        .prefetch_related('items')
        .order_by('-created_at')
    )

    for order in orders_qs:
        z = order.takeaway_zone or default_zone
        if z is None:
            continue
        ao = {
            'id': str(order.id),
            'total_amount': str(order.total_amount),
            'created_at': order.created_at,
            'status': order.status,
        }
        out.append(
            {
                'id': f'tw-ord__{order.id}',
                'name': (order.order_number or str(order.id)[-8:]).strip(),
                'table_number': 0,
                'zone': str(z.id),
                'zone_name': z.name,
                'branch_name': z.branch.name,
                'branch_id': str(z.branch_id),
                'capacity': 1,
                'min_capacity': 1,
                'size': 'MEDIUM',
                'shape': 'SQUARE',
                'status': TableStatus.OCCUPIED,
                'position_x': None,
                'position_y': None,
                'reservation_info': None,
                'reservation_scheduled_at': None,
                'reservation_party_size': None,
                'is_active': True,
                'active_order': ao,
                'active_orders': [ao],
                'pos_occupied_flow': flow_for_order(order),
                'virtual_kind': 'takeaway_order',
                'linked_order_id': str(order.id),
            }
        )

    return out
