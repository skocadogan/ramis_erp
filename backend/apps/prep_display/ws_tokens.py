"""İstasyon hazırlık kiosk ekranı için imzalı token (Django signing)."""

from __future__ import annotations

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

_SALT = "prep-display-kiosk"


def _encode(branch_id: str, station_id: str) -> str:
    return f"{str(branch_id).strip()}:{str(station_id).strip()}"


def make_prep_display_token(branch_id: str, station_id: str) -> str:
    signer = TimestampSigner(salt=_SALT)
    return signer.sign(_encode(branch_id, station_id))


def verify_prep_display_token(token: str) -> tuple[str, str] | None:
    if not token or not str(token).strip():
        return None
    signer = TimestampSigner(salt=_SALT)
    max_age = getattr(settings, "PREP_DISPLAY_TOKEN_MAX_AGE", 2592000)
    try:
        value = signer.unsign(str(token).strip(), max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    parts = value.split(":", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None
    return parts[0], parts[1]
