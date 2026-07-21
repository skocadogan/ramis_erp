#!/usr/bin/env python3
"""Root helper for Ramis Settings — invoked via pkexec."""

from __future__ import annotations

import base64
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

BACKEND_ENV = os.environ.get("RAMIS_BACKEND_ENV", "/etc/ramis/backend.env")
FRONTEND_ENV = os.environ.get("RAMIS_FRONTEND_ENV", "/etc/ramis/frontend.env")
RUNTIME_CONFIG = "/etc/ramis/runtime-config.json"
INSTALL_DIR = os.environ.get("RAMIS_INSTALL_DIR", "/srv/ramis_erp")
SYS_USER = os.environ.get("RAMIS_SYS_USER", "ramis")

# Privileged restart — yalnızca Ramis / nginx birimleri
_STATIC_ALLOWED_UNITS = frozenset(
    {
        "nginx.service",
        "ramis-daphne.service",
        "ramis-uvicorn.service",
        "ramis-worker.service",
        "ramis-worker-maintenance.service",
        "ramis-worker-broadcast.service",
        "ramis-worker-pdf.service",
        "ramis-beat.service",
        "ramis-frontend.service",
    }
)
_DAPHNE_EXTRA_RE = re.compile(r"^ramis-daphne-\d{4}\.service$")
_UVICORN_EXTRA_RE = re.compile(r"^ramis-uvicorn-\d{4}\.service$")
_ENV_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
# source edilen env değerlerinde komut enjeksiyonu riski
_UNSAFE_ENV_VALUE_RE = re.compile(r"[`$]|\$\(")


def _is_allowed_unit(unit: str) -> bool:
    if not unit or not isinstance(unit, str):
        return False
    if "/" in unit or ".." in unit or " " in unit:
        return False
    if unit in _STATIC_ALLOWED_UNITS:
        return True
    return bool(_DAPHNE_EXTRA_RE.match(unit) or _UVICORN_EXTRA_RE.match(unit))


def _filter_units(units: list) -> tuple[list[str], str | None]:
    allowed: list[str] = []
    seen: set[str] = set()
    for raw in units:
        unit = str(raw).strip()
        if not unit or unit in seen:
            continue
        if not _is_allowed_unit(unit):
            return [], f"İzin verilmeyen systemd birimi: {unit}"
        seen.add(unit)
        allowed.append(unit)
    return allowed, None


def _validate_env_content(content: str, label: str) -> str | None:
    if "\x00" in content:
        return f"{label}: null byte içeremez"
    for index, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            return f"{label}: geçersiz satır {index}"
        key, _, value = line.partition("=")
        key = key.strip()
        if not _ENV_KEY_RE.match(key):
            return f"{label}: geçersiz anahtar ({key!r})"
        # Çift tırnaklı değerlerde $() / backtick source sırasında genişler
        if _UNSAFE_ENV_VALUE_RE.search(value):
            return f"{label}: güvenli olmayan değer ({key})"
    return None


def _backend_python() -> str:
    backend_dir = os.path.join(INSTALL_DIR, "backend")
    for rel in (".venv/bin/python", "venv/bin/python", "env/bin/python"):
        candidate = os.path.join(backend_dir, rel)
        if os.path.isfile(candidate):
            return candidate
    return "python3"


def _sync_celery_worker_units() -> tuple[bool, str]:
    update_sh = os.path.join(INSTALL_DIR, "update.sh")
    if not os.path.isfile(update_sh):
        return False, f"update.sh bulunamadı: {update_sh}"
    proc = subprocess.run(
        ["bash", update_sh, "--sync-celery-workers"],
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        return True, "Celery worker birimleri güncellendi (CELERY_PRINTING_WORKER_CONCURRENCY)"
    return False, proc.stderr.strip() or proc.stdout.strip() or "sync-celery-workers başarısız"


def _run_celery_beat_task(beat_key: str) -> tuple[bool, str]:
    backend_dir = os.path.join(INSTALL_DIR, "backend")
    python = _backend_python()
    if not os.path.isdir(backend_dir):
        return False, f"Backend dizini bulunamadı: {backend_dir}"
    if not beat_key or not beat_key.replace("-", "").replace("_", "").isalnum():
        return False, f"Geçersiz Beat anahtarı: {beat_key!r}"

    cmd = (
        f"set -a && source {shlex.quote(BACKEND_ENV)} && set +a && "
        f"cd {shlex.quote(backend_dir)} && {shlex.quote(python)} manage.py run_celery_beat_task {shlex.quote(beat_key)}"
    )
    proc = subprocess.run(
        ["sudo", "-u", SYS_USER, "bash", "-c", cmd],
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        message = (proc.stdout or "").strip() or f"Görev kuyruğa eklendi: {beat_key}"
        return True, message
    return False, proc.stderr.strip() or proc.stdout.strip() or "run_celery_beat_task başarısız"


def _sync_celery_beat_schedule() -> tuple[bool, str]:
    backend_dir = os.path.join(INSTALL_DIR, "backend")
    python = _backend_python()
    if not os.path.isdir(backend_dir):
        return False, f"Backend dizini bulunamadı: {backend_dir}"
    cmd = (
        f"set -a && source {shlex.quote(BACKEND_ENV)} && set +a && "
        f"cd {shlex.quote(backend_dir)} && {shlex.quote(python)} manage.py sync_celery_beat_schedule"
    )
    proc = subprocess.run(
        ["sudo", "-u", SYS_USER, "bash", "-c", cmd],
        capture_output=True,
        text=True,
    )
    if proc.returncode == 0:
        return True, "Celery Beat görevleri senkronize edildi"
    return False, proc.stderr.strip() or proc.stdout.strip() or "sync_celery_beat_schedule başarısız"


def _read_file(path: str) -> str:
    if not os.path.isfile(path):
        return ""
    with open(path, "r", encoding="utf-8-sig") as handle:
        return handle.read()


def _atomic_write(path: str, content: str) -> None:
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".ramis_env_", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.chmod(tmp_path, 0o600)
        if os.path.exists(path):
            backup = f"{path}.bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            shutil.copy2(path, backup)
        shutil.move(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _sync_runtime_config() -> tuple[bool, str]:
    update_sh = os.path.join(INSTALL_DIR, "update.sh")
    if os.path.isfile(update_sh):
        proc = subprocess.run(
            ["bash", update_sh, "--sync-runtime-config"],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            return True, "runtime-config.json güncellendi (update.sh)"
        return False, proc.stderr.strip() or proc.stdout.strip() or "update.sh başarısız"

    # update.sh yoksa frontend.env'den basit JSON üret
    values = {}
    for line in _read_file(FRONTEND_ENV).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")

    api_url = values.get("NEXT_PUBLIC_API_URL", "")
    pos_offline = values.get("NEXT_PUBLIC_POS_OFFLINE_QUEUE", "true").lower() == "true"
    toasts = values.get("NEXT_PUBLIC_API_INTERCEPTOR_TOASTS", "false").lower() == "true"
    payload = {
        "apiUrl": api_url,
        "posOfflineQueue": pos_offline,
        "apiInterceptorToasts": toasts,
    }
    _atomic_write(RUNTIME_CONFIG, json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return True, "runtime-config.json güncellendi (basit senkron)"


def _apply_restart_plan(units: list, special: list) -> dict:
    """systemctl yeniden başlatma ve isteğe bağlı senkron adımları."""
    messages: list[str] = []
    allowed_units, unit_error = _filter_units(units or [])
    if unit_error:
        return {"ok": False, "message": unit_error}

    special_set = {str(item) for item in (special or [])}
    allowed_special = {"runtime_sync", "beat_sync", "printing_worker_sync"}
    unknown_special = special_set - allowed_special
    if unknown_special:
        return {"ok": False, "message": f"İzin verilmeyen özel işlem: {', '.join(sorted(unknown_special))}"}

    if "runtime_sync" in special_set:
        ok, msg = _sync_runtime_config()
        if not ok:
            return {"ok": False, "message": msg}
        messages.append(msg)

    if "beat_sync" in special_set:
        ok, msg = _sync_celery_beat_schedule()
        if not ok:
            return {"ok": False, "message": msg}
        messages.append(msg)

    if "printing_worker_sync" in special_set:
        ok, msg = _sync_celery_worker_units()
        if not ok:
            return {"ok": False, "message": msg}
        messages.append(msg)

    for unit in allowed_units:
        proc = subprocess.run(["systemctl", "restart", unit], capture_output=True, text=True)
        if proc.returncode != 0:
            return {
                "ok": False,
                "message": proc.stderr.strip() or f"{unit} yeniden başlatılamadı",
            }
        messages.append(unit)

    return {"ok": True, "message": ", ".join(messages) if messages else "İşlem tamamlandı"}


def handle(payload: dict) -> dict:
    action = payload.get("action")

    if action == "read":
        return {
            "ok": True,
            "backend": _read_file(BACKEND_ENV),
            "frontend": _read_file(FRONTEND_ENV),
            "backend_path": BACKEND_ENV,
            "frontend_path": FRONTEND_ENV,
        }

    if action == "write":
        backend = payload.get("backend")
        frontend = payload.get("frontend")
        if backend is None or frontend is None:
            return {"ok": False, "error": "missing_content", "message": "backend/frontend içeriği gerekli"}
        if not isinstance(backend, str) or not isinstance(frontend, str):
            return {"ok": False, "error": "invalid_content", "message": "backend/frontend metin olmalıdır"}

        backend_error = _validate_env_content(backend, "backend.env")
        if backend_error:
            return {"ok": False, "error": "validation", "message": backend_error}
        frontend_error = _validate_env_content(frontend, "frontend.env")
        if frontend_error:
            return {"ok": False, "error": "validation", "message": frontend_error}

        _atomic_write(BACKEND_ENV, backend)
        _atomic_write(FRONTEND_ENV, frontend)
        messages = ["Ortam dosyaları kaydedildi"]
        apply = payload.get("apply")
        if apply:
            apply_result = _apply_restart_plan(
                apply.get("units") or [],
                apply.get("special") or [],
            )
            if not apply_result.get("ok"):
                return {
                    "ok": False,
                    "error": "apply_failed",
                    "saved": True,
                    "message": apply_result.get("message") or "Servisler uygulanamadı",
                }
            messages.append(apply_result.get("message") or "Servisler yeniden başlatıldı")
        return {"ok": True, "message": ", ".join(messages), "applied": bool(apply)}

    if action == "run_beat_task":
        beat_key = payload.get("beat_key")
        if not beat_key:
            return {"ok": False, "error": "missing_beat_key", "message": "beat_key gerekli"}
        ok, msg = _run_celery_beat_task(str(beat_key))
        if not ok:
            return {"ok": False, "error": "run_beat_task_failed", "message": msg}
        return {"ok": True, "message": msg}

    if action == "restart":
        units = payload.get("units") or []
        special = payload.get("special") or []
        apply_result = _apply_restart_plan(units, special)
        if not apply_result.get("ok"):
            return {
                "ok": False,
                "error": "restart_failed",
                "message": apply_result.get("message") or "Yeniden başlatma başarısız",
            }
        return {"ok": True, "message": apply_result.get("message") or "İşlem tamamlandı"}

    return {"ok": False, "error": "unknown_action", "message": f"Bilinmeyen işlem: {action}"}


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "missing_payload"}))
        return 2
    try:
        payload = json.loads(base64.b64decode(sys.argv[1]).decode("utf-8"))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": "bad_payload", "message": str(exc)}))
        return 2
    result = handle(payload)
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
