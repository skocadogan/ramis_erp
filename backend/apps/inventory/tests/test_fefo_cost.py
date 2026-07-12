"""FEFO lot tüketim maliyeti testleri."""

import pytest
from decimal import Decimal

from django.test import override_settings

from apps.inventory.models import StockItem, StockLot, StockMovementLot
from apps.inventory.fefo_cost import (
    estimate_fefo_consumption_unit_price,
    get_next_fefo_unit_price,
)
from apps.inventory.services.lot_consumption_service import (
    ConsumedLotLine,
    consume_lots_fefo,
    simulate_fefo_consumption,
    weighted_unit_price_from_lines,
)
from apps.warehouse.models import Warehouse


@pytest.fixture
def warehouse(db):
    return Warehouse.objects.create(name="Test Depo", code="TWH")


@pytest.fixture
def stock_item(db):
    return StockItem.objects.create(
        name="Arpa şehriye",
        sku="GDA-MIS-SEH01-TEST",
        unit="kg",
        minimum_quantity=Decimal("0"),
        last_purchase_price=Decimal("75.00"),
    )


def _create_lot(stock_item, warehouse, qty, price, lot_number=""):
    return StockLot.objects.create(
        stock_item=stock_item,
        warehouse=warehouse,
        lot_number=lot_number,
        quantity=qty,
        initial_quantity=qty,
        unit_price=price,
    )


@pytest.mark.django_db
class TestSimulateFefoConsumption:
    def test_single_lot_full_consumption(self, warehouse, stock_item):
        lot = _create_lot(stock_item, warehouse, Decimal("10"), Decimal("28.00"), "L1")
        result = simulate_fefo_consumption([lot], Decimal("3"))
        assert len(result.lines) == 1
        assert result.lines[0].quantity == Decimal("3")
        assert result.lines[0].unit_price == Decimal("28.00")
        assert result.remaining == 0
        lot.refresh_from_db()
        assert lot.quantity == Decimal("10")

    def test_multi_lot_partial_first_lot(self, warehouse, stock_item):
        lot1 = _create_lot(stock_item, warehouse, Decimal("4.63"), Decimal("28.00"), "L1")
        lot2 = _create_lot(stock_item, warehouse, Decimal("5"), Decimal("31.33"), "L2")
        lot3 = _create_lot(stock_item, warehouse, Decimal("0.5"), Decimal("75.00"), "L3")
        result = simulate_fefo_consumption(
            [lot1, lot2, lot3], Decimal("0.37")
        )
        assert len(result.lines) == 1
        assert result.lines[0].quantity == Decimal("0.37")
        assert result.lines[0].unit_price == Decimal("28.00")
        unit = weighted_unit_price_from_lines(result.lines, Decimal("0.37"))
        assert unit == Decimal("28.00")

    def test_multi_lot_spans_two_lots(self, warehouse, stock_item):
        lot1 = _create_lot(stock_item, warehouse, Decimal("1"), Decimal("28.00"), "L1")
        lot2 = _create_lot(stock_item, warehouse, Decimal("5"), Decimal("50.00"), "L2")
        result = simulate_fefo_consumption([lot1, lot2], Decimal("3"))
        assert len(result.lines) == 2
        assert result.lines[0].quantity == Decimal("1")
        assert result.lines[1].quantity == Decimal("2")
        unit = weighted_unit_price_from_lines(result.lines, Decimal("3"))
        # (1*28 + 2*50) / 3 = 42.67
        assert unit == Decimal("42.67")


@pytest.mark.django_db
class TestConsumeLotsFefo:
    def test_consumes_and_updates_lots(self, warehouse, stock_item):
        lot1 = _create_lot(stock_item, warehouse, Decimal("2"), Decimal("28.00"), "L1")
        lot2 = _create_lot(stock_item, warehouse, Decimal("5"), Decimal("31.33"), "L2")
        qs = StockLot.objects.filter(stock_item=stock_item, warehouse=warehouse)
        result = consume_lots_fefo(qs, Decimal("3"))
        assert len(result.lines) == 2
        assert result.lines[0].quantity == Decimal("2")
        assert result.lines[1].quantity == Decimal("1")
        lot1.refresh_from_db()
        lot2.refresh_from_db()
        assert lot1.quantity == Decimal("0")
        assert lot2.quantity == Decimal("4")

    def test_allow_negative_remaining(self, warehouse, stock_item):
        qs = StockLot.objects.filter(stock_item=stock_item, warehouse=warehouse)
        result = consume_lots_fefo(
            qs,
            Decimal("1"),
            allow_negative=True,
            fallback_price=Decimal("75.00"),
        )
        assert result.lines == []
        assert result.neg_lot_quantity == Decimal("1")
        assert result.neg_lot_unit_price == Decimal("75.00")


@pytest.mark.django_db
class TestWeightedUnitPrice:
    def test_empty_lines(self):
        assert weighted_unit_price_from_lines([], Decimal("1")) == Decimal("0")

    def test_from_consumed_lines(self):
        lines = [
            ConsumedLotLine(None, "A", None, Decimal("1"), Decimal("28.00")),
            ConsumedLotLine(None, "B", None, Decimal("2"), Decimal("50.00")),
        ]
        assert weighted_unit_price_from_lines(lines, Decimal("3")) == Decimal("42.67")


@pytest.mark.django_db
class TestFefoCostEstimates:
    def test_get_next_fefo_unit_price(self, warehouse, stock_item):
        _create_lot(stock_item, warehouse, Decimal("4.63"), Decimal("28.00"), "L1")
        _create_lot(stock_item, warehouse, Decimal("5"), Decimal("31.33"), "L2")
        assert get_next_fefo_unit_price(stock_item.id, warehouse.id) == Decimal("28.00")

    def test_estimate_consumption_single_lot(self, warehouse, stock_item):
        _create_lot(stock_item, warehouse, Decimal("4.63"), Decimal("28.00"), "L1")
        _create_lot(stock_item, warehouse, Decimal("5"), Decimal("31.33"), "L2")
        price = estimate_fefo_consumption_unit_price(
            stock_item.id, warehouse.id, Decimal("0.37")
        )
        assert price == Decimal("28.00")

    def test_estimate_consumption_spans_lots(self, warehouse, stock_item):
        _create_lot(stock_item, warehouse, Decimal("1"), Decimal("28.00"), "L1")
        _create_lot(stock_item, warehouse, Decimal("5"), Decimal("50.00"), "L2")
        price = estimate_fefo_consumption_unit_price(
            stock_item.id, warehouse.id, Decimal("3")
        )
        assert price == Decimal("42.67")
