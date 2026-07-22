import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from core.ws_consumer import WS_RATE_LIMIT_CLOSE_CODE, ws_allow_connection, ws_safe_send


class _DisconnectingConsumer:
    async def send(self, text_data=None, bytes_data=None):
        raise type("Disconnected", (Exception,), {})("Attempt to send on a closed protocol")


def test_ws_safe_send_swallows_client_disconnect():
    sent = asyncio.run(ws_safe_send(_DisconnectingConsumer(), text_data='{"type":"ping"}'))
    assert sent is False


def test_ws_allow_connection_closes_with_rate_limit_code():
    consumer = SimpleNamespace(scope={}, close=AsyncMock())
    with patch(
        "core.ws_throttle.check_ws_connection_throttle",
        new=AsyncMock(return_value=False),
    ):
        allowed = asyncio.run(ws_allow_connection(consumer))

    assert allowed is False
    consumer.close.assert_awaited_once_with(code=WS_RATE_LIMIT_CLOSE_CODE)
