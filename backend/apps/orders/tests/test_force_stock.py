"""POS force stock izni kontrolü backend testleri."""

from unittest.mock import MagicMock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status

from apps.orders.force_stock import deny_force_stock_response, user_may_force_stock
from rbac.models import PermissionCategory, Role, RolePermission

User = get_user_model()


class ForceStockPermissionTests(TestCase):
    def setUp(self):
        self.cat = PermissionCategory.objects.create(code='pos', name='POS')
        self.force_perm = RolePermission.objects.create(
            code='pos.force_stock_order',
            name='Force stock',
            category=self.cat,
        )
        self.user = User.objects.create_user(username='plain', password='pw', email='plain@test.com')
        self.superuser = User.objects.create_superuser(
            username='admin', email='admin@test.com', password='pw'
        )
        role = Role.objects.create(name='ForceStockRole')
        role.permissions.add(self.force_perm)
        self.user_with_force = User.objects.create_user(
            username='force', password='pw', email='force@test.com'
        )
        self.user_with_force.roles.add(role)

    def test_superuser_may_force(self):
        request = MagicMock()
        request.user = self.superuser
        self.assertTrue(user_may_force_stock(request))

    def test_user_with_permission_may_force(self):
        request = MagicMock()
        request.user = self.user_with_force
        request.has_permission = self.user_with_force.has_permission
        self.assertTrue(user_may_force_stock(request))

    def test_user_without_permission_denied(self):
        request = MagicMock()
        request.user = self.user
        request.has_permission = lambda code: False
        self.assertFalse(user_may_force_stock(request))

    def test_deny_response_shape(self):
        resp = deny_force_stock_response()
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.data['code'], 'FORCE_STOCK_FORBIDDEN')
        self.assertIn('detail', resp.data)
