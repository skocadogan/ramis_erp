from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse

from apps.branches.call_waiter import CallWaiterBadRequest, CallWaiterNotFound, call_waiter
from apps.branches.models import Branch, Table, TableStatus, WaiterBranchAssignment, Zone

User = get_user_model()


class CallWaiterServiceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.branch = Branch.objects.create(name="Şube", code="CW1")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T1",
            table_number=1,
            status=TableStatus.FREE,
        )
        self.waiter = User.objects.create_user(
            username="garson1",
            email="g1@test.com",
            password="pass12345",
        )
        assignment = WaiterBranchAssignment.objects.create(
            user=self.waiter,
            branch=self.branch,
        )
        assignment.tables.add(self.table)

    def test_raises_when_no_waiter_assignment(self):
        WaiterBranchAssignment.objects.all().delete()
        with self.assertRaises(CallWaiterNotFound):
            call_waiter(str(self.table.id))

    def test_raises_on_invalid_uuid(self):
        with self.assertRaises(CallWaiterBadRequest):
            call_waiter("52eed3c8-9631-4616-81c6-005726f9cc6")

    @patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call")
    def test_accepted_sends_notification(self, mock_waiter_call_broadcast):
        result = call_waiter(str(self.table.id))
        self.assertEqual(result.status, "accepted")
        self.assertEqual(result.notified_count, 1)
        self.assertIsNotNone(result.call_id)
        mock_waiter_call_broadcast.assert_called_once()
        _, kwargs = mock_waiter_call_broadcast.call_args
        self.assertEqual(kwargs["data"]["source"], "smart_button")
        self.assertNotIn("customer_message", kwargs["data"])

    @patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call")
    def test_custom_message_in_notification(self, mock_waiter_call_broadcast):
        from apps.performances.models import WaiterCallLog

        result = call_waiter(str(self.table.id), message="  Hesap lütfen  ")
        self.assertEqual(result.status, "accepted")
        _, kwargs = mock_waiter_call_broadcast.call_args
        self.assertEqual(kwargs["data"]["customer_message"], "Hesap lütfen")
        self.assertIn("Hesap lütfen", kwargs["message"])

        log = WaiterCallLog.objects.get(pk=result.call_id)
        self.assertEqual(log.customer_message, "Hesap lütfen")

    @patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call")
    def test_rate_limited_returns_ignored(self, mock_waiter_call_broadcast):
        call_waiter(str(self.table.id))
        result = call_waiter(str(self.table.id))
        self.assertEqual(result.status, "ignored")
        self.assertEqual(result.reason, "rate_limited")
        mock_waiter_call_broadcast.assert_called_once()


@override_settings(CALL_WAITER_COOLDOWN_SECONDS=30)
class CallWaiterViewTests(TestCase):
    def setUp(self):
        cache.clear()
        self.branch = Branch.objects.create(name="Şube", code="CW2")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T2",
            table_number=2,
            status=TableStatus.FREE,
        )
        self.url = reverse("call-waiter")

    def test_missing_table_id_returns_400(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 400)

    def test_invalid_uuid_returns_400(self):
        res = self.client.get(
            self.url,
            {"table_id": "52eed3c8-9631-4616-81c6-005726f9cc6"},
        )
        self.assertEqual(res.status_code, 400)

    def test_no_assignment_returns_404(self):
        res = self.client.get(self.url, {"table_id": str(self.table.id)})
        self.assertEqual(res.status_code, 404)

    @patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call")
    def test_message_query_param_forwarded(self, mock_waiter_call_broadcast):
        waiter = User.objects.create_user(
            username="garson_msg",
            email="gmsg@test.com",
            password="pass12345",
        )
        assignment = WaiterBranchAssignment.objects.create(user=waiter, branch=self.branch)
        assignment.tables.add(self.table)

        res = self.client.get(
            self.url,
            {"table_id": str(self.table.id), "message": "Su istiyoruz"},
        )
        self.assertEqual(res.status_code, 200)
        mock_waiter_call_broadcast.assert_called_once()
        _, kwargs = mock_waiter_call_broadcast.call_args
        self.assertEqual(kwargs["data"]["customer_message"], "Su istiyoruz")

    @patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call")
    def test_success_returns_200(self, _mock_waiter_call_broadcast):
        waiter = User.objects.create_user(
            username="garson2",
            email="g2@test.com",
            password="pass12345",
        )
        assignment = WaiterBranchAssignment.objects.create(user=waiter, branch=self.branch)
        assignment.zones.add(self.zone)

        res = self.client.get(self.url, {"table_id": str(self.table.id)})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "accepted")
        self.assertEqual(res.json()["notified_count"], 1)
        self.assertEqual(res.json()["table_name"], "T2")

    @patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call")
    def test_duplicate_within_cooldown_returns_ignored(self, _mock_waiter_call_broadcast):
        waiter = User.objects.create_user(
            username="garson3",
            email="g3@test.com",
            password="pass12345",
        )
        assignment = WaiterBranchAssignment.objects.create(user=waiter, branch=self.branch)
        assignment.tables.add(self.table)

        first = self.client.get(self.url, {"table_id": str(self.table.id)})
        second = self.client.get(self.url, {"table_id": str(self.table.id)})
        self.assertEqual(first.json()["status"], "accepted")
        self.assertEqual(second.json()["status"], "ignored")
        self.assertEqual(second.json()["reason"], "rate_limited")
