"""WebSocket yayın birim testleri."""

from unittest.mock import AsyncMock, MagicMock, patch

from django.test import SimpleTestCase

from apps.orders.ws_broadcast import broadcast_kds_refresh, broadcast_kds_stats


class WsBroadcastTests(SimpleTestCase):
    def test_broadcast_kds_refresh_single_event_per_channel(self):
        layer = MagicMock()
        layer.group_send = AsyncMock()

        with patch("apps.orders.ws_broadcast._WS_BYPASS_CELERY", True):
            with patch("apps.orders.ws_broadcast.get_channel_layer", return_value=layer):
                broadcast_kds_refresh("branch-1", reason="test", order_id="ord-1")

        assert layer.group_send.await_count == 4
        types = [call.args[1]["type"] for call in layer.group_send.await_args_list]
        assert types.count("orders_updated") == 4
        assert "kds.refresh" not in types

    def test_broadcast_kds_stats_throttled(self):
        layer = MagicMock()
        layer.group_send = AsyncMock()

        with patch("apps.orders.ws_broadcast.get_channel_layer", return_value=layer):
            with patch(
                "apps.orders.ws_broadcast._broadcast_kds_stats_now",
                side_effect=lambda bid: layer.group_send(f"kitchen_notifications_{bid}", {"type": "x"}),
            ):
                broadcast_kds_stats("branch-1")
                broadcast_kds_stats("branch-1")

        assert layer.group_send.call_count == 1
