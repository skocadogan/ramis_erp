import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import Branch


User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def branch(db):
    return Branch.objects.create(name="Test Branch", code="TEST", address="Test Address", phone="1234567890")


@pytest.fixture
def user(db):
    return User.objects.create_user(username="testuser", email="test@test.com", password="testpass123")


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(username="admin", email="admin@test.com", password="adminpass123")


@pytest.mark.django_db
class TestBranchUserAssignment:
    def test_assign_users_to_branch(self, api_client, admin_user, branch, user):
        api_client.force_authenticate(user=admin_user)
        response = api_client.post(
            f"/api/v1/branches/{branch.id}/assign_users/",
            {"user_ids": [str(user.id)]},
            format="json",
        )
        assert response.status_code == 200
        user.refresh_from_db()
        assert user.branch_id == branch.id

    def test_get_branch_users(self, api_client, admin_user, branch, user):
        user.branch = branch
        user.save()
        api_client.force_authenticate(user=admin_user)
        response = api_client.get(f"/api/v1/branches/{branch.id}/users/")
        assert response.status_code == 200
        assert len(response.data) == 1
        assert response.data[0]["username"] == "testuser"

    def test_remove_user_from_branch(self, api_client, admin_user, branch, user):
        user.branch = branch
        user.save()
        api_client.force_authenticate(user=admin_user)
        response = api_client.delete(f"/api/v1/branches/{branch.id}/users/{user.id}/")
        assert response.status_code == 204
        user.refresh_from_db()
        assert user.branch_id is None

    def test_branch_list_includes_users_count(self, api_client, admin_user, branch, user):
        user.branch = branch
        user.save()
        api_client.force_authenticate(user=admin_user)
        response = api_client.get("/api/v1/branches/")
        assert response.status_code == 200
        results = response.data.get("results", response.data)
        branch_data = next(b for b in results if str(b["id"]) == str(branch.id))
        assert branch_data["users_count"] == 1
