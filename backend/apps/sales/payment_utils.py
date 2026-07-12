"""Ödeme yöntemi toplama (aggregation) yardımcıları."""

from apps.sales.models import PaymentMethod


def aggregation_bucket(method: str) -> str:
    """
    Rapor/özet toplamları için ödeme yöntemini gruplar.
    Ödenmez (CREDIT) → Diğer (OTHER) kovasına katılır.
    """
    if method == PaymentMethod.CREDIT:
        return PaymentMethod.OTHER
    if method in (PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.OTHER):
        return method
    return PaymentMethod.OTHER
