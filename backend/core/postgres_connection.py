"""
Split ASGI (Uvicorn HTTP + Daphne WebSocket) için PostgreSQL bağlantı stratejisi.

Kalıcı bağlantılar (CONN_MAX_AGE > 0) thread pool başına idle oturum biriktirir;
split mimaride varsayılan 0 (istek/işlem sonunda kapat) kullanılır.
"""

from __future__ import annotations

import os
import sys


def is_split_asgi_deployment() -> bool:
    """Uvicorn + Daphne ayrı süreçlerde çalışıyorsa True."""
    explicit = os.environ.get('RAMIS_ASGI_SPLIT', '').strip().lower()
    if explicit in ('1', 'true', 'yes', 'on'):
        return True
    if explicit in ('0', 'false', 'no', 'off'):
        return False

    try:
        uvicorn = int(os.environ.get('UVICORN_INSTANCES', '0') or '0')
    except ValueError:
        uvicorn = 0
    try:
        daphne = int(os.environ.get('DAPHNE_INSTANCES', '0') or '0')
    except ValueError:
        daphne = 0
    return uvicorn >= 1 and daphne >= 1


def persistent_db_connections_allowed() -> bool:
    """Split ASGI'de kalıcı bağlantı yalnızca açık opt-in ile."""
    return os.environ.get('RAMIS_DB_PERSISTENT_CONNECTIONS', '').strip().lower() in (
        '1',
        'true',
        'yes',
        'on',
    )


def resolve_postgres_conn_max_age() -> int:
    """
    Split ASGI (Uvicorn+Daphne): varsayılan 0 — env'deki 60 bile olsa override edilir.
    RAMIS_DB_PERSISTENT_CONNECTIONS=true ile kalıcı bağlantıya dönülebilir.
    """
    if persistent_db_connections_allowed():
        return max(0, int(os.environ.get('POSTGRES_CONN_MAX_AGE', 60)))
    if is_split_asgi_deployment():
        return 0
    if 'POSTGRES_CONN_MAX_AGE' in os.environ:
        return max(0, int(os.environ['POSTGRES_CONN_MAX_AGE']))
    return 60


def resolve_postgres_application_name() -> str:
    """pg_stat_activity.application_name — systemd RAMIS_DB_APPLICATION_NAME öncelikli."""
    explicit = os.environ.get('RAMIS_DB_APPLICATION_NAME', '').strip()
    if explicit:
        return explicit[:63]

    cmd = ' '.join(sys.argv).lower()
    if 'celery' in cmd:
        if 'broadcast@' in cmd or '-q broadcast' in cmd:
            return 'ramis-celery-broadcast'
        if 'maintenance@' in cmd or '-q maintenance' in cmd:
            return 'ramis-celery-maintenance'
        if 'beat' in cmd:
            return 'ramis-celery-beat'
        return 'ramis-celery-printing'
    if 'uvicorn' in cmd:
        return 'ramis-uvicorn'
    if 'daphne' in cmd:
        return 'ramis-daphne'
    if 'manage.py' in cmd:
        return 'ramis-manage'
    return 'ramis'
