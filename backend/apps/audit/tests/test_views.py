"""
AuditLogViewSet API testleri.
"""
import pytest
from django.urls import reverse
from rest_framework import status

from apps.audit.models import AuditLog


@pytest.mark.django_db
class TestAuditLogList:
    def test_yetkili_kullanici_liste_goruntuler(self, api_client, branch, user):
        """audit.view_auditlog iznine sahip kullanıcı 200 alır."""
        api_client.force_authenticate(user=user)
        url = reverse('auditlog-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_yetkisiz_kullanici_403_alir(self, api_client, unauthorized_user):
        """RBAC izni olmayan kullanıcı audit log listeleyemez."""
        api_client.force_authenticate(user=unauthorized_user)
        url = reverse('auditlog-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_kimlik_dogrulamasi_gerekir(self, api_client):
        """Giriş yapmamış kullanıcı erişemez."""
        url = reverse('auditlog-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
