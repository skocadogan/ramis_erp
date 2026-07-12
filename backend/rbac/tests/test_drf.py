"""Django REST Framework RBAC entegrasyon testleri."""
import unittest

from django.test import RequestFactory
from rbac.tests import RBACTestCase
from django.contrib.auth.models import AnonymousUser

from rbac import Role, RolePermission, PermissionCategory
from app.user.models import CustomUser

try:
    from rest_framework.views import APIView
    from rest_framework.response import Response
    from rest_framework.test import APIRequestFactory, force_authenticate
    from rbac.drf import (
        RBACPermission,
        RBACPermissionAll,
        RBACPermissionForbidden,
        RBACRoleRequired,
    )
    DRF_AVAILABLE = True
except ImportError:
    DRF_AVAILABLE = False


@unittest.skipUnless(DRF_AVAILABLE, "Django REST Framework yüklü değil")
class DRFPermissionTests(RBACTestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.category = PermissionCategory.objects.create(
            code='test', name='Test', description='Test'
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
            username='drfuser', password='test123', email='drf@test.com'
        )
        self.user.roles.add(self.role)

    def test_rbac_permission_or_ok(self):
        class TestView(APIView):
            permission_classes = [RBACPermission]
            permission_codes = ['test.view', 'test.other']

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 200)

    def test_rbac_permission_or_fail(self):
        class TestView(APIView):
            permission_classes = [RBACPermission]
            permission_codes = ['test.delete']

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_rbac_permission_all_ok(self):
        class TestView(APIView):
            permission_classes = [RBACPermissionAll]
            permission_codes = ['test.view', 'test.edit']

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 200)

    def test_rbac_permission_all_fail(self):
        class TestView(APIView):
            permission_classes = [RBACPermissionAll]
            permission_codes = ['test.view', 'test.edit', 'test.delete']

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_rbac_permission_forbidden_ok(self):
        class TestView(APIView):
            permission_classes = [RBACPermissionForbidden]
            permission_forbidden = ['test.delete']

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 200)

    def test_rbac_permission_forbidden_fail(self):
        class TestView(APIView):
            permission_classes = [RBACPermissionForbidden]
            permission_forbidden = ['test.view']

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_rbac_role_required_ok(self):
        class TestView(APIView):
            permission_classes = [RBACRoleRequired]
            required_role = 'Editor'

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 200)

    def test_rbac_role_required_fail(self):
        class TestView(APIView):
            permission_classes = [RBACRoleRequired]
            required_role = 'Admin'

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        force_authenticate(request, user=self.user)
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_rbac_unauthenticated(self):
        class TestView(APIView):
            permission_classes = [RBACPermission]
            permission_codes = ['test.view']

            def get(self, request):
                return Response({'ok': True})

        request = self.factory.get('/')
        view = TestView.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 403)

    def test_required_permissions_dict_or_list(self):
        """ViewSet action bazlı required_permissions listesi OR mantığı ile çalışır."""
        class TestViewSet(APIView):
            permission_classes = [RBACPermission]
            action = 'print_thermal'
            required_permissions = {
                'print_thermal': ['reporting.generate_report', 'printing.direct_print'],
            }

            def post(self, request):
                return Response({'ok': True})

        direct_print = RolePermission.objects.create(
            code='printing.direct_print',
            name='Direct Print',
            category=self.category,
        )
        cashier_role = Role.objects.create(name='Cashier', is_active=True)
        cashier_role.permissions.add(direct_print)
        cashier = CustomUser.objects.create_user(
            username='cashier', password='test123', email='cashier@test.com'
        )
        cashier.roles.add(cashier_role)

        request = self.factory.post('/')
        force_authenticate(request, user=cashier)
        view = TestViewSet.as_view()
        response = view(request)
        self.assertEqual(response.status_code, 200)
