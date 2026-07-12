"""Stok iptal/iade servis ve API testleri."""

from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.inventory.models import StockMovement, StockMovementType, Supplier
from apps.inventory.services import InventoryService
from apps.warehouse.models import PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus
from rbac.models import RolePermission, PermissionCategory


def _perm(code: str):
    cat, _ = PermissionCategory.objects.get_or_create(code='inventory', defaults={'name': 'Inventory'})
    perm, _ = RolePermission.objects.get_or_create(
        code=code,
        defaults={'name': code, 'category': cat},
    )
    return perm


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name='Tedarikçi A')


@pytest.fixture
def purchase_order(db, warehouse, stock_item, supplier, user):
    po = PurchaseOrder.objects.create(
        order_number='PO-RC-001',
        supplier=supplier,
        warehouse=warehouse,
        status=PurchaseOrderStatus.ORDERED,
        order_date=timezone.now().date(),
        created_by=user,
    )
    PurchaseOrderItem.objects.create(
        purchase_order=po,
        stock_item=stock_item,
        quantity=Decimal('50.000'),
        unit='kg',
        unit_price=Decimal('18.50'),
    )
    return po


@pytest.mark.django_db
class TestCancelStockService:
    def test_cancel_stock(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.cancel_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('4.000'),
            reference='EXPIRED',
            notes='SKT geçmiş',
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('96.000')
        assert movement.movement_type == StockMovementType.CANCEL

    def test_cancel_stock_with_unit_price(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.cancel_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('2.000'),
            unit_price=Decimal('18.50'),
            performed_by=user,
        )
        assert movement.unit_price == Decimal('18.50')

    def test_cancel_stock_falls_back_to_last_purchase_price(
        self, warehouse, stock_item, stock_level, user,
    ):
        movement = InventoryService.cancel_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('1.000'),
            performed_by=user,
        )
        assert movement.unit_price == Decimal('25.00')

    def test_delete_cancel_movement_soft_and_restore(self, warehouse, stock_item, stock_level, user):
        movement = InventoryService.cancel_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('5.000'),
            performed_by=user,
        )
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('95.000')

        InventoryService.delete_movement(movement.id)
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('100.000')
        deleted = StockMovement.objects.get(id=movement.id)
        assert deleted.is_active is False


@pytest.mark.django_db
class TestReturnCancelStockMovementAPI:
    def test_create_return_movement(self, api_client, staff_user, warehouse, stock_item, stock_level, purchase_order):
        perm = _perm('inventory.manage_return_cancel')
        staff_user.roles.first().permissions.add(perm)
        api_client.force_authenticate(user=staff_user)

        url = reverse('stockmovement-list')
        resp = api_client.post(url, {
            'stock_item_id': str(stock_item.id),
            'warehouse_id': str(warehouse.id),
            'movement_type': StockMovementType.RETURN,
            'quantity': '2.000000',
            'reference': 'EXPIRED',
            'notes': 'Tedarikçiye iade',
            'purchase_order_id': str(purchase_order.id),
        }, format='json')

        assert resp.status_code == status.HTTP_201_CREATED
        assert Decimal(str(resp.data['unit_price'])) == Decimal('18.50')
        stock_level.refresh_from_db()
        assert stock_level.quantity == Decimal('98.000')

    def test_create_return_requires_purchase_order(
        self, api_client, staff_user, warehouse, stock_item, stock_level,
    ):
        perm = _perm('inventory.manage_return_cancel')
        staff_user.roles.first().permissions.add(perm)
        api_client.force_authenticate(user=staff_user)

        url = reverse('stockmovement-list')
        resp = api_client.post(url, {
            'stock_item_id': str(stock_item.id),
            'warehouse_id': str(warehouse.id),
            'movement_type': StockMovementType.RETURN,
            'quantity': '2.000000',
            'reference': 'EXPIRED',
        }, format='json')

        assert resp.status_code == status.HTTP_400_BAD_REQUEST
        assert 'purchase_order_id' in resp.data

    def test_list_return_cancel_movements(self, api_client, staff_user, warehouse, stock_item, stock_level, user, branch):
        perm = _perm('inventory.view_return_cancel')
        staff_user.roles.first().permissions.add(perm)
        warehouse.branches.add(branch)
        api_client.force_authenticate(user=staff_user)

        InventoryService.return_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('1.000'),
            reference='DAMAGED',
            performed_by=user,
        )
        InventoryService.cancel_stock(
            warehouse_id=warehouse.id,
            stock_item_id=stock_item.id,
            quantity=Decimal('1.000'),
            reference='EXPIRED',
            performed_by=user,
        )

        url = reverse('stockmovement-list')
        resp = api_client.get(url, {'movement_types': 'RETURN,CANCEL'})
        assert resp.status_code == status.HTTP_200_OK
        assert resp.data['count'] == 2
        for row in resp.data['results']:
            assert Decimal(str(row['unit_price'])) == Decimal('25.00')

    def test_list_return_cancel_uses_last_purchase_price_when_stored_zero(
        self, api_client, staff_user, warehouse, stock_item, stock_level, user, branch,
    ):
        perm = _perm('inventory.view_return_cancel')
        staff_user.roles.first().permissions.add(perm)
        warehouse.branches.add(branch)
        api_client.force_authenticate(user=staff_user)

        movement = StockMovement.objects.create(
            stock_item=stock_item,
            warehouse=warehouse,
            movement_type=StockMovementType.RETURN,
            quantity=Decimal('0.500'),
            unit='kg',
            unit_price=Decimal('0.00'),
            reference='EXPIRED',
            performed_by=user,
        )

        url = reverse('stockmovement-list')
        resp = api_client.get(url, {'movement_types': 'RETURN,CANCEL'})
        assert resp.status_code == status.HTTP_200_OK
        row = next(item for item in resp.data['results'] if item['id'] == str(movement.id))
        assert Decimal(str(row['unit_price'])) == Decimal('25.00')

    def test_reason_codes_endpoint(self, api_client, staff_user):
        perm = _perm('inventory.view_return_cancel')
        staff_user.roles.first().permissions.add(perm)
        api_client.force_authenticate(user=staff_user)

        url = reverse('stockmovement-reason-codes')
        resp = api_client.get(url)
        assert resp.status_code == status.HTTP_200_OK
        assert any(row['code'] == 'EXPIRED' for row in resp.data)

    def test_list_ignores_invalid_start_date(self, api_client, staff_user):
        perm = _perm('inventory.view_return_cancel')
        staff_user.roles.first().permissions.add(perm)
        api_client.force_authenticate(user=staff_user)

        url = reverse('stockmovement-list')
        resp = api_client.get(
            url,
            {'movement_types': 'RETURN,CANCEL', 'start_date': '2026-06-231'},
        )
        assert resp.status_code == status.HTTP_200_OK
