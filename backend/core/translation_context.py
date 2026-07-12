"""Celery / arka plan işlerinde aktif çeviri dilini ayarlamak için (Faz 6)."""

from __future__ import annotations

from contextlib import contextmanager

from django.conf import settings
from django.utils import translation


@contextmanager
def user_language(language_code: str | None):
    """
    Kullanıcıya görünür metin (PDF, e-posta gövdesi vb.) üretirken kullanın.

    Örnek::

        with user_language(user.preferred_language):
            html = render_to_string("reports/x.html", context)
    """
    code = (language_code or "").strip() or settings.LANGUAGE_CODE
    with translation.override(code):
        yield
