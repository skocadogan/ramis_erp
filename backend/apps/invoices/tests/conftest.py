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
        code='invoices', defaults={'name': 'Faturalar'}
    )[0]


def _make_perm(code, name, cat):
    return RolePermission.objects.get_or_create(
        code=code, defaults={'name': name, 'category': cat}
    )[0]


@pytest.fixture
def user(db, branch, rbac_cat):
    """RBAC izinli kullanıcı: invoices.view_invoice."""
    role = Role.objects.create(name='Fatura Görüntüleyici')
    perm = _make_perm('invoices.view_invoice', 'Fatura Görüntüle', rbac_cat)
    role.permissions.add(perm)
    user = User.objects.create_user(
        username='invuser',
        email='inv@test.com',
        password='testpass123',
        branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def manager_user(db, branch, rbac_cat):
    """RBAC izinli kullanıcı: invoices.manage_invoice."""
    role = Role.objects.create(name='Fatura Yöneticisi')
    perm = _make_perm('invoices.manage_invoice', 'Fatura Yönet', rbac_cat)
    role.permissions.add(perm)
    user = User.objects.create_user(
        username='invmanager',
        email='man@test.com',
        password='testpass123',
        branch=branch,
    )
    user.roles.add(role)
    return user


@pytest.fixture
def unauthorized_user(db, branch):
    """Yetkisiz kullanıcı: hiçbir rolü yok."""
    return User.objects.create_user(
        username='nobody',
        email='nobody@test.com',
        password='testpass123',
        branch=branch,
    )
