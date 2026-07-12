import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.branches.models import Branch

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name='Test Şube', code='TST')


@pytest.fixture
def user(db, branch):
    """Arama için IsAuthenticated yeterli; özel RBAC kodu gerekmez."""
    return User.objects.create_user(
        username='searchuser',
        email='search@test.com',
        password='testpass123',
        branch=branch,
    )
