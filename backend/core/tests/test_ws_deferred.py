"""WebSocket erteleme birim testleri."""

from unittest.mock import patch

from django.db import transaction
from django.test import TransactionTestCase

from core.ws_deferred import reset_deferred_state_for_tests, schedule_kds_refresh, schedule_table_broadcast


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
                "branch-1", "order_created", order_id="o1"
            )
