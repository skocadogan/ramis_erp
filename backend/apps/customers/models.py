from django.db import models
from django.utils.translation import gettext_lazy as _
from core.models import BaseModel

class CustomerType(models.TextChoices):
    INDIVIDUAL = 'INDIVIDUAL', _('Bireysel')
    CORPORATE = 'CORPORATE', _('Kurumsal')

class Customer(BaseModel):
    customer_type = models.CharField(
        max_length=20,
        choices=CustomerType.choices,
        default=CustomerType.INDIVIDUAL,
        verbose_name=_('Müşteri Tipi')
    )
    name = models.CharField(
        max_length=255,
        verbose_name=_('Müşteri Adı / Firma Adı')
    )
    address = models.TextField(
        blank=True,
        default="",
        verbose_name=_('Adres')
    )
    phone = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name=_('Telefon')
    )
    email = models.EmailField(
        blank=True,
        default="",
        verbose_name=_('E-posta')
    )
    web_address = models.URLField(
        blank=True,
        default="",
        verbose_name=_('Web Adresi')
    )
    tax_office = models.CharField(
        max_length=100,
        blank=True,
        default="",
        verbose_name=_('Vergi Dairesi')
    )
    tax_no = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name=_('Vergi Numarası')
    )
    tc_no = models.CharField(
        max_length=11,
        blank=True,
        default="",
        verbose_name=_('T.C. Kimlik Numarası')
    )
    mersis_no = models.CharField(
        max_length=50,
        blank=True,
        default="",
        verbose_name=_('Mersis Numarası')
    )

    class Meta:
        verbose_name = _('Müşteri')
        verbose_name_plural = _('Müşteriler')
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active', 'name']),
            models.Index(fields=['customer_type']),
        ]

    def __str__(self):
        return self.name
