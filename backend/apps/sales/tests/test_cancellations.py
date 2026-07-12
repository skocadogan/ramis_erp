import pytest
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient

from apps.branches.models import Table
from apps.menu.models import Category, Product
from apps.orders.models import Order, OrderItem, OrderStatus
from apps.orders.services.item_service import ItemService
from apps.sales.models import Sale, PaymentMethod
from apps.orders.cancellation_reasons import format_cancellation_reason_display
from apps.sales.services import SaleService

User = get_user_model()


@pytest.fixture
def api_client(db):
    return APIClient()


@pytest.fixture
def staff_user(db, branch):
    user = User.objects.create_user(username='cancel_staff', password='test1234')
    user.is_staff = True
    user.is_superuser = True
    user.save()
    return user


@pytest.fixture
def table(db, branch):
    from apps.branches.models import Zone
    zone = Zone.objects.create(branch=branch, name='Salon')
    return Table.objects.create(zone=zone, name='M1', capacity=4)


@pytest.fixture
def category(db):
    return Category.objects.create(name='İçecek')


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        category=category, name='Çay', base_price=Decimal('25.00')
    )


@pytest.fixture
def order_with_item(db, branch, table, product, staff_user):
    order = Order.objects.create(
        branch=branch,
        table=table,
        status=OrderStatus.PENDING,
        total_amount=Decimal('50.00'),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        quantity=2,
        unit_price=Decimal('25.00'),
        total_price=Decimal('50.00'),
        status=OrderStatus.PENDING,
    )
    return order


@pytest.mark.django_db
class TestCancellationsApi:
    def test_list_cancelled_item(self, api_client, staff_user, order_with_item, product):
        api_client.force_authenticate(user=staff_user)
        item = order_with_item.items.first()
        ItemService.cancel_item(item, reason_code='MISTAKE', reason_text='Yanlış giriş')

        url = reverse('sale-cancellations')
        response = api_client.get(url)

        assert response.status_code == 200
        assert response.data['count'] >= 1
        row = response.data['results'][0]
        assert row['product_name'] == product.name
        assert row['quantity'] == 2
        assert row['cancel_reason_code'] == 'MISTAKE'
        assert row['table_name'] == 'M1'
        assert 'totals' in response.data

    def test_export_excel(self, api_client, staff_user, order_with_item):
        api_client.force_authenticate(user=staff_user)
        item = order_with_item.items.first()
        ItemService.cancel_item(item, reason_code='OTHER', reason_text='Test')

        url = reverse('sale-export-cancellations-excel')
        response = api_client.get(url)

        assert response.status_code == 200
        assert 'spreadsheetml' in response['Content-Type']

    def test_soft_deleted_sale_as_return(self, api_client, staff_user, branch, order_with_item):
        api_client.force_authenticate(user=staff_user)
        order = order_with_item
        order.status = OrderStatus.COMPLETED
        order.save()
        order.items.update(status=OrderStatus.COMPLETED)
        Sale.objects.create(
            order=order,
            branch=branch,
            payment_method=PaymentMethod.CASH,
            total_amount=Decimal('50.00'),
            created_by=staff_user,
        )
        SaleService.soft_delete(order.sale.id)

        url = reverse('sale-cancellations')
        response = api_client.get(url)

        assert response.status_code == 200
        assert response.data['count'] >= 1
        assert any(r['record_type'] == 'RETURN' for r in response.data['results'])


class TestCancellationReasonDisplay:
    def test_code_maps_to_turkish_label(self):
        assert format_cancellation_reason_display('KITCHEN_ERROR') == 'Mutfak Hatası'
        assert format_cancellation_reason_display('OUT_OF_STOCK') == 'Ürün Kalmadı (86)'

    def test_code_maps_to_english_label(self):
        from django.utils import translation

        with translation.override('en'):
            assert format_cancellation_reason_display('KITCHEN_ERROR') == 'Kitchen error'
            assert format_cancellation_reason_display('OUT_OF_STOCK') == 'Out of stock (86)'

    def test_detail_text_takes_precedence(self):
        assert format_cancellation_reason_display('OTHER', 'Müşteri istemedi') == 'Müşteri istemedi'

    def test_empty_code_with_text(self):
        assert format_cancellation_reason_display(None, '  Açıklama  ') == 'Açıklama'

    def test_camel_case_mobile_codes(self):
        assert format_cancellation_reason_display('outOfStock') == 'Ürün Kalmadı (86)'
        assert format_cancellation_reason_display('qualityIssue') == 'Kalite / Şikayet'
        assert format_cancellation_reason_display('customerCancel') == 'Müşteri Vazgeçti'
        assert format_cancellation_reason_display('mistake') == 'Yanlış Sipariş / Giriş Hatası'

    def test_normalize_cancellation_reason_inputs(self):
        from apps.orders.cancellation_reasons import normalize_cancellation_reason_inputs

        assert normalize_cancellation_reason_inputs('outOfStock', '') == ('OUT_OF_STOCK', None)
        assert normalize_cancellation_reason_inputs(None, 'qualityIssue') == ('QUALITY_ISSUE', None)
        assert normalize_cancellation_reason_inputs('OTHER', 'Müşteri istemedi') == (
            'OTHER',
            'Müşteri istemedi',
        )
