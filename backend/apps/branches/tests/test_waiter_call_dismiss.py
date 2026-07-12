from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from apps.branches.models import Branch, Table, TableStatus, WaiterBranchAssignment, Zone
from apps.branches.waiter_call_sync import WaiterCallDismissBadRequest, dismiss_waiter_calls

User = get_user_model()


class WaiterCallDismissServiceTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Şube", code="WD1")
        self.zone = Zone.objects.create(branch=self.branch, name="Salon")
        self.table = Table.objects.create(
            zone=self.zone,
            name="T1",
            table_number=1,
            status=TableStatus.FREE,
        )
        self.user = User.objects.create_user(
            username="pos1",
            email="pos1@test.com",
            password="pass12345",
            branch=self.branch,
        )
        assignment = WaiterBranchAssignment.objects.create(
            user=self.user,
            branch=self.branch,
        )
        assignment.tables.add(self.table)

    @patch("apps.branches.waiter_call_sync.NotificationService.broadcast_waiter_call_dismissed")
    def test_dismiss_single_call(self, mock_broadcast):
        result = dismiss_waiter_calls(
            user=self.user,
            branch_id=str(self.branch.id),
            call_id="abc-123",
        )
        self.assertEqual(result["status"], "ok")
        mock_broadcast.assert_called_once_with(
            branch_id=str(self.branch.id),
            call_ids=["abc-123"],
        )

    @patch("apps.branches.waiter_call_sync.NotificationService.broadcast_waiter_call_dismissed")
    def test_dismiss_all(self, mock_broadcast):
        result = dismiss_waiter_calls(
            user=self.user,
            branch_id=str(self.branch.id),
            dismiss_all=True,
        )
        self.assertTrue(result["dismiss_all"])
        mock_broadcast.assert_called_once_with(
            branch_id=str(self.branch.id),
            dismiss_all=True,
        )

    def test_rejects_inaccessible_branch(self):
        other = Branch.objects.create(name="Diğer", code="WD2")
        with self.assertRaises(WaiterCallDismissBadRequest):
            dismiss_waiter_calls(
                user=self.user,
                branch_id=str(other.id),
                call_id="x",
            )


class WaiterCallDismissViewTests(TestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name="Şube", code="WD3")
        self.user = User.objects.create_user(
            username="pos2",
            email="pos2@test.com",
            password="pass12345",
            branch=self.branch,
        )
        WaiterBranchAssignment.objects.create(user=self.user, branch=self.branch)
        self.url = reverse("waiter-calls-dismiss")

    @patch("apps.branches.views_waiter_call_dismiss.dismiss_waiter_calls")
    def test_post_requires_auth(self, mock_dismiss):
        res = self.client.post(self.url, {"branch_id": str(self.branch.id), "call_id": "c1"})
        self.assertEqual(res.status_code, 401)
        mock_dismiss.assert_not_called()

    @patch("apps.branches.views_waiter_call_dismiss.dismiss_waiter_calls")
    def test_authenticated_post(self, mock_dismiss):
        mock_dismiss.return_value = {"status": "ok", "call_ids": ["c1"], "branch_id": str(self.branch.id)}
        self.client.force_login(self.user)
        res = self.client.post(
            self.url,
            {"branch_id": str(self.branch.id), "call_id": "c1"},
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        mock_dismiss.assert_called_once()
