"""WebSocket v2 zarf birim testleri."""

import json
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from core.ws_envelope import (
    build_channel_event,
    build_ws_event,
    table_ids_from_payload,
    use_ws_event_protocol_v2,
    wrap_legacy_event,
)


class WsEnvelopeTests(SimpleTestCase):
    def test_build_ws_event_extracts_scope_fields(self):
        with patch("core.ws_envelope.next_ws_sequence", return_value=7):
            envelope = build_ws_event(
                "order_status_changed",
                "branch-1",
                {
                    "event": "status_update",
                    "item_status": "READY",
                    "item_id": "item-1",
                    "order_id": "order-1",
                    "table_id": "table-1",
                },
            )

        assert envelope["version"] == 2
        assert envelope["sequence"] == 7
        assert envelope["type"] == "order_status_changed"
        assert envelope["branch_id"] == "branch-1"
        assert envelope["item_id"] == "item-1"
        assert envelope["order_id"] == "order-1"
        assert envelope["table_id"] == "table-1"
        assert envelope["data"] == {"event": "status_update", "item_status": "READY"}
        assert envelope["event_id"]
        assert envelope["occurred_at"]

    def test_wrap_legacy_event_flattens_v2_payload(self):
        channel_event = {
            "type": "order_status_changed",
            "message": {
                "version": 2,
                "event_id": "evt-1",
                "sequence": 3,
                "occurred_at": "2026-07-22T07:30:00+00:00",
                "type": "order_status_changed",
                "branch_id": "branch-1",
                "item_id": "item-1",
                "data": {"event": "status_update", "item_status": "READY"},
            },
        }
        wire = wrap_legacy_event(channel_event)
        assert wire["type"] == "order_status_changed"
        assert wire["data"]["item_id"] == "item-1"
        assert wire["data"]["item_status"] == "READY"
        assert wire["version"] == 2
        assert wire["event_id"] == "evt-1"

    @override_settings()
    def test_build_channel_event_respects_protocol_flag(self):
        with patch.dict("os.environ", {"WS_EVENT_PROTOCOL_V2": "false"}):
            assert use_ws_event_protocol_v2() is False
            legacy = build_channel_event(
                "orders_updated",
                "branch-1",
                {"reason": "item_status", "order_id": "o1"},
            )
            assert legacy["message"]["order_id"] == "o1"
            assert "version" not in legacy["message"]

    def test_table_ids_from_payload_collects_singular_and_plural(self):
        assert table_ids_from_payload(
            {"table_id": "t1", "table_ids": ["t2", "t1"]}
        ) == ["t1", "t2"]

    def test_fixture_samples_match_v2_shape(self):
        fixtures_dir = Path(__file__).resolve().parents[1] / "ws_contract" / "fixtures"
        for name in ("order_status_changed.json", "orders_updated.json"):
            payload = json.loads((fixtures_dir / name).read_text(encoding="utf-8"))
            assert payload["version"] == 2
            assert payload["event_id"]
            assert payload["sequence"] >= 1
            assert payload["branch_id"]
            assert payload["data"]
