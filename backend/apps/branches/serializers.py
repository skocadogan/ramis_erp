from decimal import Decimal

from django.utils.translation import gettext as _
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.utils import timezone
from .models import Branch, Zone, Table, TableStatus, KitchenStation, BranchTarget
from .table_cleaning import serialize_cleaning_fields
from apps.orders.order_scope import OPEN_ORDER_STATUSES

User = get_user_model()


class BranchSerializer(serializers.ModelSerializer):
    users_count = serializers.IntegerField(read_only=True, default=0)
    users_list = serializers.SerializerMethodField()
    current_month_target = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'code', 'address', 'phone',
            'email', 'website',
            'tax_office', 'tax_number', 'registry_no', 'mersis_no',
            'logo',
            'currency', 'tax_rate', 'invoice_prefix',
            'table_cleaning_duration_minutes',
            'users_count', 'users_list',
            'current_month_target',
            'created_at', 'updated_at',
        ]

    def get_current_month_target(self, obj) -> float:
        now = timezone.now()
        target = BranchTarget.objects.filter(branch=obj, month=now.month, year=now.year).first()
        return float(target.target_revenue) if target else 0.0

    def update(self, instance, validated_data):
        target_val = self.initial_data.get('current_month_target')
        if target_val is not None:
            now = timezone.now()
            BranchTarget.objects.update_or_create(
                branch=instance, month=now.month, year=now.year,
                defaults={'target_revenue': Decimal(str(target_val))}
            )
        return super().update(instance, validated_data)

    def get_users_list(self, obj) -> list[str]:
        return list(obj.users.filter(is_active=True).values_list('username', flat=True)[:5])


class BranchUserSerializer(serializers.ModelSerializer):
    role_names = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'is_active', 'role_names']

    def get_role_names(self, obj) -> list[str]:
        return list(obj.roles.values_list('name', flat=True))


class AssignUsersSerializer(serializers.Serializer):
    user_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=True,
    )


class WaiterBranchAssignmentWriteSerializer(serializers.Serializer):
    zone_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True, required=True)
    table_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True, required=True)

class CookStationAssignmentWriteSerializer(serializers.Serializer):
    station_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True, required=True)

class ManagerBranchAssignmentWriteSerializer(serializers.Serializer):
    branch_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=True, required=True)

class ZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Zone
        fields = '__all__'


def compute_pos_occupied_flow(table: Table) -> str | None:
    """
    POS masa kartı rengi: üst sipariş kalemlerinde (parent yok) mutfak/teslimat öncesi
    durum varsa KITCHEN (turuncu), tümü teslim/i̇ptal/tamam ise SETTLE (kırmızı).
    Paket siparişlerde READY+görüldü SETTLE sayılır — bkz. ``pos_occupied_flow``.
    """
    if table.status != TableStatus.OCCUPIED:
        return None

    from apps.branches.pos_occupied_flow import flow_for_orders

    orders = getattr(table, 'active_orders_prefetched', None)
    if orders is None:
        orders = list(
            table.orders.filter(
                status__in=OPEN_ORDER_STATUSES
            ).order_by('created_at')
        )
    else:
        orders = list(orders)

    return flow_for_orders(orders)


def _order_top_level_items(order):
    from apps.branches.pos_occupied_flow import top_level_items

    return top_level_items(order)


class KitchenStationSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    warehouse_name = serializers.SerializerMethodField()
    categories_count = serializers.SerializerMethodField()
    pending_orders_count = serializers.SerializerMethodField()

    def get_warehouse_name(self, obj) -> str | None:
        return obj.warehouse.name if obj.warehouse else None

    class Meta:
        model = KitchenStation
        fields = [
            'id', 'branch', 'branch_name', 'name', 'code',
            'color', 'description', 'is_active',
            'warehouse', 'warehouse_name',
            'smart_firing_extra_buffer_minutes',
            'categories_count', 'pending_orders_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_categories_count(self, obj) -> int:
        return obj.categories.count()

    def get_pending_orders_count(self, obj) -> int:
        from apps.orders.models import OrderItem, OrderStatus
        return OrderItem.objects.filter(
            station=obj,
            status__in=[OrderStatus.PENDING, OrderStatus.PREPARING]
        ).count()


class TableListMinimalSerializer(serializers.ModelSerializer):
    """Garson/POS listesi — pos_occupied_flow olmadan hafif yanıt."""

    zone_name = serializers.CharField(source='zone.name', read_only=True)
    branch_id = serializers.UUIDField(source='zone.branch_id', read_only=True)
    zone_is_takeaway = serializers.BooleanField(source='zone.is_takeaway', read_only=True)
    active_order = serializers.SerializerMethodField()
    active_orders = serializers.SerializerMethodField()
    cleaning_started_at = serializers.DateTimeField(read_only=True)
    cleaning_until = serializers.SerializerMethodField()
    cleaning_remaining_seconds = serializers.SerializerMethodField()

    class Meta:
        model = Table
        fields = [
            'id', 'name', 'table_number', 'zone', 'zone_name', 'branch_id', 'zone_is_takeaway',
            'status', 'active_order', 'active_orders',
            'cleaning_started_at', 'cleaning_until', 'cleaning_remaining_seconds',
        ]

    def _cleaning_payload(self, obj):
        return serialize_cleaning_fields(obj)

    def get_cleaning_until(self, obj):
        return self._cleaning_payload(obj)['cleaning_until']

    def get_cleaning_remaining_seconds(self, obj):
        return self._cleaning_payload(obj)['cleaning_remaining_seconds']

    def _get_active(self, obj):
        orders = getattr(obj, 'active_orders_prefetched', None)
        if orders is None:
            orders = list(
                obj.orders.filter(status__in=OPEN_ORDER_STATUSES).order_by('created_at')
            )
        return orders

    def get_active_order(self, obj):
        orders = self._get_active(obj)
        if orders:
            order = orders[0]
            return {
                'id': str(order.id),
                'total_amount': str(order.total_amount),
                'created_at': order.created_at,
                'status': order.status,
            }
        return None

    def get_active_orders(self, obj):
        orders = self._get_active(obj)
        return [
            {
                'id': str(o.id),
                'total_amount': str(o.total_amount),
                'created_at': o.created_at,
                'status': o.status,
            }
            for o in orders
        ]


class TableListSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    branch_name = serializers.CharField(source='zone.branch.name', read_only=True)
    branch_id = serializers.UUIDField(source='zone.branch_id', read_only=True)
    zone_is_takeaway = serializers.BooleanField(source='zone.is_takeaway', read_only=True)
    active_order = serializers.SerializerMethodField()
    active_orders = serializers.SerializerMethodField()
    pos_occupied_flow = serializers.SerializerMethodField()
    cleaning_started_at = serializers.DateTimeField(read_only=True)
    cleaning_until = serializers.SerializerMethodField()
    cleaning_remaining_seconds = serializers.SerializerMethodField()
    assigned_waiters = serializers.SerializerMethodField()

    class Meta:
        model = Table
        fields = [
            'id', 'name', 'table_number', 'zone', 'zone_name', 'branch_name', 'branch_id',
            'zone_is_takeaway',
            'capacity', 'min_capacity', 'size', 'shape', 'status',
            'position_x', 'position_y', 'reservation_info',
            'reservation_scheduled_at', 'reservation_party_size', 'is_active',
            'active_order', 'active_orders',
            'pos_occupied_flow',
            'cleaning_started_at', 'cleaning_until', 'cleaning_remaining_seconds',
            'assigned_waiters',
        ]

    def _get_waiter_names(self, obj):
        waiters = set()
        # Direct assignments
        direct = getattr(obj, 'waiter_assignments_by_table', None)
        if direct is not None:
            for assignment in direct.all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)
        else:
            for assignment in obj.waiter_assignments_by_table.select_related('user').all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)

        # Zone assignments
        zone_assignments = getattr(obj.zone, 'waiter_assignments_by_zone', None)
        if zone_assignments is not None:
            for assignment in zone_assignments.all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)
        else:
            for assignment in obj.zone.waiter_assignments_by_zone.select_related('user').all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)

        return sorted(list(waiters))

    def get_assigned_waiters(self, obj):
        return self._get_waiter_names(obj)

    def _cleaning_payload(self, obj):
        return serialize_cleaning_fields(obj)

    def get_cleaning_until(self, obj):
        return self._cleaning_payload(obj)['cleaning_until']

    def get_cleaning_remaining_seconds(self, obj):
        return self._cleaning_payload(obj)['cleaning_remaining_seconds']

    def _get_active(self, obj):
        orders = getattr(obj, 'active_orders_prefetched', None)
        if orders is None:
            orders = list(obj.orders.filter(status__in=OPEN_ORDER_STATUSES).order_by('created_at'))
        return orders

    def get_active_order(self, obj):
        orders = self._get_active(obj)
        if orders:
            order = orders[0]
            return {
                'id': str(order.id),
                'total_amount': str(order.total_amount),
                'created_at': order.created_at,
                'status': order.status,
            }
        return None

    def get_active_orders(self, obj):
        orders = self._get_active(obj)
        return [
            {
                'id': str(o.id),
                'total_amount': str(o.total_amount),
                'created_at': o.created_at,
                'status': o.status,
            }
            for o in orders
        ]

    def get_pos_occupied_flow(self, obj):
        return compute_pos_occupied_flow(obj)

class TableDetailSerializer(serializers.ModelSerializer):
    zone_name = serializers.CharField(source='zone.name', read_only=True)
    branch_name = serializers.CharField(source='zone.branch.name', read_only=True)
    branch_id = serializers.UUIDField(source='zone.branch_id', read_only=True)
    zone_is_takeaway = serializers.BooleanField(source='zone.is_takeaway', read_only=True)
    active_order = serializers.SerializerMethodField()
    active_orders = serializers.SerializerMethodField()
    order_count = serializers.IntegerField(read_only=True, default=0)
    pos_occupied_flow = serializers.SerializerMethodField()
    cleaning_started_at = serializers.DateTimeField(read_only=True)
    cleaning_until = serializers.SerializerMethodField()
    cleaning_remaining_seconds = serializers.SerializerMethodField()
    assigned_waiters = serializers.SerializerMethodField()

    class Meta:
        model = Table
        fields = [
            'id', 'name', 'table_number', 'zone', 'zone_name', 'branch_name', 'branch_id',
            'zone_is_takeaway',
            'capacity', 'min_capacity', 'size', 'shape', 'status',
            'position_x', 'position_y', 'reservation_info',
            'reservation_scheduled_at', 'reservation_party_size',
            'notes', 'is_active',
            'active_order', 'active_orders', 'order_count',
            'pos_occupied_flow',
            'cleaning_started_at', 'cleaning_until', 'cleaning_remaining_seconds',
            'assigned_waiters',
        ]

    def get_assigned_waiters(self, obj):
        waiters = set()
        # Direct assignments
        direct = getattr(obj, 'waiter_assignments_by_table', None)
        if direct is not None:
            for assignment in direct.all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)
        else:
            for assignment in obj.waiter_assignments_by_table.select_related('user').all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)

        # Zone assignments
        zone_assignments = getattr(obj.zone, 'waiter_assignments_by_zone', None)
        if zone_assignments is not None:
            for assignment in zone_assignments.all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)
        else:
            for assignment in obj.zone.waiter_assignments_by_zone.select_related('user').all():
                u = assignment.user
                name = f"{u.first_name} {u.last_name}".strip() or u.username
                waiters.add(name)

        return sorted(list(waiters))

    def _cleaning_payload(self, obj):
        return serialize_cleaning_fields(obj)

    def get_cleaning_until(self, obj):
        return self._cleaning_payload(obj)['cleaning_until']

    def get_cleaning_remaining_seconds(self, obj):
        return self._cleaning_payload(obj)['cleaning_remaining_seconds']

    def _get_active(self, obj):
        orders = getattr(obj, 'active_orders_prefetched', None)
        if orders is None:
            orders = list(obj.orders.filter(status__in=OPEN_ORDER_STATUSES).order_by('created_at'))
        return orders

    def get_active_order(self, obj):
        orders = self._get_active(obj)
        if orders:
            order = orders[0]
            return {
                'id': str(order.id),
                'total_amount': str(order.total_amount),
                'created_at': order.created_at,
                'status': order.status,
            }
        return None

    def get_active_orders(self, obj):
        orders = self._get_active(obj)
        return [
            {
                'id': str(o.id),
                'total_amount': str(o.total_amount),
                'created_at': o.created_at,
                'status': o.status,
            }
            for o in orders
        ]

    def get_pos_occupied_flow(self, obj):
        return compute_pos_occupied_flow(obj)

class TableCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = [
            'name', 'table_number', 'zone', 'capacity', 'min_capacity',
            'size', 'shape', 'status', 'position_x', 'position_y',
            'reservation_info', 'reservation_scheduled_at', 'reservation_party_size',
            'notes', 'is_active'
        ]

    def validate_zone(self, value):
        if value is not None and getattr(value, 'is_takeaway', False):
            raise serializers.ValidationError(_("Paket bölgelerinde masa tanımlanamaz."))
        return value

    def update(self, instance, validated_data):
        new_status = validated_data.get('status', instance.status)
        if new_status != TableStatus.RESERVED:
            validated_data['reservation_info'] = ''
            validated_data['reservation_scheduled_at'] = None
            validated_data['reservation_party_size'] = None
        return super().update(instance, validated_data)

    def create(self, validated_data):
        if validated_data.get('status') != TableStatus.RESERVED:
            validated_data['reservation_info'] = ''
            validated_data['reservation_scheduled_at'] = None
            validated_data['reservation_party_size'] = None
        return super().create(validated_data)

class TableStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = ['status']


class KitchenStationWasteSerializer(serializers.Serializer):
    """KDS üzerinden fire/zayi kaydı (stok WASTE hareketi veya Ürün Porsiyon düşümü)."""

    stock_item_id = serializers.UUIDField(required=False, allow_null=True)
    product_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=Decimal('0.000001'))
    unit = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if not attrs.get('stock_item_id') and not attrs.get('product_id'):
            raise serializers.ValidationError(
                _(
                    "stock_item_id veya product_id alanlarından en az biri dolu olmalıdır."
                )
            )
        return attrs


class KitchenStationReturnCancelSerializer(serializers.Serializer):
    """KDS üzerinden iade/iptal kaydı (RETURN veya CANCEL stok hareketi)."""

    stock_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=Decimal('0.000001'))
    unit = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    reason_code = serializers.CharField(required=False, allow_blank=True, default='')
    movement_type = serializers.ChoiceField(choices=[('RETURN', 'RETURN'), ('CANCEL', 'CANCEL')])
    supplier_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_reason_code(self, value):
        from apps.inventory.return_cancel_reasons import normalize_reason_code
        if not value:
            return ''
        normalized = normalize_reason_code(value)
        if not normalized:
            raise serializers.ValidationError(_('Geçersiz neden kodu.'))
        return normalized
