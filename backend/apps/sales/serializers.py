from rest_framework import serializers
from django.utils.translation import gettext as _
from .models import Sale, SalePayment, PaymentMethod


class SalePaymentSerializer(serializers.ModelSerializer):
    payment_method_display = serializers.SerializerMethodField()

    class Meta:
        model = SalePayment
        fields = ['id', 'payment_method', 'payment_method_display', 'amount', 'notes', 'created_at']
        read_only_fields = fields

    def get_payment_method_display(self, obj):
        return obj.get_payment_method_display()


class SaleSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    table_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    payment_method_display = serializers.SerializerMethodField()
    original_payment_method_display = serializers.SerializerMethodField()
    discount_applied_by_name = serializers.SerializerMethodField()
    discount_type_display = serializers.SerializerMethodField()
    pos_terminal_display = serializers.SerializerMethodField()

    order_type = serializers.CharField(source='order.order_type', read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)
    shift = serializers.PrimaryKeyRelatedField(read_only=True, allow_null=True)
    pos_terminal = serializers.PrimaryKeyRelatedField(read_only=True, allow_null=True)

    class Meta:
        model = Sale
        fields = [
            'id', 'order', 'order_type', 'branch', 'branch_name',
            'shift',
            'pos_terminal',
            'pos_terminal_display',
            'table_name', 'created_by', 'created_by_name',
            'payment_method', 'payment_method_display',
            'is_split_payment',
            'payments',
            'original_payment_method', 'original_payment_method_display',
            'total_amount', 'paid_at', 'notes',
            'discount_amount', 'discount_type', 'discount_type_display', 'discount_applied_by', 'discount_applied_by_name',
            'is_deleted', 'deleted_at', 'created_at',
        ]
        read_only_fields = [
            'id', 'order', 'order_type', 'branch', 'branch_name',
            'shift',
            'pos_terminal',
            'pos_terminal_display',
            'table_name', 'created_by', 'created_by_name',
            'payment_method_display', 'original_payment_method', 'original_payment_method_display',
            'is_split_payment', 'payments',
            'paid_at', 'is_deleted', 'deleted_at', 'created_at',
            'discount_amount', 'discount_type', 'discount_type_display', 'discount_applied_by', 'discount_applied_by_name',
        ]

    def get_table_name(self, obj):
        if not obj.order:
            return None
        if obj.order.table:
            return obj.order.table.name
        if obj.order.order_type == 'TAKEAWAY':
            return _("Paket Satış")
        return None

    def get_created_by_name(self, obj):
        return obj.created_by.username if obj.created_by else None

    def get_payment_method_display(self, obj):
        return obj.get_payment_method_display()

    def get_original_payment_method_display(self, obj):
        if not obj.original_payment_method:
            return None
        return dict(PaymentMethod.choices).get(obj.original_payment_method)

    def get_discount_applied_by_name(self, obj):
        return obj.discount_applied_by.username if obj.discount_applied_by else None

    def get_discount_type_display(self, obj):
        choices = {'ORDER': _('Sipariş İndirimi'), 'ITEM': _('Ürün İndirimi')}
        return choices.get(obj.discount_type) if obj.discount_type else None

    def get_pos_terminal_display(self, obj):
        t = obj.pos_terminal
        if not t:
            return None
        return f"{t.name} ({t.code})"


class CancellationRecordSerializer(serializers.Serializer):
    """İptal / iade satırı — OrderItem tabanlı liste API'si."""

    id = serializers.UUIDField()
    record_type = serializers.CharField()
    cancelled_at = serializers.DateTimeField()
    branch_id = serializers.UUIDField()
    branch_name = serializers.CharField()
    order_id = serializers.UUIDField()
    table_name = serializers.CharField(allow_null=True)
    order_type = serializers.CharField()
    product_id = serializers.UUIDField()
    product_name = serializers.CharField()
    quantity = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=4)
    total_price = serializers.DecimalField(max_digits=12, decimal_places=4)
    cancel_reason_code = serializers.CharField(allow_null=True)
    cancel_reason_text = serializers.CharField(allow_null=True)
    cancelled_by_id = serializers.UUIDField(allow_null=True)
    cancelled_by_name = serializers.CharField(allow_null=True)

    @staticmethod
    def serialize_items(items, actor_map):
        from .cancellation_selectors import (
            event_at_for_item,
            record_type_for_item,
            reason_for_item,
            table_label_for_order,
        )

        rows = []
        for item in items:
            item_key = str(item.id)
            actor = actor_map.get(item_key, {})
            code, text = reason_for_item(item)
            rows.append(
                {
                    'id': item.id,
                    'record_type': record_type_for_item(item),
                    'cancelled_at': event_at_for_item(item),
                    'branch_id': item.order.branch_id,
                    'branch_name': item.order.branch.name,
                    'order_id': item.order_id,
                    'table_name': table_label_for_order(item.order),
                    'order_type': item.order.order_type,
                    'product_id': item.product_id,
                    'product_name': item.product.name,
                    'quantity': item.quantity,
                    'unit_price': item.unit_price,
                    'total_price': item.total_price,
                    'cancel_reason_code': code,
                    'cancel_reason_text': text,
                    'cancelled_by_id': actor.get('id'),
                    'cancelled_by_name': actor.get('name'),
                }
            )
        return rows

