from django.db import models
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _


def _validate_identifier_code(value):
    """Kategori/izin kodu geçerli Python tanımlayıcısı olmalıdır."""
    if not value or not value.strip():
        raise ValidationError(_('Kod boş olamaz.'))
    code = value.strip().lower()
    if not code.isidentifier():
        raise ValidationError(_(
            'Kod geçerli bir Python tanımlayıcısı olmalıdır '
            '(harf veya alt çizgi ile başlamalı, harf/rakam/alt çizgi içermeli).'
        ))


class PermissionCategory(models.Model):
    """
    İzin kategorileri için model (örn: Kullanıcı Yönetimi, İçerik Yönetimi)
    """
    name = models.CharField(max_length=100, unique=True, verbose_name=_('Kategori Adı'))
    description = models.TextField(blank=True, null=True, verbose_name=_('Açıklama'))
    code = models.CharField(
        max_length=50,
        unique=True,
        verbose_name=_('Kategori Kodu'),
        validators=[_validate_identifier_code],
    )

    def clean(self):
        super().clean()
        if self.code:
            _validate_identifier_code(self.code)

    def save(self, *args, **kwargs):
        if self.code:
            normalized = self.code.strip().lower()
            _validate_identifier_code(normalized)
            self.code = normalized  # Kalıcı normalize
        super().save(*args, **kwargs)

    class Meta:
        verbose_name = _('İzin Kategorisi')
        verbose_name_plural = _('İzin Kategorileri')
        ordering = ['name']
    def __str__(self):
        return self.name
