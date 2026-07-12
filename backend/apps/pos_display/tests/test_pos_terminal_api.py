"""POS terminal API + müşteri ekranı token doğrulaması."""

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch
from apps.pos_display.models import PosTerminal

from django.contrib.auth import get_user_model

User = get_user_model()


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(code=code, defaults={"name": name, "category": cat})[0]


@pytest.fixture
def pos_cat(db):
    return PermissionCategory.objects.get_or_create(code="pos", defaults={"name": "POS"})[0]


@pytest.fixture
def branch_pos(db):
    return Branch.objects.create(name="Terminal Şubesi", code="T1")


@pytest.fixture
def pos_viewer(db, branch_pos, pos_cat):
    role = Role.objects.create(name="POS Kasa")
    role.permissions.add(_make_perm("pos.view_pos", "POS Gör", pos_cat))
    user = User.objects.create_user(username="cashier1", password="pw", email="c1@test.com", branch=branch_pos)
    user.roles.add(role)
    return user


@pytest.fixture
def pos_admin(db, branch_pos, pos_cat):
    role = Role.objects.create(name="POS Admin")
    role.permissions.add(_make_perm("pos.manage_display", "POS Ayar", pos_cat))
    user = User.objects.create_user(username="posadm", password="pw", email="pa@test.com", branch=branch_pos)
    user.roles.add(role)
    return user


@pytest.fixture
def pos_connections_only(db, branch_pos, pos_cat):
    """Müşteri ekranı yönetimi yok; sadece POS + bağlantı izni (manage_display yok)."""
    role = Role.objects.create(name="POS Bağlantı")
    role.permissions.add(_make_perm("pos.view_pos", "POS Gör", pos_cat))
    role.permissions.add(_make_perm("pos.manage_connections", "POS Bağlantı Yönet", pos_cat))
    user = User.objects.create_user(username="connmgr", password="pw", email="cm@test.com", branch=branch_pos)
    user.roles.add(role)
    return user


@pytest.fixture
def terminal_active(db, branch_pos):
    return PosTerminal.objects.create(
        branch=branch_pos,
        code="kasa-test",
        name="Test kasa",
        sort_order=0,
        is_active=True,
    )


@pytest.mark.django_db
class TestPosTerminalCrud:
    def test_list_requires_branch_id(self, api_client, pos_viewer):
        api_client.force_authenticate(user=pos_viewer)
        url = reverse("pos-terminals-list")
        r = api_client.get(url)
        assert r.status_code == status.HTTP_200_OK
        assert r.data.get("results", r.data) == []

    def test_list_returns_terminal(self, api_client, pos_viewer, branch_pos, terminal_active):
        api_client.force_authenticate(user=pos_viewer)
        url = reverse("pos-terminals-list")
        r = api_client.get(url, {"branch_id": str(branch_pos.id)})
        assert r.status_code == status.HTTP_200_OK
        results = r.data.get("results", r.data)
        assert len(results) >= 1
        codes = {row["code"] for row in results}
        assert "kasa-test" in codes

    def test_create_requires_manage_display(self, api_client, pos_viewer, branch_pos):
        api_client.force_authenticate(user=pos_viewer)
        url = reverse("pos-terminals-list")
        r = api_client.post(
            url,
            {"branch": str(branch_pos.id), "code": "yeni-kasa", "name": "Yeni", "sort_order": 1},
            format="json",
        )
        assert r.status_code == status.HTTP_403_FORBIDDEN

    def test_create_ok(self, api_client, pos_admin, branch_pos):
        api_client.force_authenticate(user=pos_admin)
        url = reverse("pos-terminals-list")
        r = api_client.post(
            url,
            {"branch": str(branch_pos.id), "code": "yeni-kasa", "name": "Yeni", "sort_order": 1},
            format="json",
        )
        assert r.status_code == status.HTTP_201_CREATED
        assert r.data["code"] == "yeni-kasa"

    def test_create_with_fiscal_data(self, api_client, pos_admin, branch_pos):
        api_client.force_authenticate(user=pos_admin)
        url = reverse("pos-terminals-list")
        r = api_client.post(
            url,
            {
                "branch": str(branch_pos.id),
                "code": "yeni-mali-kasa",
                "name": "Mali Kasa",
                "sort_order": 2,
                "fiscal_type": "MOCK",
                "fiscal_settings": {"simulated_delay": 2, "trigger_error": False}
            },
            format="json",
        )
        assert r.status_code == status.HTTP_201_CREATED
        assert r.data["fiscal_type"] == "MOCK"
        assert r.data["fiscal_settings"] == {"simulated_delay": 2, "trigger_error": False}

    def test_connections_ok_without_manage_display(self, api_client, pos_connections_only, branch_pos, terminal_active):
        """Bağlı cihaz listesi: pos.manage_display olmadan view_pos + manage_connections yeterli olmalı."""
        api_client.force_authenticate(user=pos_connections_only)
        url = reverse("pos-terminals-connections", kwargs={"pk": str(terminal_active.id)})
        r = api_client.get(url)
        assert r.status_code == status.HTTP_200_OK
        assert "results" in r.data

    def test_disconnect_requires_manage_connections(self, api_client, pos_viewer, branch_pos, terminal_active):
        api_client.force_authenticate(user=pos_viewer)
        url = reverse("pos-terminals-disconnect-connection", kwargs={"pk": str(terminal_active.id)})
        r = api_client.post(url, {"channel_name": "ch1"}, format="json")
        assert r.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestDisplayTokenRequiresRegisteredTerminal:
    def test_token_rejects_without_branch(self, api_client, pos_viewer):
        api_client.force_authenticate(user=pos_viewer)
        url = reverse("pos-display-ws-token")
        r = api_client.get(url, {"terminal_id": "x"})
        assert r.status_code == status.HTTP_400_BAD_REQUEST

    def test_token_ok_when_terminal_active(self, api_client, pos_viewer, branch_pos, terminal_active):
        api_client.force_authenticate(user=pos_viewer)
        url = reverse("pos-display-ws-token")
        r = api_client.get(url, {"terminal_id": terminal_active.code, "branch_id": str(branch_pos.id)})
        assert r.status_code == status.HTTP_200_OK
        assert "display_token" in r.data

    def test_token_403_for_inactive(self, api_client, pos_viewer, branch_pos, terminal_active):
        terminal_active.is_active = False
        terminal_active.save(update_fields=["is_active"])
        api_client.force_authenticate(user=pos_viewer)
        url = reverse("pos-display-ws-token")
        r = api_client.get(url, {"terminal_id": terminal_active.code, "branch_id": str(branch_pos.id)})
        assert r.status_code == status.HTTP_403_FORBIDDEN


@pytest.fixture
def api_client():
    return APIClient()
