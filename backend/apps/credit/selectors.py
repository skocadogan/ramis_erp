"""Ödenmez hesabı bakiye/ekstre seçicileri."""

from decimal import Decimal

from django.db.models import Q, Sum, DecimalField, Value
from django.db.models.functions import Coalesce

from core.decimal_constants import ZERO_MONEY

from .models import CreditAccount, CreditTransaction, CreditTransactionType


_DEC = DecimalField(max_digits=14, decimal_places=4)


def _active_topup_filter() -> Q:
    return Q(transactions__is_active=True, transactions__transaction_type=CreditTransactionType.TOPUP)


def _active_charge_filter() -> Q:
    """Aktif harcama hareketleri; iptal/silinmiş satışa bağlı olanlar hariç (otomatik iade)."""
    return (
        Q(transactions__is_active=True, transactions__transaction_type=CreditTransactionType.CHARGE)
        & (Q(transactions__sale__isnull=True) | Q(transactions__sale__is_deleted=False))
    )


def annotate_account_balances(qs):
    """
    CreditAccount queryset'ine ``total_credited``, ``total_spent`` ve ``balance``
    alanlarını ekler. Tek sorguda (filtreli SUM) hesaplanır.
    """
    return qs.annotate(
        total_credited=Coalesce(
            Sum("transactions__amount", filter=_active_topup_filter()),
            Value(ZERO_MONEY),
            output_field=_DEC,
        ),
        total_spent=Coalesce(
            Sum("transactions__amount", filter=_active_charge_filter()),
            Value(ZERO_MONEY),
            output_field=_DEC,
        ),
    )


def account_available_balance(account: CreditAccount) -> Decimal:
    """Annotate edilmiş hesapta ek sorgu atmadan bakiye döner."""
    credited = getattr(account, "total_credited", None)
    spent = getattr(account, "total_spent", None)
    if credited is not None and spent is not None:
        return Decimal(credited) - Decimal(spent)
    return get_account_balance(account)["balance"]


def get_account_balance(account: CreditAccount) -> dict:
    """Tek hesap için kredi/harcama/bakiye özetini döner."""
    row = annotate_account_balances(
        CreditAccount.objects.filter(pk=account.pk)
    ).values("total_credited", "total_spent").first()
    if not row:
        return {"total_credited": ZERO_MONEY, "total_spent": ZERO_MONEY, "balance": ZERO_MONEY}
    credited = row["total_credited"] or ZERO_MONEY
    spent = row["total_spent"] or ZERO_MONEY
    return {
        "total_credited": credited,
        "total_spent": spent,
        "balance": credited - spent,
    }


def account_transactions_qs(account_id):
    """Hesabın aktif hareketleri (ekstre); en yeni önce."""
    return (
        CreditTransaction.objects.filter(account_id=account_id, is_active=True)
        .select_related("sale", "sale__order", "branch", "created_by")
        .order_by("-created_at")
    )
