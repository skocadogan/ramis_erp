"""Ödeme alınmamış / kapatılmamış sipariş durumları (masa + POS kapsamı)."""

from __future__ import annotations

from .models import OrderStatus

# COMPLETED / CANCELLED hariç — ödeme bekleyen tüm siparişler (DELIVERED dahil).
OPEN_ORDER_STATUSES: tuple[str, ...] = (
    OrderStatus.PENDING,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.DELIVERED,
)
