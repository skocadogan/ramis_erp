"""Geliştirme ortam dosyalarını yükle (.env.development → .env override)."""

from __future__ import annotations

import os
from pathlib import Path


def _parse_env_line(line: str) -> tuple[str, str] | None:
    line = line.strip()
    if not line or line.startswith('#'):
        return None
    if line.startswith('export '):
        line = line[7:].strip()
    if '=' not in line:
        return None
    key, _, value = line.partition('=')
    key = key.strip()
    value = value.strip()
    if not key:
        return None
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1]
    return key, value


def _load_env_file(path: Path, *, override: bool) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        parsed = _parse_env_line(raw_line)
        if parsed is None:
            continue
        key, value = parsed
        if override:
            os.environ[key] = value
        else:
            os.environ.setdefault(key, value)


def _is_production_env() -> bool:
    """systemd /etc/ramis/backend.env genelde DJANGO_DEBUG=false yazar."""
    return os.environ.get('DJANGO_DEBUG', '').lower() in ('false', '0', 'no')


def load_project_env(base_dir: Path) -> None:
    """Geliştirmede .env.development + .env yükler; üretimde repodaki dosyalar atlanır."""
    if _is_production_env():
        return
    _load_env_file(base_dir / '.env.development', override=False)
    _load_env_file(base_dir / '.env', override=True)
