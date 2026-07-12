import io
import base64
import qrcode
from django.utils.translation import gettext_lazy as _

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.branches.models import Table

class TableQRCodeReport(BaseModuleReport):
    """
    Masa QR Kod Raporu.
    """
    slug = 'table-qr-code'
    name = _('Masa QR Kod Raporu')
    description = _('Seçilen masanın QR Kodunu içeren yazıcı çıktısı.')
    category = 'BRANCH'
    template_name = 'reports/table_qr_code.html'

    def get_context(self) -> dict:
        table_id = self.kwargs.get('table_id')
        if not table_id:
            raise ValueError(_("Masa ID parametresi (table_id) eksik."))

        try:
            table = Table.objects.select_related('zone__branch').get(id=table_id, is_active=True)
        except Table.DoesNotExist:
            raise ValueError(_("Masa bulunamadı."))

        # QR kodu verisi olarak masanın UUID'si
        qr_data = str(table.id)

        # QR kodunu base64 PNG formatında üret
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,  # Yüksek hata düzeltme (H)
            box_size=10,
            border=4,
        )
        qr.add_data(qr_data)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_str = base64.b64encode(buffered.getvalue()).decode()
        qr_code_base64 = f"data:image/png;base64,{img_str}"

        return {
            'report_name': self.name,
            'table': table,
            'branch': table.zone.branch,
            'zone': table.zone,
            'qr_code_base64': qr_code_base64,
        }

# Raporu kaydet
report_registry.register(TableQRCodeReport)
