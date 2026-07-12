"""POS offline idempotency — EPIC-07 backend testleri."""
import uuid

import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status

from apps.orders.models import Order, PosIdempotencyRecord


@pytest.mark.django_db
class TestOrderCreateIdempotency:
    def test_replay_returns_same_order(self, api_client, branch, takeaway_zone, product, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-list')
        payload = {
            'branch_id': str(branch.id),
            'order_type': 'TAKEAWAY',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '180.00'}],
        }
        key = f'pos:create:test-replay-{uuid.uuid4().hex}'
        r1 = api_client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert r1.status_code == status.HTTP_201_CREATED
        assert r1.data['status'] == 'created'
        order_id = r1.data['order']['id']

        r2 = api_client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert r2.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
        assert r2.data['order']['id'] == order_id
        assert Order.objects.filter(branch=branch).count() == 1
        assert PosIdempotencyRecord.objects.filter(idempotency_key=key).count() == 1

    def test_same_key_different_body_conflict(self, api_client, branch, takeaway_zone, product, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-list')
        key = f'pos:create:conflict-{uuid.uuid4().hex}'
        p1 = {
            'branch_id': str(branch.id),
            'order_type': 'TAKEAWAY',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '180.00'}],
        }
        api_client.post(url, p1, format='json', HTTP_IDEMPOTENCY_KEY=key)
        p2 = {**p1, 'items': [{'product_id': str(product.id), 'quantity': 2, 'unit_price': '180.00'}]}
        r = api_client.post(url, p2, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert r.status_code == status.HTTP_409_CONFLICT
        assert r.data['code'] == 'IDEMPOTENCY_CONFLICT'

    def test_without_key_backward_compatible(self, api_client, branch, takeaway_zone, product, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-list')
        payload = {
            'branch_id': str(branch.id),
            'order_type': 'TAKEAWAY',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '180.00'}],
        }
        r = api_client.post(url, payload, format='json')
        assert r.status_code == status.HTTP_201_CREATED
        assert 'total_amount' in r.data
        assert 'status' not in r.data or r.data.get('status') != 'created'


@pytest.mark.django_db
class TestOrderCompleteIdempotency:
    def test_complete_replay_idempotent(self, api_client, pending_order, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-complete', kwargs={'pk': pending_order.id})
        key = f'pos:complete:test-{uuid.uuid4().hex}'
        r1 = api_client.post(url, {'payment_method': 'CASH'}, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert r1.status_code == status.HTTP_200_OK

        r2 = api_client.post(url, {'payment_method': 'CASH'}, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert r2.status_code == status.HTTP_200_OK
        assert r2.data.get('status') in ('created', 'already_processed', None) or 'id' in r2.data


@pytest.mark.django_db
class TestCompleteTableIdempotency:
    def test_multi_order_resource_id_fits_varchar64(self, api_client, branch, table, product, pos_user):
        from apps.orders.services import OrderService

        api_client.force_authenticate(user=pos_user)
        for _ in range(2):
            OrderService.create_order(
                branch_id=branch.id,
                table_id=table.id,
                order_type='TABLE',
                user=pos_user,
                notes='',
                items_data=[{
                    'product_id': product.id,
                    'quantity': 1,
                    'unit_price': Decimal('100.00'),
                }],
            )

        url = reverse('order-complete-table')
        key = uuid.uuid4().hex
        payload = {
            'table_id': str(table.id),
            'branch_id': str(branch.id),
            'payment_method': 'CASH',
        }
        response = api_client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert response.status_code == status.HTTP_200_OK

        record = PosIdempotencyRecord.objects.get(idempotency_key=key)
        assert record.resource_id == str(table.id)
        assert len(record.resource_id) <= 64


@pytest.mark.django_db
class TestSyncReconcile:
    def test_reconcile_found_and_missing(self, api_client, branch, takeaway_zone, product, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-list')
        key = f'pos:create:reconcile-{uuid.uuid4().hex}'
        payload = {
            'branch_id': str(branch.id),
            'order_type': 'TAKEAWAY',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '180.00'}],
        }
        api_client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=key)

        reconcile_url = reverse('order-sync-reconcile')
        r = api_client.post(
            reconcile_url,
            {'idempotency_keys': [key, 'pos:missing:key']},
            format='json',
        )
        assert r.status_code == status.HTTP_200_OK
        results = {x['idempotency_key']: x['status'] for x in r.data['results']}
        assert results[key] == 'found'
        assert results['pos:missing:key'] == 'missing'


@pytest.mark.django_db
class TestMobileWaiterOfflineSync:
    """Garson mobil uygulaması offline kuyruk — web POS ile aynı idempotency sözleşmesi."""

    def test_table_order_replay_from_mobile_client(self, api_client, branch, table, product, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-list')
        key = f'pos:create:mobile-waiter-{uuid.uuid4().hex}'
        payload = {
            'branch_id': str(branch.id),
            'table_id': str(table.id),
            'order_type': 'TABLE',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '180.00'}],
        }
        r1 = api_client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert r1.status_code == status.HTTP_201_CREATED
        order_id = r1.data['order']['id']

        r2 = api_client.post(url, payload, format='json', HTTP_IDEMPOTENCY_KEY=key)
        assert r2.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)
        assert r2.data['order']['id'] == order_id
        assert Order.objects.filter(branch=branch, table=table).count() == 1
