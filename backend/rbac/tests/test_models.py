"""Role, RolePermission, RBACAuditLog model testleri."""
from rbac.tests import RBACTestCase
from rbac import Role, RolePermission, PermissionCategory, RBACAuditLog
from app.user.models import CustomUser


class RoleHierarchyTests(RBACTestCase):
    def setUp(self):
        self.category = PermissionCategory.objects.create(
            code='test', name='Test', description='Test'
        )
        self.perm1 = RolePermission.objects.create(
            code='test.view', name='View', category=self.category
        )
        self.perm2 = RolePermission.objects.create(
            code='test.edit', name='Edit', category=self.category
        )

    def test_get_inherited_permission_codes(self):
        admin = Role.objects.create(name='Admin', is_active=True)
        admin.permissions.add(self.perm1, self.perm2)
        manager = Role.objects.create(name='Manager', parent_role=admin, is_active=True)
        manager.permissions.add(self.perm1)

        codes = manager.get_inherited_permission_codes()
        self.assertIn('test.view', codes)
        self.assertIn('test.edit', codes)

    def test_audit_log_creation(self):
        log = RBACAuditLog.objects.create(
            action=RBACAuditLog.ACTION_CREATE,
            target_type=RBACAuditLog.TARGET_ROLE,
            target_id=1,
            target_repr='TestRole',
            changes={'name': 'TestRole'},
        )
        self.assertEqual(log.action, 'create')
        self.assertEqual(RBACAuditLog.objects.count(), 1)
