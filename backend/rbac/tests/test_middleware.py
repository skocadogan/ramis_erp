"""RBACMiddleware testleri."""
from django.test import RequestFactory
from rbac.tests import RBACTestCase
from django.contrib.auth.models import AnonymousUser

from rbac.middlewares import RBACMiddleware, get_user_permissions
from rbac import Role, RolePermission, PermissionCategory
from app.user.models import CustomUser


class MiddlewareTests(RBACTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.category = PermissionCategory.objects.create(
            code='test', name='Test', description='Test'
        )
        self.perm = RolePermission.objects.create(
            code='test.view', name='View', category=self.category
        )
        self.role = Role.objects.create(name='Viewer', is_active=True)
        self.role.permissions.add(self.perm)
        self.user = CustomUser.objects.create_user(
            username='miduser', password='test123', email='mid@m.com'
        )
        self.user.roles.add(self.role)

    def test_middleware_sets_user_permissions(self):
        req = self.factory.get('/')
        req.user = self.user
        middleware = RBACMiddleware(lambda r: None)
        middleware.process_request(req)
        perms = req.user_permissions
        self.assertIn('test.view', perms)

    def test_middleware_has_permission(self):
        req = self.factory.get('/')
        req.user = self.user
        middleware = RBACMiddleware(lambda r: None)
        middleware.process_request(req)
        self.assertTrue(req.has_permission('test.view'))
        self.assertFalse(req.has_permission('test.edit'))

    def test_get_user_permissions_anonymous(self):
        req = self.factory.get('/')
        req.user = AnonymousUser()
        perms = get_user_permissions(req)
        self.assertEqual(perms, set())
