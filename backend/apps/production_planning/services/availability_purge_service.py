"""
Geçmiş Ürün Kalmadı (86) kayıtlarının otomatik temizliği.
"""

from __future__ import annotations

import logging
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def _availability_snapshot(availability) -> dict[str, Any]:
    return {
        "id": str(availability.pk),
        "branch_id": str(availability.branch_id),
        "product_id": str(availability.product_id),
        "product_name": availability.product.name,
        "effective_date": availability.effective_date.isoformat(),
        "mode": availability.mode,
        "remaining_portions": (
            str(availability.remaining_portions)
            if availability.remaining_portions is not None
            else None
        ),
        "reason": availability.reason or "",
    }


def _record_purge_run_audit(
    *,
    record_audit,
    action: str = "production_planning.availability.purge_expired_completed",
    deleted_count: int,
    cutoff_date,
    purge_ts,
    branch_ids: list[str] | None = None,
    protected_plan_keys: list[dict[str, str]] | None = None,
    skipped: bool = False,
    reason: str | None = None,
) -> None:
    metadata = {
        "deleted_count": deleted_count,
        "cutoff_date": cutoff_date.isoformat(),
        "branch_ids": branch_ids or [],
        "protected_plan_keys": protected_plan_keys or [],
        "purge_ts": purge_ts.isoformat(),
        "skipped": skipped,
    }
    if reason:
        metadata["reason"] = reason

    try:
        record_audit(
            action=action,
            target_type="production_planning.productdayavailability",
            target_id="batch",
            before_json=None,
            after_json={"deleted_count": deleted_count, "skipped": skipped},
            metadata=metadata,
            actor=None,
        )
    except Exception:
        logger.exception("Audit kaydı oluşturulamadı (%s)", action)


def purge_expired_product_day_availability(*, enabled: bool | None = None) -> dict[str, Any]:
    """
    Bugün hariç geçmiş ``ProductDayAvailability`` kayıtlarını soft-delete eder.

    ``enabled`` None ise ``settings.BEAT_PURGE_EXPIRED_86_ENABLED`` okunur.
    Bu sistem bakımı, manuel API'deki üretim planı korumasını bilinçli olarak
    atlar; geçmiş tarihli kayıtlar POS kararlarında kullanılmaz.
    """
    from apps.audit.services import record_audit
    from apps.menu.ws_broadcast import broadcast_menu_catalog_refresh
    from apps.production_planning.models import (
        ProductDayAvailability,
        ProductionPlan,
        ProductionPlanStatus,
    )

    today = timezone.localdate()
    purge_ts = timezone.now()

    if enabled is None:
        enabled = getattr(settings, "BEAT_PURGE_EXPIRED_86_ENABLED", False)

    if not enabled:
        logger.info("purge_expired_product_day_availability: atlandı (BEAT_PURGE_EXPIRED_86_ENABLED=false)")
        _record_purge_run_audit(
            record_audit=record_audit,
            action="production_planning.availability.purge_expired_skipped",
            deleted_count=0,
            cutoff_date=today,
            purge_ts=purge_ts,
            skipped=True,
            reason="BEAT_PURGE_EXPIRED_86_ENABLED=false",
        )
        return {"skipped": True, "reason": "BEAT_PURGE_EXPIRED_86_ENABLED=false", "deleted_count": 0}

    expired_qs = (
        ProductDayAvailability.objects.filter(is_active=True, effective_date__lt=today)
        .select_related("product", "branch")
        .order_by("effective_date", "pk")
    )

    total = expired_qs.count()
    if total == 0:
        logger.info("purge_expired_product_day_availability: silinecek geçmiş kayıt yok (today=%s)", today)
        _record_purge_run_audit(
            record_audit=record_audit,
            deleted_count=0,
            cutoff_date=today,
            purge_ts=purge_ts,
            reason="no_expired_records",
        )
        return {"skipped": False, "deleted_count": 0, "branch_ids": []}

    approved_plan_keys = {
        (str(branch_id), plan_date.isoformat())
        for branch_id, plan_date in ProductionPlan.objects.filter(
            is_active=True,
            status=ProductionPlanStatus.APPROVED,
            plan_date__lt=today,
        ).values_list("branch_id", "plan_date")
    }
    deleted_ids: list[str] = []
    branch_ids: set[str] = set()
    protected_plan_keys: set[tuple[str, str]] = set()

    with transaction.atomic():
        for availability in expired_qs.iterator(chunk_size=200):
            before_json = _availability_snapshot(availability)
            plan_key = (str(availability.branch_id), availability.effective_date.isoformat())
            bypassed_manual_plan_restriction = plan_key in approved_plan_keys
            if bypassed_manual_plan_restriction:
                protected_plan_keys.add(plan_key)
            try:
                record_audit(
                    action="production_planning.availability.auto_purged",
                    target_instance=availability,
                    before_json=before_json,
                    after_json={"is_active": False},
                    metadata={
                        "reason": "expired_effective_date",
                        "manual_plan_restriction_bypassed": bypassed_manual_plan_restriction,
                        "purge_ts": purge_ts.isoformat(),
                        "cutoff_date": today.isoformat(),
                    },
                    actor=None,
                    branch=availability.branch,
                )
            except Exception:
                logger.exception(
                    "Audit kaydı oluşturulamadı (production_planning.availability.auto_purged) id=%s",
                    availability.pk,
                )

            deleted_ids.append(str(availability.pk))
            branch_ids.add(str(availability.branch_id))

        ProductDayAvailability.objects.filter(pk__in=deleted_ids).update(
            is_active=False,
            updated_at=purge_ts,
        )

        _record_purge_run_audit(
            record_audit=record_audit,
            deleted_count=len(deleted_ids),
            cutoff_date=today,
            branch_ids=sorted(branch_ids),
            protected_plan_keys=[
                {"branch_id": branch_id, "date": plan_date}
                for branch_id, plan_date in sorted(protected_plan_keys)
            ],
            purge_ts=purge_ts,
        )

    for branch_id in branch_ids:
        try:
            broadcast_menu_catalog_refresh(
                reason="availability_purge_expired",
                branch_id=branch_id,
            )
        except Exception:
            logger.exception(
                "Menü katalog WS yayını başarısız (availability_purge_expired, branch_id=%s)",
                branch_id,
            )

    logger.info(
        "purge_expired_product_day_availability: %d kayıt silindi (cutoff=%s, branches=%d)",
        len(deleted_ids),
        today,
        len(branch_ids),
    )
    return {
        "skipped": False,
        "deleted_count": len(deleted_ids),
        "branch_ids": sorted(branch_ids),
        "cutoff_date": today.isoformat(),
    }
