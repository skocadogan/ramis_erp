"""WS throttle birim testleri."""

import asyncio
from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from core.ws_throttle import _run_db_safe, check_ws_connection_throttle, throttle_coalesced


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


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "ws-throttle-tests",
        }
    }
)
class WsThrottleTrailingFlushTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_trailing_flush_runs_until_pending_drained(self):
        runs: list[str] = []

        def run() -> None:
            runs.append("run")

        with patch("core.ws_throttle._KDS_STATS_THROTTLE_SECONDS", 0.01):
            with patch("core.ws_throttle._schedule_flush") as mock_schedule:
                def immediate_schedule(prefix, branch_id, window, callback):
                    async def _flush_once() -> None:
                        await asyncio.sleep(window)
                        pkey = f"ws:pending:{prefix}:{branch_id}"
                        tkey = f"ws:throttle:{prefix}:{branch_id}"
                        if not cache.get(pkey):
                            return
                        if not cache.add(tkey, 1, timeout=window):
                            return
                        cache.delete(pkey)
                        callback()

                    loop = asyncio.new_event_loop()
                    try:
                        loop.run_until_complete(_flush_once())
                    finally:
                        loop.close()

                mock_schedule.side_effect = immediate_schedule
                throttle_coalesced("test", "branch-1", run=run)
                throttle_coalesced("test", "branch-1", run=run)

        assert runs == ["run", "run"]

    def test_check_ws_connection_throttle_uses_atomic_counter(self):
        scope = {"client": ("127.0.0.1", 12345)}

        async def _check(limit: int) -> bool:
            return await check_ws_connection_throttle(scope, max_connections=limit)

        assert asyncio.run(_check(2)) is True
        assert asyncio.run(_check(2)) is True
        assert asyncio.run(_check(2)) is False
