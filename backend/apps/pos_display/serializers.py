from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from apps.sales.models import Sale
from apps.shifts.selectors import get_active_shift
from apps.sales.fiscal.webhook_service import build_fiscal_webhook_url
from apps.pos_display.models import FiscalType

from .models import DisplaySettings, PromotionSlide, PosTerminal


class DisplaySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = DisplaySettings
        fields = '__all__'

    def validate(self, attrs):
        instance = self.instance
        branch = attrs.get('branch', getattr(instance, 'branch', None) if instance else None)
        pos_terminal = attrs.get('pos_terminal', getattr(instance, 'pos_terminal', None) if instance else None)
        if pos_terminal is not None:
            if branch is None:
                raise serializers.ValidationError({'branch': _('Terminal seçildiğinde şube zorunludur.')})
            if str(pos_terminal.branch_id) != str(branch.pk):
                raise serializers.ValidationError({'pos_terminal': _('Terminal bu şubeye ait değil.')})
        return attrs


class PromotionSlideSerializer(serializers.ModelSerializer):
    class Meta:
        model = PromotionSlide
        fields = '__all__'

    def validate(self, attrs):
        instance = self.instance
        branch = attrs.get('branch', getattr(instance, 'branch', None) if instance else None)
        pos_terminal = attrs.get('pos_terminal', getattr(instance, 'pos_terminal', None) if instance else None)
        if pos_terminal is not None:
            if branch is None:
                raise serializers.ValidationError({'branch': _('Terminal seçildiğinde şube zorunludur.')})
            if str(pos_terminal.branch_id) != str(branch.pk):
                raise serializers.ValidationError({'pos_terminal': _('Terminal bu şubeye ait değil.')})
        return attrs


class PosTerminalSerializer(serializers.ModelSerializer):
    """
    list: queryset annotate ile `has_open_shift_at_terminal` (bu terminalde açık vardiya var mı),
    `used_in_open_shift` (şubedeki aktif vardiyada bu terminale bağlı satış var mı — geriye dönük).
    """

    used_in_open_shift = serializers.SerializerMethodField(read_only=True)
    has_open_shift_at_terminal = serializers.SerializerMethodField(read_only=True)
    fiscal_webhook_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = PosTerminal
        fields = [
            "id",
            "branch",
            "code",
            "name",
            "sort_order",
            "is_active",
            "has_open_shift_at_terminal",
            "used_in_open_shift",
            "fiscal_type",
            "fiscal_settings",
            "fiscal_webhook_url",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "updated_at",
            "has_open_shift_at_terminal",
            "used_in_open_shift",
            "fiscal_webhook_url",
        ]

    def get_has_open_shift_at_terminal(self, obj):
        v = getattr(obj, "has_open_shift_at_terminal", None)
        if v is not None:
            return bool(v)
        shift = get_active_shift(str(obj.branch_id), terminal_id=str(obj.pk))
        return shift is not None

    def get_used_in_open_shift(self, obj):
        v = getattr(obj, "used_in_open_shift", None)
        if v is not None:
            return bool(v)
        shift = get_active_shift(obj.branch_id)
        if not shift:
            return False
        return Sale.objects.filter(
            shift_id=shift.id,
            pos_terminal_id=obj.pk,
            is_deleted=False,
        ).exists()

    def get_fiscal_webhook_url(self, obj):
        if obj.fiscal_type != FiscalType.BEKO_GMP3:
            return None
        settings_json = obj.fiscal_settings or {}
        if settings_json.get("connection_type") != "CLOUD":
            return None
        return build_fiscal_webhook_url(obj.pk)
