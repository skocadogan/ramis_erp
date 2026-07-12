from core.decimal_constants import ZERO_QTY
from rest_framework import serializers

from apps.inventory.stock_minimum import ZERO_QTY
from .models import (
    Warehouse,
    WarehouseStockLevel,
    PurchaseOrder,
    PurchaseOrderItem,
    GoodsReceiving,
    GoodsReceivingItem,
    WarehouseTransfer,
    WarehouseTransferItem,
    StockCounting,
    StockCountingItem,
    DeficiencyReport,
    DeficiencyReportItem,
)


# ──────────────────────────────────────────────────
# Warehouse
# ──────────────────────────────────────────────────
class WarehouseSerializer(serializers.ModelSerializer):
    branch_names = serializers.SerializerMethodField()
    manager_name = serializers.CharField(source='manager.username', read_only=True, default=None)

    class Meta:
        model = Warehouse
        fields = [
            'id', 'name', 'code', 'warehouse_type', 'branches', 'branch_names',
            'address', 'capacity_info', 'manager', 'manager_name',
            'is_default', 'notes', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_branch_names(self, obj):
        return [b.name for b in obj.branches.all()]


# ──────────────────────────────────────────────────
# WarehouseStockLevel
# ──────────────────────────────────────────────────
class WarehouseStockLevelSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True)
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True)
    stock_item_unit = serializers.CharField(source='stock_item.unit', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = WarehouseStockLevel
        fields = [
            'id', 'warehouse', 'warehouse_name', 'stock_item',
            'stock_item_name', 'stock_item_sku', 'stock_item_unit',
            'quantity', 'minimum_quantity', 'is_low_stock',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# ──────────────────────────────────────────────────
# PurchaseOrder
# ──────────────────────────────────────────────────
class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True, default=None)
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True, default=None)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_fully_received = serializers.BooleanField(read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id', 'stock_item', 'stock_item_name', 'stock_item_sku',
            'quantity', 'unit', 'unit_price', 'received_quantity',
            'line_total', 'is_fully_received', 'notes',
        ]
        read_only_fields = ['id', 'received_quantity', 'line_total', 'is_fully_received']


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True, default=None)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, default=None)

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'order_number', 'supplier', 'supplier_name',
            'warehouse', 'warehouse_name', 'status',
            'order_date', 'expected_date', 'notes',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'total_amount', 'items',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'order_number', 'status', 'created_by', 'approved_by',
            'approved_at', 'total_amount', 'created_at', 'updated_at',
        ]


class PurchaseOrderItemCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=ZERO_QTY)
    unit = serializers.CharField(max_length=20)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=ZERO_QTY)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class PurchaseOrderCreateSerializer(serializers.Serializer):
    supplier_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField()
    order_date = serializers.DateField()
    expected_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = PurchaseOrderItemCreateSerializer(many=True, min_length=1)


class PurchaseOrderUpdateSerializer(serializers.Serializer):
    """Taslak veya onay bekleyen PO güncellemesi (kısmi veya tam)."""

    supplier_id = serializers.UUIDField(required=False)
    warehouse_id = serializers.UUIDField(required=False)
    order_date = serializers.DateField(required=False)
    expected_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = PurchaseOrderItemCreateSerializer(many=True, required=False, min_length=1)


# ──────────────────────────────────────────────────
# GoodsReceiving
# ──────────────────────────────────────────────────
class GoodsReceivingItemSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True, default=None)
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True, default=None)
    accepted_quantity = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = GoodsReceivingItem
        fields = [
            'id', 'stock_item', 'stock_item_name', 'stock_item_sku',
            'expected_quantity', 'received_quantity', 'rejected_quantity',
            'accepted_quantity', 'unit', 'unit_price', 'line_total',
            'expiry_date', 'batch_number', 'notes',
        ]
        read_only_fields = ['id', 'accepted_quantity', 'line_total']


class GoodsReceivingSerializer(serializers.ModelSerializer):
    items = GoodsReceivingItemSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default=None)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    purchase_order_number = serializers.CharField(
        source='purchase_order.order_number', read_only=True, default=None,
    )
    received_by_name = serializers.CharField(source='received_by.username', read_only=True, default=None)
    inspected_by_name = serializers.CharField(source='inspected_by.username', read_only=True, default=None)

    class Meta:
        model = GoodsReceiving
        fields = [
            'id', 'receiving_number', 'purchase_order', 'purchase_order_number',
            'supplier', 'supplier_name', 'warehouse', 'warehouse_name',
            'status', 'received_date', 'invoice_number', 'waybill_number',
            'received_by', 'received_by_name',
            'inspected_by', 'inspected_by_name',
            'notes', 'total_amount', 'items',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'receiving_number', 'status', 'received_by',
            'inspected_by', 'total_amount', 'created_at', 'updated_at',
        ]


class GoodsReceivingItemCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    expected_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=6, default=ZERO_QTY,
    )
    received_quantity = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=ZERO_QTY)
    rejected_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=6, default=ZERO_QTY, min_value=ZERO_QTY,
    )
    unit = serializers.CharField(max_length=20)
    unit_price = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=ZERO_QTY)
    expiry_date = serializers.DateField(required=False, allow_null=True)
    batch_number = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        received = attrs.get('received_quantity') or ZERO_QTY
        rejected = attrs.get('rejected_quantity') or ZERO_QTY
        if received <= ZERO_QTY and rejected <= ZERO_QTY:
            raise serializers.ValidationError(
                _('Kabul veya red miktarı girilmelidir.'),
            )
        from apps.warehouse.services.goods_receiving_service import GoodsReceivingService

        try:
            GoodsReceivingService.normalize_item_quantities(received, rejected)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return attrs


class GoodsReceivingCreateSerializer(serializers.Serializer):
    purchase_order_id = serializers.UUIDField(required=False, allow_null=True)
    supplier_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField()
    received_date = serializers.DateField()
    invoice_number = serializers.CharField(required=False, allow_blank=True, default='')
    waybill_number = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = GoodsReceivingItemCreateSerializer(many=True, min_length=1)


# ──────────────────────────────────────────────────
# WarehouseTransfer
# ──────────────────────────────────────────────────
class WarehouseTransferItemSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True, default=None)
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True, default=None)

    class Meta:
        model = WarehouseTransferItem
        fields = [
            'id', 'stock_item', 'stock_item_name', 'stock_item_sku',
            'quantity', 'unit', 'received_quantity', 'notes',
        ]
        read_only_fields = ['id', 'received_quantity']


class WarehouseTransferSerializer(serializers.ModelSerializer):
    items = WarehouseTransferItemSerializer(many=True, read_only=True)
    source_warehouse_name = serializers.CharField(
        source='source_warehouse.name', read_only=True, default=None,
    )
    target_warehouse_name = serializers.CharField(
        source='target_warehouse.name', read_only=True, default=None,
    )
    requested_by_name = serializers.CharField(source='requested_by.username', read_only=True, default=None)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, default=None)

    class Meta:
        model = WarehouseTransfer
        fields = [
            'id', 'transfer_number',
            'source_warehouse', 'source_warehouse_name',
            'target_warehouse', 'target_warehouse_name',
            'status', 'transfer_date', 'completed_date',
            'requested_by', 'requested_by_name',
            'approved_by', 'approved_by_name',
            'notes', 'items',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'transfer_number', 'status', 'completed_date',
            'requested_by', 'approved_by', 'created_at', 'updated_at',
        ]


class WarehouseTransferItemCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=ZERO_QTY)
    unit = serializers.CharField(max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class WarehouseTransferCreateSerializer(serializers.Serializer):
    source_warehouse_id = serializers.UUIDField()
    target_warehouse_id = serializers.UUIDField()
    transfer_date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = WarehouseTransferItemCreateSerializer(many=True, min_length=1)
    accept_partial = serializers.BooleanField(required=False, default=False)


# ──────────────────────────────────────────────────
# StockCounting
# ──────────────────────────────────────────────────
class StockCountingItemSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True, default=None)
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True, default=None)
    difference_reason_display = serializers.CharField(
        source='get_difference_reason_display',
        read_only=True,
        default=None,
    )

    class Meta:
        model = StockCountingItem
        fields = [
            'id', 'stock_item', 'stock_item_name', 'stock_item_sku',
            'system_quantity', 'counted_quantity', 'difference', 'unit', 'notes',
            'difference_reason', 'difference_reason_display', 'linked_movement',
        ]
        read_only_fields = ['id', 'difference', 'linked_movement']


class StockCountingSerializer(serializers.ModelSerializer):
    items = StockCountingItemSerializer(many=True, read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    counted_by_name = serializers.CharField(source='counted_by.username', read_only=True, default=None)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, default=None)

    class Meta:
        model = StockCounting
        fields = [
            'id', 'counting_number', 'warehouse', 'warehouse_name',
            'status', 'counting_date',
            'counted_by', 'counted_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'notes', 'items',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'counting_number', 'status', 'counted_by',
            'approved_by', 'approved_at', 'created_at', 'updated_at',
        ]


class StockCountingItemCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    system_quantity = serializers.DecimalField(max_digits=12, decimal_places=6)
    counted_quantity = serializers.DecimalField(max_digits=12, decimal_places=6)
    unit = serializers.CharField(max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    difference_reason = serializers.ChoiceField(
        choices=StockCountingItem.difference_reason.field.choices,
        required=False,
        allow_null=True,
    )


class StockCountingCreateSerializer(serializers.Serializer):
    warehouse_id = serializers.UUIDField()
    counting_date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = StockCountingItemCreateSerializer(many=True, allow_empty=True)
    auto_populate = serializers.BooleanField(default=False, required=False)


# ──────────────────────────────────────────────────
# 7. DeficiencyReport (Eksik Listesi)
# ──────────────────────────────────────────────────
_AUTO_DEFICIENCY_NOTES_PREFIX = "Otomatik oluşturuldu:"


def _deficiency_target_level_map(report: DeficiencyReport) -> dict:
    """Aynı raporun kalemleri için N+1 önleyerek hedef depo stok satırlarını tek sorguda yükler."""
    cached = getattr(report, "_deficiency_target_level_map", None)
    if cached is not None:
        return cached
    stock_ids = [i.stock_item_id for i in report.items.all()]
    if not stock_ids:
        report._deficiency_target_level_map = {}
        return report._deficiency_target_level_map
    levels = WarehouseStockLevel.objects.filter(
        warehouse_id=report.target_warehouse_id,
        stock_item_id__in=stock_ids,
    )
    report._deficiency_target_level_map = {lvl.stock_item_id: lvl for lvl in levels}
    return report._deficiency_target_level_map


class DeficiencyReportTransferSerializer(serializers.ModelSerializer):
    """Eksik listesine bağlı transferler: durum + satır bazlı ürün (KDS detay)."""

    items = WarehouseTransferItemSerializer(many=True, read_only=True)

    class Meta:
        model = WarehouseTransfer
        fields = [
            'id', 'transfer_number', 'status', 'transfer_date', 'completed_date',
            'items', 'is_active',
        ]


def _active_deficiency_transfers(report: DeficiencyReport):
    cache = getattr(report, '_prefetched_objects_cache', None)
    if cache and 'transfers' in cache:
        return [t for t in report.transfers.all() if t.is_active]
    return report.transfers.filter(is_active=True)


def _active_deficiency_purchase_orders(report: DeficiencyReport):
    cache = getattr(report, '_prefetched_objects_cache', None)
    if cache and 'purchase_orders' in cache:
        return [po for po in report.purchase_orders.all() if po.is_active]
    return report.purchase_orders.filter(is_active=True)


class DeficiencyReportItemSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True, default=None)
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True, default=None)
    current_stock = serializers.SerializerMethodField()
    minimum_stock = serializers.SerializerMethodField()
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = DeficiencyReportItem
        fields = [
            'id', 'stock_item', 'stock_item_name', 'stock_item_sku',
            'quantity', 'unit', 'notes',
            'current_stock', 'minimum_stock', 'is_low_stock',
        ]
        read_only_fields = ['id']

    def get_current_stock(self, obj: DeficiencyReportItem):
        level = _deficiency_target_level_map(obj.report).get(obj.stock_item_id)
        return level.quantity if level else None

    def get_minimum_stock(self, obj: DeficiencyReportItem):
        level = _deficiency_target_level_map(obj.report).get(obj.stock_item_id)
        return level.minimum_quantity if level else None

    def get_is_low_stock(self, obj: DeficiencyReportItem):
        level = _deficiency_target_level_map(obj.report).get(obj.stock_item_id)
        return level.is_low_stock if level else None


class DeficiencyReportSerializer(serializers.ModelSerializer):
    items = DeficiencyReportItemSerializer(many=True, read_only=True)
    transfers = serializers.SerializerMethodField()
    purchase_orders_count = serializers.SerializerMethodField()
    kitchen_station_name = serializers.CharField(source='kitchen_station.name', read_only=True, default=None)
    branch_name = serializers.CharField(source='kitchen_station.branch.name', read_only=True, default=None)
    target_warehouse_name = serializers.CharField(source='target_warehouse.name', read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, default=None)

    def get_created_by_name(self, obj: DeficiencyReport) -> str | None:
        if obj.created_by_id:
            return obj.created_by.username
        if (obj.notes or "").lstrip().startswith(_AUTO_DEFICIENCY_NOTES_PREFIX):
            return "RAMIS Otomatik Oluşturma"
        return None

    def get_purchase_orders_count(self, obj):
        active = _active_deficiency_purchase_orders(obj)
        return len(active) if isinstance(active, list) else active.count()

    def get_transfers(self, obj):
        active = _active_deficiency_transfers(obj)
        return DeficiencyReportTransferSerializer(active, many=True).data

    class Meta:
        model = DeficiencyReport
        fields = [
            'id', 'report_number', 'kitchen_station', 'kitchen_station_name', 'branch_name',
            'target_warehouse', 'target_warehouse_name',
            'status', 'notes', 'created_by', 'created_by_name',
            'approved_by', 'approved_by_name', 'approved_at',
            'items', 'transfers', 'purchase_orders_count', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'report_number', 'status', 'created_by', 'approved_by', 'approved_at', 'created_at', 'updated_at',
        ]


class DeficiencyReportItemCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=ZERO_QTY)
    unit = serializers.CharField(max_length=20)
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class DeficiencyReportCreateSerializer(serializers.Serializer):
    kitchen_station_id = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    items = DeficiencyReportItemCreateSerializer(many=True, min_length=1)


# ──────────────────────────────────────────────────
# Purchase Recommendations (EPIC-01)
# ──────────────────────────────────────────────────
class PurchaseRecommendationCommitItemSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    quantity = serializers.DecimalField(max_digits=12, decimal_places=6, min_value=ZERO_QTY)
    recommended_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=6, required=False, min_value=ZERO_QTY,
    )
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class PurchaseRecommendationCommitSerializer(serializers.Serializer):
    warehouse_id = serializers.UUIDField()
    items = PurchaseRecommendationCommitItemSerializer(many=True, min_length=1)
    preferred_suppliers = serializers.DictField(
        child=serializers.CharField(),
        required=False,
        allow_empty=True,
    )
