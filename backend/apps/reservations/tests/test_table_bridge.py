"""Masa rezervasyonu → Reservation satırı köprüsü."""
from __future__ import annotations

import datetime
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.branches.models import Branch, Table, TableStatus, Zone
from apps.branches.services import TableService
from apps.reservations.models import Reservation, ReservationStatus
from apps.reservations.reservation_alerts import find_due_reservations, notify_reservation_due


class TableReservationBridgeTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Bridge Branch", code="BB")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T5",
            table_number=5,
            status=TableStatus.FREE,
        )

    def test_reserve_table_creates_reservation_row(self):
        scheduled = timezone.now() + datetime.timedelta(hours=2)
        TableService.reserve_table(
            self.table.id,
            "Ayşe Demir · 5551234567",
            reservation_scheduled_at=scheduled,
            reservation_party_size=3,
        )
        r = Reservation.objects.get(table_id=self.table.id)
        self.assertEqual(r.customer_name, "Ayşe Demir")
        self.assertEqual(r.customer_phone, "5551234567")
        self.assertEqual(r.party_size, 3)
        self.assertEqual(r.status, ReservationStatus.CONFIRMED)

    def test_reserve_table_without_schedule_skips_reservation_row(self):
        TableService.reserve_table(
            self.table.id,
            "Misafir isimsiz",
            reservation_scheduled_at=None,
        )
        self.assertFalse(Reservation.objects.filter(table_id=self.table.id).exists())

    def test_cancel_reservation_cancels_linked_row(self):
        past = timezone.now() - datetime.timedelta(minutes=10)
        TableService.reserve_table(
            self.table.id,
            "Mehmet Kaya",
            reservation_scheduled_at=past,
            reservation_party_size=2,
        )
        r = Reservation.objects.get(table_id=self.table.id)
        TableService.cancel_reservation(self.table.id)
        r.refresh_from_db()
        self.assertEqual(r.status, ReservationStatus.CANCELLED)
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, TableStatus.FREE)

    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_waiter_call")
    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_to_staff_notifications_branch")
    def test_table_reserve_triggers_due_alert_pipeline(self, mock_staff, mock_waiter):
        past = timezone.now() - datetime.timedelta(minutes=5)
        TableService.reserve_table(
            self.table.id,
            "Zeynep Aydın",
            reservation_scheduled_at=past,
            reservation_party_size=4,
        )
        r = Reservation.objects.get(table_id=self.table.id)
        due_ids = {str(x.id) for x in find_due_reservations()}
        self.assertIn(str(r.id), due_ids)
        self.assertTrue(notify_reservation_due(r))
        mock_waiter.assert_called_once()
