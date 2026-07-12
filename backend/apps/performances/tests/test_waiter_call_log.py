import uuid
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.branches.call_waiter import call_waiter
from apps.branches.models import Branch, Table, TableStatus, WaiterBranchAssignment, Zone
from apps.branches.waiter_call_sync import dismiss_waiter_calls
from apps.performances.models import WaiterCallLog, WaiterCallStatus
from apps.performances.services import record_waiter_call, record_waiter_call_dismiss

User = get_user_model()


class WaiterCallLogServiceTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Şube", code="P1")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T1",
            table_number=1,
            status=TableStatus.FREE,
        )
        self.staff = User.objects.create_user(
            username="staff1",
            email="s1@test.com",
            password="pass12345",
            branch=self.branch,
        )

    def test_record_and_dismiss_call(self):
        call_id = str(uuid.uuid4())
        called_at = timezone.now() - timedelta(seconds=30)
        log = record_waiter_call(
            call_id=call_id,
            branch_id=str(self.branch.id),
            table_id=str(self.table.id),
            table_name=self.table.name,
            zone_name=self.zone.name,
            notified_count=2,
            called_at=called_at,
        )
        self.assertIsNotNone(log)
        self.assertEqual(WaiterCallLog.objects.count(), 1)

        updated = record_waiter_call_dismiss(
            branch_id=str(self.branch.id),
            user=self.staff,
            call_id=call_id,
        )
        self.assertEqual(updated, 1)

        log.refresh_from_db()
        self.assertEqual(log.status, WaiterCallStatus.DISMISSED)
        self.assertEqual(log.dismissed_by_id, self.staff.id)
        self.assertIsNotNone(log.response_seconds)
        self.assertGreaterEqual(log.response_seconds, 25)

    @patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call")
    def test_call_waiter_creates_log(self, _mock_broadcast):
        cache.clear()
        waiter = User.objects.create_user(
            username="garson",
            email="g@test.com",
            password="pass12345",
        )
        assignment = WaiterBranchAssignment.objects.create(user=waiter, branch=self.branch)
        assignment.tables.add(self.table)

        result = call_waiter(str(self.table.id))
        self.assertEqual(result.status, "accepted")
        self.assertEqual(WaiterCallLog.objects.count(), 1)
        log = WaiterCallLog.objects.get()
        self.assertEqual(str(log.id), result.call_id)
        self.assertEqual(log.status, WaiterCallStatus.PENDING)

    @patch("apps.branches.waiter_call_sync.NotificationService.broadcast_waiter_call_dismissed")
    def test_dismiss_updates_log(self, _mock_broadcast):
        cache.clear()
        waiter = User.objects.create_user(
            username="garson2",
            email="g2@test.com",
            password="pass12345",
            branch=self.branch,
        )
        assignment = WaiterBranchAssignment.objects.create(user=waiter, branch=self.branch)
        assignment.tables.add(self.table)

        with patch("apps.branches.call_waiter.NotificationService.broadcast_waiter_call"):
            result = call_waiter(str(self.table.id))

        dismiss_waiter_calls(
            user=self.staff,
            branch_id=str(self.branch.id),
            call_id=result.call_id,
        )
        log = WaiterCallLog.objects.get(pk=result.call_id)
        self.assertEqual(log.status, WaiterCallStatus.DISMISSED)
        self.assertEqual(log.dismissed_by_id, self.staff.id)


class WaiterCallLogApiTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Şube", code="P2")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T2",
            table_number=2,
            status=TableStatus.FREE,
        )
        self.user = User.objects.create_user(
            username="mgr",
            email="mgr@test.com",
            password="pass12345",
            branch=self.branch,
            is_superuser=True,
            is_staff=True,
        )

        called_at = timezone.now()
        self.log = WaiterCallLog.objects.create(
            id=uuid.uuid4(),
            branch=self.branch,
            table=self.table,
            table_name=self.table.name,
            zone_name=self.zone.name,
            status=WaiterCallStatus.DISMISSED,
            notified_count=1,
            called_at=called_at,
            dismissed_at=called_at + timedelta(seconds=45),
            dismissed_by=self.user,
            response_seconds=45,
        )

    def test_list_requires_auth(self):
        res = self.client.get("/api/v1/performances/waiter-calls/")
        self.assertIn(res.status_code, (401, 403))

    def test_list_returns_logs(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/v1/performances/waiter-calls/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 1)
        self.assertIn("totals", res.data)

    def test_analytics_endpoint(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get("/api/v1/performances/waiter-calls/analytics/")
        self.assertEqual(res.status_code, 200)
        self.assertIn("staff_performance", res.data)
        self.assertEqual(len(res.data["staff_performance"]), 1)
