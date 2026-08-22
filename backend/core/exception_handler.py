"""
DRF merkezi exception handler.

Domain istisnaları HTTP yanıtına çevirir; mevcut view sözleşmeleriyle uyumlu anahtarlar kullanılır:
- OrderValidationError → {"error": ...} (orders)
- SaleValidationError, ReservationError → {"detail": ...} (sales / reservations)
- InsufficientStockError → orders view ile aynı gövde + 409
"""

from django.db import connection
from django.db.utils import OperationalError
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from apps.inventory.services import InsufficientStockError
from apps.orders.services import OrderValidationError
from apps.reservations.services import ReservationError
from apps.sales.services import SaleValidationError

_DB_BUSY_MARKERS = (
    'remaining connection slots are reserved',
    'too many clients already',
    'sorry, too many clients already',
    'connection timed out',
    'server closed the connection unexpectedly',
)

_ROW_LOCK_MARKERS = (
    'could not obtain lock',
    'lock not available',
    'could not serialize access',
)


def _is_transient_db_error(exc: OperationalError) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _DB_BUSY_MARKERS)


def _is_row_lock_unavailable(exc: OperationalError) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _ROW_LOCK_MARKERS)


def api_exception_handler(exc, context):
    if isinstance(exc, OperationalError):
        connection.close()
        if _is_transient_db_error(exc):
            return Response(
                {
                    'detail': _(
                        'Veritabanı geçici olarak meşgul. Lütfen birkaç saniye sonra tekrar deneyin.'
                    ),
                    'code': 'DB_CONNECTION_BUSY',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
                headers={'Retry-After': '2'},
            )
        if _is_row_lock_unavailable(exc):
            return Response(
                {
                    'detail': _(
                        'Kayıt şu anda başka bir işlemde. Lütfen birkaç saniye sonra tekrar deneyin.'
                    ),
                    'code': 'ROW_LOCKED',
                },
                status=status.HTTP_409_CONFLICT,
                headers={'Retry-After': '1'},
            )

    if isinstance(exc, OrderValidationError):
        msg = str(exc)
        return Response({"detail": msg, "error": msg}, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, SaleValidationError):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, ReservationError):
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    if isinstance(exc, InsufficientStockError):
        return Response(
            {
                "error": _("Yetersiz stok"),
                "code": "INSUFFICIENT_STOCK",
                "item_name": exc.item_name,
                "available": str(exc.available),
                "requested": str(exc.requested),
                "hint": _("allow_negative_stock=true ile tamamlayabilirsiniz."),
            },
            status=status.HTTP_409_CONFLICT,
        )

    return drf_exception_handler(exc, context)
