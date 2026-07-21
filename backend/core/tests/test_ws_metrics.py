"""WebSocket metrik birim testleri."""

from django.test import SimpleTestCase

from core.ws_metrics import get_ws_metrics_snapshot, record_ws_broadcast_latency


class WsMetricsTests(SimpleTestCase):
    def test_broadcast_latency_snapshot(self):
        record_ws_broadcast_latency("order_status_changed", 12.5)
        record_ws_broadcast_latency("order_status_changed", 48.0)
        record_ws_broadcast_latency("orders_updated", 3.2)

        snap = get_ws_metrics_snapshot()
        assert snap["last_broadcast_latency_ms"]["order_status_changed"] == 48.0
        assert snap["max_broadcast_latency_ms"]["order_status_changed"] == 48.0
        assert snap["last_broadcast_latency_ms"]["orders_updated"] == 3.2
