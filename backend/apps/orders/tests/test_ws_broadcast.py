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

    def test_order_status_changed_bypasses_celery(self):
        layer = MagicMock()
        layer.group_send = AsyncMock()

        with patch("apps.orders.ws_broadcast.get_channel_layer", return_value=layer):
            with patch("apps.orders.ws_broadcast._WS_BYPASS_CELERY", False):
                from apps.orders.ws_broadcast import broadcast_kitchen_order_status_changed

                with patch(
                    "apps.orders.tasks.broadcast_kitchen_order_status_changed_task"
                ) as mock_task:
                    broadcast_kitchen_order_status_changed(
                        "branch-1",
                        {"event": "status_update", "item_id": "i1", "item_status": "READY"},
                    )
                    mock_task.delay.assert_not_called()

        assert layer.group_send.await_count == 4

    def test_order_status_changed_stashes_latest_payload(self):
        from django.core.cache import cache

        from apps.orders.ws_broadcast import (
            _order_status_pending_msg_key,
            broadcast_kitchen_order_status_changed,
        )

        bid = "branch-1"
        cache.delete(_order_status_pending_msg_key(bid))
        with patch("apps.orders.ws_broadcast.throttle_coalesced") as mock_throttle:
            broadcast_kitchen_order_status_changed(bid, {"item_id": "a"})
            broadcast_kitchen_order_status_changed(bid, {"item_id": "b"})

        assert mock_throttle.call_count == 2
        assert cache.get(_order_status_pending_msg_key(bid)) == {"item_id": "b"}
