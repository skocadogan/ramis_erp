import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def superuser(db):
    return User.objects.create_superuser(
        username="admin",
        email="admin@test.com",
        password="TestPass123!",
    )


@pytest.fixture
def regular_user(db):
    return User.objects.create_user(
        username="testuser",
        email="testuser@test.com",
        password="TestPass123!",
        first_name="Test",
        last_name="User",
    )


@pytest.mark.django_db
class TestUserCreateSerializer:
    def test_valid_password_accepted(self):
        from apps.users.serializers import UserCreateSerializer
        data = {
            "username": "newuser",
            "email": "new@test.com",
            "password": "StrongPass1!",
        }
        serializer = UserCreateSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_short_password_rejected(self):
        from apps.users.serializers import UserCreateSerializer
        data = {
            "username": "newuser",
            "email": "new@test.com",
            "password": "short",
        }
        serializer = UserCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "password" in serializer.errors

    def test_duplicate_username_rejected(self, regular_user):
        from apps.users.serializers import UserCreateSerializer
        data = {
            "username": "testuser",
            "email": "other@test.com",
            "password": "StrongPass1!",
        }
        serializer = UserCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "username" in serializer.errors

    def test_duplicate_email_rejected(self, regular_user):
        from apps.users.serializers import UserCreateSerializer
        data = {
            "username": "otheruser",
            "email": "testuser@test.com",
            "password": "StrongPass1!",
        }
        serializer = UserCreateSerializer(data=data)
        assert not serializer.is_valid()
        assert "email" in serializer.errors


@pytest.mark.django_db
class TestChangePasswordSerializer:
    def test_valid_change_password(self):
        from apps.users.serializers import ChangePasswordSerializer
        data = {
            "current_password": "OldPass123!",
            "new_password": "NewPass123!",
        }
        serializer = ChangePasswordSerializer(data=data)
        assert serializer.is_valid(), serializer.errors

    def test_short_new_password_rejected(self):
        from apps.users.serializers import ChangePasswordSerializer
        data = {
            "current_password": "OldPass123!",
            "new_password": "short",
        }
        serializer = ChangePasswordSerializer(data=data)
        assert not serializer.is_valid()
        assert "new_password" in serializer.errors


@pytest.mark.django_db
class TestUserAdminAPI:
    def test_list_users_requires_auth(self, api_client):
        response = api_client.get("/api/v1/admin/users/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_list_users_as_superuser(self, api_client, superuser):
        api_client.force_authenticate(user=superuser)
        response = api_client.get("/api/v1/admin/users/")
        assert response.status_code == status.HTTP_200_OK
        assert "results" in response.data

    def test_create_user(self, api_client, superuser):
        api_client.force_authenticate(user=superuser)
        data = {
            "username": "newstaff",
            "email": "newstaff@test.com",
            "password": "StrongPass1!",
            "first_name": "New",
            "last_name": "Staff",
        }
        response = api_client.post("/api/v1/admin/users/", data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data["username"] == "newstaff"
        assert User.objects.filter(username="newstaff").exists()

    def test_create_user_weak_password_rejected(self, api_client, superuser):
        api_client.force_authenticate(user=superuser)
        data = {
            "username": "weakuser",
            "email": "weak@test.com",
            "password": "123",
        }
        response = api_client.post("/api/v1/admin/users/", data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_update_user(self, api_client, superuser, regular_user):
        api_client.force_authenticate(user=superuser)
        response = api_client.patch(
            f"/api/v1/admin/users/{regular_user.id}/",
            {"first_name": "Updated"},
        )
        assert response.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.first_name == "Updated"

    def test_delete_user(self, api_client, superuser, regular_user):
        api_client.force_authenticate(user=superuser)
        response = api_client.delete(f"/api/v1/admin/users/{regular_user.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        regular_user.refresh_from_db()
        assert regular_user.is_active is False

    def test_user_search(self, api_client, superuser, regular_user):
        api_client.force_authenticate(user=superuser)
        response = api_client.get("/api/v1/admin/users/?search=testuser")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["count"] >= 1

    def test_user_filter_active(self, api_client, superuser, regular_user):
        api_client.force_authenticate(user=superuser)
        response = api_client.get("/api/v1/admin/users/?is_active=true")
        assert response.status_code == status.HTTP_200_OK
        for user in response.data["results"]:
            assert user["is_active"] is True

    def test_user_ordering(self, api_client, superuser):
        api_client.force_authenticate(user=superuser)
        response = api_client.get("/api/v1/admin/users/?ordering=-date_joined")
        assert response.status_code == status.HTTP_200_OK

    def test_shift_user_can_list_pos_users_without_manage_user(self, api_client, db):
        from rbac.models import Role, RolePermission, PermissionCategory
        from apps.branches.models import Branch

        cat_users = PermissionCategory.objects.create(code='users', name='Users')
        cat_shifts = PermissionCategory.objects.create(code='shifts', name='Shifts')
        cat_pos = PermissionCategory.objects.create(code='pos', name='POS')

        shift_perm = RolePermission.objects.create(
            code='shifts.view_shift', name='View Shift', category=cat_shifts,
        )
        pos_perm = RolePermission.objects.create(
            code='pos.view_pos', name='View POS', category=cat_pos,
        )
        RolePermission.objects.create(
            code='users.manage_user', name='Manage User', category=cat_users,
        )

        role = Role.objects.create(name='Kasiyer Test')
        role.permissions.add(shift_perm, pos_perm)

        branch = Branch.objects.create(name='Shift Şube', code='SHF1')
        cashier = User.objects.create_user(
            username='cashier1',
            email='cashier1@test.com',
            password='TestPass123!',
            branch=branch,
        )
        cashier.roles.add(role)

        pos_user = User.objects.create_user(
            username='posuser1',
            email='posuser1@test.com',
            password='TestPass123!',
            branch=branch,
        )
        pos_user.roles.add(role)

        api_client.force_authenticate(user=cashier)
        response = api_client.get(
            "/api/v1/admin/users/",
            {
                'has_permission': 'pos.view_pos',
                'page_size': 200,
                'branch': str(branch.id),
            },
        )
        assert response.status_code == status.HTTP_200_OK
        ids = {u['id'] for u in response.data['results']}
        assert str(pos_user.id) in ids

    def test_manager_cannot_create_user_on_other_branch(self, api_client, db):
        from rbac.models import Role, RolePermission, PermissionCategory
        from apps.branches.models import Branch

        cat = PermissionCategory.objects.create(code='users', name='Users')
        manage = RolePermission.objects.create(
            code='users.manage_user', name='Manage User', category=cat,
        )
        role = Role.objects.create(name='Branch Manager Scope')
        role.permissions.add(manage)

        branch_a = Branch.objects.create(name='Şube A', code='BA')
        branch_b = Branch.objects.create(name='Şube B', code='BB')
        manager = User.objects.create_user(
            username='mgr_scope',
            email='mgr_scope@test.com',
            password='TestPass123!',
            branch=branch_a,
        )
        manager.roles.add(role)

        api_client.force_authenticate(user=manager)
        response = api_client.post(
            "/api/v1/admin/users/",
            {
                "username": "crossbranch",
                "email": "cross@test.com",
                "password": "StrongPass1!",
                "branch_id": str(branch_b.id),
            },
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not User.objects.filter(username="crossbranch").exists()

    def test_manager_cannot_assign_role_with_extra_permissions(self, api_client, db):
        from rbac.models import Role, RolePermission, PermissionCategory
        from apps.branches.models import Branch

        cat = PermissionCategory.objects.create(code='users2', name='Users2')
        manage = RolePermission.objects.create(
            code='users.manage_user', name='Manage User', category=cat,
        )
        admin_perm = RolePermission.objects.create(
            code='rbac.manage_role', name='Manage Role', category=cat,
        )
        manager_role = Role.objects.create(name='Limited Manager')
        manager_role.permissions.add(manage)
        admin_role = Role.objects.create(name='Full Admin Escalation')
        admin_role.permissions.add(manage, admin_perm)

        branch = Branch.objects.create(name='Esc Şube', code='ESC')
        manager = User.objects.create_user(
            username='mgr_esc',
            email='mgr_esc@test.com',
            password='TestPass123!',
            branch=branch,
        )
        manager.roles.add(manager_role)

        api_client.force_authenticate(user=manager)
        response = api_client.post(
            "/api/v1/admin/users/",
            {
                "username": "escalated",
                "email": "escalated@test.com",
                "password": "StrongPass1!",
                "branch_id": str(branch.id),
                "role_ids": [admin_role.id],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert not User.objects.filter(username="escalated").exists()


@pytest.mark.django_db
class TestMeAPI:
    def test_get_profile(self, api_client, regular_user):
        api_client.force_authenticate(user=regular_user)
        response = api_client.get("/api/v1/auth/me/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["username"] == "testuser"
        assert response.data["email"] == "testuser@test.com"

    def test_update_profile(self, api_client, regular_user):
        api_client.force_authenticate(user=regular_user)
        response = api_client.patch(
            "/api/v1/auth/me/",
            {"first_name": "NewName"},
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["first_name"] == "NewName"

    def test_profile_requires_auth(self, api_client):
        response = api_client.get("/api/v1/auth/me/")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestChangePasswordAPI:
    def test_change_password_success(self, api_client, regular_user):
        api_client.force_authenticate(user=regular_user)
        response = api_client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "TestPass123!",
                "new_password": "NewStrong1!",
            },
        )
        assert response.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.check_password("NewStrong1!")

    def test_change_password_wrong_current(self, api_client, regular_user):
        api_client.force_authenticate(user=regular_user)
        response = api_client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "WrongPass!",
                "new_password": "NewStrong1!",
            },
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_change_password_requires_auth(self, api_client):
        response = api_client.post(
            "/api/v1/auth/change-password/",
            {
                "current_password": "TestPass123!",
                "new_password": "NewStrong1!",
            },
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
