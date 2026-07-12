import logging

from django.db import transaction
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.translation import gettext as _
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .models import Branch, Table, TableStatus, Zone, WaiterBranchAssignment
from .table_cleaning import compute_cleaning_until, revoke_cleaning_release, schedule_cleaning_release


User = get_user_model()
logger = logging.getLogger(__name__)


def clear_tables_cache(branch_id=None) -> None:
    """Masa listesi cache versiyonunu artırarak cache'i anında geçersiz kılar (O(1))."""
    from django.core.cache import cache
    
    bid = str(branch_id) if branch_id else "all"
    key = f"tables_version:{bid}"
    try:
        cache.incr(key)
    except (ValueError, Exception):
        cache.set(key, 1, timeout=86400)
    
    if bid != "all":
        try:
            cache.incr("tables_version:all")
        except (ValueError, Exception):
            cache.set("tables_version:all", 1, timeout=86400)


class NotificationService:
    @staticmethod
    def _notification_event(
        table: Table,
        event_type: str,
        message: str,
        data: dict | None = None,
    ) -> dict:
        return {
            "type": "generic_notification",
            "data": {
                "event": event_type,
                "message": message,
                "table_id": str(table.id),
                "table_name": table.name,
                "zone_name": table.zone.name,
                **(data or {}),
            },
        }

    @staticmethod
    def send_to_waiters_of_table(
        table: Table,
        event_type: str,
        message: str,
        data: dict | None = None,
    ) -> int:
        """
        Belirli bir masadan sorumlu olan garsonlara bildirim gönderir.
        Sorumluluk: Masanın doğrudan atanmış olması veya masanın bulunduğu bölgenin (zone) atanmış olması.
        Gönderilen garson sayısını döndürür.
        """
        channel_layer = get_channel_layer()
        if not channel_layer:
            return 0

        branch_id = table.zone.branch_id
        waiter_ids = list(
            WaiterBranchAssignment.objects.filter(
                branch_id=branch_id,
                user__is_active=True,
            )
            .filter(Q(tables=table) | Q(zones=table.zone))
            .values_list("user_id", flat=True)
            .distinct()
        )

        if not waiter_ids:
            return 0

        event = NotificationService._notification_event(
            table, event_type, message, data
        )

        sent = 0
        for uid in waiter_ids:
            user_group = f"user_notify_{uid}"
            try:
                async_to_sync(channel_layer.group_send)(user_group, event)
                sent += 1
            except Exception:
                logger.warning(
                    "Garson bildirimi gönderilemedi (user_id=%s, table_id=%s)",
                    uid,
                    table.id,
                    exc_info=True,
                )
        return sent

    @staticmethod
    def broadcast_to_staff_notifications_branch(
        table: Table,
        event_type: str,
        message: str,
        data: dict | None = None,
    ) -> None:
        """
        Şubedeki POS personel istemcilerine (``/ws/staff/notifications/``).
        Misafir geldi vb. — akıllı buton garson çağrısı ``broadcast_waiter_call`` ile ayrı kanaldadır.
        """
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        branch_id = table.zone.branch_id
        if not branch_id:
            return

        from apps.branches.signals import STAFF_NOTIFICATIONS_GLOBAL

        event = NotificationService._notification_event(
            table, event_type, message, data
        )

        async def _send_both() -> None:
            await channel_layer.group_send(
                f"staff_notifications_{branch_id}", event
            )
            try:
                await channel_layer.group_send(STAFF_NOTIFICATIONS_GLOBAL, event)
            except Exception:
                logger.warning(
                    "staff_notifications_global yayını başarısız (branch_id=%s)",
                    branch_id,
                    exc_info=True,
                )

        try:
            async_to_sync(_send_both)()
        except Exception:
            logger.warning(
                "Personel bildirimi gönderilemedi (branch_id=%s, table_id=%s)",
                branch_id,
                table.id,
                exc_info=True,
            )

    @staticmethod
    def broadcast_waiter_call(
        table: Table,
        message: str,
        data: dict | None = None,
    ) -> None:
        """
        Akıllı buton garson çağrısı → ``/ws/waiter/calls/`` (personel / yazıcı kanalından ayrı).
        """
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        branch_id = table.zone.branch_id
        if not branch_id:
            return

        from apps.branches.signals import WAITER_CALLS_GLOBAL

        event = {
            "type": "waiter_call_event",
            "data": NotificationService._notification_event(
                table, "waiter_call", message, data
            )["data"],
        }

        async def _send_both() -> None:
            await channel_layer.group_send(f"waiter_calls_{branch_id}", event)
            try:
                await channel_layer.group_send(WAITER_CALLS_GLOBAL, event)
            except Exception:
                logger.warning(
                    "waiter_calls_global yayını başarısız (branch_id=%s)",
                    branch_id,
                    exc_info=True,
                )

        try:
            async_to_sync(_send_both)()
        except Exception:
            logger.warning(
                "Garson çağrısı yayını başarısız (branch_id=%s, table_id=%s)",
                branch_id,
                table.id,
                exc_info=True,
            )

    @staticmethod
    def broadcast_waiter_call_dismissed(
        branch_id: str,
        *,
        call_ids: list[str] | None = None,
        dismiss_all: bool = False,
        assigned_waiter_ids: list[int] | None = None,
    ) -> None:
        """Görüldü işareti — ``/ws/waiter/calls/`` dinleyicilerinde listeden düşürülür.

        ``assigned_waiter_ids`` verilmişse sadece o garsonlar bildirimi alır;
        ``None`` ise (dismiss_all veya rezervasyon bildirimi) herkese gider.
        """
        channel_layer = get_channel_layer()
        if not channel_layer:
            return

        branch_id = str(branch_id).strip()
        if not branch_id:
            return

        from apps.branches.signals import WAITER_CALLS_GLOBAL

        payload = {
            "branch_id": branch_id,
            "dismiss_all": bool(dismiss_all),
            "call_ids": [str(x) for x in (call_ids or [])],
        }
        if assigned_waiter_ids is not None:
            payload["assigned_waiter_ids"] = assigned_waiter_ids
        event = {
            "type": "waiter_call_dismissed_event",
            "data": payload,
        }

        async def _send_both() -> None:
            await channel_layer.group_send(f"waiter_calls_{branch_id}", event)
            try:
                await channel_layer.group_send(WAITER_CALLS_GLOBAL, event)
            except Exception:
                logger.warning(
                    "waiter_calls_global dismiss yayını başarısız (branch_id=%s)",
                    branch_id,
                    exc_info=True,
                )

        try:
            async_to_sync(_send_both)()
        except Exception:
            logger.warning(
                "Garson çağrısı dismiss yayını başarısız (branch_id=%s)",
                branch_id,
                exc_info=True,
            )


class BranchService:
    @staticmethod
    @transaction.atomic
    def assign_users(branch_id: str, user_ids: list[str]) -> Branch:
        branch = Branch.objects.get(pk=branch_id)
        User.objects.filter(pk__in=user_ids).update(branch=branch)
        return branch

    @staticmethod
    @transaction.atomic
    def remove_user(branch_id: str, user_id: str) -> None:
        User.objects.filter(pk=user_id, branch_id=branch_id).update(branch=None)

    @staticmethod
    def soft_delete(branch_id: str) -> None:
        Branch.objects.filter(pk=branch_id).update(is_active=False)

    @staticmethod
    def hard_delete(branch_id: str) -> None:
        Branch.objects.filter(pk=branch_id).delete()

    @staticmethod
    def restore_branch(branch_id: str) -> Branch:
        branch = Branch.objects.get(pk=branch_id)
        branch.is_active = True
        branch.save(update_fields=['is_active'])
        return branch

def _clear_cleaning_fields(table: Table) -> None:
    table.cleaning_started_at = None


def _clear_reservation_fields(table: Table) -> None:
    table.reservation_info = ''
    table.reservation_scheduled_at = None
    table.reservation_party_size = None


class TableService:
    @staticmethod
    @transaction.atomic
    def start_cleaning(table_id, *, from_payment: bool = False) -> Table:
        from apps.orders.models import Order, OrderStatus
        from .table_cleaning import table_zone_is_takeaway

        table = Table.objects.select_for_update().select_related('zone__branch').get(pk=table_id)
        if table_zone_is_takeaway(table):
            raise ValueError(_('Paket bölgelerinde temizlik akışı kullanılmaz.'))
        allowed = {TableStatus.FREE, TableStatus.OCCUPIED}
        if table.status not in allowed:
            raise ValueError(_('Masa temizlik durumuna alınamaz.'))

        if table.status == TableStatus.OCCUPIED:
            from apps.orders.order_scope import OPEN_ORDER_STATUSES

            has_active = Order.objects.filter(
                table_id=table_id,
                status__in=OPEN_ORDER_STATUSES,
            ).exists()
            if has_active:
                raise ValueError(_('Aktif sipariş varken masa temizliğe alınamaz.'))

        branch = table.zone.branch if table.zone_id else None
        now = timezone.now()
        table.status = TableStatus.CLEANING
        table.cleaning_started_at = now
        _clear_reservation_fields(table)
        table.save(
            update_fields=[
                'status',
                'cleaning_started_at',
                'reservation_info',
                'reservation_scheduled_at',
                'reservation_party_size',
            ]
        )
        bid = getattr(table.zone, 'branch_id', None)
        cleaning_until = compute_cleaning_until(now, branch) if branch else None

        def _after_commit():
            clear_tables_cache(bid)
            if cleaning_until:
                schedule_cleaning_release(table_id, cleaning_until)

        transaction.on_commit(_after_commit)
        return table

    @staticmethod
    def finish_cleaning(table_id, *, revoke_scheduled: bool = True) -> Table:
        table = Table.objects.get(pk=table_id)
        if table.status != TableStatus.CLEANING:
            return table
        table.status = TableStatus.FREE
        _clear_cleaning_fields(table)
        table.save(update_fields=['status', 'cleaning_started_at'])
        bid = getattr(getattr(table, 'zone', None), 'branch_id', None)
        if revoke_scheduled:
            revoke_cleaning_release(table_id)

        def _after_commit():
            clear_tables_cache(bid)

        try:
            transaction.on_commit(_after_commit)
        except Exception:
            clear_tables_cache(bid)
        return table

    @staticmethod
    def close_table(table_id) -> Table:
        """Manuel kapatma: OCCUPIED → FREE (ödeme akışı start_cleaning kullanır)."""
        from apps.orders.models import Order
        from apps.orders.order_scope import OPEN_ORDER_STATUSES

        table = Table.objects.get(pk=table_id)
        if table.status == TableStatus.OCCUPIED:
            if Order.objects.filter(
                table_id=table_id,
                status__in=OPEN_ORDER_STATUSES,
            ).exists():
                raise ValueError(
                    _('Aktif sipariş varken masa kapatılamaz. Önce ödeme alın veya masayı zorla kapatın.')
                )
            table.status = TableStatus.FREE
            _clear_reservation_fields(table)
            _clear_cleaning_fields(table)
            table.save(
                update_fields=[
                    'status',
                    'reservation_info',
                    'reservation_scheduled_at',
                    'reservation_party_size',
                    'cleaning_started_at',
                ]
            )
            bid = getattr(getattr(table, 'zone', None), 'branch_id', None)
            try:
                transaction.on_commit(lambda b=bid: clear_tables_cache(b))
            except Exception:
                clear_tables_cache(bid)
        return table

    @staticmethod
    @transaction.atomic
    def force_close_table(table_id, performed_by=None):
        """Masayı zorla kapatır: tüm aktif siparişleri force-close yapar, masayı FREE yapar."""
        from apps.orders.models import Order, OrderStatus
        from apps.orders.services import OrderService

        table = Table.objects.select_for_update().get(pk=table_id)

        if table.status not in [TableStatus.OCCUPIED]:
            raise ValueError(_("Yalnızca dolu (OCCUPIED) masalar zorla kapatılabilir."))

        from apps.orders.order_scope import OPEN_ORDER_STATUSES

        active_orders = Order.objects.filter(
            table_id=table_id,
            status__in=OPEN_ORDER_STATUSES,
        )

        for order in active_orders:
            OrderService.force_close(order, performed_by)

        table.status = TableStatus.FREE
        _clear_reservation_fields(table)
        _clear_cleaning_fields(table)
        table.save(
            update_fields=[
                'status',
                'reservation_info',
                'reservation_scheduled_at',
                'reservation_party_size',
                'cleaning_started_at',
            ]
        )

        bid = getattr(getattr(table, 'zone', None), 'branch_id', None)
        try:
            transaction.on_commit(lambda b=bid: clear_tables_cache(b))
        except Exception:
            clear_tables_cache(bid)

        return table

    @staticmethod
    @transaction.atomic
    def open_table(table_id) -> Table:
        table = Table.objects.select_for_update().get(pk=table_id)
        if table.status in [TableStatus.FREE, TableStatus.RESERVED]:
            seated_reservations = []
            if table.status == TableStatus.RESERVED:
                from apps.reservations.models import Reservation, ReservationStatus

                seated_reservations = list(
                    Reservation.objects.filter(
                        table_id=table_id,
                        status__in=[ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
                        is_active=True,
                    ).select_related("table", "table__zone")
                )
                Reservation.objects.filter(
                    table_id=table_id,
                    status__in=[ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
                    is_active=True,
                ).update(status=ReservationStatus.SEATED)

            table.status = TableStatus.OCCUPIED
            _clear_reservation_fields(table)
            table.save(
                update_fields=[
                    'status',
                    'reservation_info',
                    'reservation_scheduled_at',
                    'reservation_party_size',
                ]
            )
            bid = getattr(getattr(table, 'zone', None), 'branch_id', None)
            transaction.on_commit(lambda b=bid: clear_tables_cache(b))

            if seated_reservations:
                from apps.reservations.reservation_alerts import notify_reservation_arrived

                def _notify_seated():
                    for reservation in seated_reservations:
                        reservation.status = ReservationStatus.SEATED
                        notify_reservation_arrived(reservation, table)

                transaction.on_commit(_notify_seated)
        return table

    @staticmethod
    def reserve_table(
        table_id,
        reservation_info: str = '',
        *,
        reservation_scheduled_at=None,
        reservation_party_size=None,
        sync_reservation: bool = True,
    ) -> Table:
        table = Table.objects.select_related('zone').get(pk=table_id)
        if table.status == TableStatus.FREE:
            table.status = TableStatus.RESERVED
            table.reservation_info = (reservation_info or '').strip()
            table.reservation_scheduled_at = reservation_scheduled_at
            table.reservation_party_size = reservation_party_size
            table.save(
                update_fields=[
                    'status',
                    'reservation_info',
                    'reservation_scheduled_at',
                    'reservation_party_size',
                ]
            )
            if sync_reservation:
                from apps.reservations.table_bridge import ensure_reservation_for_table

                ensure_reservation_for_table(
                    table,
                    reservation_info=table.reservation_info,
                    reservation_scheduled_at=table.reservation_scheduled_at,
                    reservation_party_size=table.reservation_party_size,
                )
            bid = getattr(getattr(table, 'zone', None), 'branch_id', None)
            try:
                transaction.on_commit(lambda b=bid: clear_tables_cache(b))
            except Exception:
                clear_tables_cache(bid)
        return table

    @staticmethod
    def update_reservation_snapshot(
        table_id,
        reservation_info: str = '',
        *,
        reservation_scheduled_at=None,
        reservation_party_size=None,
        sync_reservation: bool = True,
    ) -> Table:
        """Masa zaten RESERVED iken not/saat/kişi alanlarını günceller."""
        table = Table.objects.select_related('zone').get(pk=table_id)
        if table.status != TableStatus.RESERVED:
            return table
        table.reservation_info = (reservation_info or '').strip()
        table.reservation_scheduled_at = reservation_scheduled_at
        table.reservation_party_size = reservation_party_size
        table.save(
            update_fields=[
                'reservation_info',
                'reservation_scheduled_at',
                'reservation_party_size',
            ]
        )
        if sync_reservation:
            from apps.reservations.table_bridge import ensure_reservation_for_table

            ensure_reservation_for_table(
                table,
                reservation_info=table.reservation_info,
                reservation_scheduled_at=table.reservation_scheduled_at,
                reservation_party_size=table.reservation_party_size,
            )
        return table

    @staticmethod
    def cancel_reservation(table_id, *, sync_reservation: bool = True) -> Table:
        table = Table.objects.get(pk=table_id)
        if table.status == TableStatus.RESERVED:
            if sync_reservation:
                from apps.reservations.table_bridge import cancel_active_reservations_for_table

                cancel_active_reservations_for_table(table_id)
            table.status = TableStatus.FREE
            _clear_reservation_fields(table)
            table.save(
                update_fields=[
                    'status',
                    'reservation_info',
                    'reservation_scheduled_at',
                    'reservation_party_size',
                ]
            )
            bid = getattr(getattr(table, 'zone', None), 'branch_id', None)
            try:
                transaction.on_commit(lambda b=bid: clear_tables_cache(b))
            except Exception:
                clear_tables_cache(bid)
        return table

    @staticmethod
    def set_out_of_service(table_id) -> Table:
        table = Table.objects.get(pk=table_id)
        if table.status != TableStatus.OCCUPIED:
            if table.status == TableStatus.CLEANING:
                revoke_cleaning_release(table_id)
                _clear_cleaning_fields(table)
            table.status = TableStatus.OUT_OF_SERVICE
            _clear_reservation_fields(table)
            table.save(
                update_fields=[
                    'status',
                    'reservation_info',
                    'reservation_scheduled_at',
                    'reservation_party_size',
                    'cleaning_started_at',
                ]
            )
            bid = getattr(getattr(table, 'zone', None), 'branch_id', None)
            try:
                transaction.on_commit(lambda b=bid: clear_tables_cache(b))
            except Exception:
                clear_tables_cache(bid)
        return table

    @staticmethod
    @transaction.atomic
    def bulk_create_for_zone(zone_id, count: int, prefix: str = "T", capacity: int = 4, size='MEDIUM', shape='SQUARE') -> list[Table]:
        from django.utils.translation import gettext as _

        zone = Zone.objects.get(pk=zone_id)
        if zone.is_takeaway:
            raise ValueError(str(_("Paket bölgesine toplu masa eklenemez.")))
        existing_count = Table.objects.filter(zone=zone).count()
        
        tables = []
        for i in range(1, count + 1):
            t_num = existing_count + i
            tables.append(Table(
                zone=zone,
                name=f"{prefix}{t_num}",
                table_number=t_num,
                capacity=capacity,
                min_capacity=1,
                size=size,
                shape=shape,
                status=TableStatus.FREE,
            ))
            
        return Table.objects.bulk_create(tables)
