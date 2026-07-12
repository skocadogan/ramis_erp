from django.utils.dateparse import parse_date
from django.utils.translation import gettext, gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.sales.selectors import get_sales_queryset, aggregate_sale_money_totals
from apps.sales.models import PaymentMethod

class SalesListReport(BaseModuleReport):
    # ... (slug, name, etc) ...
    """
    Filtrelenmiş Satış Listesi Raporu.
    """
    slug = 'sales-list'
    name = gettext_lazy('Satış Hareket Listesi')
    description = gettext_lazy('Belirli tarih aralığı, şube ve ödeme yöntemine göre filtrelenmiş satış listesi.')
    category = 'SALES'
    template_name = 'reports/sales_list.html'

    def get_context(self) -> dict:
        filters = self.kwargs.copy()  # API'den gelen query_params
        
        # Tarihleri parse et (Şablonda date_tr filtresi için)
        if filters.get('start_date'):
            filters['start_date'] = parse_date(filters['start_date'])
        if filters.get('end_date'):
            filters['end_date'] = parse_date(filters['end_date'])

        # 1. Veriyi çek
        queryset = get_sales_queryset(
            branch_id=filters.get('branch_id') if filters.get('branch_id') != 'ALL' else None,
            payment_method=filters.get('payment_method') if filters.get('payment_method') != 'ALL' else None,
            start_date=filters.get('start_date'),
            end_date=filters.get('end_date'),
            discount_only=filters.get('discount_only') == 'true' or filters.get('discount_only') is True,
        )
        
        # 2. Toplamları hesapla
        totals = aggregate_sale_money_totals(queryset)
        
        # 3. Veriyi serialize/hazırla
        sales_data = [
            {
                "id": str(s.id),
                "paid_at": s.paid_at,
                "branch_name": s.branch.name if s.branch else gettext("—"),
                "table_name": s.order.table.name if s.order and s.order.table else (s.order.order_type if s.order else gettext("—")),
                "payment_method_display": s.get_payment_method_display(),
                "payment_method_key": s.payment_method, # CSS sınıfları için key
                "is_split_payment": s.is_split_payment,
                "created_by": s.created_by.get_full_name() or s.created_by.username if s.created_by else gettext("—"),
                "total_amount": s.total_amount,
                "discount_amount": s.discount_amount,
                "gross_amount": s.total_amount + s.discount_amount,
            }
            for s in queryset[:1000] # Güvenlik için limit (PDF için)
        ]

        return {
            'report_name': self.name,
            'report_description': self.description,
            'sales': sales_data,
            'totals': totals,
            'filters': filters,
            'count': len(sales_data)
        }

# Raporu kaydet
report_registry.register(SalesListReport)
