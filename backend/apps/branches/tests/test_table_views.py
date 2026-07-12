from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from rbac.models import Role, RolePermission, PermissionCategory
from apps.branches.models import Branch, Zone, Table, TableStatus

User = get_user_model()

class TableViewsTest(APITestCase):
    def setUp(self):
        # Setup RBAC
        cat = PermissionCategory.objects.create(code="branches", name="Branches")
        view_perm = RolePermission.objects.create(code="branches.view_table", name="View Table", category=cat)
        manage_perm = RolePermission.objects.create(code="branches.manage_table", name="Manage Table", category=cat)
        waiter_perm = RolePermission.objects.create(code="waiter.access", name="Waiter Access", category=cat)
        
        self.view_role = Role.objects.create(name="Viewer")
        self.view_role.permissions.add(view_perm)
        
        self.manage_role = Role.objects.create(name="Manager")
        self.manage_role.permissions.add(manage_perm)

        self.waiter_role = Role.objects.create(name="Waiter")
        self.waiter_role.permissions.add(waiter_perm, view_perm)
        
        self.viewer = User.objects.create_user(username='viewer', password='pw', email='viewer@test.com')
        self.viewer.roles.add(self.view_role)
        
        self.manager = User.objects.create_user(username='manager', password='pw', email='manager@test.com')
        self.manager.roles.add(self.manage_role)

        self.waiter = User.objects.create_user(username='waiter', password='pw', email='waiter@test.com')
        self.waiter.roles.add(self.waiter_role)

        self.branch = Branch.objects.create(name="Branch 1", code="B1")
        self.zone = Zone.objects.create(branch=self.branch, name="Zone 1")
        self.table = Table.objects.create(zone=self.zone, name="T1", table_number=1, status=TableStatus.FREE)

    def test_table_list_requires_view_permission(self):
        url = reverse('table-list')
        
        # Unauthorized
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Viewer
        self.client.force_authenticate(user=self.viewer)
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Assuming pagination or flat list. If pagination, response.data has 'results'.
        data = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertTrue(len(data) >= 1)

    def test_table_create_requires_manage_permission(self):
        url = reverse('table-list')
        data = {
            "name": "T2",
            "table_number": 2,
            "zone": str(self.zone.id)
        }
        
        # Viewer (should fail)
        self.client.force_authenticate(user=self.viewer)
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Manager (should succeed)
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_set_status_action(self):
        url = reverse('table-open', kwargs={'pk': self.table.id})
        
        self.client.force_authenticate(user=self.manager)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, TableStatus.OCCUPIED)

    def test_start_cleaning_allowed_for_waiter(self):
        url = reverse('table-start-cleaning', kwargs={'pk': self.table.id})

        bare = User.objects.create_user(username='bare', password='pw', email='bare@test.com')
        self.client.force_authenticate(user=bare)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(user=self.viewer)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.table.refresh_from_db()
        self.assertEqual(self.table.status, TableStatus.CLEANING)

        self.table.status = TableStatus.FREE
        self.table.save(update_fields=['status'])

        self.client.force_authenticate(user=self.waiter)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_finish_cleaning_allowed_for_waiter(self):
        self.table.status = TableStatus.CLEANING
        self.table.save(update_fields=['status'])
        url = reverse('table-finish-cleaning', kwargs={'pk': self.table.id})

        self.client.force_authenticate(user=self.waiter)
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.table.refresh_from_db()
        self.assertEqual(self.table.status, TableStatus.FREE)