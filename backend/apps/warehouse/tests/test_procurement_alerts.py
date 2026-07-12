"""Satın alma uyarıları API testleri."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.inventory.models import Supplier
from apps.warehouse.models import Warehouse, WarehouseType, PurchaseOrder, PurchaseOrderStatus
from django.contrib.auth import get_user_model

User = get_user_model()


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Uyarı Test Şubesi', code='ALB')


@pytest.fixture
def warehouse(db, branch):
    wh = Warehouse.objects.create(name='Uyarı Depo', code='AL-WH', warehouse_type=WarehouseType.MAIN)
    wh.branches.add(branch)
    return wh


@pytest.fixture
def wh_cat(db):
    return PermissionCategory.objects.get_or_create(code='warehouse', defaults={'name': 'Depo'})[0]


@pytest.fixture
def po_user(db, branch, wh_cat):
    role = Role.objects.create(name='PO Görüntüleyici')
    role.permissions.add(_make_perm('warehouse.view_purchase_order', 'PO Gör', wh_cat))
    role.permissions.add(_make_perm('warehouse.view_warehouse', 'Depo Gör', wh_cat))
    user = User.objects.create_user(username='pouser', password='pw', email='po@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name='Geciken Tedarikçi')


@pytest.mark.django_db
class TestProcurementAlerts:
    def test_overdue_po_listed(self, po_user, warehouse, supplier):
        today = timezone.now().date()
        PurchaseOrder.objects.create(
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrderStatus.ORDERED,
            order_date=today - timedelta(days=10),
            expected_date=today - timedelta(days=2),
            order_number='PO-OVER-1',
            total_amount=Decimal('100'),
        )
        PurchaseOrder.objects.create(
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrderStatus.RECEIVED,
            order_date=today - timedelta(days=10),
            expected_date=today - timedelta(days=3),
            order_number='PO-RCV-1',
            total_amount=Decimal('50'),
        )
        client = APIClient()
        client.force_authenticate(po_user)
        url = reverse('procurementalert-list')
        res = client.get(url, {'branch_id': str(warehouse.branches.first().id)})
        assert res.status_code == status.HTTP_200_OK
        assert res.data['overdue_orders_count'] == 1
        assert len(res.data['overdue_orders']) == 1
        assert res.data['overdue_orders'][0]['order_number'] == 'PO-OVER-1'
        assert res.data['overdue_orders'][0]['days_overdue'] == 2

    def test_supplier_alerts_grouped(self, po_user, warehouse, supplier):
        today = timezone.now().date()
        for i in range(2):
            PurchaseOrder.objects.create(
                supplier=supplier,
                warehouse=warehouse,
                status=PurchaseOrderStatus.ORDERED,
                order_date=today - timedelta(days=10),
                expected_date=today - timedelta(days=i + 1),
                order_number=f'PO-OVER-{i}',
                total_amount=Decimal('100'),
            )
        client = APIClient()
        client.force_authenticate(po_user)
        url = reverse('procurementalert-list')
        res = client.get(url)
        assert res.status_code == status.HTTP_200_OK
        assert res.data['overdue_orders_count'] == 2
        assert len(res.data['supplier_alerts']) >= 1
        alert = res.data['supplier_alerts'][0]
        assert alert['supplier_id'] == str(supplier.id)
        assert alert['overdue_count'] == 2
        assert alert['severity'] == 'critical'

    def test_purchase_orders_overdue_filter(self, po_user, warehouse, supplier):
        today = timezone.now().date()
        overdue = PurchaseOrder.objects.create(
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrderStatus.ORDERED,
            order_date=today - timedelta(days=10),
            expected_date=today - timedelta(days=1),
            order_number='PO-FLT-1',
            total_amount=Decimal('100'),
        )
        PurchaseOrder.objects.create(
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrderStatus.ORDERED,
            order_date=today,
            expected_date=today + timedelta(days=5),
            order_number='PO-FLT-2',
            total_amount=Decimal('100'),
        )
        client = APIClient()
        client.force_authenticate(po_user)
        url = reverse('purchaseorder-list')
        res = client.get(url, {'overdue': 'true'})
        assert res.status_code == status.HTTP_200_OK
        ids = {r['id'] for r in res.data['results']}
        assert str(overdue.id) in ids
        assert len(ids) == 1

    def test_summary_includes_overdue_count(self, po_user, warehouse, supplier):
        today = timezone.now().date()
        PurchaseOrder.objects.create(
            supplier=supplier,
            warehouse=warehouse,
            status=PurchaseOrderStatus.PARTIALLY_RECEIVED,
            order_date=today - timedelta(days=10),
            expected_date=today - timedelta(days=1),
            order_number='PO-SUM-1',
            total_amount=Decimal('100'),
        )
        client = APIClient()
        client.force_authenticate(po_user)
        url = reverse('warehouse-summary')
        res = client.get(url)
        assert res.status_code == status.HTTP_200_OK
        assert res.data['overdue_orders'] == 1
