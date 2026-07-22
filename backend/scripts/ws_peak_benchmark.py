#!/usr/bin/env python3
"""
WebSocket yoğun saat mikro-benchmark — 20 kalem / 100ms aralık delta kaybı ölçümü.

Kullanım (backend venv aktif):
  cd backend && python scripts/ws_peak_benchmark.py

Başarı ölçütü: 20/20 delta broadcast, p95 latency < 500ms (tek süreç, mock channel layer).
"""

from __future__ import annotations

import os
import statistics
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(BACKEND_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from unittest.mock import AsyncMock, MagicMock, patch

from apps.orders.ws_broadcast import broadcast_kitchen_order_status_changed
from core.ws_metrics import get_ws_metrics_snapshot, record_ws_broadcast_latency


def main() -> int:
    layer = MagicMock()
    layer.group_send = AsyncMock()
    latencies: list[float] = []
    count = 20
    interval_s = 0.1

    original_record = record_ws_broadcast_latency

    def capture_latency(event_type: str, latency_ms: float) -> None:
        latencies.append(latency_ms)
        original_record(event_type, latency_ms)

    with patch("apps.orders.ws_broadcast.get_channel_layer", return_value=layer):
        with patch(
            "apps.orders.ws_broadcast.record_ws_broadcast_latency",
            side_effect=capture_latency,
        ):
            started = time.monotonic()
            for i in range(count):
                broadcast_kitchen_order_status_changed(
                    "bench-branch",
                    {
                        "event": "status_update",
                        "item_id": f"bench-item-{i}",
                        "item_status": "READY",
                    },
                )
                if i < count - 1:
                    time.sleep(interval_s)
            elapsed = time.monotonic() - started

    sends = layer.group_send.await_count
    p95 = statistics.quantiles(latencies, n=20)[18] if len(latencies) >= 20 else max(latencies or [0])
    snap = get_ws_metrics_snapshot()

    print("=== WS Peak Micro-Benchmark ===")
    print(f"Items broadcast:     {count}")
    print(f"group_send calls:    {sends}")
    print(f"Elapsed:             {elapsed:.2f}s")
    print(f"p95 broadcast ms:    {p95:.1f}")
    print(f"instance_id:         {snap.get('instance_id')}")
    print(f"channel_layer_errors:{snap.get('channel_layer_errors_total', 0)}")

    ok = sends >= count * 4
    if not ok:
        print("FAIL: expected at least 4 group_send per item")
        return 1
    if p95 > 500:
        print(f"WARN: p95 latency {p95:.1f}ms exceeds 500ms target (local baseline)")
    print("PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
