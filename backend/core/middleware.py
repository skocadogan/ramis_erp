"""
Oturum açılmış isteklerde çeviri dilini User.preferred_language ile hizalar.

LocaleMiddleware (AuthenticationMiddleware'den önce) anonim istekler için
Accept-Language / cookie ile dili seçer. Bu middleware kimlik doğrulamasından
sonra çalışır; geçerli preferred_language varsa üzerine yazar.
"""

import logging

from django.conf import settings
from django.db import close_old_connections, connection
from django.db.utils import OperationalError
from django.http import JsonResponse
from django.utils import translation
from django.utils.translation import gettext as _

from core.postgres_connection import resolve_postgres_conn_max_age

logger = logging.getLogger(__name__)

_DB_BUSY_MARKERS = (
    'remaining connection slots are reserved',
    'too many clients already',
    'sorry, too many clients already',
)


def _valid_language_codes() -> set[str]:
    return {code for code, _ in settings.LANGUAGES}


def _is_transient_db_error(exc: OperationalError) -> bool:
    msg = str(exc).lower()
    return any(marker in msg for marker in _DB_BUSY_MARKERS)


def _release_request_db_connections() -> None:
    """İstek thread'inde açık kalan PostgreSQL oturumunu kapat."""
    close_old_connections()
    if resolve_postgres_conn_max_age() == 0:
        connection.close()


class UserPreferredLanguageMiddleware:
    """Auth sonrası: geçerli preferred_language → translation.activate + LANGUAGE_CODE."""

    def __init__(self, get_response):
        self.get_response = get_response
        self._valid = _valid_language_codes()

    def __call__(self, request):
        did_override = False
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            lang = getattr(user, "preferred_language", None)
            if lang and lang in self._valid:
                translation.activate(lang)
                request.LANGUAGE_CODE = lang
                did_override = True

        response = self.get_response(request)

        if did_override:
            translation.deactivate()

        return response


class DatabaseConnectionMiddleware:
    """
    Split ASGI: istek öncesi/sonrası DB oturumu temizliği.
    Slot tükenmesinde DRF'den önce 503 döner (auth dahil).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _release_request_db_connections()
        try:
            response = self.get_response(request)
        except OperationalError as exc:
            if resolve_postgres_conn_max_age() == 0:
                connection.close()
            if _is_transient_db_error(exc):
                logger.warning('PostgreSQL slot tükenmesi: %s', exc)
                return JsonResponse(
                    {
                        'detail': _(
                            'Veritabanı geçici olarak meşgul. Lütfen birkaç saniye sonra tekrar deneyin.'
                        ),
                        'code': 'DB_CONNECTION_BUSY',
                    },
                    status=503,
                    headers={'Retry-After': '2'},
                )
            raise
        finally:
            _release_request_db_connections()
        return response
