"""KDS geri çağır drawer ve recall endpoint testleri."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework import status

from apps.orders.models import Order, OrderItem, OrderStatus
from apps.orders.services import OrderService


@pytest.mark.django_db
class TestKdsRecall:
    def _ensure_kds_station_assignment(self, kds_user, branch):
        """view_kds kullanıcısı için CookStationAssignment (ortak kalemler dahil)."""
        from apps.branches.models import CookStationAssignment, KitchenStation

        station, _ = KitchenStation.objects.get_or_create(
            branch=branch,
            code='recall-test',
            defaults={'name': 'Recall Test', 'color': '#000000'},
        )
        assignment, _ = CookStationAssignment.objects.get_or_create(
            user=kds_user, branch=branch
        )
        assignment.stations.set([station])
        return station

    def _order_with_item(self, branch, table, product, item_status=OrderStatus.DELIVERED):
        order = Order.objects.create(
            branch=branch,
            table=table,
            status=OrderStatus.READY,
            total_amount=Decimal('100.00'),
        )
        item = OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal('100.00'),
            total_price=Decimal('100.00'),
            status=item_status,
        )
        return order, item

    def test_kds_recall_listesi_delivered_kalemi_doner(self, api_client, branch, table, product, kds_user):
        self._ensure_kds_station_assignment(kds_user, branch)
        order, item = self._order_with_item(branch, table, product, OrderStatus.DELIVERED)
        api_client.force_authenticate(user=kds_user)
        url = reverse('order-kds-recall')
        response = api_client.get(url, {'branch_id': str(branch.id)})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['recall_window_minutes'] >= 1
        ids = [it['id'] for g in response.data['groups'] for it in g['items']]
        assert str(item.id) in ids

    def test_suresi_dolan_kalem_listede_yok(
        self, api_client, branch, table, product, kds_user, settings
    ):
        self._ensure_kds_station_assignment(kds_user, branch)
        settings.KDS_RECALL_WINDOW_MINUTES = 15
        order, item = self._order_with_item(branch, table, product, OrderStatus.DELIVERED)
        OrderItem.objects.filter(pk=item.pk).update(
            updated_at=timezone.now() - timedelta(minutes=20)
        )
        api_client.force_authenticate(user=kds_user)
        url = reverse('order-kds-recall')
        response = api_client.get(url, {'branch_id': str(branch.id)})
        assert response.status_code == status.HTTP_200_OK
        ids = [it['id'] for g in response.data['groups'] for it in g['items']]
        assert str(item.id) not in ids

    def test_suresi_dolan_kalem_recall_edilemez(
        self, api_client, branch, table, product, kds_user, settings
    ):
        self._ensure_kds_station_assignment(kds_user, branch)
        settings.KDS_RECALL_WINDOW_MINUTES = 15
        order, item = self._order_with_item(branch, table, product, OrderStatus.DELIVERED)
        OrderItem.objects.filter(pk=item.pk).update(
            updated_at=timezone.now() - timedelta(minutes=20)
        )
        api_client.force_authenticate(user=kds_user)
        url = reverse('orderitem-recall', kwargs={'pk': item.id})
        response = api_client.post(url, {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        item.refresh_from_db()
        assert item.status == OrderStatus.DELIVERED

    def test_recall_kalemi_pending_yapar(self, api_client, branch, table, product, kds_user):
        self._ensure_kds_station_assignment(kds_user, branch)
        order, item = self._order_with_item(branch, table, product, OrderStatus.DELIVERED)
        api_client.force_authenticate(user=kds_user)
        url = reverse('orderitem-recall', kwargs={'pk': item.id})
        response = api_client.post(url, {}, format='json')
        assert response.status_code == status.HTTP_200_OK
        item.refresh_from_db()
        assert item.status == OrderStatus.PENDING

    def test_hesap_kapaninca_listeden_dusulur(self, api_client, branch, table, product, kds_user, pos_user):
        self._ensure_kds_station_assignment(kds_user, branch)
        order, item = self._order_with_item(branch, table, product, OrderStatus.DELIVERED)
        OrderService.complete_table(table.id, 'CASH', pos_user)
        api_client.force_authenticate(user=kds_user)
        url = reverse('order-kds-recall')
        response = api_client.get(url, {'branch_id': str(branch.id)})
        assert response.status_code == status.HTTP_200_OK
        ids = [it['id'] for g in response.data['groups'] for it in g['items']]
        assert str(item.id) not in ids
