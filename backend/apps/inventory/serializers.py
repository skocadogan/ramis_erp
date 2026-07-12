from core.decimal_constants import ZERO_QTY
from django.utils.translation import gettext as _
from rest_framework import serializers

from apps.inventory.stock_minimum import (
    ZERO_QTY,
    is_minimum_unlimited,
    is_quantity_below_minimum,
    normalize_minimum_quantity,
    quantity_at_warehouse_level,
)
from django.db import models
from .models import (
    StockItem,
    StockMovement,
    StockMovementLot,
    StockMovementType,
    Supplier,
    StockCategory,
    StockUnit,
    Allergen,
    StockReceiptDraft,
    StockReceiptDraftLine,
    StockReceiptDraftStatus,
)


def validate_unit_short_name(value: str) -> str:
    """Geçerli bir StockUnit.short_name olmalı (boş bırakılabilir - opsiyonel alanlar için)."""
    if not value or not value.strip():
        return value or ""
    if not StockUnit.objects.filter(short_name=value.strip()).exists():
        raise serializers.ValidationError(
            _("Geçersiz birim: '%(value)s'. Lütfen Birim Tanımlamalarından seçin.")
            % {"value": value}
        )
    return value.strip()


class StockUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockUnit
        fields = ['id', 'name', 'short_name', 'multiplier', 'category', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class AllergenSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = [
            'id', 'code', 'name', 'prevalence_pct', 'risk_score',
            'sort_order', 'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AllergenListSerializer(serializers.ModelSerializer):
    """POS dialog — yalnızca ad ve risk puanı."""

    class Meta:
        model = Allergen
        fields = ['id', 'name', 'risk_score']


class AllergenNestedSerializer(serializers.ModelSerializer):
    class Meta:
        model = Allergen
        fields = ['id', 'code', 'name', 'prevalence_pct', 'risk_score']


class StockCategorySerializer(serializers.ModelSerializer):
    items_count = serializers.IntegerField(read_only=True, default=0)
    parent_name = serializers.CharField(source='parent.name', read_only=True, default=None)

    class Meta:
        model = StockCategory
        fields = [
            'id', 'name', 'code', 'parent', 'parent_name',
            'items_count', 'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'items_count', 'created_at', 'updated_at']


class StockItemCurrentQuantityMixin:
    """
    `current_quantity` hesaplama mantığını paylaşan mixin.

    Görünüm her zaman `selectors.get_active_stock_items()` üzerinden
    annotated queryset döndürür; bu fallback yalnızca tekil nesne
    erişimi (retrieve, update vb.) için guard görevi görür.
    """

    def get_current_quantity(self, obj):
        val = getattr(obj, 'current_quantity', None)
        if val is not None:
            return val

        from apps.warehouse.models import WarehouseStockLevel
        total = WarehouseStockLevel.objects.filter(
            stock_item=obj, is_active=True,
        ).aggregate(total=models.Sum('quantity'))['total']
        return total if total else ZERO_QTY

    def get_physical_quantity(self, obj):
        val = getattr(obj, 'physical_quantity', None)
        if val is not None:
            return val
        return self.get_current_quantity(obj) # Fallback to physical logic

    def get_reserved_quantity(self, obj):
        val = getattr(obj, 'reserved_quantity', None)
        if val is not None:
            return val
        
        from .models import StockReservation, StockReservationStatus
        res = StockReservation.objects.filter(
            order_item__product__id=obj.id, # Aslında hammadde bazlı ama basit fallback
            status=StockReservationStatus.RESERVED
        ).aggregate(total=models.Sum('quantity'))['total']
        return res if res else ZERO_QTY


class StockItemRecipeUsageMixin:
    def get_recipe_usage_count(self, obj):
        annotated = getattr(obj, 'recipe_usage_count', None)
        if annotated is not None:
            return annotated
        from apps.recipes.models import RecipeIngredient
        return (
            RecipeIngredient.objects.filter(stock_item_id=obj.id, is_active=True)
            .values('recipe_id')
            .distinct()
            .count()
        )


class StockItemSerializer(StockItemRecipeUsageMixin, StockItemCurrentQuantityMixin, serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()
    current_quantity = serializers.SerializerMethodField()
    physical_quantity = serializers.SerializerMethodField()
    reserved_quantity = serializers.SerializerMethodField()
    effective_minimum = serializers.SerializerMethodField()
    recipe_usage_count = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)

    category_code = serializers.CharField(source='category.code', read_only=True, default=None)
    unit = serializers.CharField(validators=[validate_unit_short_name])
    allergens = AllergenNestedSerializer(many=True, read_only=True)
    allergen_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Allergen.objects.filter(is_active=True),
        source='allergens',
        write_only=True,
        required=False,
    )

    class Meta:
        model = StockItem
        fields = [
            'id', 'name', 'sku', 'barcode', 'unit', 'category', 'category_name', 'category_code',
            'current_quantity', 'physical_quantity', 'reserved_quantity',
            'minimum_quantity', 'effective_minimum', 'last_purchase_price',
            'is_low_stock', 'allergens', 'allergen_ids', 'recipe_usage_count',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'current_quantity', 'effective_minimum', 'recipe_usage_count', 'created_at', 'updated_at']

    def _cascade_allergen_recalc(self, instance):
        from apps.recipes.allergen_service import recalculate_recipes_for_stock_item
        recalculate_recipes_for_stock_item(instance.id)

    def create(self, validated_data):
        allergens = validated_data.pop('allergens', None)
        instance = super().create(validated_data)
        if allergens is not None:
            instance.allergens.set(allergens)
            self._cascade_allergen_recalc(instance)
        return instance

    def update(self, instance, validated_data):
        allergens = validated_data.pop('allergens', None)
        instance = super().update(instance, validated_data)
        if allergens is not None:
            instance.allergens.set(allergens)
            self._cascade_allergen_recalc(instance)
        return instance


    def validate_minimum_quantity(self, value):
        try:
            return normalize_minimum_quantity(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e)) from e

    def get_effective_minimum(self, obj):
        val = getattr(obj, 'effective_minimum', None)
        if val is not None:
            return val
        return obj.minimum_quantity

    def get_is_low_stock(self, obj):

        pre = getattr(obj, 'is_low_stock', None)
        if pre is not None:
            return bool(pre)
        cq = getattr(obj, 'current_quantity', None)
        if cq is None:
            return False
        
        eff_min = getattr(obj, 'effective_minimum', obj.minimum_quantity)
        return is_quantity_below_minimum(cq, eff_min)


class StockItemWithWarehouseSerializer(StockItemRecipeUsageMixin, StockItemCurrentQuantityMixin, serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()
    current_quantity = serializers.SerializerMethodField()
    physical_quantity = serializers.SerializerMethodField()
    reserved_quantity = serializers.SerializerMethodField()
    effective_minimum = serializers.SerializerMethodField()
    recipe_usage_count = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True, default=None)
    category_code = serializers.CharField(source='category.code', read_only=True, default=None)
    unit = serializers.CharField(validators=[validate_unit_short_name])
    warehouse_quantity = serializers.SerializerMethodField()

    class Meta:
        model = StockItem
        fields = [
            'id', 'name', 'sku', 'barcode', 'unit', 'category', 'category_name', 'category_code',
            'current_quantity', 'physical_quantity', 'reserved_quantity',
            'minimum_quantity', 'effective_minimum', 'last_purchase_price',
            'is_low_stock', 'recipe_usage_count', 'is_active', 'created_at', 'updated_at',
            'warehouse_quantity',
        ]
        read_only_fields = ['id', 'current_quantity', 'effective_minimum', 'recipe_usage_count', 'created_at', 'updated_at']


    def validate_minimum_quantity(self, value):
        try:
            return normalize_minimum_quantity(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e)) from e

    def get_effective_minimum(self, obj):
        val = getattr(obj, 'effective_minimum', None)
        if val is not None:
            return val
        return obj.minimum_quantity

    def get_is_low_stock(self, obj):

        pre = getattr(obj, 'is_low_stock', None)
        if pre is not None:
            return bool(pre)
        cq = getattr(obj, 'current_quantity', None)
        if cq is None:
            return False
        
        eff_min = getattr(obj, 'effective_minimum', obj.minimum_quantity)
        return is_quantity_below_minimum(cq, eff_min)

    def get_warehouse_quantity(self, obj):
        """Belirli bir depodaki miktarı getirir. Context'ten `warehouse_id` beklenir."""
        warehouse_id = self.context.get('warehouse_id')
        if not warehouse_id:
            return None

        # Prefetch cache kontrolü: view prefetch_related kullandıysa DB'ye gitmez
        prefetched = getattr(obj, '_prefetched_objects_cache', {})
        if 'warehouse_stock_levels' in prefetched:
            for lvl in prefetched['warehouse_stock_levels']:
                if str(lvl.warehouse_id) == str(warehouse_id) and lvl.is_active:
                    return quantity_at_warehouse_level(lvl)
            return ZERO_QTY

        from apps.warehouse.models import WarehouseStockLevel
        level = WarehouseStockLevel.objects.filter(
            stock_item=obj, warehouse_id=warehouse_id, is_active=True,
        ).first()
        return quantity_at_warehouse_level(level)


class StockMovementLotSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMovementLot
        fields = [
            'id', 'stock_lot', 'quantity', 'unit_price', 'lot_number', 'expiry_date',
        ]
        read_only_fields = fields


class StockMovementSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True)
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True, default=None)
    performed_by_name = serializers.CharField(
        source='performed_by.username', read_only=True, default=None,
    )
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default=None)
    signed_quantity = serializers.DecimalField(
        max_digits=12, decimal_places=6, read_only=True,
    )
    lot_consumptions = StockMovementLotSerializer(many=True, read_only=True)

    class Meta:
        model = StockMovement
        fields = [
            'id', 'stock_item', 'stock_item_name', 'warehouse', 'warehouse_name',
            'movement_type', 'quantity', 'signed_quantity', 'unit', 'unit_price', 'reference', 'notes',
            'performed_by', 'performed_by_name', 'supplier', 'supplier_name', 'created_at',
            'lot_consumptions',
        ]
        read_only_fields = ['id', 'created_at']

    def to_representation(self, instance):
        from apps.inventory.services.return_cancel_service import effective_return_cancel_unit_price
        from apps.inventory.stock_movement_display import get_stock_movement_signed_quantity

        data = super().to_representation(instance)
        data['unit_price'] = effective_return_cancel_unit_price(instance)
        data['signed_quantity'] = get_stock_movement_signed_quantity(instance)
        return data


class StockMovementCreateSerializer(serializers.Serializer):
    stock_item_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField(required=False, allow_null=True)
    movement_type = serializers.ChoiceField(choices=StockMovement.movement_type.field.choices)
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=6, min_value=ZERO_QTY,
    )
    unit = serializers.CharField(required=False, allow_blank=True, validators=[validate_unit_short_name])
    reference = serializers.CharField(required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    supplier_id = serializers.UUIDField(required=False, allow_null=True)
    purchase_order_id = serializers.UUIDField(required=False, allow_null=True)
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, default=ZERO_QTY,
    )

    def validate(self, attrs):
        movement_type = attrs.get('movement_type')
        if movement_type not in (StockMovementType.RETURN, StockMovementType.CANCEL):
            return attrs

        po_id = attrs.get('purchase_order_id')
        if not po_id:
            raise serializers.ValidationError({
                'purchase_order_id': _('Satın alma seçimi zorunludur.'),
            })

        from apps.warehouse.models import PurchaseOrder, PurchaseOrderStatus

        po = (
            PurchaseOrder.objects.filter(id=po_id, is_active=True)
            .prefetch_related('items')
            .first()
        )
        if not po:
            raise serializers.ValidationError({
                'purchase_order_id': _('Satın alma bulunamadı.'),
            })

        warehouse_id = attrs.get('warehouse_id')
        if warehouse_id and str(po.warehouse_id) != str(warehouse_id):
            raise serializers.ValidationError({
                'purchase_order_id': _('Seçilen satın alma bu depoya ait değil.'),
            })

        line = po.items.filter(
            stock_item_id=attrs['stock_item_id'],
            is_active=True,
        ).first()
        if not line:
            raise serializers.ValidationError({
                'purchase_order_id': _('Seçilen satın alma bu stok kalemini içermiyor.'),
            })

        allowed_statuses = {
            PurchaseOrderStatus.APPROVED,
            PurchaseOrderStatus.ORDERED,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
            PurchaseOrderStatus.RECEIVED,
        }
        if po.status not in allowed_statuses:
            raise serializers.ValidationError({
                'purchase_order_id': _('Bu satın alma durumunda iptal/iade kaydı yapılamaz.'),
            })

        from apps.inventory.services.return_cancel_service import resolve_return_cancel_unit_price

        attrs['unit_price'] = resolve_return_cancel_unit_price(
            stock_item_id=attrs['stock_item_id'],
            movement_type=movement_type,
            unit_price=attrs.get('unit_price', ZERO_QTY),
            purchase_order_id=po_id,
        )
        if not attrs.get('supplier_id'):
            attrs['supplier_id'] = po.supplier_id

        po_ref = _('Satın alma: %(order)s') % {'order': po.order_number}
        notes = (attrs.get('notes') or '').strip()
        if po_ref not in notes:
            attrs['notes'] = f'{po_ref}{(" | " + notes) if notes else ""}'
        return attrs


class SupplierSerializer(serializers.ModelSerializer):
    stock_item_names = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            'id', 'name', 'contact_person', 'phone', 'email',
            'address', 'notes', 'stock_items', 'stock_item_names',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_stock_item_names(self, obj) -> list[str]:
        if isinstance(obj, dict):
            return []
        return [item.name for item in obj.stock_items.all()]


class StockReceiptDraftLineSerializer(serializers.ModelSerializer):
    """Taslak satırı — okuma ve yazma."""

    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True, allow_null=True)
    stock_item_sku = serializers.CharField(source='stock_item.sku', read_only=True, allow_null=True)
    temp_category_name = serializers.CharField(
        source='temp_category.name', read_only=True, allow_null=True,
    )

    class Meta:
        model = StockReceiptDraftLine
        fields = [
            'id', 'sort_order', 'stock_item', 'stock_item_name', 'stock_item_sku',
            'temp_name', 'temp_sku', 'temp_unit', 'temp_category', 'temp_category_name',
            'quantity', 'unit', 'unit_price', 'lot_number', 'expiry_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'stock_item': {'required': False, 'allow_null': True},
        }

    def validate(self, attrs):
        stock_item = attrs.get('stock_item')
        if self.instance:
            stock_item = attrs.get('stock_item', self.instance.stock_item)
        temp_name = (attrs.get('temp_name') or '').strip() if attrs.get('temp_name') is not None else ''
        temp_sku = (attrs.get('temp_sku') or '').strip() if attrs.get('temp_sku') is not None else ''
        temp_unit = (attrs.get('temp_unit') or '').strip() if attrs.get('temp_unit') is not None else ''

        if stock_item:
            return attrs
        if temp_name and temp_sku and temp_unit:
            return attrs
        raise serializers.ValidationError(
            _(
                "Mevcut stok kalemi seçin veya yeni kalem için ad, SKU ve birim girin."
            ),
        )

    def validate_quantity(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError(_("Miktar pozitif olmalı."))
        return value


class StockReceiptDraftSerializer(serializers.ModelSerializer):
    lines = StockReceiptDraftLineSerializer(many=True)
    user_username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = StockReceiptDraft
        fields = [
            'id', 'user', 'user_username', 'warehouse', 'supplier', 'reference', 'notes',
            'status', 'posted_at', 'lines', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'user_username', 'status', 'posted_at', 'created_at', 'updated_at']

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError(_("En az bir satır gerekli."))
        return lines

    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        validated_data['user'] = self.context['request'].user
        validated_data.setdefault('status', StockReceiptDraftStatus.DRAFT)
        draft = StockReceiptDraft.objects.create(**validated_data)
        for i, raw in enumerate(lines_data):
            row = dict(raw)
            sort_order = row.pop('sort_order', i)
            row.pop('id', None)
            StockReceiptDraftLine.objects.create(draft=draft, sort_order=sort_order, **row)
        return draft

    def update(self, instance, validated_data):
        if instance.status != StockReceiptDraftStatus.DRAFT:
            raise serializers.ValidationError(_("Sadece taslaklar güncellenebilir."))
        lines_data = validated_data.pop('lines', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lines_data is not None:
            instance.lines.all().delete()
            for i, raw in enumerate(lines_data):
                row = dict(raw)
                sort_order = row.pop('sort_order', i)
                row.pop('id', None)
                StockReceiptDraftLine.objects.create(draft=instance, sort_order=sort_order, **row)
        return instance


class StockLotDetailSerializer(serializers.ModelSerializer):
    warehouse_name = serializers.CharField(source='warehouse.name', read_only=True)

    class Meta:
        from .models import StockLot
        model = StockLot
        fields = [
            'id', 'lot_number', 'expiry_date', 'quantity', 'initial_quantity',
            'unit_price', 'warehouse', 'warehouse_name', 'received_at'
        ]


class FEFOInventoryReportListSerializer(serializers.ModelSerializer):
    """FEFO liste API — lot detayı yok; toplamlar selector annotate ile gelir."""
    total_quantity = serializers.DecimalField(
        source='fefo_total_quantity', max_digits=12, decimal_places=6, read_only=True,
    )
    total_value = serializers.DecimalField(
        source='fefo_total_value', max_digits=20, decimal_places=6, read_only=True,
    )
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = StockItem
        fields = [
            'id', 'name', 'sku', 'unit', 'category_name',
            'total_quantity', 'total_value',
        ]


class FEFOInventoryReportSerializer(serializers.ModelSerializer):
    lots = serializers.SerializerMethodField()
    total_quantity = serializers.SerializerMethodField()
    total_value = serializers.SerializerMethodField()
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = StockItem
        fields = [
            'id', 'name', 'sku', 'unit', 'category_name',
            'total_quantity', 'total_value', 'lots'
        ]

    def get_lots(self, obj):
        # Selector'da to_attr='active_lots' olarak ekledik
        lots = getattr(obj, 'active_lots', [])
        return StockLotDetailSerializer(lots, many=True).data

    def get_total_quantity(self, obj):
        lots = getattr(obj, 'active_lots', [])
        return sum(lot.quantity for lot in lots)

    def get_total_value(self, obj):
        lots = getattr(obj, 'active_lots', [])
        return sum(lot.quantity * lot.unit_price for lot in lots)


class ExpiringLotSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    stock_item_id = serializers.UUIDField(read_only=True)
    stock_item_name = serializers.CharField(read_only=True)
    stock_item_sku = serializers.CharField(read_only=True)
    warehouse_id = serializers.UUIDField(read_only=True)
    warehouse_name = serializers.CharField(read_only=True)
    lot_number = serializers.CharField(read_only=True)
    expiry_date = serializers.DateField(read_only=True, allow_null=True)
    days_until_expiry = serializers.IntegerField(read_only=True, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=6, read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    risk_score = serializers.IntegerField(read_only=True)


class ExpiryAutoReturnCancelSerializer(serializers.Serializer):
    lot_id = serializers.UUIDField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')


class ExpiryActionCreateSerializer(serializers.Serializer):
    lot_id = serializers.UUIDField()
    action_type = serializers.ChoiceField(choices=[])
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    target_warehouse_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.DecimalField(
        max_digits=12, decimal_places=6, required=False, allow_null=True,
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from .models import ExpiryActionType
        self.fields['action_type'].choices = ExpiryActionType.choices


class ExpiryActionHistorySerializer(serializers.ModelSerializer):
    lot_id = serializers.UUIDField(source='stock_lot_id', read_only=True)
    stock_item_name = serializers.CharField(source='stock_lot.stock_item.name', read_only=True)
    stock_item_sku = serializers.CharField(source='stock_lot.stock_item.sku', read_only=True)
    warehouse_name = serializers.CharField(source='stock_lot.warehouse.name', read_only=True)
    lot_number = serializers.CharField(source='stock_lot.lot_number', read_only=True)
    expiry_date = serializers.DateField(source='stock_lot.expiry_date', read_only=True, allow_null=True)
    action_type_label = serializers.CharField(source='get_action_type_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    result_json = serializers.JSONField(read_only=True)
    automation_applied = serializers.BooleanField(read_only=True)
    linked_transfer_number = serializers.SerializerMethodField()

    class Meta:
        from .models import ExpiryAction
        model = ExpiryAction
        fields = [
            'id',
            'lot_id',
            'stock_item_name',
            'stock_item_sku',
            'warehouse_name',
            'lot_number',
            'expiry_date',
            'action_type',
            'action_type_label',
            'notes',
            'created_by_name',
            'created_at',
            'result_json',
            'automation_applied',
            'linked_transfer_number',
        ]
        read_only_fields = fields

    def get_linked_transfer_number(self, obj):
        transfer_number = (obj.result_json or {}).get('transfer_number')
        if transfer_number:
            return transfer_number
        transfer = obj.transfers.filter(is_active=True).order_by('-created_at').first()
        return transfer.transfer_number if transfer else None

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None


class ReturnDisposalFlowItemSerializer(serializers.ModelSerializer):
    stock_item_name = serializers.CharField(source='stock_item.name', read_only=True)

    class Meta:
        model = 'inventory.ReturnDisposalFlowItem'
        fields = [
            'id', 'flow', 'stock_item', 'stock_item_name', 'stock_lot',
            'quantity', 'unit_price', 'is_packaging_intact',
            'checked_by', 'checked_at', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ReturnDisposalFlowSerializer(serializers.ModelSerializer):
    items = ReturnDisposalFlowItemSerializer(many=True, read_only=True)
    source_warehouse_name = serializers.CharField(source='source_warehouse.name', read_only=True)
    target_warehouse_name = serializers.CharField(source='target_warehouse.name', read_only=True, allow_null=True)
    created_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    flow_type_display = serializers.CharField(source='get_flow_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        from .models import ReturnDisposalFlow
        model = ReturnDisposalFlow
        fields = [
            'id', 'flow_type', 'flow_type_display', 'status', 'status_display',
            'source_warehouse', 'source_warehouse_name',
            'target_warehouse', 'target_warehouse_name',
            'supplier', 'reason_code', 'reason_text',
            'sale', 'order', 'created_by', 'created_by_name',
            'approved_by', 'approved_by_name', 'completed_at',
            'items', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'completed_at']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return None

    def get_approved_by_name(self, obj):
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None
