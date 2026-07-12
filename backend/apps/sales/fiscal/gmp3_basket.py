"""GMP-3 sepet (basket) oluşturma — Sale → ÖKC JSON formatı."""
from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from apps.sales.models import PaymentMethod

# Ramis ödeme tipi → GMP-3 / Token payment type
GMP3_PAYMENT_TYPE_MAP: dict[str, int] = {
    PaymentMethod.CASH: 1,
    PaymentMethod.CARD: 2,
    PaymentMethod.OTHER: 5,
    PaymentMethod.CREDIT: 17,
}

# KDV % → varsayılan kısım (fiscal parameters yoksa)
DEFAULT_TAX_SECTION_MAP: dict[int, int] = {
    1: 1,
    8: 2,
    10: 2,
    18: 3,
    20: 3,
}


def match_gmp3_section_no(tax_rate_percent: float, fiscal_params: dict[str, Any]) -> int:
    """
    Ürün KDV oranına göre sectionNo eşleştir.

    fiscal_params.sections[]: {sectionNo, taxPercent} — taxPercent binde (‰).
    """
    target_permille = int(tax_rate_percent * 100)
    sections = fiscal_params.get("sections") or []
    for section in sections:
        if section.get("taxPercent") == target_permille:
            return int(section.get("sectionNo", 1))
    if sections:
        return int(sections[0].get("sectionNo", 1))
    return DEFAULT_TAX_SECTION_MAP.get(int(tax_rate_percent), 1)


def payment_method_to_gmp3_type(payment_method: str) -> int:
    return GMP3_PAYMENT_TYPE_MAP.get(payment_method, 1)


def _money_to_cents(amount: Decimal | float) -> int:
    return int(Decimal(str(amount)) * 100)


def _quantity_to_milli(quantity: Decimal | float) -> int:
    return int(Decimal(str(quantity)) * 1000)


def build_gmp3_basket_from_sale(sale, fiscal_params: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Sale nesnesinden GMP-3 sepet JSON'u üret.

    Args:
        sale: Kayıtlı Sale (order.items ve payments erişilebilir olmalı)
        fiscal_params: getFiscalParameters yanıtı (kısım eşleştirme için)
    """
    fiscal_params = fiscal_params or {}
    items = []
    for order_item in sale.order.items.all():
        if getattr(order_item, "status", None) == "CANCELLED":
            continue
        product = order_item.product
        tax_rate = float(product.tax_rate) if product and product.tax_rate else 0.0
        section_no = match_gmp3_section_no(tax_rate, fiscal_params)
        items.append({
            "name": (product.name if product else "Ürün")[:50],
            "price": _money_to_cents(order_item.unit_price),
            "quantity": _quantity_to_milli(order_item.quantity),
            "sectionNo": section_no,
            "taxPercent": int(tax_rate * 100),
        })

    payment_items = []
    sale_payments = list(sale.payments.all())
    if sale_payments:
        for pay in sale_payments:
            payment_items.append({
                "amount": _money_to_cents(pay.amount),
                "type": payment_method_to_gmp3_type(pay.payment_method),
            })
    else:
        payment_items.append({
            "amount": _money_to_cents(sale.total_amount),
            "type": payment_method_to_gmp3_type(sale.payment_method),
        })

    check_number = 1
    try:
        check_number = int(str(sale.order.id).replace("-", "")[:8], 16) % 10000
    except (ValueError, TypeError):
        pass

    table = getattr(sale.order, "table", None)
    title = f"Masa {table.name}" if table and getattr(table, "name", None) else "Siparis"

    basket: dict[str, Any] = {
        "basketID": str(uuid.uuid4()),
        "createInvoice": False,
        "documentType": 0,
        "isVoid": False,
        "checkNumber": check_number,
        "title": title[:40],
        "total": _money_to_cents(sale.total_amount),
        "items": items,
        "paymentItems": payment_items,
    }

    discount = sale.discount_amount or Decimal("0")
    if discount > 0:
        basket["adjust"] = {
            "description": "Indirim",
            "discountOrSurcharge": 0,
            "type": 0,
            "value": _money_to_cents(discount),
        }

    return basket
