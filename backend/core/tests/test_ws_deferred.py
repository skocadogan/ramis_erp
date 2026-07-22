"""WebSocket erteleme birim testleri."""

from unittest.mock import patch

from django.db import transaction
from django.test import TransactionTestCase

from core.ws_deferred import (
    reset_deferred_state_for_tests,
    schedule_kds_refresh,
    schedule_order_status_changed,
    schedule_table_broadcast,
)


class WsDeferredTests(TransactionTestCase):
    def setUp(self):
        reset_deferred_state_for_tests()

    def test_table_broadcast_coalesced_on_commit(self):
        with patch("apps.branches.signals.broadcast_table_change") as mock_broadcast:
            with patch(
                "apps.branches.selectors.get_table_with_active_orders",
                return_value=object(),
            ):
                with transaction.atomic():
                    schedule_table_broadcast("table-1", "upsert")
                    schedule_table_broadcast("table-1", "upsert")
                self.assertEqual(mock_broadcast.call_count, 1)

    def test_kds_refresh_deferred_on_commit(self):
        with patch("apps.orders.ws_broadcast.broadcast_kds_refresh") as mock_kds:
            with transaction.atomic():
                schedule_kds_refresh("branch-1", "order_created", order_id="o1")
            mock_kds.assert_called_once_with(
                "branch-1",
                "order_created",
                reasons=["order_created"],
                order_ids=["o1"],
                order_id="o1",
            )

    def test_kds_refresh_accumulates_all_scopes(self):
        with patch("apps.orders.ws_broadcast.broadcast_kds_refresh") as mock_kds:
            with transaction.atomic():
                schedule_kds_refresh(
                    "branch-1", "item_status", item_id="i1", order_id="o1"
                )
                schedule_kds_refresh(
                    "branch-1",
                    "bulk_status",
                    item_ids=["i2", "i1"],
                    order_ids=["o2"],
                    table_id="t1",
                )

            mock_kds.assert_called_once_with(
                "branch-1",
                "bulk_status",
                reasons=["bulk_status", "item_status"],
                order_ids=["o1", "o2"],
                table_ids=["t1"],
                table_id="t1",
                item_ids=["i1", "i2"],
            )

    def test_order_status_delta_runs_only_after_commit(self):
        with patch(
            "apps.orders.ws_broadcast.broadcast_kitchen_order_status_changed"
        ) as mock_broadcast:
            with transaction.atomic():
                schedule_order_status_changed("branch-1", {"item_id": "i1"})
                mock_broadcast.assert_not_called()

            mock_broadcast.assert_called_once_with("branch-1", {"item_id": "i1"})

    def test_order_status_delta_is_discarded_on_rollback(self):
        with patch(
            "apps.orders.ws_broadcast.broadcast_kitchen_order_status_changed"
        ) as mock_broadcast:
            try:
                with transaction.atomic():
                    schedule_order_status_changed("branch-1", {"item_id": "i1"})
                    raise RuntimeError("rollback")
            except RuntimeError:
                pass

            mock_broadcast.assert_not_called()
