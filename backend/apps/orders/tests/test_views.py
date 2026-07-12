"""
OrderViewSet API testleri.
KDS branch scope güvenlik testi dahil (Rapor P1-1 regresyon).
"""
import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.guest_feedback.models import (
    Survey,
    SurveySessionStatus,
    SurveySource,
    TableSurveySessionState,
)
from apps.orders.models import Order, OrderItem, OrderStatus



@pytest.mark.django_db
class TestOrderCreateView:
    def test_yetkisiz_kullanici_siparis_olusturamaz(self, api_client, branch, product):
        url = reverse('order-list')
        payload = {
            'branch_id': str(branch.id),
            'order_type': 'TAKEAWAY',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '50.00'}],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pos_kullanicisi_siparis_olusturabilir(self, api_client, branch, takeaway_zone, product, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-list')
        payload = {
            'branch_id': str(branch.id),
            'order_type': 'TAKEAWAY',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '180.00'}],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert Decimal(response.data['total_amount']) == Decimal('180.00')

    def test_garson_pos_view_pos_olmadan_siparis_olusturur(
        self, api_client, branch, zone, table, product, waiter_user_no_pos_view
    ):
        """`pos.view_pos` olmayan garson: manage_order + waiter.access ile POST /orders/ izni."""
        from apps.branches.models import WaiterBranchAssignment

        wba, _ = WaiterBranchAssignment.objects.get_or_create(
            user=waiter_user_no_pos_view, branch=branch
        )
        wba.zones.add(zone)

        api_client.force_authenticate(user=waiter_user_no_pos_view)
        url = reverse('order-list')
        payload = {
            'branch_id': str(branch.id),
            'table_id': str(table.id),
            'order_type': 'TABLE',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '50.00'}],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_201_CREATED

    def test_baska_subeye_siparis_olusturulamaz(self, api_client, other_branch, product, pos_user):
        """POS kullanıcısı yalnızca kendi şubesine sipariş oluşturabilmeli."""
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-list')
        payload = {
            'branch_id': str(other_branch.id),
            'order_type': 'TAKEAWAY',
            'items': [{'product_id': str(product.id), 'quantity': 1, 'unit_price': '50.00'}],
        }
        response = api_client.post(url, payload, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestOrderKdsActiveView:
    """
    P1-1 Regresyon: kds_active endpoint'i sadece kullanıcının şubesindeki
    siparişleri döndürmeli, başka şubeyi göstermemeli.
    """

    def _create_order_for_branch(self, branch, product):
        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal('100.00'),
        )
        OrderItem.objects.create(
            order=order, product=product, quantity=1,
            unit_price=Decimal('100.00'), total_price=Decimal('100.00'),
            status=OrderStatus.PENDING,
        )
        return order

    def test_yetkisiz_erisim_engellenir(self, api_client):
        url = reverse('order-kds-active')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_kds_kullanicisi_yalnizca_kendi_sube_siparisini_gorur(
        self, api_client, branch, other_branch, product, kds_user, other_branch_user
    ):
        own_order = self._create_order_for_branch(branch, product)
        other_order = self._create_order_for_branch(other_branch, product)

        api_client.force_authenticate(user=kds_user)
        url = reverse('order-kds-active')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        ids = [o['id'] for o in response.data]
        assert str(own_order.id) in ids
        assert str(other_order.id) not in ids

    def test_diger_sube_kullanicisi_kendi_siparisini_gorur(
        self, api_client, branch, other_branch, product, kds_user, other_branch_user
    ):
        own_order = self._create_order_for_branch(branch, product)
        other_order = self._create_order_for_branch(other_branch, product)

        api_client.force_authenticate(user=other_branch_user)
        url = reverse('order-kds-active')
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        ids = [o['id'] for o in response.data]
        assert str(other_order.id) in ids
        assert str(own_order.id) not in ids

    def test_kds_yanlis_istasyonda_durum_guncelleyemez(
        self, api_client, branch, product, kds_user
    ):
        """view_kds + CookStation: yalnız atanan istasyon kalemleri (veya ortak / NULL kalem)."""
        from apps.branches.models import CookStationAssignment, KitchenStation

        station_kizgara = KitchenStation.objects.create(
            branch=branch, name="Izgara", code="izgara", color="#000"
        )
        station_bar = KitchenStation.objects.create(
            branch=branch, name="Bar", code="bar", color="#111"
        )
        assignment, _ = CookStationAssignment.objects.get_or_create(
            user=kds_user, branch=branch
        )
        assignment.stations.set([station_kizgara])

        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal("100.00"),
        )
        item_bar = OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("100.00"),
            total_price=Decimal("100.00"),
            status=OrderStatus.PENDING,
            station=station_bar,
        )

        api_client.force_authenticate(user=kds_user)
        url = reverse("orderitem-set-status", kwargs={"pk": item_bar.id})
        response = api_client.post(
            url, {"status": OrderStatus.PREPARING}, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_kds_atanmis_istasyonda_durum_gunceller(
        self, api_client, branch, product, kds_user
    ):
        from apps.branches.models import CookStationAssignment, KitchenStation

        station = KitchenStation.objects.create(
            branch=branch, name="Izgara", code="izgara2", color="#000"
        )
        assignment, _ = CookStationAssignment.objects.get_or_create(
            user=kds_user, branch=branch
        )
        assignment.stations.set([station])

        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal("100.00"),
        )
        item = OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal("100.00"),
            total_price=Decimal("100.00"),
            status=OrderStatus.PENDING,
            station=station,
        )

        api_client.force_authenticate(user=kds_user)
        url = reverse("orderitem-set-status", kwargs={"pk": item.id})
        response = api_client.post(
            url, {"status": OrderStatus.PREPARING}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        item.refresh_from_db()
        assert item.status == OrderStatus.PREPARING

    def test_kds_istasyon_filtresi_istasyonsuz_kalemleri_gosterir(
        self, api_client, branch, product, kds_user
    ):
        """Kategoriye mutfak istasyonu atanmamış ürünler (station NULL) tüm KDS ekranlarında görünsün."""
        from apps.branches.models import KitchenStation

        station = KitchenStation.objects.create(
            branch=branch, name='Izgara', code='izgara', color='#000000'
        )
        order = Order.objects.create(
            branch=branch,
            status=OrderStatus.PENDING,
            total_amount=Decimal('100.00'),
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal('100.00'),
            total_price=Decimal('100.00'),
            status=OrderStatus.PENDING,
            station_id=None,
        )

        api_client.force_authenticate(user=kds_user)
        url = reverse('order-kds-active')
        response = api_client.get(url, {'station_id': str(station.id)})

        assert response.status_code == status.HTTP_200_OK
        match = next((o for o in response.data if str(o['id']) == str(order.id)), None)
        assert match is not None
        assert len(match['items']) >= 1


@pytest.mark.django_db
class TestOrderCompleteView:
    def test_siparis_tamamlanir(self, api_client, pending_order, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-complete', kwargs={'pk': pending_order.id})
        response = api_client.post(url, {'payment_method': 'CASH'}, format='json')
        assert response.status_code == status.HTTP_200_OK
        pending_order.refresh_from_db()
        assert pending_order.status == OrderStatus.COMPLETED

    def test_gecersiz_odeme_yontemi_400(self, api_client, pending_order, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-complete', kwargs={'pk': pending_order.id})
        response = api_client.post(url, {'payment_method': 'ALTIN'}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestOrderSurveyAnsweredField:
    def test_order_detayinda_anket_cevaplandi_alani_true_doner(
        self, api_client, pending_order, pos_user, branch
    ):
        survey = Survey.objects.create(title="POS Anketi")
        survey.branches.add(branch)
        TableSurveySessionState.objects.create(
            survey=survey,
            branch=branch,
            table=pending_order.table,
            order=pending_order,
            source=SurveySource.POS_DISPLAY,
            session_key=f"POS_DISPLAY:order:{pending_order.id}",
            status=SurveySessionStatus.ANSWERED,
        )

        api_client.force_authenticate(user=pos_user)
        url = reverse('order-detail', kwargs={'pk': pending_order.id})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['customer_display_survey_answered'] is True

    def test_order_detayinda_anket_cevaplandi_alani_yoksa_false_doner(
        self, api_client, pending_order, pos_user
    ):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-detail', kwargs={'pk': pending_order.id})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['customer_display_survey_answered'] is False

    def test_order_detayinda_smart_table_anketi_cevaplandi_alani_true_doner(
        self, api_client, pending_order, pos_user, branch
    ):
        survey = Survey.objects.create(
            title="Smart Table Anketi",
            is_smart_table_active=True,
        )
        survey.branches.add(branch)
        TableSurveySessionState.objects.create(
            survey=survey,
            branch=branch,
            table=pending_order.table,
            order=pending_order,
            source=SurveySource.SMART_TABLE,
            session_key=f"SMART_TABLE:order:{pending_order.id}",
            status=SurveySessionStatus.ANSWERED,
        )

        api_client.force_authenticate(user=pos_user)
        url = reverse('order-detail', kwargs={'pk': pending_order.id})
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data['customer_display_survey_answered'] is True


@pytest.mark.django_db
class TestOrderCancelView:
    def test_siparis_iptal_edilir(self, api_client, pending_order, pos_user):
        api_client.force_authenticate(user=pos_user)
        url = reverse('order-cancel', kwargs={'pk': pending_order.id})
        response = api_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        pending_order.refresh_from_db()
        assert pending_order.status == OrderStatus.CANCELLED

    def test_yetkisiz_kullanici_iptal_edemez(self, api_client, pending_order):
        url = reverse('order-cancel', kwargs={'pk': pending_order.id})
        response = api_client.post(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestCancelTableView:
    """cancel_table endpoint testleri: POST /orders/main/cancel_table/"""

    URL = '/api/v1/orders/main/cancel_table/'

    def _create_order(self, branch, table, product, status=OrderStatus.PENDING):
        from apps.orders.models import OrderItem
        order = Order.objects.create(
            branch=branch,
            table=table,
            status=status,
            total_amount=Decimal('100.00'),
        )
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=Decimal('100.00'),
            total_price=Decimal('100.00'),
            status=status,
        )
        return order

    def test_kimlik_dogrulamasi_gerekir(self, api_client, table):
        response = api_client.post(self.URL, {'table_id': str(table.id)}, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_tek_siparis_iptal_edilir(self, api_client, branch, table, product, pos_user):
        order = self._create_order(branch, table, product)
        api_client.force_authenticate(user=pos_user)
        response = api_client.post(
            self.URL,
            {'table_id': str(table.id), 'branch_id': str(branch.id), 'reason_code': 'mistake'},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['cancelled_count'] == 1
        assert str(order.id) in response.data['order_ids']
        order.refresh_from_db()
        assert order.status == OrderStatus.CANCELLED

    def test_birden_fazla_siparis_iptal_edilir(self, api_client, branch, table, product, pos_user):
        o1 = self._create_order(branch, table, product)
        o2 = self._create_order(branch, table, product, status=OrderStatus.PREPARING)
        api_client.force_authenticate(user=pos_user)
        response = api_client.post(
            self.URL,
            {'table_id': str(table.id), 'branch_id': str(branch.id)},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['cancelled_count'] == 2
        for order in [o1, o2]:
            order.refresh_from_db()
            assert order.status == OrderStatus.CANCELLED

    def test_aktif_siparis_yoksa_sifir_donar(self, api_client, branch, table, product, pos_user):
        """Tabloda COMPLETED sipariş varsa cancel_table 0 döner."""
        self._create_order(branch, table, product, status=OrderStatus.COMPLETED)
        api_client.force_authenticate(user=pos_user)
        response = api_client.post(
            self.URL,
            {'table_id': str(table.id), 'branch_id': str(branch.id)},
            format='json',
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['cancelled_count'] == 0

    def test_table_id_olmadan_400(self, api_client, pos_user):
        api_client.force_authenticate(user=pos_user)
        response = api_client.post(self.URL, {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_baska_subenin_masasini_iptal_edemez(
        self, api_client, other_branch, branch, table, product, pos_user
    ):
        """POS kullanıcısı yalnızca kendi şubesinin masasını iptal edebilmeli."""
        other_zone = __import__('apps.branches.models', fromlist=['Zone']).Zone.objects.create(
            branch=other_branch, name='Diğer Salon'
        )
        other_table = __import__('apps.branches.models', fromlist=['Table']).Table.objects.create(
            zone=other_zone, name='X1', table_number=99
        )
        self._create_order(other_branch, other_table, product)
        api_client.force_authenticate(user=pos_user)
        response = api_client.post(
            self.URL,
            {'table_id': str(other_table.id), 'branch_id': str(other_branch.id)},
            format='json',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
