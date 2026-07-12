"""PermissionForm ve PermissionCategoryForm testleri."""
from rbac.tests import RBACTestCase
from rbac.forms import PermissionForm, PermissionCategoryForm
from rbac import PermissionCategory, RolePermission


class FormTests(RBACTestCase):
    def setUp(self):
        self.category = PermissionCategory.objects.create(
            code='test', name='Test', description='Test'
        )

    def test_permission_form_valid_code(self):
        form = PermissionForm(data={
            'name': 'View Test',
            'code': 'test.view_items',
            'category': self.category.pk,
            'description': 'View items',
        })
        self.assertTrue(form.is_valid(), form.errors)

    def test_permission_form_invalid_code(self):
        form = PermissionForm(data={
            'name': 'Bad',
            'code': 'invalid code!',
            'category': self.category.pk,
            'description': 'Bad',
        })
        self.assertFalse(form.is_valid())
        self.assertIn('code', form.errors)

    def test_permission_form_app_category_mismatch(self):
        """App kısmı kategori kodu ile eşleşmeli."""
        form = PermissionForm(data={
            'name': 'Wrong',
            'code': 'other.view_items',
            'category': self.category.pk,
            'description': 'Wrong app',
        })
        self.assertFalse(form.is_valid())
        self.assertIn('code', form.errors)

    def test_category_form_valid(self):
        form = PermissionCategoryForm(data={
            'name': 'New Category',
            'code': 'newcat',
            'description': 'New category',
        })
        self.assertTrue(form.is_valid(), form.errors)

    def test_category_form_duplicate_code(self):
        form = PermissionCategoryForm(data={
            'name': 'Duplicate',
            'code': 'test',
            'description': 'Duplicate code',
        })
        self.assertFalse(form.is_valid())
        self.assertIn('code', form.errors)
