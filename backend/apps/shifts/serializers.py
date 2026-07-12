from rest_framework import serializers

from core.decimal_constants import ZERO_MONEY

from apps.shifts.models import Shift, ShiftExpense, ShiftCashMovement, ShiftStatus, CashierPinAssignment
from django.utils.translation import gettext_lazy as _


class ShiftListSerializer(serializers.ModelSerializer):
    opened_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    opened_at_terminal_name = serializers.SerializerMethodField()

    class Meta:
        model = Shift
        fields = [
            "id",
            "branch",
            "status",
            "opened_at",
            "closed_at",
            "opening_cash",
            "expected_cash",
            "actual_cash",
            "difference",
            "expected_card",
            "actual_card",
            "difference_card",
            "expected_other",
            "actual_other",
            "difference_other",
            "notes",
            "opened_by",
            "opened_by_name",
            "opened_at_terminal",
            "opened_at_terminal_name",
            "closed_by",
            "closed_by_name",
            "created_at",
        ]
        read_only_fields = fields

    def get_opened_by_name(self, obj):
        return getattr(obj.opened_by, "username", None)

    def get_closed_by_name(self, obj):
        return getattr(obj.closed_by, "username", None) if obj.closed_by else None

    def get_opened_at_terminal_name(self, obj):
        return getattr(obj.opened_at_terminal, "name", None) if obj.opened_at_terminal else None


class ShiftOpenSerializer(serializers.Serializer):
    branch_id = serializers.UUIDField()
    opening_cash = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=ZERO_MONEY
    )
    at_terminal_id = serializers.UUIDField(required=False, allow_null=True)


class ShiftCloseSerializer(serializers.Serializer):
    actual_cash = serializers.DecimalField(max_digits=12, decimal_places=2)
    actual_card = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=ZERO_MONEY
    )
    actual_other = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=ZERO_MONEY
    )
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ShiftExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftExpense
        fields = ["id", "shift", "description", "amount", "created_by", "created_at"]
        read_only_fields = ["id", "shift", "created_by", "created_at"]


class ShiftExpenseCreateSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class ShiftCashMovementCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    movement_type = serializers.ChoiceField(choices=["IN", "OUT"])
    description = serializers.CharField(required=False, allow_blank=True, default="")


class ShiftCashMovementSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShiftCashMovement
        fields = [
            "id",
            "shift",
            "amount",
            "movement_type",
            "description",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["id", "shift", "created_by", "created_at"]


class CashierPinAssignmentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    pos_terminal_ids = serializers.SerializerMethodField()

    class Meta:
        model = CashierPinAssignment
        fields = [
            "id",
            "branch",
            "user",
            "username",
            "pos_terminals",
            "pos_terminal_ids",
            "pin",
            "created_at",
            "updated_at",
        ]

    def get_pos_terminal_ids(self, obj):
        return [str(pt.id) for pt in obj.pos_terminals.all()]


class CashierPinAssignmentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashierPinAssignment
        fields = [
            "branch",
            "user",
            "pos_terminals",
            "pin",
        ]

    def validate_pin(self, value):
        if not value.isdigit() or len(value) != 4:
            raise serializers.ValidationError(_("PIN kodu 4 haneli sadece rakamlardan oluşmalıdır."))
        
        # Check uniqueness
        qs = CashierPinAssignment.objects.filter(pin=value)
        if self.instance:
            qs = qs.exclude(id=self.instance.id)
        if qs.exists():
            raise serializers.ValidationError(_("Bu PIN kodu zaten başka bir kullanıcıya atanmış."))
        return value

    def validate_user(self, value):
        if not value.roles.filter(name__in=["Kasiyer", "Cashier"]).exists():
            raise serializers.ValidationError(_("Seçilen kullanıcı Kasiyer rolüne sahip değil."))
        return value

    def validate(self, attrs):
        branch = attrs.get("branch") or (self.instance.branch if self.instance else None)
        terminals = attrs.get("pos_terminals")
        if branch is not None and terminals is not None:
            wrong_branch = [t for t in terminals if t.branch_id != branch.id]
            if wrong_branch:
                raise serializers.ValidationError(
                    {
                        "pos_terminals": _(
                            "Seçilen POS terminalleri bu şubeye ait değil."
                        )
                    }
                )
        return attrs

