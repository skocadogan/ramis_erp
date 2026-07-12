"""
GlobalSearchView API testleri.
"""
import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestGlobalSearch:
    def test_search_endpoint_yetkili_kullanici_icin_200_doner(self, api_client, user):
        """IsAuthenticated olan kullanıcı arama yapabilir."""
        api_client.force_authenticate(user=user)
        url = reverse('global-search')
        response = api_client.get(url, {'q': 'test'})
        assert response.status_code == status.HTTP_200_OK

    def test_bos_query_ile_arama_yapilabilir(self, api_client, user):
        """Boş query parametresi ile arama yapıldığında hata vermez."""
        api_client.force_authenticate(user=user)
        url = reverse('global-search')
        response = api_client.get(url, {'q': ''})
        assert response.status_code == status.HTTP_200_OK

    def test_kimlik_dogrulamasi_gerekir(self, api_client):
        """Giriş yapmamış kullanıcı arama yapamaz."""
        url = reverse('global-search')
        response = api_client.get(url, {'q': 'test'})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
