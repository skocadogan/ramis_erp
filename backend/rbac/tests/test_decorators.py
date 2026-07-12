"""@permission_required, @permission_required_all, @permission_forbidden, @role_required decorator testleri."""
from django.test import TestCase, RequestFactory
from django.http import HttpResponse
from django.contrib.auth.models import AnonymousUser

from rbac.tests import RBACTestCase
from rbac.permissions import (
    permission_required,
    permission_required_all,
    permission_forbidden,
    role_required,
)
from rbac import Role, RolePermission, PermissionCategory
from app.user.models import CustomUser


class DecoratorTests(RBACTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.category = PermissionCategory.objects.create(
            code='test', name='Test', description='Test kategori'
        )
        self.perm1 = RolePermission.objects.create(
            code='test.view', name='View', category=self.category
        )
        self.perm2 = RolePermission.objects.create(
            code='test.edit', name='Edit', category=self.category
        )
        self.role = Role.objects.create(name='Editor', is_active=True)
        self.role.permissions.add(self.perm1, self.perm2)
        self.user = CustomUser.objects.create_user(
            username='testuser', password='testpass123', email='test@test.com'
        )
        self.user.roles.add(self.role)

    def test_permission_required_single_ok(self):
        @permission_required('test.view')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_permission_required_single_fail(self):
        @permission_required('test.nonexistent')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 403)

    def test_permission_required_or_list_ok(self):
        @permission_required(['test.view', 'test.other'])
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_permission_required_unauthenticated(self):
        @permission_required('test.view')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = AnonymousUser()
        response = view(req)
        self.assertEqual(response.status_code, 403)

    def test_permission_required_all_ok(self):
        @permission_required_all(['test.view', 'test.edit'])
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_permission_required_all_fail(self):
        @permission_required_all(['test.view', 'test.edit', 'test.delete'])
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 403)

    def test_permission_forbidden_ok(self):
        @permission_forbidden('test.delete')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_permission_forbidden_fail(self):
        @permission_forbidden('test.view')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 403)

    def test_role_required_ok(self):
        @role_required('Editor')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 200)

    def test_role_required_fail(self):
        @role_required('Admin')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = self.user
        response = view(req)
        self.assertEqual(response.status_code, 403)

    def test_role_required_superuser_bypass(self):
        """Superuser rol kontrolünden muaf olmalı."""
        superuser = CustomUser.objects.create_superuser(
            username='admin', password='admin123', email='admin@test.com'
        )
        superuser.roles.clear()

        @role_required('Editor')
        def view(request):
            return HttpResponse('OK')

        req = self.factory.get('/')
        req.user = superuser
        response = view(req)
        self.assertEqual(response.status_code, 200)
