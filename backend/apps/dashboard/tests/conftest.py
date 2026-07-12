import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.branches.models import Branch
from rbac.models import Role, RolePermission, PermissionCategory

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Test Şube', code='TST')


@pytest.fixture
def rbac_cat(db):
    return PermissionCategory.objects.get_or_create(
        code='dashboard', defaults={'name': 'Gösterge Paneli'}
    )[0]


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(
        code=code, defaults={'name': name, 'category': cat}
    )[0]


@pytest.fixture
def user(db, branch, rbac_cat):
    """RBAC izinli kullanıcı: dashboard.view_dashboard."""
    role = Role.objects.create(name='Dashboard Görüntüleyici')
    perm = _make_perm('dashboard.view_dashboard', 'Dashboard Görüntüle', rbac_cat)
    role.permissions.add(perm)
    user = User.objects.create_user(
        username='dashuser',
        email='dash@test.com',
        password='testpass123',
        branch=branch,
    )
    user.roles.add(role)
    return user
