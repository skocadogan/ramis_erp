from decimal import Decimal

from django.test import TestCase

from apps.branches.models import Branch
from apps.pos_display.models import PosTerminal
from apps.shifts.services import ShiftService
from apps.users.models import PosUiContext, User, UserPosScreenPreferences
from apps.users.pos_terminal_preferences import resolve_stock_tracking_mode_for_terminal


class PosTerminalStockTrackingModeTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Branch", code="TST")
        self.terminal = PosTerminal.objects.create(
            branch=self.branch,
            code="kasa-01",
            name="Kasa 1",
        )
        self.cashier = User.objects.create_user(
            username="cashier",
            email="cashier@test.com",
            password="pass12345",
        )
        self.other = User.objects.create_user(
            username="other",
            email="other@test.com",
            password="pass12345",
        )

    def test_defaults_to_product_when_no_prefs(self):
        mode = resolve_stock_tracking_mode_for_terminal(
            str(self.terminal.id),
            branch_id=str(self.branch.id),
        )
        self.assertEqual(mode, "PRODUCT")

    def test_uses_open_shift_opener_pos_prefs(self):
        UserPosScreenPreferences.objects.create(
            user=self.cashier,
            ui_context=PosUiContext.POS,
            data={"stock_tracking_mode": "INGREDIENT"},
        )
        ShiftService.open_shift(
            branch_id=str(self.branch.id),
            user=self.cashier,
            opening_cash=Decimal("0"),
            at_terminal_id=str(self.terminal.id),
        )

        mode = resolve_stock_tracking_mode_for_terminal(
            str(self.terminal.id),
            branch_id=str(self.branch.id),
        )
        self.assertEqual(mode, "INGREDIENT")

    def test_falls_back_to_assigned_pos_terminal_prefs(self):
        UserPosScreenPreferences.objects.create(
            user=self.other,
            ui_context=PosUiContext.POS,
            data={
                "stock_tracking_mode": "INGREDIENT",
                "assigned_pos_terminal_uuid": str(self.terminal.id),
            },
        )

        mode = resolve_stock_tracking_mode_for_terminal(
            str(self.terminal.id),
            branch_id=str(self.branch.id),
        )
        self.assertEqual(mode, "INGREDIENT")

    def test_open_shift_prefs_take_priority_over_assigned_terminal(self):
        UserPosScreenPreferences.objects.create(
            user=self.cashier,
            ui_context=PosUiContext.POS,
            data={"stock_tracking_mode": "INGREDIENT"},
        )
        UserPosScreenPreferences.objects.create(
            user=self.other,
            ui_context=PosUiContext.POS,
            data={
                "stock_tracking_mode": "PRODUCT",
                "assigned_pos_terminal_uuid": str(self.terminal.id),
            },
        )
        ShiftService.open_shift(
            branch_id=str(self.branch.id),
            user=self.cashier,
            opening_cash=Decimal("0"),
            at_terminal_id=str(self.terminal.id),
        )

        mode = resolve_stock_tracking_mode_for_terminal(
            str(self.terminal.id),
            branch_id=str(self.branch.id),
        )
        self.assertEqual(mode, "INGREDIENT")
