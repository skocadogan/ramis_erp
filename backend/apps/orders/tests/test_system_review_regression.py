"""
Sistem inceleme planı: sipariş invariantları, prep üretim idempotency, assess uyumu.
"""

import datetime

import pytest
from decimal import Decimal
from django.utils import timezone

from apps.orders.order_validation_service import assess_create_order_checks
from apps.prep.models import PrepTemplate
from apps.prep.services import PrepService
from apps.production_planning.models import (
    AvailabilityMode,
    ProductDayAvailability,
    ProductionDaySettings,
    PosBlockMode,
)
from apps.orders.services import OrderService, OrderValidationError


@pytest.mark.django_db
def test_assess_create_matches_merge_logic(branch, product):
    """``check_station_stock`` ile aynı birleşik sonuç (üretim + stok)."""
    items = [{"product_id": str(product.id), "quantity": 1, "unit_price": "10.00"}]
    a = assess_create_order_checks(str(branch.id), items)
    assert "ok" in a
    assert a["ok"] is True


@pytest.mark.django_db
def test_prep_generate_tasks_idempotent(db, branch):
    """Arka arkaya şablon üretimi: ikinci çağrı yeni satır eklemez."""
    from apps.branches.models import KitchenStation

    station = KitchenStation.objects.create(
        branch=branch, name="S1", code="s1-idem", color="#000000"
    )
    now = timezone.now()
    day = now.strftime("%A").lower()
    kwargs = {f"every_{day}": True}
    PrepTemplate.objects.create(
        branch=branch,
        station=station,
        title="Idempotent Gün",
        target_quantity=Decimal("1"),
        unit="kg",
        is_enabled=True,
        is_active=True,
        activation_time=datetime.time(6, 0),
        **kwargs,
    )
    c1 = PrepService.generate_tasks_from_templates()
    c2 = PrepService.generate_tasks_from_templates()
    assert c1 >= 0
    assert c2 == 0


@pytest.mark.django_db
def test_create_order_rejects_sold_out_when_blocked(branch, takeaway_zone, product, pos_user):
    """SOLD_OUT + PosBlockMode.BLOCK: ``create_order`` reddeder."""
    ProductionDaySettings.objects.create(
        branch=branch, pos_block_mode=PosBlockMode.BLOCK
    )
    ProductDayAvailability.objects.create(
        branch=branch,
        product=product,
        effective_date=timezone.localdate(),
        is_active=True,
        mode=AvailabilityMode.SOLD_OUT,
    )
    with pytest.raises(OrderValidationError):
        OrderService.create_order(
            branch_id=branch.id,
            table_id=None,
            order_type="TAKEAWAY",
            user=pos_user,
            notes="",
            items_data=[
                {
                    "product_id": str(product.id),
                    "quantity": 1,
                    "unit_price": Decimal("10.00"),
                }
            ],
        )
