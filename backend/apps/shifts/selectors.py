from datetime import datetime, time
from django.utils import timezone
from django.utils.dateparse import parse_date
from core.branch_scope import branch_filter_qs
from decimal import Decimal
from typing import Any

from core.decimal_constants import ZERO_MONEY
from django.db.models import QuerySet, Sum

from apps.sales.models import PaymentMethod, Sale
from apps.shifts.models import Shift, ShiftStatus


def get_filtered_shifts_report_data(branch_id=None, status=None, date_from=None, date_to=None, terminal_id=None, user=None) -> list[dict]:
    """
    Vardiya listesi raporu için filtrelenmiş veri sağlar.
    """
    qs = Shift.objects.select_related("branch", "opened_by", "closed_by", "opened_at_terminal").order_by("-opened_at")
    
    # 1. Branch Filter
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    elif user:
        # Eğer spesifik branch yoksa user'ın yetkili olduğu branları filtrele
        qs = branch_filter_qs(qs, None, user=user)

    # 2. Status Filter
    if status in ("OPEN", "CLOSED"):
        qs = qs.filter(status=status)

    # 3. Date Filters
    if date_from:
        d = parse_date(date_from) if isinstance(date_from, str) else date_from
        if d:
            start = timezone.make_aware(datetime.combine(d, time.min))
            qs = qs.filter(opened_at__gte=start)

    if date_to:
        d = parse_date(date_to) if isinstance(date_to, str) else date_to
        if d:
            end = timezone.make_aware(datetime.combine(d, time.max))
            qs = qs.filter(opened_at__lte=end)

    # 4. Terminal Filter
    if terminal_id:
        qs = qs.filter(opened_at_terminal_id=terminal_id)

    # Veriyi sadeleştirerek dön
    return [
        {
            "id": str(s.id),
            "branch_name": s.branch.name,
            "opened_at": s.opened_at,
            "closed_at": s.closed_at,
            "status": s.status,
            "status_display": s.get_status_display(),
            "opened_by": s.opened_by.get_full_name() or s.opened_by.username if s.opened_by else "—",
            "terminal_name": s.opened_at_terminal.name if s.opened_at_terminal else "—",
            "expected_cash": s.expected_cash or 0,
            "actual_cash": s.actual_cash or 0,
            "difference": s.difference or 0,
        }
        for s in qs
    ]


def get_active_shift(branch_id, terminal_id=None) -> Shift | None:
    qs = Shift.objects.filter(branch_id=branch_id, status=ShiftStatus.OPEN).select_related("branch", "opened_by")
    if terminal_id:
        qs = qs.filter(opened_at_terminal_id=terminal_id)
    return qs.first()


def shifts_for_branch(branch_id=None) -> QuerySet[Shift]:
    qs = Shift.objects.select_related("branch", "opened_by", "closed_by").order_by("-opened_at")
    if branch_id:
        qs = qs.filter(branch_id=branch_id)
    return qs


def _payment_lines_for_sale(sale: Sale) -> dict[str, Decimal]:
    """Tek satış için ham ödeme yöntemi → tutar (CREDIT ayrı)."""
    from apps.sales.models import PaymentMethod

    keys = [PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.OTHER, PaymentMethod.CREDIT]
    out = {k: ZERO_MONEY for k in keys}
    if getattr(sale, "is_split_payment", False) and sale.payments.exists():
        for p in sale.payments.all():
            out[p.payment_method] = out.get(p.payment_method, ZERO_MONEY) + p.amount
    else:
        out[sale.payment_method] = sale.total_amount
    return out


def _payment_breakdown_for_sale(sale: Sale) -> dict[str, Decimal]:
    """Tek satış için ödeme yöntemi → tutar (CASH, CARD, OTHER, CREDIT). CREDIT ayrı tutulur."""
    from apps.sales.models import PaymentMethod

    lines = _payment_lines_for_sale(sale)
    out = {
        PaymentMethod.CASH: ZERO_MONEY,
        PaymentMethod.CARD: ZERO_MONEY,
        PaymentMethod.OTHER: ZERO_MONEY,
        PaymentMethod.CREDIT: ZERO_MONEY,
    }
    for method, amount in lines.items():
        if method == PaymentMethod.CREDIT:
            out[PaymentMethod.CREDIT] = out.get(PaymentMethod.CREDIT, ZERO_MONEY) + amount
        else:
            from apps.sales.payment_utils import aggregation_bucket
            bucket = aggregation_bucket(method)
            out[bucket] = out.get(bucket, ZERO_MONEY) + amount
    return out


def get_shift_z_report(shift_id) -> dict[str, Any]:
    shift = (
        Shift.objects.select_related("branch", "opened_by", "closed_by")
        .prefetch_related("expenses", "cash_movements", "sales__payments")
        .get(pk=shift_id)
    )

    sales_qs = Sale.objects.filter(shift_id=shift_id, is_deleted=False).prefetch_related(
        "payments"
    )
    if shift.closed_at:
        sales_qs = sales_qs.filter(paid_at__lte=shift.closed_at)

    sales = list(sales_qs)

    total_sales = sum((s.total_amount for s in sales), ZERO_MONEY)
    pay_cash = ZERO_MONEY
    pay_card = ZERO_MONEY
    pay_other = ZERO_MONEY
    pay_credit = ZERO_MONEY
    total_discount = sum((s.discount_amount for s in sales), ZERO_MONEY)

    for s in sales:
        br = _payment_breakdown_for_sale(s)
        pay_cash += br.get(PaymentMethod.CASH, ZERO_MONEY)
        pay_card += br.get(PaymentMethod.CARD, ZERO_MONEY)
        pay_other += br.get(PaymentMethod.OTHER, ZERO_MONEY)
        pay_credit += br.get(PaymentMethod.CREDIT, ZERO_MONEY)

    expenses_total = shift.expenses.aggregate(s=Sum("amount"))["s"] or ZERO_MONEY
    mov_in = sum(
        (m.amount for m in shift.cash_movements.all() if m.movement_type == "IN"),
        ZERO_MONEY,
    )
    mov_out = sum(
        (m.amount for m in shift.cash_movements.all() if m.movement_type == "OUT"),
        ZERO_MONEY,
    )

    expected_cash = shift.opening_cash + pay_cash + mov_in - expenses_total - mov_out

    return {
        "shift": {
            "id": str(shift.id),
            "branch_id": str(shift.branch_id),
            "branch_name": shift.branch.name,
            "status": shift.status,
            "status_display": shift.get_status_display(),
            "opened_at": shift.opened_at,
            "closed_at": shift.closed_at,
            "opening_cash": shift.opening_cash,
            "expected_cash": expected_cash,
            "actual_cash": shift.actual_cash,
            "difference": shift.difference,
            "opened_by": getattr(shift.opened_by, "username", None),
            "opened_by_name": getattr(shift.opened_by, "get_full_name", lambda: "")() or getattr(shift.opened_by, "username", None),
            "closed_by": getattr(shift.closed_by, "username", None) if shift.closed_by else None,
        },
        "totals": {
            "gross_sales": total_sales,
            "sale_count": len(sales),
            "discounts": total_discount,
        },
        "payment_breakdown": {
            "CASH": pay_cash,
            "CARD": pay_card,
            "OTHER": pay_other,
            "CREDIT": pay_credit,
        },
        "expenses": [
            {"id": str(e.id), "description": e.description, "amount": e.amount}
            for e in shift.expenses.all()
        ],
        "expenses_total": expenses_total,
        "cash_movements": [
            {
                "id": str(m.id),
                "amount": m.amount,
                "movement_type": m.movement_type,
                "description": m.description,
            }
            for m in shift.cash_movements.all()
        ],
        "cash_movements_net": mov_in - mov_out,
    }


def get_shift_cash_report(shift_id) -> dict[str, Any]:
    shift = (
        Shift.objects.select_related("branch", "opened_by", "closed_by")
        .get(pk=shift_id)
    )

    sales_qs = Sale.objects.filter(shift_id=shift_id, is_deleted=False).select_related(
        "pos_terminal", "created_by", "order"
    ).prefetch_related("payments")
    sales = list(sales_qs)

    deleted_sales_qs = Sale.objects.filter(shift_id=shift_id, is_deleted=True).select_related(
        "pos_terminal", "created_by"
    )
    deleted_sales = list(deleted_sales_qs)

    total_cancelled = sum((s.total_amount for s in deleted_sales), ZERO_MONEY)
    total_discount = sum((s.discount_amount for s in sales), ZERO_MONEY)
    total_sales = sum((s.total_amount for s in sales), ZERO_MONEY)

    terminal_breakdown = {}
    for s in sales:
        term_id = str(s.pos_terminal_id) if s.pos_terminal else "unknown"
        term_name = s.pos_terminal.name if s.pos_terminal else "Bilinmeyen Cihaz"

        if term_id not in terminal_breakdown:
            terminal_breakdown[term_id] = {
                "terminal_name": term_name,
                "sales_count": 0,
                "total_amount": ZERO_MONEY,
                "discount_amount": ZERO_MONEY,
                "payments": {
                    "CASH": ZERO_MONEY,
                    "CARD": ZERO_MONEY,
                    "OTHER": ZERO_MONEY,
                    "CREDIT": ZERO_MONEY,
                },
                "sales_list": []
            }

        tb = terminal_breakdown[term_id]
        tb["sales_count"] += 1
        tb["total_amount"] += s.total_amount
        tb["discount_amount"] += s.discount_amount

        br = _payment_breakdown_for_sale(s)
        tb["payments"]["CASH"] += br.get(PaymentMethod.CASH, ZERO_MONEY)
        tb["payments"]["CARD"] += br.get(PaymentMethod.CARD, ZERO_MONEY)
        tb["payments"]["OTHER"] += br.get(PaymentMethod.OTHER, ZERO_MONEY)
        lines = _payment_lines_for_sale(s)
        tb["payments"]["CREDIT"] += lines.get(PaymentMethod.CREDIT, ZERO_MONEY)

        tb["sales_list"].append({
            "id": str(s.id),
            "order_number": s.order.order_number if s.order else "—",
            "total_amount": s.total_amount,
            "discount_amount": s.discount_amount,
            "payment_method": s.payment_method,
            "payment_method_display": s.get_payment_method_display(),
            "paid_at": s.paid_at,
            "created_by": s.created_by.get_full_name() or s.created_by.username if s.created_by else "—"
        })

    pay_cash = ZERO_MONEY
    pay_card = ZERO_MONEY
    pay_other = ZERO_MONEY
    for s in sales:
        br = _payment_breakdown_for_sale(s)
        pay_cash += br.get(PaymentMethod.CASH, ZERO_MONEY)
        pay_card += br.get(PaymentMethod.CARD, ZERO_MONEY)
        pay_other += br.get(PaymentMethod.OTHER, ZERO_MONEY)

    return {
        "shift": {
            "id": str(shift.id),
            "branch_id": str(shift.branch_id),
            "branch_name": shift.branch.name,
            "status": shift.status,
            "status_display": shift.get_status_display(),
            "opened_at": shift.opened_at,
            "closed_at": shift.closed_at,
            "opening_cash": shift.opening_cash,
            "actual_cash": shift.actual_cash,
            "opened_by_name": getattr(shift.opened_by, "get_full_name", lambda: "")() or getattr(shift.opened_by, "username", None),
        },
        "totals": {
            "gross_sales": total_sales,
            "sale_count": len(sales),
            "total_discount": total_discount,
            "total_cancelled": total_cancelled,
        },
        "payment_breakdown": {
            "CASH": pay_cash,
            "CARD": pay_card,
            "OTHER": pay_other,
        },
        "terminals": list(terminal_breakdown.values())
    }

