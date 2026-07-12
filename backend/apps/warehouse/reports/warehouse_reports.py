"""Depo modülü sabit raporları — apps.reporting.registry ile kayıt."""

from django.utils.translation import gettext, gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry

from apps.warehouse.models import GoodsReceiving, PurchaseOrder
from apps.warehouse.serializers import GoodsReceivingSerializer, PurchaseOrderSerializer


class PurchaseOrderPdfReport(BaseModuleReport):
    """Tek bir satın alma siparişi için PDF çıktısı (detay / yazdırma)."""

    slug = "purchase-order-pdf"
    name = gettext_lazy("Satın Alma Siparişi PDF")
    description = gettext_lazy("Onaylı veya taslak satın alma siparişinin PDF dökümü.")
    category = "WAREHOUSE"
    template_name = "reports/purchase_order_pdf.html"

    def get_context(self) -> dict:
        order_id = self.kwargs.get("purchase_order_id")
        if not order_id:
            raise ValueError(gettext("purchase_order_id gerekli."))

        try:
            order = (
                PurchaseOrder.objects.select_related(
                    "supplier", "warehouse", "created_by", "approved_by"
                )
                .prefetch_related("items__stock_item")
                .get(pk=order_id)
            )
        except PurchaseOrder.DoesNotExist as exc:
            raise ValueError(gettext("Satın alma siparişi bulunamadı.")) from exc

        data = PurchaseOrderSerializer(order).data
        # Jinja2'de `order.items` dict anahtarı değil `dict.items` metoduna çözülür; şablonda `order_items` kullan.
        return {
            "report_name": self.name,
            "order": data,
            "order_items": data.get("items") or [],
            "status_label": order.get_status_display(),
        }


class GoodsReceivingPdfReport(BaseModuleReport):
    """Tek bir mal kabul kaydı için PDF çıktısı (detay / yazdırma)."""

    slug = "goods-receiving-pdf"
    name = gettext_lazy("Mal Kabul PDF")
    description = gettext_lazy("Mal kabul fişinin PDF dökümü.")
    category = "WAREHOUSE"
    template_name = "reports/goods_receiving_pdf.html"

    def get_context(self) -> dict:
        gr_id = self.kwargs.get("goods_receiving_id")
        if not gr_id:
            raise ValueError(gettext("goods_receiving_id gerekli."))

        try:
            gr = (
                GoodsReceiving.objects.select_related(
                    "supplier",
                    "warehouse",
                    "purchase_order",
                    "received_by",
                    "inspected_by",
                )
                .prefetch_related("items__stock_item")
                .get(pk=gr_id)
            )
        except GoodsReceiving.DoesNotExist as exc:
            raise ValueError(gettext("Mal kabul kaydı bulunamadı.")) from exc

        data = GoodsReceivingSerializer(gr).data
        return {
            "report_name": self.name,
            "receiving": data,
            "receiving_items": data.get("items") or [],
            "status_label": gr.get_status_display(),
        }


report_registry.register(PurchaseOrderPdfReport)
report_registry.register(GoodsReceivingPdfReport)
