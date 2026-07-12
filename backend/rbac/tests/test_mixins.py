"""RBACUserMixin ve PermissionRequiredMixin testleri."""
from django.test import RequestFactory
from rbac.tests import RBACTestCase
from django.views.generic import View
from django.http import HttpResponse
from django.core.exceptions import PermissionDenied

from rbac.mixins import RBACUserMixin
from rbac.permissions import PermissionRequiredMixin
from rbac import Role, RolePermission, PermissionCategory
from app.user.models import CustomUser


class MixinTests(RBACTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.category = PermissionCategory.objects.create(
            code='test', name='Test', description='Test'
        )
        self.perm = RolePermission.objects.create(
            code='test.view', name='View', category=self.category
        )
        self.perm2 = RolePermission.objects.create(
            code='test.edit', name='Edit', category=self.category
        )
        self.role = Role.objects.create(name='Viewer', is_active=True)
        self.role.permissions.add(self.perm)
        self.user = CustomUser.objects.create_user(
            username='mixuser', password='test123', email='m@m.com'
        )
        self.user.roles.add(self.role)

    def test_has_permission_true(self):
        self.assertTrue(self.user.has_permission('test.view'))

    def test_has_permission_false(self):
        self.assertFalse(self.user.has_permission('test.edit'))

    def test_get_all_permissions(self):
        perms = self.user.get_all_permissions()
        self.assertIn('test.view', perms)
        self.assertNotIn('test.edit', perms)

    def test_permission_required_mixin_or_ok(self):
        class TestView(PermissionRequiredMixin, View):
            permission_required = ['test.view', 'test.other']

            def get(self, request):
                return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        view = TestView.as_view()
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_permission_required_mixin_or_fail(self):
        class TestView(PermissionRequiredMixin, View):
            permission_required = ['test.other', 'test.nonexistent']

            def get(self, request):
                return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        view = TestView.as_view()
        with self.assertRaises(PermissionDenied):
            view(req)

    def test_permission_required_mixin_and_ok(self):
        self.role.permissions.add(self.perm2)

        class TestView(PermissionRequiredMixin, View):
            required_all_permissions = ['test.view', 'test.edit']

            def get(self, request):
                return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        view = TestView.as_view()
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_permission_required_mixin_and_fail(self):
        class TestView(PermissionRequiredMixin, View):
            required_all_permissions = ['test.view', 'test.edit']

            def get(self, request):
                return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        view = TestView.as_view()
        with self.assertRaises(PermissionDenied):
            view(req)

    def test_permission_required_mixin_forbidden_ok(self):
        class TestView(PermissionRequiredMixin, View):
            permission_required = 'test.view'
            permission_forbidden = ['test.delete']

            def get(self, request):
                return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        view = TestView.as_view()
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_permission_required_mixin_forbidden_fail(self):
        class TestView(PermissionRequiredMixin, View):
            permission_required = 'test.view'
            permission_forbidden = ['test.view']

            def get(self, request):
                return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        view = TestView.as_view()
        with self.assertRaises(PermissionDenied):
            view(req)

    def test_role_hierarchy_inherits_permissions(self):
        """Alt rol üst rolün izinlerini miras alır."""
        parent_role = Role.objects.create(name='Parent', is_active=True)
        parent_role.permissions.add(self.perm)
        child_role = Role.objects.create(name='Child', parent_role=parent_role, is_active=True)
        child_role.permissions.add(self.perm2)

        child_user = CustomUser.objects.create_user(
            username='childuser', password='test123', email='c@c.com'
        )
        child_user.roles.add(child_role)

        perms = child_user.get_all_permissions()
        self.assertIn('test.view', perms)
        self.assertIn('test.edit', perms)
