from django.utils.translation import gettext as _
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

from rbac.models import Role, RolePermission, PermissionCategory

User = get_user_model()


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    permission_codes = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = [
            'id', 'name', 'description', 'parent_role',
            'permissions', 'permission_codes', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_permissions(self, obj):
        return list(obj.permissions.values_list('id', flat=True))

    def get_permission_codes(self, obj):
        return list(obj.permissions.values_list('code', flat=True))


class PermissionSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = RolePermission
        fields = ['id', 'name', 'code', 'description', 'category', 'category_name']


class PermissionCategorySerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)

    class Meta:
        model = PermissionCategory
        fields = ['id', 'name', 'code', 'description', 'permissions']


class UserListSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)
    role_names = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'branch', 'branch_name', 'is_active', 'is_superuser',
            'is_staff', 'role_names', 'date_joined', 'last_login',
        ]

    def get_role_names(self, obj):
        return list(obj.roles.values_list('name', flat=True))


class UserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150, required=False, default='')
    last_name = serializers.CharField(max_length=150, required=False, default='')
    branch_id = serializers.UUIDField(required=False, allow_null=True)
    role_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=[],
    )

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError(_("Bu kullanıcı adı zaten kullanılıyor."))
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError(_("Bu e-posta adresi zaten kullanılıyor."))
        return value


class UserUpdateSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    branch_id = serializers.UUIDField(required=False, allow_null=True)
    is_active = serializers.BooleanField(required=False)
    role_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False,
    )

    def validate_email(self, value):
        user = self.instance if hasattr(self, 'instance') else None
        qs = User.objects.filter(email=value)
        if user:
            qs = qs.exclude(pk=user.pk)
        if qs.exists():
            raise serializers.ValidationError(_("Bu e-posta adresi zaten kullanılıyor."))
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class UserPermissionMixin:
    """
    `all_permissions` ve `available_branches` metodları hem
    `UserDetailSerializer` hem de `UserProfileSerializer` için ortaktır.
    DRY-2 düzeltmesi: tek tanım, iki serializer'da kullanılır.
    """

    def get_all_permissions(self, obj):
        return sorted(list(obj.get_all_permissions()))

    def get_available_branches(self, obj):
        from apps.branches.models import Branch
        from core.branch_scope import accessible_branch_id_strings

        allowed = accessible_branch_id_strings(obj)
        if allowed is None:
            qs = Branch.objects.filter(is_active=True).order_by("name")
        elif not allowed:
            return []
        else:
            qs = Branch.objects.filter(id__in=list(allowed)).order_by("name")
        return [{"id": str(b.id), "name": b.name} for b in qs]


class UserDetailSerializer(UserPermissionMixin, serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)
    roles = RoleSerializer(many=True, read_only=True)
    all_permissions = serializers.SerializerMethodField()
    available_branches = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'branch', 'branch_name', 'available_branches', 'is_active', 'is_superuser',
            'is_staff', 'roles', 'all_permissions', 'date_joined', 'last_login',
        ]


class UserProfileSerializer(UserPermissionMixin, serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True, default=None)
    role_names = serializers.SerializerMethodField()
    all_permissions = serializers.SerializerMethodField()
    available_branches = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'branch', 'branch_name', 'available_branches', 'is_active', 'is_superuser',
            'is_staff', 'role_names', 'all_permissions', 'date_joined', 'last_login',
        ]
        read_only_fields = [
            'id', 'username', 'branch', 'is_superuser', 'is_staff', 'date_joined', 'last_login',
        ]

    def get_role_names(self, obj):
        return list(obj.roles.values_list('name', flat=True))

    def validate_email(self, value):
        qs = User.objects.filter(email=value).exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(_("Bu e-posta adresi zaten kullanılıyor."))
        return value


class PrinterJobPrefSerializer(serializers.Serializer):
    printerId = serializers.CharField(allow_blank=True)
    templateSlug = serializers.CharField(allow_blank=True)


class PosScreenPreferencesPatchSerializer(serializers.Serializer):
    show_ready_notifs = serializers.BooleanField(required=False)
    show_waiter_call_notifs = serializers.BooleanField(required=False)
    play_notif_sound = serializers.BooleanField(required=False)
    show_customer_display = serializers.BooleanField(required=False)
    order_printers = PrinterJobPrefSerializer(many=True, required=False)
    payment_printers = PrinterJobPrefSerializer(many=True, required=False)
    auto_print_order = serializers.BooleanField(required=False)
    auto_print_payment = serializers.BooleanField(required=False)
    stock_tracking_mode = serializers.ChoiceField(choices=["PRODUCT", "INGREDIENT"], required=False)
    performance_mode = serializers.BooleanField(required=False)
    assigned_pos_terminal_uuid = serializers.UUIDField(required=False, allow_null=True)
    assigned_terminal_code = serializers.CharField(required=False, allow_blank=True, max_length=96)
