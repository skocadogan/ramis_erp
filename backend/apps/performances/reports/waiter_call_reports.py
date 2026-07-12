from django.utils.translation import gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.performances.selectors import (
    aggregate_waiter_call_totals,
    get_waiter_call_logs_queryset,
    staff_waiter_call_performance,
)


class WaiterCallPerformanceReport(BaseModuleReport):
    slug = 'waiter-call-performance'
    name = gettext_lazy('Garson Çağrı Performans Raporu')
    description = gettext_lazy('Garson çağrı geçmişi ve personel yanıt süreleri analizi.')
    category = 'PERFORMANCE'
    template_name = 'reports/waiter_calls_report.html'

    def get_context(self) -> dict:
        filters = self.kwargs.copy()
        queryset = get_waiter_call_logs_queryset(
            branch_id=filters.get('branch_id') if filters.get('branch_id') != 'ALL' else None,
            start_date=filters.get('start_date'),
            end_date=filters.get('end_date'),
        )
        totals = aggregate_waiter_call_totals(queryset)
        staff_rows = staff_waiter_call_performance(queryset)
        logs = list(queryset[:1000])

        return {
            'report_name': self.name,
            'report_description': self.description,
            'logs': logs,
            'totals': totals,
            'staff_performance': staff_rows,
            'filters': filters,
            'count': len(logs),
        }


report_registry.register(WaiterCallPerformanceReport)
