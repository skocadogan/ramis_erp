"""register_permissions ve rbac_manage management command testleri."""
import json
from io import StringIO

from django.core.management import call_command

from rbac.tests import RBACTestCase
from rbac import Role, RolePermission, PermissionCategory
from app.user.models import CustomUser


class RegisterPermissionsCommandTests(RBACTestCase):
    def setUp(self):
        self.category = PermissionCategory.objects.create(
            code='user', name='User', description='User module'
        )

    def test_dry_run(self):
        out = StringIO()
        call_command('register_permissions', '--dry-run', stdout=out)
        self.assertIn('DRY RUN', out.getvalue())

    def test_dry_run_json(self):
        out = StringIO()
        call_command('register_permissions', '--dry-run', '--json', stdout=out)
        data = json.loads(out.getvalue())
        self.assertTrue(data.get('dry_run'))
        self.assertIn('permissions', data)

    def test_reset_with_yes(self):
        Role.objects.create(name='TestRole')
        out = StringIO()
        call_command('register_permissions', '--reset', '--yes', stdout=out)
        self.assertEqual(Role.objects.count(), 0)


class RbacManageCommandTests(RBACTestCase):
    def test_list_categories_json(self):
        out = StringIO()
        call_command('rbac_manage', 'list', 'categories', '--json', stdout=out)
        data = json.loads(out.getvalue())
        self.assertIsInstance(data, list)

    def test_list_roles(self):
        Role.objects.create(name='TestRole')
        out = StringIO()
        call_command('rbac_manage', 'list', 'roles', stdout=out)
        self.assertIn('TestRole', out.getvalue())

    def test_create_role_with_parent(self):
        parent = Role.objects.create(name='Admin')
        out = StringIO()
        call_command('rbac_manage', 'create_role', 'Manager', '--parent', 'Admin', stdout=out)
        manager = Role.objects.get(name='Manager')
        self.assertEqual(manager.parent_role, parent)
