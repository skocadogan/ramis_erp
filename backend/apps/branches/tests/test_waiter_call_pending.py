import uuid
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone

from apps.branches.models import Branch, Table, TableStatus, WaiterBranchAssignment, Zone
from apps.branches.waiter_call_pending import (
    WaiterCallPendingBadRequest,
    expire_pending_waiter_calls,
    list_pending_waiter_calls,
)
from apps.performances.models import WaiterCallLog, WaiterCallStatus
from apps.performances.services import record_waiter_call

User = get_user_model()


class WaiterCallPendingServiceTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Şube", code="WP1")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T1",
            table_number=1,
            status=TableStatus.FREE,
        )
        self.user = User.objects.create_user(
            username="pos_pending",
            email="pos_pending@test.com",
            password="pass12345",
            branch=self.branch,
        )
        WaiterBranchAssignment.objects.create(user=self.user, branch=self.branch)

    def test_list_pending_returns_only_pending(self):
        call_id = str(uuid.uuid4())
        record_waiter_call(
            call_id=call_id,
            branch_id=str(self.branch.id),
            table_id=str(self.table.id),
            table_name=self.table.name,
            zone_name=self.zone.name,
            notified_count=1,
            called_at=timezone.now(),
        )
        dismissed_id = str(uuid.uuid4())
        record_waiter_call(
            call_id=dismissed_id,
            branch_id=str(self.branch.id),
            table_id=str(self.table.id),
            table_name=self.table.name,
            zone_name=self.zone.name,
            notified_count=1,
            called_at=timezone.now(),
        )
        WaiterCallLog.objects.filter(pk=dismissed_id).update(
            status=WaiterCallStatus.DISMISSED,
            dismissed_at=timezone.now(),
        )

        calls = list_pending_waiter_calls(
            user=self.user,
            branch_id=str(self.branch.id),
        )
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0]["call_id"], call_id)
        self.assertEqual(calls[0]["table_name"], "T1")
        self.assertIn("masasından garson çağrısı", calls[0]["message"])

    def test_list_rejects_inaccessible_branch(self):
        other = Branch.objects.create(name="Diğer", code="WP2")
        with self.assertRaises(WaiterCallPendingBadRequest):
            list_pending_waiter_calls(user=self.user, branch_id=str(other.id))

    @patch("apps.branches.waiter_call_pending.NotificationService.broadcast_waiter_call_dismissed")
    def test_expire_pending_clears_and_broadcasts(self, mock_broadcast):
        call_id = str(uuid.uuid4())
        record_waiter_call(
            call_id=call_id,
            branch_id=str(self.branch.id),
            table_id=str(self.table.id),
            table_name=self.table.name,
            zone_name=self.zone.name,
            notified_count=1,
            called_at=timezone.now(),
        )

        count = expire_pending_waiter_calls(branch_id=str(self.branch.id))
        self.assertEqual(count, 1)
        mock_broadcast.assert_called_once_with(
            branch_id=str(self.branch.id),
            dismiss_all=True,
        )
        log = WaiterCallLog.objects.get(pk=call_id)
        self.assertEqual(log.status, WaiterCallStatus.DISMISSED)
        self.assertIsNone(log.dismissed_by_id)

    def test_expire_noop_when_no_pending(self):
        count = expire_pending_waiter_calls(branch_id=str(self.branch.id))
        self.assertEqual(count, 0)


class WaiterCallPendingViewTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Şube", code="WP3")
        self.user = User.objects.create_user(
            username="pos_pending_view",
            email="pos_pending_view@test.com",
            password="pass12345",
            branch=self.branch,
        )
        WaiterBranchAssignment.objects.create(user=self.user, branch=self.branch)
        self.url = reverse("waiter-calls-pending")

    def test_get_requires_auth(self):
        res = self.client.get(self.url, {"branch_id": str(self.branch.id)})
        self.assertEqual(res.status_code, 401)

    @patch("apps.branches.views_waiter_call_pending.list_pending_waiter_calls")
    def test_authenticated_get(self, mock_list):
        mock_list.return_value = [{"call_id": "c1", "message": "test"}]
        self.client.force_login(self.user)
        res = self.client.get(self.url, {"branch_id": str(self.branch.id)})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["calls"][0]["call_id"], "c1")
        mock_list.assert_called_once()
