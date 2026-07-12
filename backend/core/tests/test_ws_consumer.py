import asyncio

from core.ws_consumer import ws_safe_send


class _DisconnectingConsumer:
    async def send(self, text_data=None, bytes_data=None):
        raise type("Disconnected", (Exception,), {})("Attempt to send on a closed protocol")


def test_ws_safe_send_swallows_client_disconnect():
    sent = asyncio.run(ws_safe_send(_DisconnectingConsumer(), text_data='{"type":"ping"}'))
    assert sent is False
