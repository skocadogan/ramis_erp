"""Kritik WebSocket kanallarının bağlantı RBAC testleri."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from django.test import SimpleTestCase

from apps.branches.consumers import PosSyncConsumer, WaiterCallConsumer
from apps.orders.consumers import (
    KITCHEN_NOTIFICATIONS_WS_PERMISSIONS,
    KitchenNotificationConsumer,
)


class WsConsumerRbacTests(SimpleTestCase):
    def _consumer(self, consumer_class):
        consumer = consumer_class()
        consumer.scope = {"query_string": b"", "client": ("192.0.2.1", 1234)}
        consumer.close = AsyncMock()
        consumer._authenticate_ws = AsyncMock(
            return_value=SimpleNamespace(id="user-1", is_authenticated=True)
        )
        return consumer

    def test_pos_sync_denies_user_without_pos_or_waiter_permission(self):
        consumer = self._consumer(PosSyncConsumer)
        consumer._user_has_any_permission = AsyncMock(return_value=False)

        with patch(
            "apps.branches.consumers.ws_allow_connection",
            new=AsyncMock(return_value=True),
        ):
            asyncio.run(consumer.connect())

        consumer.close.assert_awaited_once()
        consumer._user_has_any_permission.assert_awaited_once_with(
            ("pos.view_pos", "waiter.access")
        )

    def test_kitchen_denies_user_without_kitchen_notification_permission(self):
        consumer = self._consumer(KitchenNotificationConsumer)
        consumer._user_has_any_permission = AsyncMock(return_value=False)

        with patch(
            "apps.orders.consumers.ws_allow_connection",
            new=AsyncMock(return_value=True),
        ):
            asyncio.run(consumer.connect())

        consumer.close.assert_awaited_once()
        consumer._user_has_any_permission.assert_awaited_once_with(
            KITCHEN_NOTIFICATIONS_WS_PERMISSIONS
        )

    def test_waiter_calls_denies_user_without_waiter_or_pos_permission(self):
        consumer = self._consumer(WaiterCallConsumer)
        consumer._user_has_any_permission = AsyncMock(return_value=False)

        with patch(
            "apps.branches.consumers.ws_allow_connection",
            new=AsyncMock(return_value=True),
        ):
            asyncio.run(consumer.connect())

        consumer.close.assert_awaited_once()
        consumer._user_has_any_permission.assert_awaited_once_with(
            ("waiter.access", "pos.view_pos")
        )
