"""
Vardiya selector testleri — Z-raporu ödeme kırılımı (CREDIT ayrı) ve
kasa hareketi (IN/OUT) doğruluğunu test eder.
"""
import pytest
from decimal import Decimal

from core.decimal_constants import ZERO_MONEY
from apps.branches.models import Branch
from apps.sales.models import PaymentMethod, Sale
from apps.orders.models import Order, OrderStatus
from apps.shifts.models import Shift, ShiftStatus
from apps.shifts.selectors import get_shift_z_report, _payment_breakdown_for_sale
from apps.shifts.services import ShiftService

User = None  # get_user_model() lazım değil; fixture üzerinden gelecek


@pytest.fixture
def branch(db):
    return Branch.objects.create(name="Test Şube", code="TST")


@pytest.fixture
def shift(db, branch):
    user = _create_user(branch, "shiftuser")
    return Shift.objects.create(
        branch=branch,
        status=ShiftStatus.OPEN,
        opened_by=user,
        opening_cash=Decimal("100.00"),
    )


def _create_user(branch, username):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    return User.objects.create_user(username=username, password="pass", email=f"{username}@test.com", branch=branch)


def _make_sale(branch, shift, payment_method, amount):
    order = Order.objects.create(
        branch=branch,
        status=OrderStatus.COMPLETED,
        total_amount=amount,
    )
    return Sale.objects.create(
        branch=branch,
        shift=shift,
        order=order,
        payment_method=payment_method,
        total_amount=amount,
        discount_amount=ZERO_MONEY,
    )


class TestPaymentBreakdown:
    """_payment_breakdown_for_sale doğruluğunu test eder."""

    def test_cash_sale(self, db, branch, shift):
        sale = _make_sale(branch, shift, PaymentMethod.CASH, Decimal("50.00"))
        br = _payment_breakdown_for_sale(sale)
        assert br[PaymentMethod.CASH] == Decimal("50.00")
        assert br[PaymentMethod.CREDIT] == ZERO_MONEY

    def test_card_sale(self, db, branch, shift):
        sale = _make_sale(branch, shift, PaymentMethod.CARD, Decimal("75.00"))
        br = _payment_breakdown_for_sale(sale)
        assert br[PaymentMethod.CARD] == Decimal("75.00")
        assert br[PaymentMethod.CREDIT] == ZERO_MONEY

    def test_credit_sale_isolated(self, db, branch, shift):
        """CREDIT satışlar OTHER'a karışmamalı, ayrı tutulmalı."""
        sale = _make_sale(branch, shift, PaymentMethod.CREDIT, Decimal("120.00"))
        br = _payment_breakdown_for_sale(sale)
        assert br[PaymentMethod.CREDIT] == Decimal("120.00")
        assert br[PaymentMethod.OTHER] == ZERO_MONEY
        assert br[PaymentMethod.CASH] == ZERO_MONEY


class TestZReportCreditField:
    """Z-raporu payment_breakdown içinde CREDIT alanını doğrular."""

    def test_credit_appears_in_z_report(self, db, branch, shift):
        _make_sale(branch, shift, PaymentMethod.CASH, Decimal("200.00"))
        _make_sale(branch, shift, PaymentMethod.CREDIT, Decimal("150.00"))

        report = get_shift_z_report(shift.id)
        pb = report["payment_breakdown"]

        assert "CREDIT" in pb
        assert pb["CREDIT"] == Decimal("150.00")
        assert pb["CASH"] == Decimal("200.00")

    def test_credit_not_merged_into_other(self, db, branch, shift):
        _make_sale(branch, shift, PaymentMethod.CREDIT, Decimal("80.00"))

        report = get_shift_z_report(shift.id)
        pb = report["payment_breakdown"]

        assert pb["CREDIT"] == Decimal("80.00")
        assert pb["OTHER"] == ZERO_MONEY

    def test_z_report_has_required_keys(self, db, branch, shift):
        report = get_shift_z_report(shift.id)
        pb = report["payment_breakdown"]
        for key in ("CASH", "CARD", "OTHER", "CREDIT"):
            assert key in pb, f"payment_breakdown içinde {key} eksik"


class TestCashMovements:
    """Kasa hareketi (IN/OUT) testleri."""

    @pytest.fixture
    def user(self, db, branch):
        return _create_user(branch, "cashuser2")

    def test_income_movement_type_in(self, db, branch, shift, user):
        from apps.shifts.models import ShiftCashMovement
        ShiftService.add_cash_movement(
            shift_id=shift.id,
            movement_type="IN",
            amount=Decimal("50.00"),
            description="Nakit gelir",
            user=user,
        )
        assert ShiftCashMovement.objects.filter(shift=shift, movement_type="IN").exists()

    def test_expense_movement_type_out(self, db, branch, shift, user):
        from apps.shifts.models import ShiftCashMovement
        ShiftService.add_cash_movement(
            shift_id=shift.id,
            movement_type="OUT",
            amount=Decimal("30.00"),
            description="Nakit gider",
            user=user,
        )
        assert ShiftCashMovement.objects.filter(shift=shift, movement_type="OUT").exists()

    def test_z_report_cash_movement_net(self, db, branch, shift, user):
        """Kasa hareketi net tutarı doğru hesaplanmalı."""
        ShiftService.add_cash_movement(shift_id=shift.id, movement_type="IN", amount=Decimal("100.00"), description="Gelir", user=user)
        ShiftService.add_cash_movement(shift_id=shift.id, movement_type="OUT", amount=Decimal("40.00"), description="Gider", user=user)

        report = get_shift_z_report(shift.id)
        assert report["cash_movements_net"] == Decimal("60.00")
