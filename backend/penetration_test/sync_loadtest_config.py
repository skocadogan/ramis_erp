#!/usr/bin/env python3
"""
Ramis ERP — yük testi yapılandırmasını uzak sunucudan çeker ve base.py günceller.

Admin (veya süper kullanıcı) ile API'ye bağlanır; şube, masa, ürün ve POS terminal
UUID'lerini alıp base.py içindeki DEFAULT_* sabitlerini yazar.

Kullanım:
  cd backend/penetration_test
  python sync_loadtest_config.py 20.20.24.106
  python sync_loadtest_config.py --host http://20.20.24.106:9000
  python sync_loadtest_config.py 20.20.24.106 --user admin --dry-run

Gereksinim: requests (backend venv)
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

try:
    import requests
except ImportError:
    print("requests paketi gerekli: pip install requests", file=sys.stderr)
    sys.exit(1)

BASE_DIR = Path(__file__).resolve().parent
BASE_PY = BASE_DIR / "base.py"

TEST_USERNAMES = {
    "waiter": "garson_test",
    "chef": "asci_test",
    "cashier": "kasiyer_test",
}

DEFAULT_PASSWORD = "Sk74833."


def _normalize_host(raw: str) -> str:
    raw = raw.strip().rstrip("/")
    if not raw.startswith(("http://", "https://")):
        raw = "http://" + raw
    return raw


def _login(host: str, username: str, password: str) -> str:
    url = urljoin(host + "/", "api/v1/auth/token/")
    response = requests.post(
        url,
        json={"username": username, "password": password, "remember_me": True},
        timeout=30,
    )
    if response.status_code != 200:
        raise RuntimeError(
            f"Giriş başarısız ({response.status_code}): {response.text[:300]}"
        )
    token = response.json().get("access")
    if not token:
        raise RuntimeError("Yanıtta access token yok")
    return token


def _resolve_admin_username(host: str, password: str, preferred: str) -> str:
    candidates = [preferred]
    if preferred.lower() != preferred:
        candidates.append(preferred.lower())
    if preferred.upper() != preferred:
        candidates.append(preferred.upper())
    if preferred.lower() == "admin":
        candidates.extend(["Admin", "admin"])

    seen: set[str] = set()
    last_error = ""
    for name in candidates:
        if not name or name in seen:
            continue
        seen.add(name)
        try:
            _login(host, name, password)
            return name
        except RuntimeError as exc:
            last_error = str(exc)
    raise RuntimeError(f"Admin girişi yapılamadı. Son hata: {last_error}")


class RamisClient:
    def __init__(self, host: str, token: str) -> None:
        self.host = host.rstrip("/")
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {token}"

    def get_json(self, path: str, params: dict | None = None) -> Any:
        url = urljoin(self.host + "/", path.lstrip("/"))
        response = self.session.get(url, params=params, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(
                f"GET {path} → {response.status_code}: {response.text[:300]}"
            )
        return response.json()

    def fetch_all(self, path: str, params: dict | None = None) -> list[dict]:
        url = urljoin(self.host + "/", path.lstrip("/"))
        params = dict(params or {})
        rows: list[dict] = []

        while url:
            response = self.session.get(url, params=params, timeout=30)
            if response.status_code != 200:
                raise RuntimeError(
                    f"GET {url} → {response.status_code}: {response.text[:300]}"
                )
            payload = response.json()
            if isinstance(payload, list):
                return [row for row in payload if isinstance(row, dict)]
            batch = payload.get("results", [])
            if isinstance(batch, list):
                rows.extend(row for row in batch if isinstance(row, dict))
            url = payload.get("next")
            params = None
        return rows


def _pick_branch(client: RamisClient) -> dict:
    branches = client.fetch_all("api/v1/branches/")
    active = [b for b in branches if b.get("is_active", True)]
    if not active:
        raise RuntimeError("Aktif şube bulunamadı")

    me = client.get_json("api/v1/auth/me/")
    user_branch = me.get("branch")
    if user_branch:
        for branch in active:
            if str(branch.get("id")) == str(user_branch):
                return branch

    if len(active) == 1:
        return active[0]

    print(
        f"  Uyarı: {len(active)} şube var, ilki seçildi: {active[0].get('name')}",
        file=sys.stderr,
    )
    return active[0]


def _fetch_tables(client: RamisClient, branch_id: str) -> list[str]:
    rows = client.fetch_all(
        "api/v1/tables/",
        {"branch_id": branch_id},
    )
    ids: list[str] = []
    for row in rows:
        if row.get("zone_is_takeaway"):
            continue
        if row.get("status") == "OUT_OF_SERVICE":
            continue
        table_id = row.get("id")
        if table_id:
            ids.append(str(table_id))
    return ids


def _fetch_products(client: RamisClient, branch_id: str, limit: int = 12) -> list[str]:
    rows = client.fetch_all(
        "api/v1/menu/products/",
        {"branch_id": branch_id, "show_on_pos": "true"},
    )
    ids: list[str] = []
    for row in rows:
        if not row.get("is_active", True):
            continue
        if row.get("show_on_pos") is False:
            continue
        product_id = row.get("id")
        if product_id:
            ids.append(str(product_id))
        if len(ids) >= limit:
            break
    return ids


def _fetch_terminals(client: RamisClient, branch_id: str) -> list[str]:
    rows = client.fetch_all(
        "api/v1/pos-display/terminals/",
        {"branch_id": branch_id},
    )
    ids: list[str] = []
    for row in rows:
        if not row.get("is_active", True):
            continue
        terminal_id = row.get("id")
        if terminal_id:
            ids.append(str(terminal_id))
    return ids


def _verify_test_users(client: RamisClient) -> dict[str, str | None]:
    users = client.fetch_all("api/v1/admin/users/")
    by_name = {str(u.get("username", "")): u for u in users}
    found: dict[str, str | None] = {}
    for role, username in TEST_USERNAMES.items():
        if username in by_name:
            found[role] = username
            print(f"  ✓ {role}: {username}")
        else:
            found[role] = None
            print(f"  ✗ {role}: {username} bulunamadı — seed_full --all çalıştırın")
    return found


def _format_uuid_tuple(name: str, uuids: list[str], *, single: bool = False) -> str:
    if single:
        if not uuids:
            raise ValueError(f"{name} boş — sunucuda kayıt yok")
        return f'{name} = "{uuids[0]}"'
    if not uuids:
        raise ValueError(f"{name} boş — sunucuda kayıt yok")
    lines = [f"{name} = ("]
    for uid in uuids:
        lines.append(f'    "{uid}",')
    lines.append(")")
    return "\n".join(lines)


def _build_defaults_block(
    *,
    host: str,
    admin_user: str,
    branch: dict,
    tables: list[str],
    products: list[str],
    terminals: list[str],
) -> str:
    branch_id = str(branch["id"])
    branch_name = branch.get("name", "?")
    synced_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    header = (
        f"# ─── Varsayılan seed UUID'ler — sync_loadtest_config.py ─────────\n"
        f"# Kaynak: {host} | admin={admin_user} | şube={branch_name} ({branch_id})\n"
        f"# Senkron: {synced_at}\n"
    )
    body = "\n".join(
        [
            _format_uuid_tuple("DEFAULT_BRANCH", [branch_id], single=True),
            _format_uuid_tuple("DEFAULT_PRODUCTS", products),
            _format_uuid_tuple("DEFAULT_TABLES", tables),
            _format_uuid_tuple("DEFAULT_TERMINALS", [terminals[0]], single=True),
        ]
    )
    return header + body


def _patch_base_py(block: str) -> None:
    text = BASE_PY.read_text(encoding="utf-8")
    pattern = re.compile(
        r"# ─── Varsayılan seed UUID'ler.*?^DEFAULT_TERMINALS = \"[^\"]+\"",
        re.MULTILINE | re.DOTALL,
    )
    if not pattern.search(text):
        raise RuntimeError(
            "base.py içinde DEFAULT_* bloğu bulunamadı — dosya yapısı değişmiş olabilir"
        )
    updated = pattern.sub(block.rstrip(), text, count=1)
    BASE_PY.write_text(updated, encoding="utf-8")


def _probe_ws_hint(host: str) -> str:
    """Split mimari için olası WS adresi (bilgi amaçlı)."""
    from urllib.parse import urlparse

    parsed = urlparse(host)
    hostname = parsed.hostname or host
    scheme = "wss" if parsed.scheme == "https" else "ws"
    port = parsed.port
    if port in (9000, 9001, 9002, 9003):
        return f"{scheme}://{hostname}:8000"
    if port in (80, 443, None):
        return f"{scheme}://{hostname}"
    return f"{scheme}://{hostname}:8000"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Uzak Ramis sunucusundan load test UUID'lerini çekip base.py günceller."
    )
    parser.add_argument(
        "host",
        nargs="?",
        help="Sunucu IP veya URL (örn. 20.20.24.106 veya http://20.20.24.106:9000)",
    )
    parser.add_argument("--host", dest="host_flag", help="--host http://… alternatifi")
    parser.add_argument("--user", default="Admin", help="Admin kullanıcı adı (varsayılan: Admin)")
    parser.add_argument("--password", default=DEFAULT_PASSWORD, help="Admin şifresi")
    parser.add_argument(
        "--max-products",
        type=int,
        default=12,
        help="base.py'ye yazılacak max ürün sayısı",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="base.py yazmadan yalnızca özet göster",
    )
    args = parser.parse_args()

    raw_host = args.host_flag or args.host
    if not raw_host:
        parser.error("host gerekli: python sync_loadtest_config.py 20.20.24.106")

    host = _normalize_host(raw_host)
    print(f"Sunucu: {host}")

    admin_user = _resolve_admin_username(host, args.password, args.user)
    print(f"Giriş OK: {admin_user}")

    token = _login(host, admin_user, args.password)
    client = RamisClient(host, token)

    print("Test kullanıcıları:")
    _verify_test_users(client)

    branch = _pick_branch(client)
    branch_id = str(branch["id"])
    print(f"Şube: {branch.get('name')} ({branch_id})")

    tables = _fetch_tables(client, branch_id)
    products = _fetch_products(client, branch_id, limit=args.max_products)
    terminals = _fetch_terminals(client, branch_id)

    print(f"  Masalar (paket hariç): {len(tables)}")
    print(f"  POS ürünleri: {len(products)}")
    print(f"  POS terminalleri: {len(terminals)}")

    if not tables:
        print("HATA: Yemek masası bulunamadı.", file=sys.stderr)
        return 1
    if not products:
        print("HATA: show_on_pos ürün bulunamadı.", file=sys.stderr)
        return 1
    if not terminals:
        print("HATA: POS terminal bulunamadı.", file=sys.stderr)
        return 1

    block = _build_defaults_block(
        host=host,
        admin_user=admin_user,
        branch=branch,
        tables=tables,
        products=products,
        terminals=terminals,
    )

    ws_hint = _probe_ws_hint(host)
    print("\n--- base.py bloğu ---")
    print(block)
    print(f"\nWS önerisi (split mimari): RAMIS_LOADTEST_WS_HOST={ws_hint}")
    print(f"Locust: locust -f test_peak_hour.py --host {host}")

    if args.dry_run:
        print("\n(dry-run — base.py değiştirilmedi)")
        return 0

    _patch_base_py(block)
    print(f"\n✓ {BASE_PY} güncellendi")
    return 0


if __name__ == "__main__":
    sys.exit(main())
