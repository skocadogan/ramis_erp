from django.db.utils import OperationalError
from django.test import SimpleTestCase
from rest_framework import status

from core.exception_handler import api_exception_handler


class DbOperationalErrorHandlerTests(SimpleTestCase):
    def test_connection_slots_busy_returns_503(self):
        exc = OperationalError(
            'connection failed: remaining connection slots are reserved for roles with the SUPERUSER attribute'
        )
        response = api_exception_handler(exc, {})
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response['Retry-After'], '2')
        self.assertEqual(response.data['code'], 'DB_CONNECTION_BUSY')

    def test_row_lock_unavailable_returns_409(self):
        exc = OperationalError('could not obtain lock on row in relation "orders_order"')
        response = api_exception_handler(exc, {})
        self.assertIsNotNone(response)
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['code'], 'ROW_LOCKED')

    def test_other_operational_error_falls_through(self):
        exc = OperationalError('syntax error at or near "FOO"')
        response = api_exception_handler(exc, {})
        self.assertIsNone(response)
