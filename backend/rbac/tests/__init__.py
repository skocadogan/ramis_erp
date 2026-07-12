# RBAC test paketi
from django.test import TestCase


class RBACTestCase(TestCase):
    """Audit aktör sızıntısını önlemek için her test öncesi temizlik."""
    def setUp(self):
        super().setUp()
        from rbac.signals import clear_audit_user
        clear_audit_user()
