from rest_framework import serializers
from .models import PrepTask, PrepTaskAssignment, PrepTemplate, PrepSmartRule, PrepBranchSettings


class PrepTaskAssignmentSerializer(serializers.ModelSerializer):
    """PrepTaskAssignment için nested serializer (salt okunur)."""
    user_name = serializers.SerializerMethodField()

    class Meta:
        model = PrepTaskAssignment
        fields = ['id', 'user', 'user_name', 'display_name']

    def get_user_name(self, obj):
        if obj.user:
            full = f"{obj.user.first_name} {obj.user.last_name}".strip()
            return full or obj.user.username
        return None


class PrepTaskSerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source='station.name', read_only=True)
    assigned_to_name = serializers.SerializerMethodField()
    completed_by_name = serializers.CharField(source='completed_by.username', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    plan_line_product_name = serializers.CharField(
        source='plan_line.product.name', read_only=True, default=None
    )
    assignments = PrepTaskAssignmentSerializer(many=True, read_only=True)

    def get_assigned_to_name(self, obj):
        """assigned_to varsa kullanıcı adını, yoksa ilk assignment'daki display_name'i döner."""
        if obj.assigned_to:
            full = f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
            return full or obj.assigned_to.username
        # display_name ataması varsa onu döndür (KDS gruplama için)
        first_display = obj.assignments.filter(is_active=True).exclude(display_name='').first()
        if first_display:
            return first_display.display_name
        return None

    class Meta:
        model = PrepTask
        fields = [
            'id', 'branch', 'station', 'station_name', 'title', 'description',
            'target_quantity', 'completed_quantity', 'unit', 'status',
            'priority', 'deadline', 'assigned_to', 'assigned_to_name',
            'completed_by', 'completed_by_name', 'is_recurring', 'source_template',
            'product', 'product_name', 'plan_line', 'plan_line_product_name',
            'assignments', 'scheduled_start',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'completed_by', 'source_template', 'assignments']


class PrepTaskCreateUpdateSerializer(serializers.ModelSerializer):
    assigned_user_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        write_only=True,
    )
    assignee_names = serializers.ListField(
        child=serializers.CharField(max_length=200),
        required=False,
        write_only=True,
    )

    class Meta:
        model = PrepTask
        fields = [
            'branch', 'station', 'title', 'description',
            'target_quantity', 'completed_quantity', 'unit', 'status',
            'priority', 'deadline', 'assigned_to', 'is_recurring',
            'product', 'plan_line',
            'assigned_user_ids', 'assignee_names',
        ]


class PrepTemplateSerializer(serializers.ModelSerializer):
    station_name = serializers.CharField(source='station.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    assigned_to_name = serializers.SerializerMethodField(read_only=True)

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            full = f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip()
            return full or obj.assigned_to.username
        if obj.display_name:
            return obj.display_name
        return None

    class Meta:
        model = PrepTemplate
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

class PrepSmartRuleSerializer(serializers.ModelSerializer):
    base_product_name = serializers.CharField(source='base_product.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    
    class Meta:
        model = PrepSmartRule
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PrepBranchSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrepBranchSettings
        fields = ["id", "branch", "management_hide_old_completed", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class PrepBranchSettingsByBranchSerializer(serializers.Serializer):
    """by-branch GET/PATCH gövdesi: kayıt yokken GET için varsayılan üretilir."""

    branch = serializers.UUIDField()
    management_hide_old_completed = serializers.BooleanField(default=False)
