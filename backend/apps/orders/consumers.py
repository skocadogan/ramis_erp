import json
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.core.serializers.json import DjangoJSONEncoder

from core.ws_consumer import (
    ws_allow_connection,
    ws_handle_client_ping,
    ws_on_connect,
    ws_on_disconnect,
    ws_safe_send,
    ws_send_pong,
)
from core.ws_envelope import wrap_legacy_event

logger = logging.getLogger(__name__)


class KitchenNotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        if not await ws_allow_connection(self, use_authenticated_user=False):
            return
        query = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        prep_display_token = (
            (query.get("prep_display_token") or query.get("pdt") or [None])[0]
        )
        if prep_display_token:
            resolved = await self._connect_prep_display(prep_display_token)
            if resolved:
                return
            await self.close()
            return

        # --- WS Authentication ---
        user = await self._authenticate_ws()
        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.user = user
        if not await ws_allow_connection(self, user):
            return
        if not await self._user_has_permission("orders.view_kds"):
            await self.close()
            return
        query = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        branch_id = (query.get("branch_id") or [None])[0]
        eff_id, mode = await self._resolve_ws_branch(self.user, branch_id)
        if mode == "deny":
            await self.close()
            return

        if mode == "global":
            self.group_name = "kitchen_notifications"
        else:
            self.group_name = f"kitchen_notifications_{eff_id}"

        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )

        ws_on_connect("kitchen_notifications")
        await self.accept()

    async def _connect_prep_display(self, token: str) -> bool:
        parsed = await self._verify_prep_display_token(token)
        if not parsed:
            return False
        branch_id, _station_id = parsed
        self.group_name = f"kitchen_notifications_{branch_id}"
        self.is_prep_display = True
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        ws_on_connect("kitchen_notifications")
        await self.accept()
        return True

    @database_sync_to_async
    def _verify_prep_display_token(self, token: str):
        from apps.prep_display.ws_tokens import verify_prep_display_token

        return verify_prep_display_token(token)

    @database_sync_to_async
    def _authenticate_ws(self):
        from apps.users.ws_auth import get_user_for_websocket

        return get_user_for_websocket(self.scope)

    @database_sync_to_async
    def _resolve_ws_branch(self, user, branch_id_raw):
        from core.branch_scope import resolve_websocket_branch_subscription

        return resolve_websocket_branch_subscription(user, branch_id_raw)

    @database_sync_to_async
    def _user_has_permission(self, permission: str) -> bool:
        return self.user.has_permission(permission)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
        ws_on_disconnect("kitchen_notifications")

    async def receive(self, text_data=None, bytes_data=None):
        if await ws_handle_client_ping(text_data):
            await ws_send_pong(self)
            return
    async def order_status_changed(self, event):
        await ws_safe_send(
            self,
            text_data=json.dumps(wrap_legacy_event(event), cls=DjangoJSONEncoder),
        )

    async def kds_refresh(self, event):
        """KDS / POS: kds_active listesini HTTP ile yenilemek için tetikleyici."""
        wire = wrap_legacy_event(event)
        if wire.get("type") == "orders_updated":
            wire["type"] = "kds_refresh"
        await ws_safe_send(self, text_data=json.dumps(wire, cls=DjangoJSONEncoder))

    async def orders_updated(self, event):
        """Sipariş listesi değişti; istemci selektif invalidasyon yapabilir (eski: kds_refresh)."""
        await ws_safe_send(
            self,
            text_data=json.dumps(wrap_legacy_event(event), cls=DjangoJSONEncoder),
        )

    async def prep_updated(self, event):
        """Hazırlık görevleri; siparişi yenilemeden sadece prep önbelleğini güncellemek için."""
        await ws_safe_send(self, text_data=json.dumps(
            {'type': 'prep_updated', 'data': event.get('message', {})},
            cls=DjangoJSONEncoder,
        ))

    async def stock_low_alert(self, event):
        """Düşük stok (mutfak ekranı rozet/uyarı)."""
        await ws_safe_send(self, text_data=json.dumps(
            {'type': 'stock_low_alert', 'data': event.get('message', {})},
            cls=DjangoJSONEncoder,
        ))

    async def kds_stats_update(self, event):
        """İstasyon bazlı bekleyen sayılarını frontend'e gönder."""
        await ws_safe_send(self, text_data=json.dumps(
            {'type': 'kds_stats_update', 'data': event.get('message', {})},
            cls=DjangoJSONEncoder,
        ))

    async def deficiency_status_changed(self, event):
        """Eksik listesi durum değişikliğini KDS'e ilet."""
        await ws_safe_send(self, text_data=json.dumps(
            {'type': 'deficiency_status_changed', 'data': event['message']},
            cls=DjangoJSONEncoder,
        ))

    async def transfer_status_changed(self, event):
        """Eksik listesine bağlı depo transferi durumunu KDS'e ilet."""
        await ws_safe_send(self, text_data=json.dumps(
            {'type': 'transfer_status_changed', 'data': event['message']},
            cls=DjangoJSONEncoder,
        ))


class PosDisplayConsumer(AsyncWebsocketConsumer):
    """
    Kasa (POS) ve Müşteri Ekranı (CFD) arasındaki canlı senkronizasyon.
    Yayın: yalnızca JWT ile kimliği doğrulanmış ve pos.view_pos izni olan bağlantılar.
    Abonelik: imzalı display_token (veya kısa alan adı t) ile; bu istemciler mesaj gönderemez.
    """

    async def connect(self):
        if not await ws_allow_connection(self, use_authenticated_user=False):
            return
        self.terminal_id = self.scope["url_route"]["kwargs"].get("terminal_id", "default")
        self.can_publish = False

        query = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        display_token = (query.get("display_token") or query.get("t") or [None])[0]

        user = await self._authenticate_ws()
        if user is not None and user.is_authenticated:
            if await self._user_can_publish_pos_display(user):
                self.can_publish = True
        elif display_token:
            if not await self._verify_display_token(display_token, self.terminal_id):
                await self.close()
                return
        else:
            await self.close()
            return

        if user is not None and user.is_authenticated and not await ws_allow_connection(self, user):
            return
        self.group_name = f"pos_display_{self.terminal_id}"
        logger.debug(
            "PosDisplayConsumer terminal_id=%s can_publish=%s",
            self.terminal_id,
            self.can_publish,
        )

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        ws_on_connect("pos_display")
        await self.accept()

    @database_sync_to_async
    def _authenticate_ws(self):
        from apps.users.ws_auth import get_user_for_websocket

        return get_user_for_websocket(self.scope)

    @database_sync_to_async
    def _user_can_publish_pos_display(self, user):
        if getattr(user, "is_superuser", False):
            return True
        if hasattr(user, "has_permission"):
            return user.has_permission("pos.view_pos")
        return False

    @database_sync_to_async
    def _verify_display_token(self, token, terminal_id):
        from apps.pos_display.ws_tokens import verify_display_subscribe_token

        return verify_display_subscribe_token(token, terminal_id)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )
        ws_on_disconnect("pos_display")

    async def receive(self, text_data):
        """Kasiyerden gelen sepet verisini gruba yayınla (yalnız yayıncı)."""
        if await ws_handle_client_ping(text_data):
            await ws_send_pong(self)
            return
        if not self.can_publish:
            return
        try:
            data = json.loads(text_data)
            msg_type = data.get('type')

            if msg_type == 'DISPLAY_UPDATE':
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        'type': 'pos_display_send',
                        'data': data.get('data')
                    }
                )
            elif msg_type == 'pos_display_success':
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        'type': 'pos_display_success_forward',
                        'payload': data.get('data') or {},
                    }
                )
        except Exception as e:
            logger.warning("WS PosDisplay receive error: %s", e)

    async def pos_display_send(self, event):
        """Gruba gelen veriyi WebSocket istemcisine (Display) ilet."""
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'pos_display_update',
            'data': event['data']
        }))

    async def pos_display_success_forward(self, event):
        """Kasadan gelen başarı sinyalini müşteri ekranına ilet."""
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'pos_display_success',
            'data': event['payload'],
        }))

    async def pos_display_refresh(self, event):
        """Müşteri ekranının ayarlarının/sayfasının yenilenmesi için tetikleyici."""
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'pos_display_refresh',
            'data': event.get('data') or {}
        }))

    async def pos_display_survey_forward(self, event):
        """Kasiyer veya backend tetiklemeli anket olaylarını müşteri ekranına ilet."""
        await ws_safe_send(
            self,
            text_data=json.dumps(
                {
                    'type': 'pos_display_survey',
                    'data': event.get('payload') or {},
                }
            ),
        )

