"""Minimum stok eşiği ve düşük stok karşılaştırması — sınır testleri."""

from decimal import Decimal

import pytest

from apps.branches.models import Branch
from apps.inventory.models import StockItem, StockUnit
from apps.inventory.stock_minimum import (
    MINIMUM_UNLIMITED_SENTINEL,
    has_positive_minimum_threshold,
    is_quantity_below_minimum,
    q_low_stock_warehouse_level,
)
from apps.warehouse.models import Warehouse, WarehouseStockLevel, WarehouseType


@pytest.fixture
def kitchen_warehouse(db):
    branch = Branch.objects.create(name="Test Branch", code="TST-MIN")
    wh = Warehouse.objects.create(
        name="Mutfak",
        code="WH-MIN-K",
        warehouse_type=WarehouseType.KITCHEN,
        is_default=True,
    )
    wh.branches.add(branch)
    return wh


@pytest.fixture
def stock_item_a(db):
    StockUnit.objects.get_or_create(
        short_name="kg",
        defaults={"name": "Kilogram", "multiplier": Decimal("1.000")},
    )
    return StockItem.objects.create(
        name="Kalem A",
        sku="MIN-A-001",
        unit="kg",
        minimum_quantity=Decimal("1.000"),
    )


@pytest.fixture
def stock_item_b(db):
    return StockItem.objects.create(
        name="Kalem B",
        sku="MIN-B-001",
        unit="kg",
        minimum_quantity=Decimal("1.000"),
    )


@pytest.mark.parametrize(
    "quantity,minimum,expected",
    [
        (Decimal("1"), Decimal("1"), False),
        (Decimal("5"), Decimal("5"), False),
        (Decimal("0.99"), Decimal("1"), True),
        (Decimal("4.99"), Decimal("5"), True),
        (Decimal("2.5"), Decimal("1"), False),
        (Decimal("0"), Decimal("1"), True),
        (Decimal("0"), Decimal("0"), False),
        (Decimal("1"), Decimal("0"), False),
        (Decimal("1"), MINIMUM_UNLIMITED_SENTINEL, False),
    ],
)
def test_is_quantity_below_minimum(quantity, minimum, expected):
    assert is_quantity_below_minimum(quantity, minimum) is expected


def test_has_positive_minimum_threshold():
    assert has_positive_minimum_threshold(Decimal("1")) is True
    assert has_positive_minimum_threshold(Decimal("0")) is False
    assert has_positive_minimum_threshold(MINIMUM_UNLIMITED_SENTINEL) is False


@pytest.mark.django_db
def test_warehouse_stock_level_is_low_stock_at_equality(kitchen_warehouse, stock_item_a):
    level = WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_a,
        quantity=Decimal("1.000"),
        minimum_quantity=Decimal("1.000"),
    )
    assert level.is_low_stock is False


@pytest.mark.django_db
def test_warehouse_stock_level_is_low_stock_below_minimum(kitchen_warehouse, stock_item_a):
    level = WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_a,
        quantity=Decimal("0.999"),
        minimum_quantity=Decimal("1.000"),
    )
    assert level.is_low_stock is True


@pytest.mark.django_db
def test_q_low_stock_warehouse_level_excludes_equality(
    kitchen_warehouse, stock_item_a, stock_item_b,
):
    at_min = WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_a,
        quantity=Decimal("1.000"),
        minimum_quantity=Decimal("1.000"),
    )
    below = WarehouseStockLevel.objects.create(
        warehouse=kitchen_warehouse,
        stock_item=stock_item_b,
        quantity=Decimal("0.500"),
        minimum_quantity=Decimal("1.000"),
    )
    ids = set(
        WarehouseStockLevel.objects.filter(warehouse=kitchen_warehouse)
        .filter(q_low_stock_warehouse_level())
        .values_list("id", flat=True)
    )
    assert at_min.id not in ids
    assert below.id in ids
