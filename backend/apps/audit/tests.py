import uuid

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.audit.models import AuditLog
from apps.audit.services import record_audit

User = get_user_model()


class RecordAuditJsonSerializationTests(TestCase):
    def test_record_audit_serializes_uuid_in_json_fields(self):
        user = User.objects.create_user(username="audit_test", password="test")
        terminal_id = uuid.uuid4()

        log = record_audit(
            action="shift.opened",
            after_json={
                "opening_cash": "100.00",
                "terminal_id": terminal_id,
            },
            actor=user,
        )

        self.assertIsNotNone(log)
        log.refresh_from_db()
        self.assertEqual(log.after_json["terminal_id"], str(terminal_id))
        self.assertEqual(AuditLog.objects.count(), 1)
