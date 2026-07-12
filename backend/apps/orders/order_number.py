"""Şube/gün bazlı sipariş numarası — cache hızlandırması + DB kalıcılık."""

from __future__ import annotations

import logging
from datetime import date

from django.core.cache import cache
from django.db import transaction
from django.db.models import F

logger = logging.getLogger(__name__)

_COUNTER_TTL = 90000  # ~25 saat


def _cache_key(branch_id, day: date) -> str:
    return f"branch_order_num:{branch_id}:{day.isoformat()}"


def _init_cache_from_db(branch_id, day: date) -> int:
    from apps.branches.models import BranchOrderCounter

    row = BranchOrderCounter.objects.filter(branch_id=branch_id, date=day).first()
    return int(row.last_number) if row else 0


def _persist_counter(branch_id, day: date, number: int) -> None:
    from apps.branches.models import BranchOrderCounter

    updated = BranchOrderCounter.objects.filter(
        branch_id=branch_id,
        date=day,
        last_number__lt=number,
    ).update(last_number=number)
    if updated:
        return
    BranchOrderCounter.objects.update_or_create(
        branch_id=branch_id,
        date=day,
        defaults={"last_number": number},
    )


def _allocate_via_db_lock(branch_id, day: date) -> str:
    from apps.branches.models import BranchOrderCounter

    counter, _ = BranchOrderCounter.objects.select_for_update().get_or_create(
        branch_id=branch_id,
        date=day,
        defaults={"last_number": 0},
    )
    BranchOrderCounter.objects.filter(pk=counter.pk).update(
        last_number=F("last_number") + 1
    )
    counter.refresh_from_db(fields=["last_number"])
    return f"#{counter.last_number}"


def allocate_branch_order_number(branch_id, day: date | None = None) -> str:
    """
    Sıradaki sipariş numarasını üretir.

    Önce cache ``incr`` (düşük gecikme); başarısız olursa ``select_for_update`` yedeği.
    DB satırı commit sonrası güncellenir.
    """
    from django.utils.timezone import now

    day = day or now().date()
    key = _cache_key(branch_id, day)
    init_key = f"{key}:init"

    try:
        if cache.add(init_key, 1, timeout=_COUNTER_TTL):
            cache.set(key, _init_cache_from_db(branch_id, day), timeout=_COUNTER_TTL)
        number = cache.incr(key)
        transaction.on_commit(lambda n=number: _persist_counter(branch_id, day, n))
        return f"#{number}"
    except Exception:
        logger.debug("Sipariş numarası cache yolu başarısız, DB kilidine dönülüyor", exc_info=True)
        return _allocate_via_db_lock(branch_id, day)
