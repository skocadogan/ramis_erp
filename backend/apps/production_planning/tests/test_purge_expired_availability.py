import pytest
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.audit.models import AuditLog
from apps.menu.models import Category, Product
from apps.production_planning.models import (
    AvailabilityMode,
    ProductDayAvailability,
    ProductionPlan,
    ProductionPlanLine,
    ProductionPlanStatus,
)
from apps.production_planning.services.availability_purge_service import (
    purge_expired_product_day_availability,
)
from apps.production_planning.tasks import purge_expired_product_day_availability as purge_task


@pytest.fixture
def branch(db):
    from apps.branches.models import Branch

    return Branch.objects.create(name="Test Branch", code="TST")


@pytest.fixture
def product(db):
    category = Category.objects.create(name="Ana Yemek")
    return Product.objects.create(
        category=category,
        name="Köfte",
        base_price=Decimal("100.00"),
    )


def _create_availability(*, branch, product, effective_date, mode=AvailabilityMode.SOLD_OUT):
    return ProductDayAvailability.objects.create(
        branch=branch,
        product=product,
        effective_date=effective_date,
        mode=mode,
        reason="test",
    )


@pytest.mark.django_db
class TestPurgeExpiredProductDayAvailability:
    def test_skips_when_disabled(self, branch, product):
        today = timezone.localdate()
        past = today - timedelta(days=1)
        _create_availability(branch=branch, product=product, effective_date=past)

        result = purge_expired_product_day_availability(enabled=False)

        assert result["skipped"] is True
        assert result["deleted_count"] == 0
        assert ProductDayAvailability.objects.filter(is_active=True).count() == 1
        audit = AuditLog.objects.get(
            action="production_planning.availability.purge_expired_skipped"
        )
        assert audit.metadata["reason"] == "BEAT_PURGE_EXPIRED_86_ENABLED=false"
        assert audit.metadata["skipped"] is True
        assert audit.metadata["deleted_count"] == 0

    def test_deletes_past_records_keeps_today(self, branch, product):
        today = timezone.localdate()
        past = today - timedelta(days=2)
        yesterday = today - timedelta(days=1)

        past_rec = _create_availability(branch=branch, product=product, effective_date=past)
        yesterday_rec = _create_availability(
            branch=branch,
            product=Product.objects.create(
                category=product.category,
                name="Pilav",
                base_price=Decimal("50.00"),
            ),
            effective_date=yesterday,
        )
        today_rec = _create_availability(
            branch=branch,
            product=Product.objects.create(
                category=product.category,
                name="Çorba",
                base_price=Decimal("30.00"),
            ),
            effective_date=today,
        )

        result = purge_expired_product_day_availability(enabled=True)

        assert result["skipped"] is False
        assert result["deleted_count"] == 2
        assert str(branch.id) in result["branch_ids"]

        past_rec.refresh_from_db()
        yesterday_rec.refresh_from_db()
        today_rec.refresh_from_db()
        assert past_rec.is_active is False
        assert yesterday_rec.is_active is False
        assert today_rec.is_active is True

        assert AuditLog.objects.filter(
            action="production_planning.availability.auto_purged"
        ).count() == 2
        assert AuditLog.objects.filter(
            action="production_planning.availability.purge_expired_completed"
        ).count() == 1

    def test_deletes_expired_plan_availability_without_deleting_plan(
        self, branch, product
    ):
        today = timezone.localdate()
        past = today - timedelta(days=1)
        plan = ProductionPlan.objects.create(
            branch=branch,
            plan_date=past,
            status=ProductionPlanStatus.APPROVED,
        )
        ProductionPlanLine.objects.create(
            plan=plan,
            product=product,
            target_quantity=Decimal("10"),
        )
        availability = _create_availability(
            branch=branch,
            product=product,
            effective_date=past,
            mode=AvailabilityMode.LIMITED,
        )

        result = purge_expired_product_day_availability(enabled=True)

        assert result["deleted_count"] == 1
        availability.refresh_from_db()
        plan.refresh_from_db()
        assert availability.is_active is False
        assert plan.is_active is True

        batch_audit = AuditLog.objects.get(
            action="production_planning.availability.purge_expired_completed"
        )
        assert batch_audit.metadata["protected_plan_keys"] == [
            {"branch_id": str(branch.id), "date": past.isoformat()}
        ]
        item_audit = AuditLog.objects.get(
            action="production_planning.availability.auto_purged"
        )
        assert item_audit.metadata["manual_plan_restriction_bypassed"] is True

    def test_no_op_when_no_expired_records(self, branch, product):
        today = timezone.localdate()
        _create_availability(branch=branch, product=product, effective_date=today)

        result = purge_expired_product_day_availability(enabled=True)

        assert result["deleted_count"] == 0
        audit = AuditLog.objects.get(
            action="production_planning.availability.purge_expired_completed"
        )
        assert audit.metadata["reason"] == "no_expired_records"
        assert audit.metadata["deleted_count"] == 0

    def test_celery_task_delegates_to_service(self, branch, product, monkeypatch):
        called = {}

        def fake_purge(*, enabled=None):
            called["enabled"] = enabled
            return {"deleted_count": 0, "skipped": False}

        monkeypatch.setattr(
            "apps.production_planning.services.availability_purge_service.purge_expired_product_day_availability",
            fake_purge,
        )

        purge_task(enabled=True)
        assert called["enabled"] is True
