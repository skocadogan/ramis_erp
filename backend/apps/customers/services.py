"""
Customer business logic services.
"""

from core.branch_scope import branch_filter_qs
from apps.sales.models import Sale
from apps.sales.selectors import aggregate_sale_money_totals


def get_customer_sales_queryset(customer, request):
    qs = Sale.objects.filter(
        order__customer=customer, is_deleted=False
    ).select_related('order', 'branch', 'created_by')
    return branch_filter_qs(qs, request, field='branch_id')


def calculate_sales_totals(sales_qs):
    return aggregate_sale_money_totals(sales_qs)
