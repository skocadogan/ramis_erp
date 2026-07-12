"""
Customer business logic services.
"""

from core.branch_scope import branch_filter_qs
from apps.sales.models import Sale


def get_customer_sales_queryset(customer, request):
    qs = Sale.objects.filter(
        order__customer=customer, is_deleted=False
    ).select_related('order', 'branch', 'created_by')
    return branch_filter_qs(qs, request, field='branch_id')


def calculate_sales_totals(sales_qs):
    total_amount = sum(s.total_amount for s in sales_qs)
    total_discount = sum(s.discount_amount for s in sales_qs)
    total_gross = total_amount + total_discount
    return {
        'gross_total': float(total_gross),
        'discount_total': float(total_discount),
        'net_total': float(total_amount),
    }
