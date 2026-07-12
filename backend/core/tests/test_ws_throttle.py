"""WS throttle birim testleri."""

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from core.ws_throttle import _run_db_safe


class WsThrottleDbSafeTests(SimpleTestCase):
    def test_run_db_safe_refreshes_connection_around_callback(self):
        callback = MagicMock()

        with patch("django.db.close_old_connections") as close_old:
            with patch("django.db.connection") as conn:
                with patch(
                    "core.postgres_connection.resolve_postgres_conn_max_age",
                    return_value=0,
                ):
                    _run_db_safe(callback)

        callback.assert_called_once()
        assert close_old.call_count == 2
        conn.close.assert_called_once()
