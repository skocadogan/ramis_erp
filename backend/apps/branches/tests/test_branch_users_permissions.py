from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.branches.models import Branch
from rbac.models import PermissionCategory, Role, RolePermission

User = get_user_model()


class BranchUsersPermissionsTest(APITestCase):
    def setUp(self):
        cat = PermissionCategory.objects.create(code="branches", name="Branches")
        cook_perm = RolePermission.objects.create(
            code="branches.manage_cook_assignment",
            name="Cook Assignment",
            category=cat,
        )
        manage_branch_perm = RolePermission.objects.create(
            code="branches.manage_branch",
            name="Manage Branch",
            category=cat,
        )

        cook_role = Role.objects.create(name="CookAssigner")
        cook_role.permissions.add(cook_perm)

        branch_admin_role = Role.objects.create(name="BranchAdmin")
        branch_admin_role.permissions.add(manage_branch_perm)

        self.branch = Branch.objects.create(name="Branch 1", code="B1")
        self.staff = User.objects.create_user(
            username="cook1",
            password="pw",
            email="cook1@test.com",
            branch=self.branch,
        )

        self.cook_assigner = User.objects.create_user(
            username="assigner",
            password="pw",
            email="assigner@test.com",
            branch=self.branch,
        )
        self.cook_assigner.roles.add(cook_role)

        self.branch_admin = User.objects.create_user(
            username="branchadmin",
            password="pw",
            email="branchadmin@test.com",
            branch=self.branch,
        )
        self.branch_admin.roles.add(branch_admin_role)

        self.url = reverse("branch-users", kwargs={"pk": self.branch.id})

    def test_cook_assignment_manager_can_list_branch_users(self):
        self.client.force_authenticate(user=self.cook_assigner)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {row["username"] for row in response.data}
        self.assertIn("cook1", usernames)

    def test_cook_assignment_manager_cannot_assign_users(self):
        other = User.objects.create_user(
            username="other",
            password="pw",
            email="other@test.com",
        )
        assign_url = reverse("branch-assign-users", kwargs={"pk": self.branch.id})
        self.client.force_authenticate(user=self.cook_assigner)
        response = self.client.post(assign_url, {"user_ids": [str(other.id)]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_branch_admin_can_assign_users(self):
        other = User.objects.create_user(
            username="other2",
            password="pw",
            email="other2@test.com",
        )
        assign_url = reverse("branch-assign-users", kwargs={"pk": self.branch.id})
        self.client.force_authenticate(user=self.branch_admin)
        response = self.client.post(assign_url, {"user_ids": [str(other.id)]}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
