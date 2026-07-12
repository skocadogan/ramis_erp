from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from .models import Order, OrderItem, OrderItemModifier, OrderStatus
from .smart_firing import compute_firing_state, get_station_queue_metrics


def _decimal_for_json_qty(q: Decimal):
    q = q.quantize(Decimal('0.0001'))
    iq = int(q)
    if Decimal(iq) == q:
        return iq
    return float(q)


class OrderItemModifierSerializer(serializers.ModelSerializer):
    modifier_name = serializers.CharField(source='modifier.name', read_only=True)
    
    class Meta:
        model = OrderItemModifier
        fields = ['id', 'modifier', 'modifier_name', 'price']

class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_tax_rate = serializers.DecimalField(
        source='product.tax_rate', read_only=True, max_digits=6, decimal_places=2, allow_null=True,
    )
    product_image = serializers.ImageField(source='product.image', read_only=True)
    variant_name = serializers.CharField(source='variant.name', read_only=True)
    modifiers = OrderItemModifierSerializer(many=True, read_only=True)
    station_id = serializers.UUIDField(source='station.id', read_only=True, allow_null=True)
    station_name = serializers.CharField(source='station.name', read_only=True, allow_null=True)
    category_name = serializers.SerializerMethodField()
    table_name = serializers.SerializerMethodField()
    order_id = serializers.UUIDField(source='order.id', read_only=True)
    order_number = serializers.CharField(
        source='order.order_number', read_only=True, allow_null=True,
    )
    order_type = serializers.CharField(source='order.order_type', read_only=True)

    def get_category_name(self, obj):
        if obj.product and obj.product.category:
            return obj.product.category.name
        return None
    firing_state = serializers.SerializerMethodField()
    queue_hint = serializers.SerializerMethodField()
    timing_meta = serializers.SerializerMethodField()
    is_combined_product = serializers.SerializerMethodField()
    combined_parts = serializers.SerializerMethodField()

    def get_is_combined_product(self, obj):
        if obj.parent_item_id:
            return False
        return bool(obj.product and getattr(obj.product, 'is_combined', False))

    def get_combined_parts(self, obj):
        """Birleşik ürün satırı: alt bileşenler (snapshot kalemler veya menü tanımı)."""
        if obj.parent_item_id:
            return []
        product = obj.product
        if not product or not getattr(product, 'is_combined', False):
            return []

        components = list(obj.components.all())
        if components:
            out = []
            for c in components:
                if c.status == OrderStatus.CANCELLED:
                    continue
                pname = c.product.name if c.product else ''
                qty = Decimal(str(c.quantity)) * c.portion_multiplier
                out.append({
                    'product_name': pname,
                    'quantity_total': _decimal_for_json_qty(qty),
                    'unit_name': (c.unit_name or '').strip() or None,
                })
            return out

        parent_qty = Decimal(str(obj.quantity)) * obj.portion_multiplier
        out = []
        for ci in product.combined_items.all():
            um = Decimal(str(ci.product_unit.multiplier)) if ci.product_unit_id else Decimal('1')
            comp_qty = parent_qty * Decimal(str(ci.quantity)) * um
            uname = ci.product_unit.name if ci.product_unit_id else None
            out.append({
                'product_name': ci.product.name if ci.product else '',
                'quantity_total': _decimal_for_json_qty(comp_qty),
                'unit_name': uname,
            })
        return out

    def get_table_name(self, obj):
        if obj.order:
            if obj.order.table:
                return obj.order.table.name
            if obj.order.order_type == 'TAKEAWAY':
                return "Paket Servis"
        return "—"

    def get_firing_state(self, obj):
        if not getattr(settings, 'ENABLE_SMART_FIRING_V2', False):
            return None
        return compute_firing_state(obj, now=timezone.now())

    def get_queue_hint(self, obj):
        if not getattr(settings, 'ENABLE_SMART_FIRING_V2', False):
            return None
        sid = obj.station_id
        if not sid or not obj.order_id:
            return None
        threshold = getattr(settings, 'SMART_FIRING_QUEUE_DEPTH_THRESHOLD', 8)
        cache = self.context.get('station_queue_metrics') or {}
        m = cache.get(str(sid))
        if m is None:
            m = get_station_queue_metrics(obj.order.branch_id, sid)
        n = m.get('active_items_count', 0)
        if n <= threshold:
            return None
        computed_at = m.get('computed_at')
        if hasattr(computed_at, 'isoformat'):
            computed_at = computed_at.isoformat()
        return {
            'station_active_items': n,
            'station_id': str(sid),
            'computed_at': computed_at,
        }

    def get_timing_meta(self, obj):
        if not getattr(settings, 'ENABLE_SMART_FIRING_V2', False):
            return None
        return None

    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_name', 'product_tax_rate', 'product_image', 'variant', 'variant_name',
            'unit_name', 'quantity', 'unit_price', 'total_price', 'status', 'notes', 'modifiers',
            'station_id', 'station_name', 'category_name', 'table_name',
            'order_id', 'order_number', 'order_type',
            'parent_item', 'scheduled_start_time',
            'is_combined_product', 'combined_parts',
            'firing_forced_at',
            'firing_state', 'queue_hint', 'timing_meta', 'created_at', 'updated_at',
            'waiter_acknowledged_at',
        ]
        read_only_fields = [
            'status', 'total_price', 'created_at', 'updated_at', 'firing_forced_at',
            'waiter_acknowledged_at',
        ]

# Write Serializer to allow nested creation of items and modifiers
class OrderItemCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    variant_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(default=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=4)
    unit_name = serializers.CharField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    modifier_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    table_name = serializers.CharField(source='table.name', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)
    branch_name = serializers.SerializerMethodField(read_only=True)
    discount_by_name = serializers.CharField(source='discount_by.username', read_only=True, allow_null=True)
    kitchen_queue_notice = serializers.SerializerMethodField(read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True, allow_null=True)
    customer_display_survey_answered = serializers.SerializerMethodField(read_only=True)

    payment_method = serializers.SerializerMethodField(read_only=True)
    payment_method_display = serializers.SerializerMethodField(read_only=True)

    def get_kitchen_queue_notice(self, obj):
        return getattr(obj, '_kitchen_queue_notice', None)

    def get_branch_name(self, obj):
        """Şube adı: Order.branch (asıl kaynak); yoksa masa → bölge → şube zinciri."""
        if getattr(obj, "branch_id", None):
            b = getattr(obj, "branch", None)
            if b is not None:
                return b.name
        table = getattr(obj, "table", None)
        if table is not None:
            zone = getattr(table, "zone", None)
            if zone is not None:
                br = getattr(zone, "branch", None)
                if br is not None:
                    return br.name
        return None

    def get_payment_method(self, obj):
        sale = getattr(obj, 'sale', None)
        if sale:
            return sale.payment_method
        return None

    def get_payment_method_display(self, obj):
        sale = getattr(obj, 'sale', None)
        if sale:
            return sale.get_payment_method_display()
        return None

    def get_customer_display_survey_answered(self, obj):
        return bool(getattr(obj, 'customer_display_survey_answered', False))

    class Meta:
        model = Order
        fields = ['id', 'branch', 'branch_name', 'table', 'table_name', 'user', 'user_name', 
                  'customer', 'customer_name',
                  'order_type', 'status', 'total_amount', 'order_number', 'notes', 'items', 
                  'discount_amount', 'discount_type', 'discount_by', 'discount_by_name',
                  'kitchen_queue_notice', 'payment_method', 'payment_method_display',
                  'customer_display_survey_answered',
                  'created_at', 'updated_at']
        read_only_fields = ['total_amount', 'user', 'discount_amount', 'discount_type', 'discount_by', 'created_at', 'updated_at']


class OrderMinimalSerializer(serializers.ModelSerializer):
    table_name = serializers.CharField(source='table.name', read_only=True)
    user_name = serializers.CharField(source='user.username', read_only=True)
    kitchen_queue_notice = serializers.SerializerMethodField(read_only=True)
    customer_name = serializers.CharField(source='customer.name', read_only=True, allow_null=True)

    def get_kitchen_queue_notice(self, obj):
        return getattr(obj, '_kitchen_queue_notice', None)

    class Meta:
        model = Order
        fields = [
            'id', 'branch', 'table', 'table_name', 'user', 'user_name', 
            'customer', 'customer_name',
            'order_type', 'status', 'total_amount', 'order_number', 'notes',
            'kitchen_queue_notice',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['total_amount', 'user', 'created_at', 'updated_at']


class OrderCreateSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    table_id = serializers.UUIDField(required=False, allow_null=True)
    customer_id = serializers.UUIDField(required=False, allow_null=True)
    order_type = serializers.ChoiceField(choices=['TABLE', 'TAKEAWAY'], default='TABLE')
    notes = serializers.CharField(required=False, allow_blank=True)
    items = OrderItemCreateSerializer(many=True)
    stock_tracking_mode = serializers.ChoiceField(choices=['PRODUCT', 'INGREDIENT'], default='PRODUCT')


class PosStationStockCheckItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)
    unit_name = serializers.CharField(required=False, allow_null=True)


class PosStationStockCheckSerializer(serializers.Serializer):
    """POS / garson — sipariş öncesi istasyon deposu stok kontrolü."""

    branch_id = serializers.UUIDField()
    items = PosStationStockCheckItemSerializer(many=True, min_length=1)
    stock_tracking_mode = serializers.ChoiceField(choices=['PRODUCT', 'INGREDIENT'], default='PRODUCT')


class OrderItemSnoozeSerializer(serializers.Serializer):
    """Smart Firing — kalem erteleme (dk)."""

    minutes = serializers.IntegerField(min_value=1, max_value=60)


class KDSSlimOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    category_name = serializers.SerializerMethodField()
    modifiers = OrderItemModifierSerializer(many=True, read_only=True)
    station_id = serializers.UUIDField(source='station.id', read_only=True, allow_null=True)
    station_name = serializers.CharField(source='station.name', read_only=True, allow_null=True)
    table_name = serializers.SerializerMethodField()
    order_id = serializers.UUIDField(source='order.id', read_only=True)
    is_combined_product = serializers.SerializerMethodField()
    combined_parts = serializers.SerializerMethodField()
    is_combined_component = serializers.SerializerMethodField()
    combined_parent_name = serializers.SerializerMethodField()
    combined_parent_quantity = serializers.SerializerMethodField()
    combined_parent_category_name = serializers.SerializerMethodField()

    def get_category_name(self, obj):
        if obj.product and obj.product.category:
            return obj.product.category.name
        return None

    def get_is_combined_component(self, obj):
        if not obj.parent_item_id:
            return False
        parent = getattr(obj, 'parent_item', None)
        product = getattr(parent, 'product', None) if parent else None
        return bool(product and getattr(product, 'is_combined', False))

    def get_combined_parent_name(self, obj):
        if not obj.parent_item_id:
            return None
        parent = getattr(obj, 'parent_item', None)
        product = getattr(parent, 'product', None) if parent else None
        return product.name if product else None

    def get_combined_parent_quantity(self, obj):
        if not obj.parent_item_id:
            return None
        parent = getattr(obj, 'parent_item', None)
        if not parent:
            return None
        return _decimal_for_json_qty(Decimal(str(parent.quantity)) * parent.portion_multiplier)

    def get_combined_parent_category_name(self, obj):
        if not obj.parent_item_id:
            return None
        parent = getattr(obj, 'parent_item', None)
        product = getattr(parent, 'product', None) if parent else None
        category = getattr(product, 'category', None) if product else None
        return category.name if category else None

    def get_is_combined_product(self, obj):
        if obj.parent_item_id:
            return False
        return bool(obj.product and getattr(obj.product, 'is_combined', False))

    def get_combined_parts(self, obj):
        """Birleşik ürün satırı: alt bileşenler (snapshot kalemler veya menü tanımı)."""
        if obj.parent_item_id:
            return []
        product = obj.product
        if not product or not getattr(product, 'is_combined', False):
            return []

        components = list(obj.components.all())
        if components:
            out = []
            for c in components:
                if c.status == OrderStatus.CANCELLED:
                    continue
                pname = c.product.name if c.product else ''
                qty = Decimal(str(c.quantity)) * c.portion_multiplier
                out.append({
                    'product_name': pname,
                    'quantity_total': _decimal_for_json_qty(qty),
                    'unit_name': (c.unit_name or '').strip() or None,
                })
            return out

        parent_qty = Decimal(str(obj.quantity)) * obj.portion_multiplier
        out = []
        for ci in product.combined_items.all():
            um = Decimal(str(ci.product_unit.multiplier)) if ci.product_unit_id else Decimal('1')
            comp_qty = parent_qty * Decimal(str(ci.quantity)) * um
            uname = ci.product_unit.name if ci.product_unit_id else None
            out.append({
                'product_name': ci.product.name if ci.product else '',
                'quantity_total': _decimal_for_json_qty(comp_qty),
                'unit_name': uname,
            })
        return out

    def get_table_name(self, obj):
        if obj.order:
            if obj.order.table:
                return obj.order.table.name
            if obj.order.order_type == 'TAKEAWAY':
                return "Paket Servis"
        return "—"

    class Meta:
        model = OrderItem
        fields = [
            'id', 'product', 'product_name', 'category_name', 'quantity', 'status',
            'station_id', 'station_name', 'table_name', 'order_id',
            'parent_item', 'scheduled_start_time',
            'notes', 'unit_name', 'unit_price', 'total_price',
            'created_at', 'updated_at', 'waiter_acknowledged_at',
            'modifiers', 'is_combined_product', 'combined_parts',
            'is_combined_component', 'combined_parent_name', 'combined_parent_quantity',
            'combined_parent_category_name',
        ]


class KDSSlimOrderSerializer(serializers.ModelSerializer):
    items = KDSSlimOrderItemSerializer(many=True, read_only=True)
    table_name = serializers.CharField(source='table.name', read_only=True)
    branch_name = serializers.SerializerMethodField(read_only=True)

    def get_branch_name(self, obj):
        if getattr(obj, "branch_id", None):
            b = getattr(obj, "branch", None)
            if b is not None:
                return b.name
        table = getattr(obj, "table", None)
        if table is not None:
            zone = getattr(table, "zone", None)
            if zone is not None:
                br = getattr(zone, "branch", None)
                if br is not None:
                    return br.name
        return None

    class Meta:
        model = Order
        fields = [
            'id', 'branch', 'branch_name', 'table', 'table_name',
            'order_type', 'status', 'order_number', 'notes', 'items',
            'created_at', 'updated_at',
        ]
