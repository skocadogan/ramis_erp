from django.utils.dateparse import parse_date
from django.utils.translation import gettext, gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.shifts.selectors import get_shift_z_report, get_filtered_shifts_report_data, get_shift_cash_report
from apps.shifts.models import Shift

class ZReport(BaseModuleReport):
    # ... (existing ZReport code) ...
    """
    Standart Z-Raporu (Vardiya Sonu Özeti).
    """
    slug = 'z-report'
    name = gettext_lazy('Z-Raporu (Vardiya Özeti)')
    description = gettext_lazy('Vardiya kapanışındaki satış, ödeme ve kasa özetlerini içerir.')
    category = 'SHIFTS'
    template_name = 'reports/z_report.html'

    def get_context(self) -> dict:
        shift_id = self.kwargs.get('shift_id')
        if not shift_id:
            last_shift = Shift.objects.filter(status='CLOSED').order_by('-closed_at').first()
            if last_shift:
                shift_id = str(last_shift.id)
            else:
                raise ValueError(gettext("Z-Raporu için geçerli bir vardiya bulunamadı."))

        data = get_shift_z_report(shift_id)
        return {
            'report_name': self.name,
            'report_description': self.description,
            'z_data': data,
            'shift_id': shift_id
        }

class CashReport(BaseModuleReport):
    """
    Vardiya Kasa Detay Raporu (Kasa Raporu).
    """
    slug = 'cash-report'
    name = gettext_lazy('Vardiya Kasa Raporu')
    description = gettext_lazy('Vardiya içerisindeki satış cihazı bazlı satışlar, iptal, indirim ve ödeme türü detaylarını içerir.')
    category = 'SHIFTS'
    template_name = 'reports/cash_report.html'

    def get_context(self) -> dict:
        shift_id = self.kwargs.get('shift_id')
        if not shift_id:
            last_shift = Shift.objects.filter(status='CLOSED').order_by('-closed_at').first()
            if last_shift:
                shift_id = str(last_shift.id)
            else:
                raise ValueError(gettext("Kasa Raporu için geçerli bir vardiya bulunamadı."))

        data = get_shift_cash_report(shift_id)
        return {
            'report_name': self.name,
            'report_description': self.description,
            'cash_data': data,
            'shift_id': shift_id
        }

class ShiftListReport(BaseModuleReport):
    """
    Filtrelenmiş Vardiya Listesi Raporu.
    """
    slug = 'shift-list'
    name = gettext_lazy('Vardiya Hareket Listesi')
    description = gettext_lazy('Belirli tarih aralığı ve kriterlere göre filtrelenmiş vardiya listesi.')
    category = 'SHIFTS'
    template_name = 'reports/shift_list.html'

    def get_context(self) -> dict:
        filters = self.kwargs.copy()  # API'den gelen query_params

        # Tarih dökümlerini parse et (Şablonda date_tr için)
        if filters.get('date_from'):
            filters['date_from'] = parse_date(filters['date_from'])
        if filters.get('date_to'):
            filters['date_to'] = parse_date(filters['date_to'])

        shifts = get_filtered_shifts_report_data(
            branch_id=filters.get('branch_id'),
            status=filters.get('status'),
            date_from=filters.get('date_from'),
            date_to=filters.get('date_to'),
            terminal_id=filters.get('opened_at_terminal'),
            user=self.request.user
        )
        return {
            'report_name': self.name,
            'report_description': self.description,
            'shifts': shifts,
            'filters': filters
        }

# Raporları kaydet
report_registry.register(ZReport)
report_registry.register(CashReport)
report_registry.register(ShiftListReport)
