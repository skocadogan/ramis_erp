import io
from decimal import Decimal, ROUND_HALF_UP

from core.decimal_constants import ZERO_MONEY
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.invoices.models import Invoice
from apps.sales.models import Sale


class InvoiceError(Exception):
    pass


def _next_invoice_seq(branch, when=None):
    when = when or timezone.now()
    yymm = when.strftime("%y%m")
    prefix = (branch.invoice_prefix or branch.code or "BR")[:10].upper()
    pattern = f"INV-{prefix}-{yymm}-"
    q = Invoice.objects.filter(invoice_number__startswith=pattern).order_by("-invoice_number")
    last = q.values_list("invoice_number", flat=True).first()
    n = 1
    if last and last.rsplit("-", 1)[-1].isdigit():
        n = int(last.rsplit("-", 1)[-1]) + 1
    return f"{pattern}{n:04d}"


def _build_pdf_bytes(invoice: Invoice, sale: Sale) -> bytes:
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
    except ImportError as e:
        raise InvoiceError(_("PDF için reportlab kurulu değil.")) from e

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    y = h - 50
    c.setFont("Helvetica-Bold", 14)
    c.drawString(50, y, "FATURA")
    y -= 28
    c.setFont("Helvetica", 10)
    c.drawString(50, y, f"No: {invoice.invoice_number}")
    y -= 16
    c.drawString(50, y, f"Tarih: {invoice.issued_at.strftime('%d.%m.%Y %H:%M')}")
    y -= 24
    c.drawString(50, y, f"Şube: {invoice.branch.name} ({invoice.branch.code})")
    y -= 30
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, y, "Müşteri")
    y -= 14
    c.setFont("Helvetica", 10)
    cust_lines = []
    if invoice.customer_name:
        cust_lines.append(f"Ünvan: {invoice.customer_name}")
    if invoice.customer_tax_id:
        cust_lines.append(f"VKN/TCKN: {invoice.customer_tax_id}")
    if invoice.customer_address:
        cust_lines.append(invoice.customer_address[:500])
    for line in cust_lines:
        c.drawString(50, y, line[:120])
        y -= 14
    y -= 20
    order = sale.order
    c.drawString(50, y, f"Sipariş: {order.id} | Ödeme: {sale.get_payment_method_display()}")
    y -= 22
    c.drawString(50, y, f"Ara toplam: {invoice.subtotal:.2f} {invoice.branch.currency}")
    y -= 14
    c.drawString(50, y, f"KDV (%{invoice.tax_rate}): {invoice.tax_amount:.2f}")
    y -= 14
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, f"Genel toplam: {invoice.total_amount:.2f} {invoice.branch.currency}")

    y -= 40
    c.setFont("Helvetica", 8)
    items = order.items.filter(parent_item__isnull=True).select_related("product")[:30]
    for it in items:
        if y < 100:
            c.showPage()
            y = h - 50
        c.drawString(50, y, f"- {it.product.name} x{it.quantity} = {it.total_price}")
        y -= 12
    c.save()
    return buf.getvalue()


class InvoiceService:
    @staticmethod
    @transaction.atomic
    def create_invoice(sale_id, customer_info: dict, user=None) -> Invoice:
        sale = (
            Sale.objects.select_related("order", "branch")
            .prefetch_related("order__items__product")
            .filter(pk=sale_id, is_deleted=False)
            .first()
        )
        if not sale:
            raise InvoiceError(_("Satış bulunamadı veya silinmiş."))
        if hasattr(sale, "invoice"):
            raise InvoiceError(_("Bu satış için fatura zaten oluşturulmuş."))

        branch = sale.branch
        rate = branch.tax_rate or ZERO_MONEY
        gross = sale.total_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if rate and rate > 0:
            div = Decimal("1") + (rate / Decimal("100"))
            subtotal = (gross / div).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            tax_amount = (gross - subtotal).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        else:
            subtotal = gross
            tax_amount = ZERO_MONEY

        inv = Invoice.objects.create(
            sale=sale,
            branch=branch,
            invoice_number=_next_invoice_seq(branch),
            customer_name=customer_info.get("customer_name", "") or "",
            customer_tax_id=customer_info.get("customer_tax_id", "") or "",
            customer_address=customer_info.get("customer_address", "") or "",
            subtotal=subtotal,
            tax_amount=tax_amount,
            tax_rate=rate,
            total_amount=gross,
        )

        # PERF: PDF üretimini Celery'ye taşı.
        # Transaction commit olduktan sonra Celery worker PDF'i üretir.
        # pdf_file NULL olarak başlar; task tamamlanınca doldurulur.
        from apps.invoices.tasks import generate_invoice_pdf
        transaction.on_commit(
            lambda: generate_invoice_pdf.delay(str(inv.id))
        )

        return inv
