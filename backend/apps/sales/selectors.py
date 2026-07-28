from django.db.models import Sum, Count, F, DecimalField, ExpressionWrapper

from .models import Sale

# Frontend TableSelect sentinel — paket (TAKEAWAY) satışları filtrele.
TAKEAWAY_SALES_TABLE_FILTER = "__takeaway__"


def sale_gross_expression():
    """Brüt tutar hesaplama ifadesi (net + indirim)."""
    return ExpressionWrapper(
        F('total_amount') + F('discount_amount'),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )


def aggregate_sale_money_totals(queryset):
    """Bir satış queryset'i için brüt, indirim ve net toplamları hesaplar."""
    gross_expr = sale_gross_expression()
    result = queryset.order_by().aggregate(
        net=Sum('total_amount'),
        disc=Sum('discount_amount'),
        gross=Sum(gross_expr),
    )
    return {
        'gross_total': float(result['gross'] or 0),
        'discount_total': float(result['disc'] or 0),
        'net_total': float(result['net'] or 0),
    }


def get_sales_queryset(
    branch_id=None,
    payment_method=None,
    start_date=None,
    end_date=None,
    order_id=None,
    discount_only=False,
    deleted=False,
    pos_terminal_id=None,
    created_by_id=None,
    table_id=None,
):
    """
    Filtrelenmiş satış queryset'i döner.
    Varsayılan olarak silinmemişleri döner; deleted=True geçilirse silinmişleri döner.
    """
    qs = Sale.objects.select_related(
        'order__table', 'branch', 'created_by', 'shift', 'pos_terminal',
        'discount_applied_by',
    ).prefetch_related('payments')

    if deleted:
        qs = qs.filter(is_deleted=True).order_by('-deleted_at')
    else:
        qs = qs.filter(is_deleted=False).order_by('-paid_at')

    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    if payment_method:
        qs = qs.filter(payment_method=payment_method)
    if pos_terminal_id:
        qs = qs.filter(pos_terminal_id=pos_terminal_id)
    if created_by_id:
        qs = qs.filter(created_by_id=created_by_id)
    if table_id:
        if str(table_id) == TAKEAWAY_SALES_TABLE_FILTER:
            qs = qs.filter(order__order_type="TAKEAWAY")
        else:
            qs = qs.filter(order__table_id=table_id)
    if start_date:
        qs = qs.filter(paid_at__date__gte=start_date)
    if end_date:
        qs = qs.filter(paid_at__date__lte=end_date)
    if order_id:
        qs = qs.filter(order_id=order_id)
    if discount_only:
        qs = qs.filter(discount_amount__gt=0)

    return qs


def get_sales_summary(base_qs):
    """
    Satış özetini dönem bazlı hesaplar ve döner.
    base_qs: branch/kullanıcı kapsamı zaten uygulanmış queryset.
    """
    from django.utils import timezone
    from django.db.models import Q, Sum, Count

    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timezone.timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)
    year_start = today_start.replace(month=1, day=1)

    def _first_day_n_months_back(anchor, months_back):
        y, m = anchor.year, anchor.month - months_back
        while m < 1:
            m += 12
            y -= 1
        return anchor.replace(year=y, month=m, day=1)

    last_week_start = today_start - timezone.timedelta(days=now.weekday() + 7)
    last_month_start = _first_day_n_months_back(month_start, 1)
    last_3_months_start = _first_day_n_months_back(month_start, 2)
    last_6_months_start = _first_day_n_months_back(month_start, 5)
    last_9_months_start = _first_day_n_months_back(month_start, 8)

    periods = [
        ('today', today_start),
        ('this_week', week_start),
        ('last_week', last_week_start),
        ('this_month', month_start),
        ('last_month', last_month_start),
        ('last_3_months', last_3_months_start),
        ('last_6_months', last_6_months_start),
        ('last_9_months', last_9_months_start),
        ('this_year', year_start),
        ('all_time', None),
    ]

    gross_expr = sale_gross_expression()
    aggs = {}
    payment_methods = ['CASH', 'CARD', 'OTHER']

    for name, start in periods:
        f = Q(paid_at__gte=start) if start else Q()
        aggs[f'{name}_net'] = Sum('total_amount', filter=f)
        aggs[f'{name}_disc'] = Sum('discount_amount', filter=f)
        aggs[f'{name}_gross'] = Sum(gross_expr, filter=f)
        aggs[f'{name}_cnt'] = Count('id', filter=f, distinct=True)
        
        # Takeaway
        tf = f & Q(order__order_type='TAKEAWAY')
        aggs[f'{name}_ta_net'] = Sum('total_amount', filter=tf)
        aggs[f'{name}_ta_gross'] = Sum(gross_expr, filter=tf)
        aggs[f'{name}_ta_cnt'] = Count('id', filter=tf, distinct=True)
        
        # Discounted
        df = f & Q(discount_amount__gt=0)
        aggs[f'{name}_disc_rev'] = Sum('total_amount', filter=df)
        aggs[f'{name}_disc_cnt'] = Count('id', filter=df, distinct=True)

    # Payment Breakdown - Accurate calculation from SalePayment
    payment_methods = ['CASH', 'CARD', 'OTHER']
    payment_aggs = {}
    for name, start in periods:
        f_pay = Q(sale__paid_at__gte=start) if start else Q()
        f_pay &= Q(sale__is_deleted=False)
        # base_qs filtrelerini de SalePayment'a yansıtmak için:
        # Ancak base_qs zaten şube vb. filtrelerini içeriyor.
        # En temizi SalePayment üzerinden base_qs'e bağlı bir filtre kurmak.
        
        for pm in payment_methods:
            if pm == "OTHER":
                pmf = f_pay & Q(payment_method__in=["OTHER", "CREDIT"])
            else:
                pmf = f_pay & Q(payment_method=pm)
            payment_aggs[f'{name}_pm_{pm}_net'] = Sum('amount', filter=pmf)
            # Brüt hesaplama için SalePayment'ta indirim yok (indirim Sale seviyesinde),
            # ancak genellikle split ödemelerde brüt/net farkı Sale bazlıdır.
            # Basitleştirmek için net tutarları topluyoruz.
            # İleride her ödeme kalemine indirim payı düşülebilir.
            payment_aggs[f'{name}_pm_{pm}_cnt'] = Count('sale_id', filter=pmf, distinct=True)

    from .models import SalePayment
    pay_res = SalePayment.objects.filter(sale__in=base_qs).aggregate(**payment_aggs)
    res = base_qs.aggregate(**aggs)

    def _format_period(name):
        return {
            'total': float(res[f'{name}_net'] or 0),
            'gross_total': float(res[f'{name}_gross'] or 0),
            'discount_total': float(res[f'{name}_disc'] or 0),
            'count': res[f'{name}_cnt'] or 0,
            'takeaway': {
                'total': float(res[f'{name}_ta_net'] or 0),
                'gross': float(res[f'{name}_ta_gross'] or 0),
                'count': res[f'{name}_ta_cnt'] or 0,
            },
            'breakdown': {
                pm: {
                    'total': float(pay_res[f'{name}_pm_{pm}_net'] or 0),
                    'gross': float(pay_res[f'{name}_pm_{pm}_net'] or 0), # Split ödemelerde brüt detayı Sale seviyesindedir
                    'count': pay_res[f'{name}_pm_{pm}_cnt'] or 0,
                } for pm in payment_methods
            },
            'discount': {
                'total': float(res[f'{name}_disc'] or 0),
                'count': res[f'{name}_disc_cnt'] or 0,
                'sales_revenue': float(res[f'{name}_disc_rev'] or 0),
            },
        }

    return {name: _format_period(name) for name, _ in periods}
