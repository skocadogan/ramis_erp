"""Ödenmez (müşteri kredisi) serializer'ları."""

from decimal import Decimal

from rest_framework import serializers

from apps.branches.models import Branch
from apps.users.models import User

from .models import (
    CreditAccount,
    CreditPolicy,
    CreditTransaction,
)


class CreditAccountSerializer(serializers.ModelSerializer):
    """Liste/detay; bakiye alanları ``annotate_account_balances`` ile gelir."""

    full_name = serializers.CharField(read_only=True)
    credit_policy_display = serializers.CharField(source="get_credit_policy_display", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True, default=None)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    total_credited = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)
    total_spent = serializers.DecimalField(max_digits=14, decimal_places=4, read_only=True)
    balance = serializers.SerializerMethodField()

    class Meta:
        model = CreditAccount
        fields = [
            "id",
            "user",
            "user_username",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "email",
            "address",
            "notes",
            "branch",
            "branch_name",
            "is_global",
            "credit_policy",
            "credit_policy_display",
            "total_credited",
            "total_spent",
            "balance",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_balance(self, obj):
        credited = getattr(obj, "total_credited", None)
        spent = getattr(obj, "total_spent", None)
        if credited is None or spent is None:
            return None
        return Decimal(credited) - Decimal(spent)


class CreditAccountWriteSerializer(serializers.Serializer):
    """Hesap oluşturma/güncelleme girdisi (servis katmanına aktarılır)."""

    user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True
    )
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    phone = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    address = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True), required=False, allow_null=True
    )
    is_global = serializers.BooleanField(required=False, default=False)
    credit_policy = serializers.ChoiceField(
        choices=CreditPolicy.choices, required=False, default=CreditPolicy.BLOCK
    )

    def validate(self, attrs):
        is_global = attrs.get("is_global", False)
        branch = attrs.get("branch")
        if not is_global and branch is None:
            raise serializers.ValidationError(
                {"branch": "Şubeye özel hesap için şube seçilmelidir."}
            )
        return attrs


class CreditAccountUpdateSerializer(serializers.Serializer):
    """Kısmi güncelleme (sanal kişi bilgileri + politika/şube kapsamı)."""

    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=50, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True), required=False, allow_null=True
    )
    is_global = serializers.BooleanField(required=False)
    credit_policy = serializers.ChoiceField(choices=CreditPolicy.choices, required=False)
    user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True
    )


class CreditTopupSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=4, min_value=Decimal("0.0001"))
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True), required=False, allow_null=True
    )


class CreditTransactionSerializer(serializers.ModelSerializer):
    transaction_type_display = serializers.CharField(
        source="get_transaction_type_display", read_only=True
    )
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    sale_id = serializers.UUIDField(source="sale.id", read_only=True, default=None)
    order_number = serializers.CharField(source="sale.order.order_number", read_only=True, default=None)
    created_by_username = serializers.CharField(
        source="created_by.username", read_only=True, default=None
    )

    class Meta:
        model = CreditTransaction
        fields = [
            "id",
            "transaction_type",
            "transaction_type_display",
            "amount",
            "branch",
            "branch_name",
            "sale_id",
            "order_number",
            "notes",
            "created_by_username",
            "created_at",
        ]
        read_only_fields = fields
