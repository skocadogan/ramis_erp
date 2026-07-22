"""WebSocket uçtan uca akış testleri — commit, çoklu delta, rollback."""

from unittest.mock import AsyncMock, MagicMock, patch

from django.test import TransactionTestCase

from core.ws_deferred import (
    reset_deferred_state_for_tests,
    schedule_kds_refresh,
    schedule_order_status_changed,
)


class WsMultiDeltaFlowTests(TransactionTestCase):
    """Transaction commit sonrası her kalem delta'sının korunması."""

    def setUp(self):
        reset_deferred_state_for_tests()

    def test_twenty_item_deltas_all_broadcast_after_commit(self):
        layer = MagicMock()
        layer.group_send = AsyncMock()
        broadcasts: list[dict] = []

        def capture_now(branch_id, message):
            broadcasts.append(message)

        with patch("apps.orders.ws_broadcast.get_channel_layer", return_value=layer):
            with patch(
                "apps.orders.ws_broadcast._broadcast_kitchen_order_status_changed_now",
                side_effect=capture_now,
            ):
                from django.db import transaction

                with transaction.atomic():
                    for i in range(20):
                        schedule_order_status_changed(
                            "branch-1",
                            {"item_id": f"item-{i}", "item_status": "READY"},
                        )

                self.assertEqual(len(broadcasts), 20)
                item_ids = {b["item_id"] for b in broadcasts}
                self.assertEqual(item_ids, {f"item-{i}" for i in range(20)})

    def test_rollback_discards_all_deltas(self):
        broadcasts: list[dict] = []

        with patch(
            "apps.orders.ws_broadcast._broadcast_kitchen_order_status_changed_now",
            side_effect=lambda bid, msg: broadcasts.append(msg),
        ):
            from django.db import transaction

            try:
                with transaction.atomic():
                    schedule_order_status_changed(
                        "branch-1",
                        {"item_id": "rollback-item", "item_status": "READY"},
                    )
                    raise ValueError("simulated rollback")
            except ValueError:
                pass

        self.assertEqual(broadcasts, [])


class WsDeferredMergeFlowTests(TransactionTestCase):
    def setUp(self):
        reset_deferred_state_for_tests()

    def test_merged_orders_updated_scope_on_flush(self):
        flushed: list[tuple] = []

        def capture_refresh(branch_id, reason, **extra):
            flushed.append((branch_id, reason, extra))

        with patch("apps.orders.ws_broadcast.broadcast_kds_refresh", side_effect=capture_refresh):
            from django.db import transaction

            with transaction.atomic():
                schedule_kds_refresh("branch-1", "item_status", order_id="o1", item_id="i1")
                schedule_kds_refresh("branch-1", "table_update", order_id="o2", table_id="t1")

            self.assertEqual(len(flushed), 1)
            _bid, _reason, extra = flushed[0]
            self.assertIn("item_status", extra.get("reasons", []))
            self.assertIn("table_update", extra.get("reasons", []))
            self.assertIn("o1", extra.get("order_ids", []))
            self.assertIn("o2", extra.get("order_ids", []))
            self.assertIn("t1", extra.get("table_ids", []))
            self.assertIn("i1", extra.get("item_ids", []))
