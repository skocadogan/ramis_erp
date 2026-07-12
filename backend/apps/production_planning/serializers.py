from rest_framework import serializers
from apps.production_planning.models import (
    ProductionPlan,
    ProductionPlanLine,
    ProductionDaySettings,
    ProductDayAvailability
)
from apps.menu.serializers import ProductSerializer

class ProductionPlanLineSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    category_name = serializers.CharField(source='product.category.name', read_only=True)
    station_name = serializers.SerializerMethodField()

    class Meta:
        model = ProductionPlanLine
        fields = [
            'id', 'plan', 'product', 'product_name', 'category_name',
            'target_quantity', 'station', 'station_name', 'source'
        ]
        read_only_fields = ['id', 'plan']

    def get_station_name(self, obj):
        # 1. Eğer satırda özel bir istasyon seçilmişse onu kullan
        if obj.station:
            return obj.station.name
        
        # 2. Seçilmemişse ürünün kategorisindeki varsayılan istasyonu kullan
        if obj.product and obj.product.category and obj.product.category.station:
            return obj.product.category.station.name
            
        return "-"


class ProductionPlanSerializer(serializers.ModelSerializer):
    lines = ProductionPlanLineSerializer(many=True, required=False)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)

    class Meta:
        model = ProductionPlan
        fields = [
            'id', 'branch', 'branch_name', 'plan_date', 'status', 'notes',
            'created_by', 'created_by_name', 'approved_by', 'approved_by_name',
            'approved_at', 'lines', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'approved_by', 'approved_at']

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        plan = ProductionPlan.objects.create(**validated_data)
        for line_data in lines_data:
            ProductionPlanLine.objects.create(plan=plan, **line_data)
        return plan

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        
        # Update main plan fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if lines_data is not None:
            # Simple approach: clear and recreate lines
            # In production, you might want to update existing lines by ID for better performance/audit
            instance.lines.all().delete()
            for line_data in lines_data:
                ProductionPlanLine.objects.create(plan=instance, **line_data)
        
        return instance


class ProductionDaySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductionDaySettings
        fields = '__all__'
        read_only_fields = ['id']


class ProductDayAvailabilitySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    category_name = serializers.CharField(source='product.category.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    set_by_name = serializers.CharField(source='set_by.get_full_name', read_only=True)

    class Meta:
        model = ProductDayAvailability
        fields = [
            'id', 'branch', 'branch_name', 'effective_date', 'product', 'product_name', 'category_name',
            'mode', 'remaining_portions', 'reason', 'set_by', 'set_by_name', 'updated_at'
        ]
        read_only_fields = ['id', 'set_by', 'updated_at']
