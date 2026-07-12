from rest_framework import serializers

from apps.orders.cancellation_reasons import format_cancellation_reason_display
from apps.orders.models import Order, OrderStatus

from .models import WaiterCallLog


class WaiterCallLogSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    dismissed_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = WaiterCallLog
        fields = [
            'id',
            'branch',
            'branch_name',
            'table',
            'table_name',
            'zone_name',
            'source',
            'status',
            'status_display',
            'notified_count',
            'called_at',
            'dismissed_at',
            'dismissed_by',
            'dismissed_by_name',
            'response_seconds',
        ]
        read_only_fields = fields

    def get_dismissed_by_name(self, obj):
        if not obj.dismissed_by:
            return None
        name = obj.dismissed_by.get_full_name()
        return name.strip() or obj.dismissed_by.username


class WaiterOrderSalesSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    table_name = serializers.CharField(source='table.name', read_only=True, allow_null=True)
    zone_name = serializers.SerializerMethodField()
    staff_id = serializers.IntegerField(source='user_id', read_only=True)
    staff_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    cancel_reason_display = serializers.SerializerMethodField()
    order_channel = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id',
            'branch',
            'branch_name',
            'table',
            'table_name',
            'zone_name',
            'staff_id',
            'staff_name',
            'order_number',
            'order_type',
            'status',
            'status_display',
            'total_amount',
            'cancel_reason_code',
            'cancel_reason_display',
            'order_channel',
            'created_at',
        ]
        read_only_fields = fields

    def get_zone_name(self, obj):
        if obj.table and obj.table.zone:
            return obj.table.zone.name
        return ''

    def get_staff_name(self, obj):
        if not obj.user:
            return None
        name = obj.user.get_full_name()
        return name.strip() or obj.user.username

    def get_cancel_reason_display(self, obj):
        if obj.status != OrderStatus.CANCELLED:
            return None
        return format_cancellation_reason_display(
            code=obj.cancel_reason_code,
            text=obj.cancel_reason_text,
        )

    def get_order_channel(self, obj):
        channel_map = self.context.get('channel_by_order') or {}
        return channel_map.get(str(obj.id), 'unknown')
