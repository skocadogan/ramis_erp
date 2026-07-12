from django.utils.translation import gettext as _
from rest_framework import serializers
from .models import Printer, UsageType

class PrinterSerializer(serializers.ModelSerializer):
    connection_type_display = serializers.CharField(source='get_connection_type_display', read_only=True)
    printer_type_display = serializers.CharField(source='get_printer_type_display', read_only=True)
    usage_type_display = serializers.CharField(source='get_usage_type_display', read_only=True)
    kitchen_station_name = serializers.CharField(
        source='kitchen_station.name',
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Printer
        fields = [
            'id', 'branch', 'name', 'connection_type', 'connection_type_display',
            'ip_address', 'port', 'device_path', 'printer_type', 'printer_type_display',
            'usage_type', 'usage_type_display',
            'kitchen_station', 'kitchen_station_name', 'receipt_template_slug',
            'is_active', 'status_info', 'last_seen', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        connection_type = data.get('connection_type')
        instance = getattr(self, 'instance', None)

        usage_type = data.get('usage_type')
        if usage_type is None and instance is not None:
            usage_type = instance.usage_type

        kitchen_station = data.get('kitchen_station')
        if 'kitchen_station' not in data and instance is not None:
            kitchen_station = instance.kitchen_station

        receipt_template_slug = data.get('receipt_template_slug')
        if 'receipt_template_slug' not in data and instance is not None:
            receipt_template_slug = instance.receipt_template_slug

        branch = data.get('branch')
        if branch is None and instance is not None:
            branch = instance.branch_id

        if connection_type == 'NETWORK':
            if not data.get('ip_address'):
                raise serializers.ValidationError({
                    "ip_address": _(
                        "Network yazıcıları için geçerli bir IP adresi gereklidir."
                    )
                })
        elif connection_type == 'USB':
            if not data.get('device_path'):
                raise serializers.ValidationError({
                    "device_path": _(
                        "USB yazıcılar için cihaz yolu (örn: /dev/usb/lp0) gereklidir."
                    )
                })
            data['ip_address'] = None

        if usage_type == UsageType.KITCHEN:
            kitchen_errors = {}
            if not kitchen_station:
                kitchen_errors['kitchen_station'] = _(
                    'Mutfak yazıcıları için istasyon seçimi zorunludur.'
                )
            if not receipt_template_slug:
                kitchen_errors['receipt_template_slug'] = _(
                    'Mutfak yazıcıları için fiş şablonu zorunludur.'
                )
            if kitchen_errors:
                raise serializers.ValidationError(kitchen_errors)

            branch_id = getattr(branch, 'pk', branch)
            if branch_id and str(kitchen_station.branch_id) != str(branch_id):
                raise serializers.ValidationError({
                    'kitchen_station': _(
                        'Seçilen istasyon yazıcının şubesine ait olmalıdır.'
                    ),
                })
        elif usage_type == UsageType.POS:
            data['kitchen_station'] = None
            data['receipt_template_slug'] = None

        return data
