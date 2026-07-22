"""WebSocket metrik birim testleri."""

from django.test import SimpleTestCase

from core.ws_metrics import (
    get_ws_metrics_snapshot,
    increment_ws_rate_limit_rejected,
    increment_ws_throttle_coalesced,
    record_ws_broadcast_latency,
)


class WsMetricsTests(SimpleTestCase):
    def test_broadcast_latency_snapshot(self):
        record_ws_broadcast_latency("order_status_changed", 12.5)
        record_ws_broadcast_latency("order_status_changed", 48.0)
        record_ws_broadcast_latency("orders_updated", 3.2)

        snap = get_ws_metrics_snapshot()
        assert snap["last_broadcast_latency_ms"]["order_status_changed"] == 48.0
        assert snap["max_broadcast_latency_ms"]["order_status_changed"] == 48.0
        assert snap["last_broadcast_latency_ms"]["orders_updated"] == 3.2

    def test_snapshot_includes_instance_and_counters(self):
        increment_ws_throttle_coalesced("kds_stats")
        increment_ws_rate_limit_rejected()

        snap = get_ws_metrics_snapshot()
        assert "instance_id" in snap
        assert snap["throttle_coalesced_by_prefix"]["kds_stats"] >= 1
        assert snap["rate_limit_rejected_total"] >= 1
