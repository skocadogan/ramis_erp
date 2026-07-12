from decimal import Decimal
import logging

from core.decimal_constants import ZERO_MONEY
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext as _

from apps.orders.models import Order, OrderStatus
from apps.shifts.models import CashMovementType, Shift, ShiftExpense, ShiftCashMovement, ShiftStatus
from apps.shifts.selectors import get_active_shift, get_shift_z_report

logger = logging.getLogger(__name__)


class ShiftError(Exception):
    pass


def branch_has_unpaid_open_orders(branch_id) -> bool:
    """Satış kaydı olmayan, henüz sonuçlanmamış sipariş var mı (açık hesap)."""
    return (
        Order.objects.filter(branch_id=branch_id, sale__isnull=True)
        .exclude(status__in=[OrderStatus.COMPLETED, OrderStatus.CANCELLED])
        .exists()
    )


class ShiftService:
    @staticmethod
    def _broadcast_shift_update(branch_id: str, shift_id: str, status: str):
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        from apps.branches.signals import POS_SYNC_GLOBAL

        channel_layer = get_channel_layer()
        if channel_layer:
            event = {
                "type": "shift_event",
                "data": {
                    "shift_id": str(shift_id),
                    "branch_id": str(branch_id),
                    "status": status,
                },
            }

            async def _send() -> None:
                await channel_layer.group_send(f"pos_sync_{branch_id}", event)
                await channel_layer.group_send(POS_SYNC_GLOBAL, event)

            try:
                async_to_sync(_send)()
            except Exception:
                logger.exception("shift_event WebSocket yayını başarısız (branch_id=%s)", branch_id)

    @staticmethod
    @transaction.atomic
    def open_shift(branch_id, user, opening_cash: Decimal = ZERO_MONEY, at_terminal_id: str = None) -> Shift:
        if get_active_shift(branch_id, terminal_id=at_terminal_id):
            if at_terminal_id:
                raise ShiftError(_("Bu terminalde zaten açık bir vardiya var."))
            else:
                raise ShiftError(_("Bu şubede zaten açık bir (genel) vardiya var."))

        shift = Shift.objects.create(
            branch_id=branch_id,
            opened_by=user,
            opening_cash=opening_cash,
            status=ShiftStatus.OPEN,
            opened_at_terminal_id=at_terminal_id,
        )
        from apps.audit.services import record_audit

        record_audit(
            action="shift.opened",
            target_instance=shift,
            after_json={
                "opening_cash": str(opening_cash),
                "terminal_id": at_terminal_id or "",
            },
            actor=user,
            branch=shift.branch,
        )
        ShiftService._broadcast_shift_update(branch_id, str(shift.id), "OPEN")
        return shift

    @staticmethod
    @transaction.atomic
    def close_shift(
        shift_id,
        user,
        actual_cash: Decimal,
        actual_card: Decimal = ZERO_MONEY,
        actual_other: Decimal = ZERO_MONEY,
        notes: str = "",
    ) -> Shift:
        shift = Shift.objects.select_for_update().get(pk=shift_id)
        if shift.status != ShiftStatus.OPEN:
            raise ShiftError(_("Bu vardiya zaten kapalı."))

        if branch_has_unpaid_open_orders(shift.branch_id):
            raise ShiftError(
                _("Ödemesi alınmamış açık hesaplar (masa veya sipariş) varken vardiya kapatılamaz. "
                  "Önce tüm hesapları kapatın.")
            )

        report = get_shift_z_report(str(shift.id))
        expected_cash = Decimal(str(report["shift"]["expected_cash"]))
        expected_card = Decimal(str(report["payment_breakdown"]["CARD"]))
        expected_other = Decimal(str(report["payment_breakdown"]["OTHER"]))

        shift.status = ShiftStatus.CLOSED
        shift.closed_by = user
        shift.closed_at = timezone.now()

        # Cash
        shift.expected_cash = expected_cash
        shift.actual_cash = actual_cash
        shift.difference = actual_cash - expected_cash

        # Card
        shift.expected_card = expected_card
        shift.actual_card = actual_card
        shift.difference_card = actual_card - expected_card

        # Other
        shift.expected_other = expected_other
        shift.actual_other = actual_other
        shift.difference_other = actual_other - expected_other

        if notes:
            shift.notes = (shift.notes + "\n" + notes).strip() if shift.notes else notes

        shift.save(
            update_fields=[
                "status",
                "closed_by",
                "closed_at",
                "expected_cash",
                "actual_cash",
                "difference",
                "expected_card",
                "actual_card",
                "difference_card",
                "expected_other",
                "actual_other",
                "difference_other",
                "notes",
                "updated_at",
            ]
        )

        from apps.audit.services import record_audit

        record_audit(
            action="shift.closed",
            target_instance=shift,
            after_json={
                "expected_cash": str(expected_cash),
                "actual_cash": str(actual_cash),
                "difference": str(shift.difference),
                "expected_card": str(expected_card),
                "actual_card": str(actual_card),
                "expected_other": str(expected_other),
                "actual_other": str(actual_other),
            },
            actor=user,
            branch=shift.branch,
            metadata={"notes": notes or ""},
        )

        ShiftService._broadcast_shift_update(shift.branch_id, str(shift.id), "CLOSED")

        from apps.branches.waiter_call_pending import expire_pending_waiter_calls

        expire_pending_waiter_calls(branch_id=str(shift.branch_id))

        return shift

    @staticmethod
    @transaction.atomic
    def add_expense(shift_id, description: str, amount: Decimal, user) -> ShiftExpense:
        shift = Shift.objects.select_for_update().get(pk=shift_id)
        if shift.status != ShiftStatus.OPEN:
            raise ShiftError(_("Kapalı vardiyaya gider eklenemez."))
        expense = ShiftExpense.objects.create(
            shift=shift,
            description=description,
            amount=amount,
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
        )
        from apps.audit.services import record_audit

        record_audit(
            action="shift.expense_added",
            target_instance=expense,
            after_json={"description": description, "amount": str(amount)},
            actor=user,
            branch=shift.branch,
        )
        return expense

    @staticmethod
    @transaction.atomic
    def add_cash_movement(
        shift_id, amount: Decimal, movement_type: str, description: str, user
    ) -> ShiftCashMovement:
        if movement_type not in (CashMovementType.IN, CashMovementType.OUT):
            raise ShiftError(_("Geçersiz hareket tipi (IN/OUT)."))
        shift = Shift.objects.select_for_update().get(pk=shift_id)
        if shift.status != ShiftStatus.OPEN:
            raise ShiftError(_("Kapalı vardiyaya nakit hareketi eklenemez."))
        movement = ShiftCashMovement.objects.create(
            shift=shift,
            amount=amount,
            movement_type=movement_type,
            description=description or "",
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
        )
        from apps.audit.services import record_audit

        action = (
            "shift.cash_movement.in"
            if movement_type == CashMovementType.IN
            else "shift.cash_movement.out"
        )
        record_audit(
            action=action,
            target_instance=movement,
            after_json={
                "amount": str(amount),
                "movement_type": movement_type,
                "description": description or "",
            },
            actor=user,
            branch=shift.branch,
        )
        return movement
    @staticmethod
    @transaction.atomic
    def update_closing_info(
        shift_id,
        user,
        actual_cash: Decimal,
        actual_card: Decimal = ZERO_MONEY,
        actual_other: Decimal = ZERO_MONEY,
        notes: str = "",
    ) -> Shift:
        from apps.audit.services import record_audit

        shift = Shift.objects.select_for_update().get(pk=shift_id)
        if shift.status != ShiftStatus.CLOSED:
            raise ShiftError(_("Sadece kapalı vardiyalar düzenlenebilir."))

        # Capture state before changes
        before = {
            "actual_cash": str(shift.actual_cash),
            "actual_card": str(shift.actual_card),
            "actual_other": str(shift.actual_other),
            "notes": shift.notes,
        }

        # Update totals
        shift.actual_cash = actual_cash
        shift.difference = actual_cash - shift.expected_cash

        shift.actual_card = actual_card
        shift.difference_card = actual_card - shift.expected_card

        shift.actual_other = actual_other
        shift.difference_other = actual_other - shift.expected_other

        if notes:
            shift.notes = notes

        shift.save(
            update_fields=[
                "actual_cash",
                "difference",
                "actual_card",
                "difference_card",
                "actual_other",
                "difference_other",
                "notes",
                "updated_at",
            ]
        )

        # Capture state after changes
        after = {
            "actual_cash": str(shift.actual_cash),
            "actual_card": str(shift.actual_card),
            "actual_other": str(shift.actual_other),
            "notes": shift.notes,
        }

        # Record audit
        record_audit(
            action="shift.update_closing",
            target_instance=shift,
            before_json=before,
            after_json=after,
            actor=user,
            metadata={"reason": "Manual correction by authorized user"}
        )

        return shift
