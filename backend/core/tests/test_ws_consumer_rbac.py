"""WebSocket consumer RBAC birim testleri."""

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.branches.consumers import PosSyncConsumer, WaiterCallConsumer
from apps.branches.models import Branch, Table, TableStatus, Zone
from apps.orders.consumers import KitchenNotificationConsumer
from rbac.models import PermissionCategory, Role, RolePermission

User = get_user_model()


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={"name": name, "category": cat})[0]


class WsConsumerRbacTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.rbac_cat = PermissionCategory.objects.get_or_create(
            code="orders", defaults={"name": "Siparişler"}
        )[0]
        cls.branch = Branch.objects.create(name="Test Şubesi", code="WSRBAC")
        cls.zone = Zone.objects.create(branch=cls.branch, name="Salon")
        cls.table = Table.objects.create(
            zone=cls.zone,
            name="M1",
            table_number=1,
            status=TableStatus.FREE,
        )

        pos_role = Role.objects.create(name="POS Kasiyer")
        for code, name in [
            ("orders.manage_order", "Sipariş Yönet"),
            ("pos.view_pos", "POS Görüntüle"),
        ]:
            pos_role.permissions.add(_make_perm(code, name, cls.rbac_cat))
        cls.pos_user = User.objects.create_user(
            username="wsrbacpos",
            password="pw",
            email="wsrbacpos@test.com",
            branch=cls.branch,
        )
        cls.pos_user.roles.add(pos_role)

        waiter_role = Role.objects.create(name="Garson")
        for code, name in [
            ("orders.manage_order", "Sipariş Yönet"),
            ("waiter.access", "Garson"),
        ]:
            waiter_role.permissions.add(_make_perm(code, name, cls.rbac_cat))
        cls.waiter_user = User.objects.create_user(
            username="wsrbacwaiter",
            password="pw",
            email="wsrbacwaiter@test.com",
            branch=cls.branch,
        )
        cls.waiter_user.roles.add(waiter_role)

        kds_role = Role.objects.create(name="KDS")
        kds_role.permissions.add(
            _make_perm("orders.view_kds", "KDS Görüntüle", cls.rbac_cat)
        )
        cls.kds_user = User.objects.create_user(
            username="wsrbackds",
            password="pw",
            email="wsrbackds@test.com",
            branch=cls.branch,
        )
        cls.kds_user.roles.add(kds_role)

        prep_cat = PermissionCategory.objects.get_or_create(
            code="prep", defaults={"name": "Hazırlık"}
        )[0]
        prep_role = Role.objects.create(name="Prep Only")
        prep_role.permissions.add(
            _make_perm("prep.view_preptask", "Hazırlık Listesi", prep_cat)
        )
        cls.prep_user = User.objects.create_user(
            username="wsrbacprep",
            password="pw",
            email="wsrbacprep@test.com",
            branch=cls.branch,
        )
        cls.prep_user.roles.add(prep_role)

    def test_pos_sync_permission_helper(self):
        consumer = PosSyncConsumer()
        perms = ("pos.view_pos", "waiter.access")

        consumer.user = self.pos_user
        self.assertTrue(async_to_sync(consumer._user_has_any_permission)(perms))

        consumer.user = self.waiter_user
        self.assertTrue(async_to_sync(consumer._user_has_any_permission)(perms))

        denied = User.objects.create_user(
            username="wsrbacdenied",
            password="pw",
            email="wsrbacdenied@test.com",
            branch=self.branch,
        )
        consumer.user = denied
        self.assertFalse(async_to_sync(consumer._user_has_any_permission)(perms))

    def test_kitchen_consumer_accepts_kds_or_prep_permission(self):
        consumer = KitchenNotificationConsumer()
        consumer.user = self.kds_user
        self.assertTrue(
            async_to_sync(consumer._user_has_any_permission)(
                ("orders.view_kds", "prep.view_preptask")
            )
        )

        consumer.user = self.prep_user
        self.assertTrue(
            async_to_sync(consumer._user_has_any_permission)(
                ("orders.view_kds", "prep.view_preptask")
            )
        )

        consumer.user = self.pos_user
        self.assertFalse(
            async_to_sync(consumer._user_has_any_permission)(
                ("orders.view_kds", "prep.view_preptask")
            )
        )

    def test_kitchen_consumer_requires_kds_permission(self):
        consumer = KitchenNotificationConsumer()
        consumer.user = self.kds_user
        self.assertTrue(
            async_to_sync(consumer._user_has_permission)("orders.view_kds")
        )

        consumer.user = self.pos_user
        self.assertFalse(
            async_to_sync(consumer._user_has_permission)("orders.view_kds")
        )

    def test_waiter_call_consumer_requires_waiter_access(self):
        consumer = WaiterCallConsumer()
        consumer.user = self.waiter_user
        self.assertTrue(
            async_to_sync(consumer._user_has_any_permission)(("waiter.access",))
        )

        consumer.user = self.pos_user
        self.assertFalse(
            async_to_sync(consumer._user_has_any_permission)(("waiter.access",))
        )

    def test_pos_sync_table_subscription_verifies_branch_table(self):
        consumer = PosSyncConsumer()
        self.assertTrue(
            async_to_sync(consumer._verify_table_subscription)(
                str(self.branch.id),
                str(self.table.id),
            )
        )
        self.assertFalse(
            async_to_sync(consumer._verify_table_subscription)(
                str(self.branch.id),
                "00000000-0000-0000-0000-000000000001",
            )
        )
