import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.branches.models import Branch, Table, TableStatus, Zone
from apps.orders.models import Order, OrderStatus, OrderType
from apps.performances.waiter_order_selectors import classify_order_channel

User = get_user_model()


class OrderChannelClassificationTests(TestCase):
    def test_mobile_user_agent(self):
        self.assertEqual(classify_order_channel('okhttp/4.9.0'), 'mobile')

    def test_web_user_agent(self):
        self.assertEqual(classify_order_channel('Mozilla/5.0 Chrome/120.0'), 'web')

    def test_unknown_user_agent(self):
        self.assertEqual(classify_order_channel(None), 'unknown')


class WaiterSalesApiTests(APITestCase):
    def setUp(self):
        self.branch = Branch.objects.create(name='Şube Satış', code='PS1')
        self.zone = Zone.objects.create(branch=self.branch, name='Salon')
        self.table = Table.objects.create(
            zone=self.zone,
            name='T10',
            table_number=10,
            status=TableStatus.FREE,
        )
        self.manager = User.objects.create_user(
            username='mgr_sales',
            email='mgr_sales@test.com',
            password='pass12345',
            branch=self.branch,
            is_superuser=True,
            is_staff=True,
        )
        from rbac.models import Role, RolePermission, PermissionCategory

        cat, _ = PermissionCategory.objects.get_or_create(code='waiter', defaults={'name': 'Garson'})
        perm, _ = RolePermission.objects.get_or_create(
            code='waiter.access',
            defaults={'name': 'Garson', 'category': cat},
        )
        role = Role.objects.create(name='Test Garson Satış')
        role.permissions.add(perm)

        self.waiter = User.objects.create_user(
            username='garson_sales',
            email='garson_sales@test.com',
            password='pass12345',
            branch=self.branch,
        )
        self.waiter.roles.add(role)

        Order.objects.create(
            branch=self.branch,
            table=self.table,
            user=self.waiter,
            order_type=OrderType.TABLE,
            status=OrderStatus.PENDING,
            total_amount=Decimal('150.0000'),
            order_number='1',
        )

    def test_list_requires_auth(self):
        res = self.client.get('/api/v1/performances/waiter-sales/')
        self.assertIn(res.status_code, (401, 403))

    def test_list_returns_orders(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.get('/api/v1/performances/waiter-sales/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data['count'], 1)
        self.assertIn('totals', res.data)

    def test_analytics_endpoint(self):
        self.client.force_authenticate(user=self.manager)
        res = self.client.get('/api/v1/performances/waiter-sales/analytics/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('staff_performance', res.data)
        self.assertIn('daily_sales', res.data)
