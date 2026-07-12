"""Rezervasyon saati ve misafir geldi bildirim testleri."""
from __future__ import annotations

import datetime
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.branches.models import Branch, Table, TableStatus, Zone
from apps.branches.services import TableService
from apps.performances.models import WaiterCallLog, WaiterCallStatus
from apps.reservations.models import Reservation, ReservationStatus
from apps.reservations.reservation_alerts import (
    RESERVATION_ARRIVED_SOURCE,
    RESERVATION_DUE_SOURCE,
    find_due_reservations,
    notify_reservation_due,
)
from apps.reservations.services import ReservationService
from apps.reservations.tasks import notify_due_reservations
from apps.users.models import User


class ReservationAlertsTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Branch", code="TB")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T1",
            table_number=1,
            status=TableStatus.FREE,
        )
        User.objects.create_user(username="waiter1", password="x")
        today = timezone.localdate()
        past_time = (timezone.localtime() - datetime.timedelta(minutes=5)).time()
        self.reservation = Reservation.objects.create(
            branch=self.branch,
            table=self.table,
            customer_name="Ahmet Yılmaz",
            party_size=4,
            scheduled_date=today,
            scheduled_time=past_time,
            status=ReservationStatus.CONFIRMED,
        )

    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_waiter_call")
    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_to_staff_notifications_branch")
    def test_notify_reservation_due_is_idempotent_within_interval(
        self, mock_staff, mock_waiter_call
    ):
        self.assertTrue(notify_reservation_due(self.reservation))
        self.reservation.refresh_from_db()
        self.assertIsNotNone(self.reservation.due_notified_at)
        mock_waiter_call.assert_called_once()

        self.assertFalse(notify_reservation_due(self.reservation))
        mock_waiter_call.assert_called_once()

    def test_find_due_reservations_includes_past_confirmed(self):
        due = find_due_reservations()
        ids = {str(r.id) for r in due}
        self.assertIn(str(self.reservation.id), ids)

    @patch("apps.reservations.reservation_alerts.find_due_reservations")
    @patch("apps.reservations.reservation_alerts.notify_reservation_due")
    def test_celery_task_calls_notify(self, mock_notify, mock_find):
        mock_find.return_value = [self.reservation]
        mock_notify.return_value = True
        count = notify_due_reservations()
        self.assertEqual(count, 1)
        mock_notify.assert_called_once()

    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_waiter_call")
    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_to_staff_notifications_branch")
    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_waiter_call_dismissed")
    def test_seat_dismisses_due_alert_and_notifies_arrived(
        self, mock_dismiss, mock_staff, mock_waiter_call
    ):
        notify_reservation_due(self.reservation)
        due_log = WaiterCallLog.objects.get(
            reservation_id=self.reservation.id,
            source=RESERVATION_DUE_SOURCE,
        )
        self.assertEqual(due_log.status, WaiterCallStatus.PENDING)

        ReservationService.seat(str(self.reservation.id))

        due_log.refresh_from_db()
        self.assertEqual(due_log.status, WaiterCallStatus.DISMISSED)
        arrived = WaiterCallLog.objects.filter(
            reservation_id=self.reservation.id,
            source=RESERVATION_ARRIVED_SOURCE,
            status=WaiterCallStatus.PENDING,
        )
        self.assertEqual(arrived.count(), 1)
        mock_dismiss.assert_called()

    @patch("apps.reservations.reservation_alerts.notify_reservation_arrived")
    def test_open_reserved_table_notifies_arrived(self, mock_arrived):
        self.table.status = TableStatus.RESERVED
        self.table.reservation_info = "Ahmet"
        self.table.save()
        with self.captureOnCommitCallbacks(execute=True):
            TableService.open_table(self.table.id)
        mock_arrived.assert_called_once()
        args = mock_arrived.call_args[0]
        self.assertEqual(str(args[0].id), str(self.reservation.id))
