import json
from urllib.parse import parse_qs
from django.core.serializers.json import DjangoJSONEncoder
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.core.cache import cache
from django.utils import timezone

from core.ws_consumer import (
    ws_handle_client_ping,
    ws_on_connect,
    ws_on_disconnect,
    ws_safe_send,
    ws_send_pong,
)

class PosSyncConsumer(AsyncWebsocketConsumer):
    """
    POS / garson masa senkronu (``/ws/pos/sync/``).

    Yalnızca ``pos_sync_{branch}`` grubuna abone olur (masa + sipariş/KDS tetikleyicileri).
    Garson çağrısı / misafir geldi → ``/ws/staff/notifications/`` (KDS ile karışmaz).
    """

    async def connect(self):
        # --- WS Authentication ---
        user = await self._authenticate_ws()
        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.user = user
        query = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        branch_id = (query.get("branch_id") or [None])[0]
        eff_id, mode = await self._resolve_ws_branch(self.user, branch_id)
        if mode == "deny":
            await self.close()
            return

        if mode == "global":
            self.group_name = "pos_sync_global"
        else:
            self.group_name = f"pos_sync_{eff_id}"

        terminal_id = (query.get("terminal_id") or [None])[0]
        platform = (query.get("platform") or ["web"])[0]
        
        self.terminal_id = terminal_id
        self.platform = platform

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        
        if self.terminal_id:
            await self._add_connection_to_cache()
            
        ws_on_connect("pos_sync")
        await self.accept()

    async def _add_connection_to_cache(self):
        cache_key = f"pos_connections_{self.terminal_id}"
        conn_data = {
            "channel_name": self.channel_name,
            "user_id": str(self.user.id),
            "name": self.user.get_full_name() or self.user.username,
            "platform": self.platform,
            "connected_at": timezone.now().isoformat()
        }
        
        # Redis operations should ideally be async, but Django's cache is sync.
        # We can use database_sync_to_async to wrap the cache calls to avoid blocking the event loop.
        await self._sync_cache_add(cache_key, self.channel_name, conn_data)

    async def _remove_connection_from_cache(self):
        cache_key = f"pos_connections_{self.terminal_id}"
        await self._sync_cache_remove(cache_key, self.channel_name)

    @database_sync_to_async
    def _sync_cache_add(self, cache_key, channel_name, conn_data):
        connections = cache.get(cache_key, {})
        connections[channel_name] = conn_data
        cache.set(cache_key, connections, timeout=86400)

    @database_sync_to_async
    def _sync_cache_remove(self, cache_key, channel_name):
        connections = cache.get(cache_key, {})
        if channel_name in connections:
            del connections[channel_name]
            cache.set(cache_key, connections, timeout=86400)

    @database_sync_to_async
    def _authenticate_ws(self):
        from apps.users.ws_auth import get_user_for_websocket

        return get_user_for_websocket(self.scope)

    @database_sync_to_async
    def _resolve_ws_branch(self, user, branch_id_raw):
        from core.branch_scope import resolve_websocket_branch_subscription

        return resolve_websocket_branch_subscription(user, branch_id_raw)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            
        if getattr(self, "terminal_id", None):
            await self._remove_connection_from_cache()
        ws_on_disconnect("pos_sync")

    async def receive(self, text_data=None, bytes_data=None):
        if await ws_handle_client_ping(text_data):
            await ws_send_pong(self)
            return

    async def force_disconnect(self, event):
        """Yönetici tarafından zorla bağlantı koparıldığında tetiklenir."""
        # İstemciye (frontend'e) özel bir mesaj göndererek kasten atıldığını bildirebiliriz.
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'force_disconnect',
            'message': 'Bağlantınız yönetici tarafından sonlandırıldı.'
        }, cls=DjangoJSONEncoder))
        
        await self.close()

    async def table_update(self, event):
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'table_update',
            'data': event['data'],
            'action': event['action']
        }, cls=DjangoJSONEncoder))

    async def shift_event(self, event):
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'shift_event',
            'data': event['data']
        }, cls=DjangoJSONEncoder))

    async def kds_refresh(self, event):
        msg = event.get('message')
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'kds.refresh',
            'message': msg,
            'data': msg,
        }, cls=DjangoJSONEncoder))

    async def order_status_changed(self, event):
        msg = event.get('message')
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'order_status_changed',
            'message': msg,
            'data': msg,
        }, cls=DjangoJSONEncoder))

    async def orders_updated(self, event):
        msg = event.get('message')
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'orders_updated',
            'message': msg,
            'data': msg,
        }, cls=DjangoJSONEncoder))

    async def menu_catalog_refresh(self, event):
        msg = event.get('message')
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'menu_catalog_refresh',
            'message': msg,
            'data': msg,
        }, cls=DjangoJSONEncoder))

    async def production_status_update(self, event):
        msg = event.get('message')
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'production_status_update',
            'message': msg,
            'data': msg,
        }, cls=DjangoJSONEncoder))


class StaffNotificationConsumer(AsyncWebsocketConsumer):
    """
    POS / garson personel bildirimleri (``/ws/staff/notifications/``).

    Misafir geldi vb. — akıllı buton garson çağrısı ``/ws/waiter/calls/`` kanalındadır.
    """

    async def connect(self):
        user = await self._authenticate_ws()
        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.user = user
        query = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        branch_id = (query.get("branch_id") or [None])[0]
        eff_id, mode = await self._resolve_ws_branch(self.user, branch_id)
        if mode == "deny":
            await self.close()
            return

        if mode == "global":
            from apps.branches.signals import STAFF_NOTIFICATIONS_GLOBAL

            self.group_name = STAFF_NOTIFICATIONS_GLOBAL
        else:
            self.group_name = f"staff_notifications_{eff_id}"

        self.user_group = f"user_notify_{self.user.id}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        ws_on_connect("staff_notifications")
        await self.accept()

    @database_sync_to_async
    def _authenticate_ws(self):
        from apps.users.ws_auth import get_user_for_websocket

        return get_user_for_websocket(self.scope)

    @database_sync_to_async
    def _resolve_ws_branch(self, user, branch_id_raw):
        from core.branch_scope import resolve_websocket_branch_subscription

        return resolve_websocket_branch_subscription(user, branch_id_raw)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if hasattr(self, "user_group"):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)
        ws_on_disconnect("staff_notifications")

    async def receive(self, text_data=None, bytes_data=None):
        if await ws_handle_client_ping(text_data):
            await ws_send_pong(self)
            return

    async def generic_notification(self, event):
        await ws_safe_send(self, text_data=json.dumps({
            'type': 'notification',
            'data': event['data']
        }, cls=DjangoJSONEncoder))


class WaiterCallConsumer(AsyncWebsocketConsumer):
    """
    Akıllı buton garson çağrısı (``/ws/waiter/calls/``).

    ``waiter_calls_{branch}`` — personel bildirimleri, POS senkronu ve yazıcı
    API'sinden bağımsız kanal.
    """

    async def connect(self):
        user = await self._authenticate_ws()
        if user is None or not user.is_authenticated:
            await self.close()
            return

        self.user = user
        query = parse_qs((self.scope.get("query_string") or b"").decode("utf-8"))
        branch_id = (query.get("branch_id") or [None])[0]
        eff_id, mode = await self._resolve_ws_branch(self.user, branch_id)
        if mode == "deny":
            await self.close()
            return

        if mode == "global":
            from apps.branches.signals import WAITER_CALLS_GLOBAL

            self.group_name = WAITER_CALLS_GLOBAL
        else:
            self.group_name = f"waiter_calls_{eff_id}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        ws_on_connect("waiter_calls")
        await self.accept()

    @database_sync_to_async
    def _authenticate_ws(self):
        from apps.users.ws_auth import get_user_for_websocket

        return get_user_for_websocket(self.scope)

    @database_sync_to_async
    def _resolve_ws_branch(self, user, branch_id_raw):
        from core.branch_scope import resolve_websocket_branch_subscription

        return resolve_websocket_branch_subscription(user, branch_id_raw)

    async def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        ws_on_disconnect("waiter_calls")

    async def receive(self, text_data=None, bytes_data=None):
        if await ws_handle_client_ping(text_data):
            await ws_send_pong(self)
            return

    @database_sync_to_async
    def _user_has_perm(self, perm: str) -> bool:
        """Kullanıcının belirtilen izni var mı? (RBAC)."""
        return self.user.has_permission(perm)

    def _user_is_assigned(self, assigned_ids: list) -> bool:
        """
        ``assigned_ids`` (str UUID'ler) içinde bu kullanıcı var mı?

        User model UUID PK kullanır; ``assigned_ids`` msgpack için ``str`` olarak
        taşınır — bu yüzden ``self.user.id`` (UUID) ile doğrudan karşılaştırma
        her zaman ``False`` döner. Önce str'e çevirip öyle kontrol ediyoruz.
        """
        return str(self.user.id) in assigned_ids

    async def _should_filter_by_assignment(self, assigned_ids: list) -> bool:
        """
        Bu çağrı bu kullanıcıya gelmemeli mi?

        - assigned_ids boşsa → filtre yok (herkes alır).
        - waiter.access varsa → daima masa atamasına göre filtrele;
          pos.view_pos istisnası geçmez (garsonun hem POS hem garson yetkisi
          olduğu durumda yalnızca kendi masalarını görmesi gerekir).
        - Salt POS kullanıcısı (pos.view_pos, waiter.access yok) → tüm çağrıları alır.
        """
        if not assigned_ids:
            return False
        if self._user_is_assigned(assigned_ids):
            return False
        # Kullanıcı listede değil; waiter.access varsa kesinlikle filtrele
        if await self._user_has_perm("waiter.access"):
            return True
        # Salt POS kullanıcısı → filtre yok
        if await self._user_has_perm("pos.view_pos"):
            return False
        # Hiçbir ilgili izin yok → filtrele
        return True

    async def waiter_call_event(self, event):
        data = event.get("data", {})
        assigned_ids: list = data.get("assigned_waiter_ids") or []

        if await self._should_filter_by_assignment(assigned_ids):
            return

        await ws_safe_send(self, text_data=json.dumps({
            'type': 'waiter_call',
            'data': data,
        }, cls=DjangoJSONEncoder))

    async def waiter_call_dismissed_event(self, event):
        data = event.get("data", {})
        assigned_ids: list = data.get("assigned_waiter_ids") or []

        if await self._should_filter_by_assignment(assigned_ids):
            return

        await ws_safe_send(self, text_data=json.dumps({
            'type': 'waiter_call_dismissed',
            'data': data,
        }, cls=DjangoJSONEncoder))
