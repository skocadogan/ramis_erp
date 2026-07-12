from rest_framework import serializers
from django.utils.translation import gettext as _
from .models import ReportTemplate, ReceiptTemplate


class ReportTemplateSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = ReportTemplate
        fields = [
            'id', 'name', 'slug', 'category', 'category_display',
            'html_body', 'css_styles', 'is_active', 'is_default',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_slug(self, value):
        qs = ReportTemplate.objects.filter(slug=value, is_active=True)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _('Bu şablon kodu ile zaten aktif bir şablon var.')
            )
        return value


class ReceiptTemplateSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = ReceiptTemplate
        fields = [
            'id', 'name', 'slug', 'category', 'category_display',
            'paper_width', 'layout_json', 'is_default', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'category': {'validators': []}, # DRF bazen koşullu UniqueConstraint'i yanlış yorumlayıp kategori bazlı tekil şablon zorluyor.
        }

    def validate_slug(self, value):
        qs = ReceiptTemplate.objects.filter(slug=value, is_active=True)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                _('Bu şablon kodu ile zaten aktif bir şablon var.')
            )
        return value

    def validate_layout_json(self, value):
        """Her bloğun geçerli bir 'type' alanına sahip olduğunu kontrol eder."""
        if not isinstance(value, list):
            raise serializers.ValidationError(_("layout_json bir liste olmalıdır."))
        valid_types = {"text", "divider", "key_value", "item_loop", "feed", "cut", "qr", "date", "time", "branch_logo", "branch_info"}
        for i, block in enumerate(value):
            if not isinstance(block, dict):
                raise serializers.ValidationError(
                    _("Blok %(index)s bir sözlük (dict) olmalıdır.") % {"index": i}
                )
            if block.get("type") not in valid_types:
                raise serializers.ValidationError(
                    _(
                        "Blok %(index)s: geçersiz tip '%(typ)s'. Geçerli tipler: %(valid)s"
                    )
                    % {
                        "index": i,
                        "typ": block.get("type"),
                        "valid": ", ".join(sorted(valid_types)),
                    }
                )
        return value
