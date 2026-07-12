"""Müşteri ekranı WebSocket aboneliği için imzalı, süreli token (Django signing)."""

from __future__ import annotations

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

_SALT = "pos-display-ws-subscriber"


def make_display_subscribe_token(terminal_id: str) -> str:
    signer = TimestampSigner(salt=_SALT)
    return signer.sign(str(terminal_id).strip())


def verify_display_subscribe_token(token: str, expected_terminal_id: str) -> bool:
    signer = TimestampSigner(salt=_SALT)
    max_age = getattr(settings, "POS_DISPLAY_WS_TOKEN_MAX_AGE", 86400)
    try:
        value = signer.unsign(token, max_age=max_age)
        return value == str(expected_terminal_id).strip()
    except (BadSignature, SignatureExpired):
        return False
