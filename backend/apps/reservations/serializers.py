from django.utils.translation import gettext as _
from rest_framework import serializers

from apps.branches.models import Table
from apps.reservations.models import (
    DEFAULT_DUE_ALERT_INTERVAL_MINUTES,
    DEFAULT_DUE_ALERT_LEAD_MINUTES,
    Reservation,
    ReservationBranchSettings,
)


class ReservationSerializer(serializers.ModelSerializer):
    table_name = serializers.CharField(source="table.name", read_only=True, allow_null=True)
    zone_name = serializers.CharField(source="table.zone.name", read_only=True, allow_null=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Reservation
        fields = [
            "id",
            "branch",
            "table",
            "table_name",
            "zone_name",
            "customer_name",
            "customer_phone",
            "customer_email",
            "party_size",
            "scheduled_date",
            "scheduled_time",
            "duration_minutes",
            "status",
            "status_display",
            "notes",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "created_by",
            "created_at",
            "updated_at",
            "table_name",
            "zone_name",
            "status_display",
        ]


class ReservationCreateSerializer(serializers.ModelSerializer):
    table = serializers.PrimaryKeyRelatedField(
        queryset=Table.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Reservation
        fields = [
            "branch",
            "table",
            "customer_name",
            "customer_phone", 
            "customer_email",
            "party_size",
            "scheduled_date",
            "scheduled_time",
            "duration_minutes",
            "notes",
        ]

    def validate(self, attrs):
        if attrs.get("party_size", 0) < 1:
            raise serializers.ValidationError({"party_size": _("En az 1 kişi gerekli.")})
        return attrs


class ReservationPatchSerializer(serializers.ModelSerializer):
    table = serializers.PrimaryKeyRelatedField(
        queryset=Table.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Reservation
        fields = [
            "table",
            "customer_name",
            "customer_phone",
            "customer_email",
            "party_size",
            "scheduled_date",
            "scheduled_time",
            "duration_minutes",
            "notes",
        ]


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class ReservationBranchSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReservationBranchSettings
        fields = [
            "id",
            "branch",
            "due_alert_lead_minutes",
            "due_alert_interval_minutes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class ReservationBranchSettingsByBranchSerializer(serializers.Serializer):
    branch = serializers.UUIDField()
    due_alert_lead_minutes = serializers.IntegerField(
        min_value=0,
        max_value=180,
        default=DEFAULT_DUE_ALERT_LEAD_MINUTES,
    )
    due_alert_interval_minutes = serializers.IntegerField(
        min_value=1,
        max_value=60,
        default=DEFAULT_DUE_ALERT_INTERVAL_MINUTES,
    )
