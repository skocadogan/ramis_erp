"""
Sipariş oluşturma öncesi sunucu tarafı doğrulama (invariant).
POS/istemci ayrı endpoint çağırmasa da aynı kurallar uygulanır.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from django.conf import settings
from django.core.cache import cache
from django.utils.translation import gettext as _

from apps.inventory.services import InventoryService
from apps.production_planning.services.pos_integration import check_cart_with_production

from .services import OrderValidationError

logger = logging.getLogger(__name__)

_VALIDATE_CACHE_SECONDS = 10


def _cart_fingerprint(
    branch_id: str, items_data: list[dict[str, Any]], stock_tracking_mode: str
) -> str:
    normalized = []
    for item in items_data:
        normalized.append(
            {
                "product_id": str(item.get("product_id", "")),
                "quantity": str(item.get("quantity", "")),
                "modifier_ids": sorted(str(m) for m in item.get("modifier_ids") or []),
            }
        )
    normalized.sort(key=lambda x: (x["product_id"], x["quantity"]))
    payload = json.dumps(
        {"branch_id": str(branch_id), "mode": stock_tracking_mode, "items": normalized},
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:24]


def _validate_cache_key(branch_id: str, fingerprint: str) -> str:
    return f"order_validate_ok:{branch_id}:{fingerprint}"


def assess_create_order_checks(
    branch_id: str, items_data: list[dict[str, Any]], stock_tracking_mode: str = "PRODUCT"
) -> dict[str, Any]:
    """
    ``check_station_stock`` endpoint’i ile aynı birleşik sonuç.
    Başarılı sonuç kısa süre önbelleğe alınır (create hot path tekrarını azaltır).
    """
    if not items_data:
        return {"ok": False, "issues": [{"code": "EMPTY", "detail": _("Sepet boş.")}]}

    fingerprint = _cart_fingerprint(branch_id, items_data, stock_tracking_mode)
    cache_key = _validate_cache_key(branch_id, fingerprint)
    if cache.get(cache_key):
        return {"ok": True, "issues": [], "cached": True}

    result = InventoryService.check_pos_cart_station_stock(str(branch_id), items_data)
    prod_result = check_cart_with_production(str(branch_id), items_data)

    from .smart_firing import batch_compute_queue_buffers, get_ui_busy_threshold_minutes

    v2 = bool(getattr(settings, 'ENABLE_SMART_FIRING_V2', False))
    firing_stats = {
        "enabled": v2,
        "max_buffer_minutes": 0,
        "busy_threshold_minutes": get_ui_busy_threshold_minutes(),
    }

    if v2:
        from apps.menu.models import Product

        pids = [i['product_id'] for i in items_data]
        products = Product.objects.filter(id__in=pids).select_related(
            'category__station',
        ).prefetch_related(
            'combined_items__product__category__station',
        )
        station_ids = set()
        for p in products:
            sid = getattr(getattr(p.category, 'station', None), 'id', None)
            if sid:
                station_ids.add(sid)
            if p.is_combined:
                for ci in p.combined_items.all():
                    cs = getattr(getattr(ci.product.category, 'station', None), 'id', None)
                    if cs:
                        station_ids.add(cs)
        # Batch — N sorgu yerine 2 sorgu
        buffers = batch_compute_queue_buffers(branch_id, station_ids)
        max_buf = max(buffers.values()) if buffers else 0
        firing_stats["max_buffer_minutes"] = max_buf

    if stock_tracking_mode == "INGREDIENT":
        # Sadece hammadde sorunlarını önemse
        result["smart_firing_stats"] = firing_stats
        if result.get("ok"):
            cache.set(cache_key, 1, timeout=_VALIDATE_CACHE_SECONDS)
        return result
    else:
        # Sadece üretim/ürün porsiyon sorunlarını önemse (PRODUCT mode)
        # Inventory issues'ları boşaltıyoruz ki engel olmasın
        prod_result["issues"] = prod_result.get("production_issues", [])
        prod_result["smart_firing_stats"] = firing_stats
        if prod_result.get("ok"):
            cache.set(cache_key, 1, timeout=_VALIDATE_CACHE_SECONDS)
        return prod_result


def validate_create_order_invariants(
    branch_id: str, items_data: list[dict[str, Any]], stock_tracking_mode: str = "PRODUCT"
) -> None:
    fingerprint = _cart_fingerprint(branch_id, items_data, stock_tracking_mode)
    cache_key = _validate_cache_key(branch_id, fingerprint)
    if cache.get(cache_key):
        return

    r = assess_create_order_checks(branch_id, items_data, stock_tracking_mode)
    if r.get("ok"):
        cache.set(cache_key, 1, timeout=_VALIDATE_CACHE_SECONDS)
        logger.info(
            "order_validate_create_ok branch_id=%s line_count=%d",
            branch_id,
            len(items_data),
        )
        return

    issues = r.get("issues") or []
    first: dict = issues[0] if issues and isinstance(issues[0], dict) else {}
    code = first.get("code") or "VALIDATION"
    if "detail" in first:
        msg = str(first["detail"])
    elif code in ("SOLD_OUT", "LIMITED_EXCEEDED"):
        msg = first.get("reason") or _("Üretim / ürün kalmadı.")
        msg = f"[{code}] {msg}"
    elif code in ("INSUFFICIENT_STOCK", "CRITICAL_STOCK"):
        msg = _(
            "Stok: %(code)s — %(name)s (Mevcut: %(physical)s, Rezerve: %(reserved)s, "
            "Kullanılabilir: %(available)s, Gerekli: %(required)s)"
        ) % {
            "code": code,
            "name": first.get("stock_item_name", ""),
            "physical": first.get("physical", "—"),
            "reserved": first.get("reserved", "—"),
            "available": first.get("available", "—"),
            "required": first.get("required", "—"),
        }
    else:
        msg = first.get("reason") or str(first) or _("Sipariş doğrulanamadı.")
    raise OrderValidationError(msg)
