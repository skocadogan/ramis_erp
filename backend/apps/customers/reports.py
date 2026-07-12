from django.utils.dateparse import parse_date
from django.utils.translation import gettext, gettext_lazy

from apps.reporting.reports.base_report import BaseModuleReport
from apps.reporting.registry import report_registry
from apps.customers.models import Customer
from apps.sales.models import Sale

class CustomerListReport(BaseModuleReport):
    """
    Kayıtlı Müşterilerin Listesi Raporu.
    """
    slug = 'customer-list'
    name = gettext_lazy('Müşteri Listesi Raporu')
    description = gettext_lazy('Sistemde kayıtlı olan aktif müşterilerin detaylı listesi.')
    category = 'GENERAL'
    template_name = 'reports/customer_list.html'

    def get_context(self) -> dict:
        filters = self.kwargs.copy()
        
        # Müşterileri çek
        queryset = Customer.objects.filter(is_active=True)
        if filters.get('customer_type') and filters.get('customer_type') != 'ALL':
            queryset = queryset.filter(customer_type=filters.get('customer_type'))
            
        search_query = filters.get('search', '').strip()
        if search_query:
            from django.db.models import Q
            queryset = queryset.filter(
                Q(name__icontains=search_query) |
                Q(phone__icontains=search_query) |
                Q(email__icontains=search_query)
            )

        customers_data = [
            {
                "id": str(c.id),
                "customer_type_display": c.get_customer_type_display(),
                "name": c.name,
                "address": c.address or "—",
                "phone": c.phone or "—",
                "email": c.email or "—",
                "tax_office": c.tax_office or "—",
                "tax_no": c.tax_no or "—",
                "tc_no": c.tc_no or "—",
            }
            for c in queryset[:1000]
        ]

        return {
            'report_name': self.name,
            'report_description': self.description,
            'customers': customers_data,
            'filters': filters,
            'count': len(customers_data)
        }

    def get_excel_data(self, context: dict):
        customers = context.get('customers', [])
        columns = [
            {'key': 'name', 'label': gettext('Müşteri/Firma Adı')},
            {'key': 'customer_type_display', 'label': gettext('Tip')},
            {'key': 'phone', 'label': gettext('Telefon')},
            {'key': 'email', 'label': gettext('E-posta')},
            {'key': 'tax_office', 'label': gettext('Vergi Dairesi')},
            {'key': 'tax_no', 'label': gettext('Vergi No')},
            {'key': 'tc_no', 'label': gettext('T.C. No')},
            {'key': 'address', 'label': gettext('Adres')},
        ]
        return customers, columns

class CustomerSalesDetailReport(BaseModuleReport):
    """
    Müşteri Bazlı Satış Raporu.
    """
    slug = 'customer-sales-detail'
    name = gettext_lazy('Müşteri Satış Detay Raporu')
    description = gettext_lazy('Bir müşteriye ait bugüne kadar yapılmış satış hareketleri listesi.')
    category = 'GENERAL'
    template_name = 'reports/customer_sales_detail.html'

    def get_context(self) -> dict:
        filters = self.kwargs.copy()
        customer_id = filters.get('customer_id')
        
        customer = Customer.objects.get(id=customer_id)
        
        # Müşteri siparişleriyle ilişkili satışları çek
        sales_qs = Sale.objects.filter(order__customer_id=customer_id, is_deleted=False).select_related('order', 'branch', 'created_by')
        
        sales_data = [
            {
                "id": str(s.id),
                "paid_at": s.paid_at,
                "branch_name": s.branch.name,
                "payment_method_display": s.get_payment_method_display(),
                "total_amount": float(s.total_amount),
                "discount_amount": float(s.discount_amount),
                "gross_amount": float(s.total_amount + s.discount_amount),
            }
            for s in sales_qs[:1000]
        ]
        
        total_net = sum(x['total_amount'] for x in sales_data)
        total_discount = sum(x['discount_amount'] for x in sales_data)
        total_gross = sum(x['gross_amount'] for x in sales_data)

        return {
            'report_name': self.name,
            'report_description': self.description,
            'customer_name': customer.name,
            'sales': sales_data,
            'totals': {
                'net_total': total_net,
                'discount_total': total_discount,
                'gross_total': total_gross,
            },
            'filters': filters,
            'count': len(sales_data)
        }

    def get_excel_data(self, context: dict):
        sales = context.get('sales', [])
        columns = [
            {'key': 'id', 'label': gettext('Satış No')},
            {'key': 'paid_at', 'label': gettext('Tarih')},
            {'key': 'branch_name', 'label': gettext('Şube')},
            {'key': 'payment_method_display', 'label': gettext('Ödeme Yöntemi')},
            {'key': 'gross_amount', 'label': gettext('Brüt Tutar')},
            {'key': 'discount_amount', 'label': gettext('İndirim')},
            {'key': 'total_amount', 'label': gettext('Net Tutar')},
        ]
        
        data = [
            {
                'id': s['id'],
                'paid_at': s['paid_at'].strftime('%d.%m.%Y %H:%M') if s['paid_at'] else '',
                'branch_name': s['branch_name'],
                'payment_method_display': s['payment_method_display'],
                'gross_amount': s['gross_amount'],
                'discount_amount': s['discount_amount'],
                'total_amount': s['total_amount'],
            }
            for s in sales
        ]
        
        # Toplam satırı ekle
        data.append({
            'id': gettext('TOPLAM'),
            'paid_at': '',
            'branch_name': '',
            'payment_method_display': '',
            'gross_amount': context['totals']['gross_total'],
            'discount_amount': context['totals']['discount_total'],
            'total_amount': context['totals']['net_total'],
        })
        
        return data, columns

report_registry.register(CustomerListReport)
report_registry.register(CustomerSalesDetailReport)
