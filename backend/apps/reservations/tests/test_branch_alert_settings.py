"""Rezervasyon geliş bildirimi şube ayarları ve lead/interval testleri."""
from __future__ import annotations

import datetime
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.branches.models import Branch, Table, TableStatus, Zone
from apps.reservations.models import Reservation, ReservationBranchSettings, ReservationStatus
from apps.reservations.reservation_alerts import (
    clear_reservation_alert_settings_cache,
    find_due_reservations,
    notify_reservation_due,
)
from apps.reservations.services import ReservationService
from apps.users.models import User


class ReservationBranchAlertSettingsTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Test Branch", code="TB")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T1",
            table_number=1,
            status=TableStatus.FREE,
        )
        self.user = User.objects.create_user(
            username="manager1",
            password="x",
            branch=self.branch,
            is_staff=True,
            is_superuser=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_reservation(self, *, minutes_from_now: int) -> Reservation:
        scheduled = timezone.localtime() + datetime.timedelta(minutes=minutes_from_now)
        return Reservation.objects.create(
            branch=self.branch,
            table=self.table,
            customer_name="Ayşe Demir",
            party_size=2,
            scheduled_date=scheduled.date(),
            scheduled_time=scheduled.time(),
            status=ReservationStatus.CONFIRMED,
        )

    def test_lead_minutes_includes_upcoming_reservation(self):
        clear_reservation_alert_settings_cache()
        ReservationService.upsert_branch_settings(
            str(self.branch.id),
            due_alert_lead_minutes=30,
            due_alert_interval_minutes=5,
        )
        reservation = self._create_reservation(minutes_from_now=20)
        due_ids = {str(r.id) for r in find_due_reservations()}
        self.assertIn(str(reservation.id), due_ids)

    def test_lead_minutes_excludes_far_future_reservation(self):
        clear_reservation_alert_settings_cache()
        ReservationService.upsert_branch_settings(
            str(self.branch.id),
            due_alert_lead_minutes=10,
            due_alert_interval_minutes=5,
        )
        reservation = self._create_reservation(minutes_from_now=30)
        due_ids = {str(r.id) for r in find_due_reservations()}
        self.assertNotIn(str(reservation.id), due_ids)

    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_waiter_call")
    @patch("apps.reservations.reservation_alerts.NotificationService.broadcast_to_staff_notifications_branch")
    @patch("apps.reservations.reservation_alerts.dismiss_pending_due_alerts")
    def test_interval_allows_repeat_notification(
        self, mock_dismiss, mock_staff, mock_waiter_call
    ):
        clear_reservation_alert_settings_cache()
        ReservationService.upsert_branch_settings(
            str(self.branch.id),
            due_alert_lead_minutes=60,
            due_alert_interval_minutes=5,
        )
        reservation = self._create_reservation(minutes_from_now=10)
        self.assertTrue(notify_reservation_due(reservation))
        reservation.refresh_from_db()
        first_notified = reservation.due_notified_at
        self.assertIsNotNone(first_notified)

        self.assertFalse(notify_reservation_due(reservation))
        mock_dismiss.assert_not_called()

        later = first_notified + datetime.timedelta(minutes=5)
        with patch("django.utils.timezone.now", return_value=later):
            self.assertTrue(notify_reservation_due(reservation))
        mock_dismiss.assert_called_once()

    def test_branch_settings_get_defaults_without_row(self):
        response = self.client.get(
            "/api/v1/reservations/branch-settings/by-branch/",
            {"branch_id": str(self.branch.id)},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["due_alert_lead_minutes"], 15)
        self.assertEqual(response.data["due_alert_interval_minutes"], 5)

    def test_branch_settings_patch_persists(self):
        response = self.client.patch(
            "/api/v1/reservations/branch-settings/by-branch/",
            {
                "branch": str(self.branch.id),
                "due_alert_lead_minutes": 20,
                "due_alert_interval_minutes": 3,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        row = ReservationBranchSettings.objects.get(branch=self.branch)
        self.assertEqual(row.due_alert_lead_minutes, 20)
        self.assertEqual(row.due_alert_interval_minutes, 3)
