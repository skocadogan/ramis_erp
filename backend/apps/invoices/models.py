from django.db import models
from django.utils.translation import gettext_lazy as _

from core.models import BaseModel
from apps.branches.models import Branch
from apps.sales.models import Sale


class Invoice(BaseModel):
    sale = models.OneToOneField(
        Sale,
        on_delete=models.PROTECT,
        related_name="invoice",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    invoice_number = models.CharField(max_length=50, unique=True, db_index=True)
    customer_name = models.CharField(max_length=255, blank=True, default="")
    customer_tax_id = models.CharField(max_length=20, blank=True, default="")
    customer_address = models.TextField(blank=True, default="")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    issued_at = models.DateTimeField(auto_now_add=True)
    pdf_file = models.FileField(upload_to="invoices/", null=True, blank=True)

    class Meta:
        ordering = ["-issued_at"]
        verbose_name = _("Fatura")
        verbose_name_plural = _("Faturalar")

    def __str__(self):
        return self.invoice_number
