from decimal import Decimal
from uuid import uuid4

from django.test import SimpleTestCase

from core.json_utils import to_json_safe
from apps.reporting.receipt_views import (
    PRINT_IDEMPOTENCY_KEY_MAX_LENGTH,
    normalize_print_idempotency_key,
)


class ToJsonSafeTests(SimpleTestCase):
    def test_decimal_price_and_quantity(self):
        payload = {
            "subtotal": Decimal("180.0000"),
            "items": [
                {"name": "Köfte", "qty": Decimal("2"), "price": Decimal("90.0000")},
            ],
        }
        safe = to_json_safe(payload)
        self.assertEqual(safe["subtotal"], 180.0)
        self.assertEqual(safe["items"][0]["qty"], 2)
        self.assertEqual(safe["items"][0]["price"], 90.0)

    def test_uuid_and_nested_structures(self):
        uid = uuid4()
        safe = to_json_safe({"order_id": uid, "payments": [{"amount": Decimal("50.50")}]})
        self.assertEqual(safe["order_id"], str(uid))
        self.assertEqual(safe["payments"][0]["amount"], 50.5)


class PrintIdempotencyKeyTests(SimpleTestCase):
    def test_keeps_short_key(self):
        self.assertEqual(normalize_print_idempotency_key(" print:abc "), "print:abc")

    def test_hashes_key_over_database_limit(self):
        raw_key = "print:" + ("x" * 200)

        normalized = normalize_print_idempotency_key(raw_key)

        self.assertIsNotNone(normalized)
        self.assertLessEqual(len(normalized), PRINT_IDEMPOTENCY_KEY_MAX_LENGTH)
        self.assertTrue(normalized.startswith("sha256:"))
        self.assertEqual(normalized, normalize_print_idempotency_key(raw_key))
