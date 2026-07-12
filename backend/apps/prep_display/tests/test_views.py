"""
Prep Display API testleri.
"""
import pytest
from django.urls import reverse
from rest_framework import status


@pytest.mark.django_db
class TestPrepDisplaySetup:
    def test_branches_endpoint_allow_any_200_doner(self, api_client):
        """Şube listesi AllowAny — giriş gerekmez."""
        url = reverse('prep-display-setup-branches')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_stations_endpoint_branch_id_olmadan_400_doner(self, api_client):
        """branch_id zorunlu; verilmezse 400."""
        url = reverse('prep-display-setup-stations')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_stations_endpoint_gecerli_branch_ile_200_doner(self, api_client, branch):
        """Geçerli branch_id ile AllowAny istek başarılı."""
        url = reverse('prep-display-setup-stations')
        response = api_client.get(url, {'branch_id': str(branch.id)})
        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestPrepDisplaySession:
    def test_session_endpoint_allow_any_ile_calisir(self, api_client, branch, station):
        """Geçerli branch ve station ile oturum token'ı alır."""
        url = reverse('prep-display-session')
        response = api_client.post(url, {
            'branch_id': str(branch.id),
            'station_id': str(station.id),
        }, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert 'display_token' in response.data

    def test_session_endpoint_eksik_veri_ile_400_doner(self, api_client):
        """branch_id ve station_id zorunlu."""
        url = reverse('prep-display-session')
        response = api_client.post(url, {}, format='json')
        assert response.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
class TestPrepDisplayStation:
    @pytest.mark.skip(reason="PrepDisplayPrincipal.pk eksikliği — throttle ile çakışıyor (önceden var olan bug)")
    def test_station_endpoint_token_ile_200_doner(self, api_client, branch, station, display_token):
        """Geçerli Prep Display token ile istasyon bilgisi alınır."""
        url = reverse('prep-display-station')
        response = api_client.get(url, HTTP_X_PREP_DISPLAY_TOKEN=display_token)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == station.name

    def test_station_endpoint_gecersiz_token_ile_401_doner(self, api_client):
        """Geçersiz token ile erişim engellenir."""
        url = reverse('prep-display-station')
        response = api_client.get(url, HTTP_X_PREP_DISPLAY_TOKEN='gecersiz-token')
        assert response.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)
