"""
DashboardViewSet API testleri.
"""
import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestDashboardSummary:
    def test_summary_endpoint_yetkili_kullanici_icin_200_doner(self, api_client, branch, user):
        """dashboard.view_dashboard iznine sahip kullanıcı summary alabilir."""
        api_client.force_authenticate(user=user)
        url = reverse('dashboard-summary')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_summary_kimlik_dogrulamasi_gerekir(self, api_client):
        """Giriş yapmamış kullanıcı erişemez."""
        url = reverse('dashboard-summary')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestDashboardTopProducts:
    def test_top_products_endpoint_yetkili_kullanici_icin_calisir(self, api_client, branch, user):
        """dashboard.view_dashboard iznine sahip kullanıcı top-products alabilir."""
        api_client.force_authenticate(user=user)
        url = reverse('dashboard-top-products')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
