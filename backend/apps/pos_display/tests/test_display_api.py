"""
pos_display API testleri — TEST-2.

Kapsam:
  - DisplaySettings: branch_id zorunlu (P1-2 regresyon)
  - PromotionSlide: listeleme, aktif filtre, reorder IDOR koruması (P1-3 regresyon)
  - BaseModel UUID PK migrasyonunun doğrulaması (PERF-3 regresyon)
"""
import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.pos_display.models import DisplaySettings, PromotionSlide

User = get_user_model()


# ------------------------------------------------------------------ #
# Fixture'lar                                                          #
# ------------------------------------------------------------------ #

def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={'name': name, 'category': cat})[0]


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='POS Şubesi', code='POS')


@pytest.fixture
def other_branch(db):
    return Branch.objects.create(name='Diğer POS Şubesi', code='POS2')


@pytest.fixture
def display_settings(db, branch):
    return DisplaySettings.objects.create(branch=branch)


@pytest.fixture
def slide_active(db, branch):
    return PromotionSlide.objects.create(
        branch=branch, title='Aktif Slayt', type='TEXT', is_active=True, order=1,
    )


@pytest.fixture
def slide_inactive(db, branch):
    return PromotionSlide.objects.create(
        branch=branch, title='Pasif Slayt', type='TEXT', is_active=False, order=2,
    )


@pytest.fixture
def other_branch_slide(db, other_branch):
    return PromotionSlide.objects.create(
        branch=other_branch, title='Diğer Şube Slaytı', type='TEXT', is_active=True, order=1,
    )


@pytest.fixture
def pos_cat(db):
    return PermissionCategory.objects.get_or_create(code='pos', defaults={'name': 'POS'})[0]


@pytest.fixture
def pos_manager(db, branch, pos_cat):
    role = Role.objects.create(name='POS Yönetici')
    role.permissions.add(_make_perm('pos.manage_display', 'POS Yönet', pos_cat))
    user = User.objects.create_user(
        username='posmgr', password='pw', email='posmgr@test.com', branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def api_client():
    return APIClient()


# ------------------------------------------------------------------ #
# DisplaySettings — P1-2 Regresyon                                    #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestDisplaySettingsView:
    def test_branch_id_olmadan_bos_doner(self, api_client, display_settings):
        """P1-2 regresyon: branch_id olmadan liste isteği boş döner."""
        url = reverse('display-settings-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get('results', response.data)
        assert len(data) == 0

    def test_branch_id_ile_ayarlar_gelir(self, api_client, branch, display_settings):
        url = reverse('display-settings-list')
        response = api_client.get(url, {'branch_id': str(branch.id)})
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get('results', response.data)
        assert len(data) == 1

    def test_yetkisiz_kullanici_guncelleme_yapamaz(self, api_client, display_settings):
        url = reverse('display-settings-detail', kwargs={'pk': display_settings.id})
        response = api_client.patch(url, {'idle_timeout': 60}, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_pos_yonetici_guncelleme_yapabilir(self, api_client, display_settings, pos_manager):
        api_client.force_authenticate(user=pos_manager)
        url = reverse('display-settings-detail', kwargs={'pk': display_settings.id})
        response = api_client.patch(url, {'idle_timeout': 60}, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['idle_timeout'] == 60

    def test_basemodel_uuid_pk_kullaniliyor(self, db, branch, display_settings):
        """PERF-3 regresyon: id alanı UUID olmalı."""
        import uuid
        try:
            uuid.UUID(str(display_settings.id))
        except ValueError:
            pytest.fail("DisplaySettings.id UUID değil — PERF-3 migrasyonu çalışmamış olabilir.")


# ------------------------------------------------------------------ #
# PromotionSlide — P1-2 + P1-3 Regresyon                             #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestPromotionSlideListView:
    def test_branch_id_olmadan_bos_doner(self, api_client, slide_active):
        """P1-2 regresyon: branch_id olmadan liste isteği boş döner."""
        url = reverse('promotion-slides-list')
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get('results', response.data)
        assert len(data) == 0

    def test_branch_id_ile_slaytlar_gelir(self, api_client, branch, slide_active, slide_inactive):
        url = reverse('promotion-slides-list')
        response = api_client.get(url, {'branch_id': str(branch.id)})
        assert response.status_code == status.HTTP_200_OK
        data = response.data.get('results', response.data)
        assert len(data) == 2

    def test_aktif_filtresi_yalnizca_aktif_slaytlari_doner(
        self, api_client, branch, slide_active, slide_inactive
    ):
        url = reverse('promotion-slides-active')
        response = api_client.get(url, {'branch_id': str(branch.id)})
        assert response.status_code == status.HTTP_200_OK
        titles = [s['title'] for s in response.data]
        assert 'Aktif Slayt' in titles
        assert 'Pasif Slayt' not in titles

    def test_basemodel_uuid_pk_kullaniliyor(self, db, slide_active):
        """PERF-3 regresyon: id alanı UUID olmalı."""
        import uuid
        try:
            uuid.UUID(str(slide_active.id))
        except ValueError:
            pytest.fail("PromotionSlide.id UUID değil — PERF-3 migrasyonu çalışmamış olabilir.")


@pytest.mark.django_db
class TestPromotionSlideReorderView:
    """P1-3 Regresyon: IDOR koruması — başka şubenin slaytlarını sıralayamaz."""

    def test_reorder_yetkisiz_engellenir(self, api_client, slide_active):
        url = reverse('promotion-slides-reorder')
        response = api_client.post(url, {'order_ids': [str(slide_active.id)]}, format='json')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_kendi_slaytlarini_siralayabilir(self, api_client, branch, slide_active, slide_inactive, pos_manager):
        api_client.force_authenticate(user=pos_manager)
        url = reverse('promotion-slides-reorder')
        # branch_id query param olarak geçirilmeli (get_queryset onu query_params'tan okur)
        payload = {'order_ids': [str(slide_inactive.id), str(slide_active.id)]}
        response = api_client.post(
            url, payload, format='json', QUERY_STRING=f'branch_id={branch.id}',
        )
        assert response.status_code == status.HTTP_200_OK

        slide_inactive.refresh_from_db()
        slide_active.refresh_from_db()
        assert slide_inactive.order == 0
        assert slide_active.order == 1

    def test_baska_subenin_slaytini_siralayamaz(
        self, api_client, branch, slide_active, other_branch_slide, pos_manager
    ):
        """P1-3 regresyon: IDOR — farklı şubenin slayt id'si 403 döndürmeli."""
        api_client.force_authenticate(user=pos_manager)
        url = reverse('promotion-slides-reorder')
        # branch'in query param ile kapsamlanmış queryset'i other_branch_slide'ı içermez → 403
        payload = {'order_ids': [str(slide_active.id), str(other_branch_slide.id)]}
        response = api_client.post(
            url, payload, format='json', QUERY_STRING=f'branch_id={branch.id}',
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
