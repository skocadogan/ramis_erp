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
        from django.core.cache import cache

        send = MagicMock()
        cache.delete("ws:throttle:kds_stats:branch-1")
        cache.delete("ws:pending:kds_stats:branch-1")

        with patch(
            "apps.orders.ws_broadcast._broadcast_kds_stats_now",
            side_effect=send,
        ):
            broadcast_kds_stats("branch-1")
            broadcast_kds_stats("branch-1")

        send.assert_called_once_with("branch-1")

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

    def test_order_status_changed_preserves_each_item_delta(self):
        from apps.orders.ws_broadcast import broadcast_kitchen_order_status_changed

        layer = MagicMock()
        layer.group_send = AsyncMock()
        with patch("apps.orders.ws_broadcast.get_channel_layer", return_value=layer):
            broadcast_kitchen_order_status_changed("branch-1", {"item_id": "a"})
            broadcast_kitchen_order_status_changed("branch-1", {"item_id": "b"})

        assert layer.group_send.await_count == 8

        def _item_id(message: dict) -> str | None:
            if message.get("version") == 2:
                return message.get("item_id")
            return message.get("item_id")

        item_ids = [
            _item_id(call.args[1]["message"])
            for call in layer.group_send.await_args_list
        ]
        assert item_ids.count("a") == 4
        assert item_ids.count("b") == 4

    def test_orders_updated_includes_table_sync_group(self):
        layer = MagicMock()
        layer.group_send = AsyncMock()

        with patch("apps.orders.ws_broadcast._WS_BYPASS_CELERY", True):
            with patch("apps.orders.ws_broadcast.get_channel_layer", return_value=layer):
                broadcast_kds_refresh(
                    "branch-1",
                    reason="item_status",
                    table_id="table-9",
                    order_id="ord-1",
                )

        groups = [call.args[0] for call in layer.group_send.await_args_list]
        assert groups.count("table_sync_table-9") == 1
        assert layer.group_send.await_count == 5
