"""
InvoiceViewSet API testleri.
"""
import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestInvoiceList:
    def test_invoice_list_endpoint_yetkili_kullanici_icin_calisir(self, api_client, branch, user):
        """invoices.view_invoice iznine sahip kullanıcı fatura listesini görebilir."""
        api_client.force_authenticate(user=user)
        url = reverse('invoice-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_yetkisiz_kullanici_403_alir(self, api_client, unauthorized_user):
        """RBAC izni olmayan kullanıcı fatura listeleyemez."""
        api_client.force_authenticate(user=unauthorized_user)
        url = reverse('invoice-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestInvoiceCreate:
    def test_yetkisiz_kullanici_fatura_olusturamaz(self, api_client, user):
        """invoices.view_invoice olan ama invoices.manage_invoice olmayan kullanıcı oluşturamaz."""
        api_client.force_authenticate(user=user)
        url = reverse('invoice-list')
        response = api_client.post(url, {}, format='json')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_manager_kullanici_olusturma_icin_yetkilidir(self, api_client, manager_user):
        """invoices.manage_invoice izni olan kullanıcı fatura oluşturmayı dener
        (geçersiz veri ile 400 beklenir; 403/401 dönmemeli)."""
        api_client.force_authenticate(user=manager_user)
        url = reverse('invoice-list')
        response = api_client.post(url, {}, format='json')
        # manage_invoice yetkisi var ama veri eksik → 400 Bad Request
        assert response.status_code == status.HTTP_400_BAD_REQUEST
