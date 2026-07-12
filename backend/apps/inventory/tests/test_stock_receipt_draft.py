"""Toplu stok girişi taslağı finalize testleri."""
import pytest
from decimal import Decimal
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.inventory.models import (
    StockItem,
    StockReceiptDraft,
    StockReceiptDraftLine,
    StockReceiptDraftStatus,
    StockUnit,
)
from apps.inventory.services import InventoryService
from apps.warehouse.models import Warehouse, WarehouseStockLevel

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def warehouse(db):
    return Warehouse.objects.create(name='Test Depo', code='TWH', is_default=True)


@pytest.fixture
def stock_user(db, warehouse):
    user = User.objects.create_user(
        username='stockmgr',
        email='sm@test.com',
        password='pass12345',
        is_superuser=True,
    )
    return user


@pytest.fixture
def stock_item(db):
    StockUnit.objects.get_or_create(
        short_name='kg',
        defaults={'name': 'Kilogram', 'multiplier': Decimal('1')},
    )
    return StockItem.objects.create(
        name='Un',
        sku='UN-001',
        unit='kg',
        minimum_quantity=Decimal('1'),
        last_purchase_price=Decimal('10'),
    )


@pytest.mark.django_db
class TestFinalizeStockReceiptDraft:
    def test_finalize_existing_line(self, warehouse, stock_item, stock_user):
        draft = StockReceiptDraft.objects.create(
            user=stock_user,
            warehouse=warehouse,
            reference='FAT-001',
            status=StockReceiptDraftStatus.DRAFT,
        )
        StockReceiptDraftLine.objects.create(
            draft=draft,
            sort_order=0,
            stock_item=stock_item,
            quantity=Decimal('10.000'),
            unit='kg',
            unit_price=Decimal('25.00'),
        )

        movement_ids = InventoryService.finalize_stock_receipt_draft(draft.id, stock_user)

        assert len(movement_ids) == 1
        draft.refresh_from_db()
        assert draft.status == StockReceiptDraftStatus.POSTED
        assert draft.posted_at is not None

        level = WarehouseStockLevel.objects.get(warehouse=warehouse, stock_item=stock_item)
        assert level.quantity == Decimal('10.000')

    def test_finalize_new_product_line(self, warehouse, stock_user):
        StockUnit.objects.get_or_create(
            short_name='adet',
            defaults={'name': 'Adet', 'multiplier': Decimal('1')},
        )
        draft = StockReceiptDraft.objects.create(
            user=stock_user,
            warehouse=warehouse,
            reference='FAT-NEW',
            status=StockReceiptDraftStatus.DRAFT,
        )
        StockReceiptDraftLine.objects.create(
            draft=draft,
            sort_order=0,
            stock_item=None,
            temp_name='Yeni Ürün',
            temp_sku='NEW-SKU-1',
            temp_unit='adet',
            quantity=Decimal('5.000'),
            unit='adet',
            unit_price=Decimal('12.50'),
        )

        movement_ids = InventoryService.finalize_stock_receipt_draft(draft.id, stock_user)

        assert len(movement_ids) == 1
        item = StockItem.objects.get(sku='NEW-SKU-1')
        assert item.name == 'Yeni Ürün'
        level = WarehouseStockLevel.objects.get(warehouse=warehouse, stock_item=item)
        assert level.quantity == Decimal('5.000')

    def test_finalize_double_raises(self, warehouse, stock_item, stock_user):
        draft = StockReceiptDraft.objects.create(
            user=stock_user,
            warehouse=warehouse,
            status=StockReceiptDraftStatus.DRAFT,
        )
        StockReceiptDraftLine.objects.create(
            draft=draft,
            sort_order=0,
            stock_item=stock_item,
            quantity=Decimal('1.000'),
            unit='kg',
        )
        InventoryService.finalize_stock_receipt_draft(draft.id, stock_user)
        with pytest.raises(ValueError, match='kesinleştirilmiş'):
            InventoryService.finalize_stock_receipt_draft(draft.id, stock_user)


@pytest.mark.django_db
class TestStockReceiptDraftAPI:
    def test_finalize_endpoint(self, api_client, warehouse, stock_item, stock_user):
        api_client.force_authenticate(user=stock_user)
        draft = StockReceiptDraft.objects.create(
            user=stock_user,
            warehouse=warehouse,
            status=StockReceiptDraftStatus.DRAFT,
        )
        StockReceiptDraftLine.objects.create(
            draft=draft,
            sort_order=0,
            stock_item=stock_item,
            quantity=Decimal('2.000'),
            unit='kg',
        )

        url = f'/api/v1/inventory/stock-receipt-drafts/{draft.id}/finalize/'
        res = api_client.post(url)

        assert res.status_code == status.HTTP_200_OK
        assert res.data['count'] == 1
        assert len(res.data['movement_ids']) == 1

        res2 = api_client.post(url)
        assert res2.status_code == status.HTTP_400_BAD_REQUEST

    def test_delete_posted_draft_allowed(self, api_client, warehouse, stock_item, stock_user):
        """Kesinleştirilmiş taslak kaydı silinebilir; stok hareketleri DB'de kalır.

        Silme `BaseModel.delete()` ile yumuşak silmedir (`is_active=False`); satır
        DB'den silinmez. Liste/retrieve genelde aktif kayıtları gösterdiği için
        kayıt kullanıcı tarafından kaybolmuş sayılır.
        """
        api_client.force_authenticate(user=stock_user)
        draft = StockReceiptDraft.objects.create(
            user=stock_user,
            warehouse=warehouse,
            status=StockReceiptDraftStatus.DRAFT,
        )
        StockReceiptDraftLine.objects.create(
            draft=draft,
            sort_order=0,
            stock_item=stock_item,
            quantity=Decimal('1.000'),
            unit='kg',
        )
        finalize_url = f'/api/v1/inventory/stock-receipt-drafts/{draft.id}/finalize/'
        fin = api_client.post(finalize_url)
        assert fin.status_code == status.HTTP_200_OK

        del_url = f'/api/v1/inventory/stock-receipt-drafts/{draft.id}/'
        res = api_client.delete(del_url)
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not StockReceiptDraft.objects.filter(id=draft.id, is_active=True).exists()

        level = WarehouseStockLevel.objects.get(warehouse=warehouse, stock_item=stock_item)
        assert level.quantity == Decimal('1.000')
