"""Satın alma öneri motoru API testleri."""

from decimal import Decimal
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.inventory.models import StockItem, StockCategory, StockMovement, StockMovementType, Supplier
from apps.inventory.stock_minimum import MINIMUM_UNLIMITED_SENTINEL
from apps.warehouse.models import Warehouse, WarehouseType, WarehouseStockLevel, PurchaseOrderStatus
from apps.audit.models import AuditLog
from django.contrib.auth import get_user_model

User = get_user_model()


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Öneri Test Şubesi', code='PRB')


@pytest.fixture
def warehouse(db, branch):
    wh = Warehouse.objects.create(name='Öneri Depo', code='PR-WH', warehouse_type=WarehouseType.MAIN)
    wh.branches.add(branch)
    return wh


@pytest.fixture
def wh_cat(db):
    return PermissionCategory.objects.get_or_create(code='warehouse', defaults={'name': 'Depo'})[0]


@pytest.fixture
def recommendation_user(db, branch, wh_cat):
    role = Role.objects.create(name='Öneri Kullanıcısı')
    for code, name in [
        ('warehouse.view_purchase_recommendation', 'Öneri Gör'),
        ('warehouse.commit_purchase_recommendation', 'Öneri Commit'),
    ]:
        role.permissions.add(_make_perm(code, name, wh_cat))
    user = User.objects.create_user(username='recuser', password='pw', email='rec@test.com', branch=branch)
    user.roles.add(role)
    return user


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name='Tedarikçi A')


@pytest.fixture
def tracked_item(db, supplier):
    cat = StockCategory.objects.create(name='Gıda', code='GIDA')
    item = StockItem.objects.create(
        name='Domates',
        sku='DOM-001',
        unit='kg',
        category=cat,
        minimum_quantity=Decimal('10'),
        last_purchase_price=Decimal('25'),
    )
    item.suppliers.add(supplier)
    return item


@pytest.fixture
def unlimited_item(db):
    cat = StockCategory.objects.create(name='Servis', code='SRV')
    return StockItem.objects.create(
        name='Peçete',
        sku='PEC-001',
        unit='adet',
        category=cat,
        minimum_quantity=MINIMUM_UNLIMITED_SENTINEL,
    )


@pytest.mark.django_db
class TestPurchaseRecommendations:
    def test_list_requires_warehouse_id(self, recommendation_user):
        client = APIClient()
        client.force_authenticate(recommendation_user)
        url = reverse('purchaserecommendation-list')
        res = client.get(url)
        assert res.status_code == status.HTTP_400_BAD_REQUEST

    def test_horizon_days_affects_recommendation_quantity(
        self, recommendation_user, warehouse, tracked_item,
    ):
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            quantity=Decimal('2'),
            minimum_quantity=Decimal('5'),
        )
        StockMovement.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            movement_type=StockMovementType.OUT,
            quantity=Decimal('28'),
            unit='kg',
        )
        client = APIClient()
        client.force_authenticate(recommendation_user)
        url = reverse('purchaserecommendation-list')

        res_3 = client.get(url, {
            'warehouse_id': str(warehouse.id),
            'weeks': '4',
            'horizon_days': '3',
            'only_positive': 'true',
        })
        res_7 = client.get(url, {
            'warehouse_id': str(warehouse.id),
            'weeks': '4',
            'horizon_days': '7',
            'only_positive': 'true',
        })
        assert res_3.status_code == status.HTTP_200_OK
        assert res_7.status_code == status.HTTP_200_OK
        row_3 = next(r for r in res_3.data['results'] if r['stock_item_id'] == str(tracked_item.id))
        row_7 = next(r for r in res_7.data['results'] if r['stock_item_id'] == str(tracked_item.id))
        assert Decimal(row_3['recommended_quantity']) < Decimal(row_7['recommended_quantity'])
        assert row_3['horizon_days'] == 3
        assert row_7['horizon_days'] == 7
        assert row_3['daily_average_consumption'] == '1.00'
        assert row_3['urgency'] in ('critical', 'warning', 'ok')

    def test_stockout_estimation_fields(
        self, recommendation_user, warehouse, tracked_item,
    ):
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            quantity=Decimal('2'),
            minimum_quantity=Decimal('5'),
        )
        StockMovement.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            movement_type=StockMovementType.OUT,
            quantity=Decimal('28'),
            unit='kg',
        )
        client = APIClient()
        client.force_authenticate(recommendation_user)
        url = reverse('purchaserecommendation-list')
        res = client.get(url, {
            'warehouse_id': str(warehouse.id),
            'weeks': '4',
            'horizon_days': '7',
            'only_positive': 'true',
        })
        assert res.status_code == status.HTTP_200_OK
        row = next(r for r in res.data['results'] if r['stock_item_id'] == str(tracked_item.id))
        assert row['estimated_days_until_stockout'] == '2.00'
        assert row['urgency'] == 'critical'

    def test_unlimited_minimum_excluded(
        self, recommendation_user, warehouse, tracked_item, unlimited_item,
    ):
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            quantity=Decimal('2'),
            minimum_quantity=Decimal('10'),
        )
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=unlimited_item,
            quantity=Decimal('0'),
            minimum_quantity=MINIMUM_UNLIMITED_SENTINEL,
        )
        client = APIClient()
        client.force_authenticate(recommendation_user)
        url = reverse('purchaserecommendation-list')
        res = client.get(url, {'warehouse_id': str(warehouse.id), 'only_positive': 'false'})
        assert res.status_code == status.HTTP_200_OK
        ids = {r['stock_item_id'] for r in res.data['results']}
        assert str(tracked_item.id) in ids
        assert str(unlimited_item.id) not in ids

    def test_recommendation_formula_with_consumption(
        self, recommendation_user, warehouse, tracked_item, supplier,
    ):
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            quantity=Decimal('5'),
            minimum_quantity=Decimal('10'),
        )
        StockMovement.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            movement_type=StockMovementType.OUT,
            quantity=Decimal('28'),
            unit='kg',
        )
        client = APIClient()
        client.force_authenticate(recommendation_user)
        url = reverse('purchaserecommendation-list')
        res = client.get(url, {
            'warehouse_id': str(warehouse.id),
            'weeks': '4',
            'only_positive': 'true',
        })
        assert res.status_code == status.HTTP_200_OK
        row = next(r for r in res.data['results'] if r['stock_item_id'] == str(tracked_item.id))
        # haftalık ort 7; güvenlik 1.0 → hedef 7; mevcut 5 → öneri en az 2 (min gap 5 de olabilir)
        recommended = Decimal(row['recommended_quantity'])
        assert recommended >= Decimal('5')

    def test_commit_creates_draft_po_and_audit(
        self, recommendation_user, warehouse, tracked_item, supplier,
    ):
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=tracked_item,
            quantity=Decimal('1'),
            minimum_quantity=Decimal('10'),
        )
        client = APIClient()
        client.force_authenticate(recommendation_user)
        url = reverse('purchaserecommendation-commit')
        res = client.post(url, {
            'warehouse_id': str(warehouse.id),
            'items': [{
                'stock_item_id': str(tracked_item.id),
                'quantity': '12',
                'recommended_quantity': '12',
            }],
        }, format='json')
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data['created_count'] == 1
        assert res.data['orders'][0]['status'] == PurchaseOrderStatus.DRAFT
        assert AuditLog.objects.filter(action='warehouse.purchase_recommendation.committed').exists()

    def test_commit_skips_no_supplier_item(self, recommendation_user, warehouse):
        cat = StockCategory.objects.create(name='Baharat', code='BAH')
        no_sup = StockItem.objects.create(
            name='Tuz',
            sku='TUZ-1',
            unit='kg',
            category=cat,
            minimum_quantity=Decimal('5'),
        )
        WarehouseStockLevel.objects.create(
            warehouse=warehouse,
            stock_item=no_sup,
            quantity=Decimal('0'),
            minimum_quantity=Decimal('5'),
        )
        client = APIClient()
        client.force_authenticate(recommendation_user)
        url = reverse('purchaserecommendation-commit')
        res = client.post(url, {
            'warehouse_id': str(warehouse.id),
            'items': [{
                'stock_item_id': str(no_sup.id),
                'quantity': '5',
            }],
        }, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
