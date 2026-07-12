"""
Ramis ERP — yük / stres testi ortak altyapısı (Locust).

Split mimari:
  HTTP (API/Admin) → Uvicorn :9000-9003
  WS (Channels)    → Daphne  :8000

Nginx (:80) arkasında her şey tek adresten çalışır.
Doğrudan test için RAMIS_LOADTEST_WS_HOST ayarlayın (örn. ws://127.0.0.1:8000).

  locust -f base.py --host http://127.0.0.1:9000
  locust -f base.py --host http://192.168.1.100
  RAMIS_LOADTEST_WS_HOST=ws://192.168.1.100:8000 locust -f base.py --host http://192.168.1.100
"""

from __future__ import annotations

import json
import logging
import os
import random
import re
import threading
import time
from urllib.parse import urlencode

from locust import HttpUser, between, events, task

try:
    import requests
except ImportError:
    requests = None  # type: ignore[assignment]

try:
    import websocket
    from websocket._exceptions import WebSocketBadStatusException
except ImportError:
    websocket = None  # type: ignore[assignment]
    WebSocketBadStatusException = None  # type: ignore[assignment,misc]

logger = logging.getLogger(__name__)

# ─── Yapılandırma ────────────────────────────────────────────────────


def _env(key: str, default: str = "") -> str:
    value = os.environ.get(key)
    if value is None:
        return default.strip() if isinstance(default, str) else str(default)
    return value.strip()


def _env_csv(
    key: str,
    default: str | tuple[str, ...] | list[str] = "",
) -> list[str]:
    raw = os.environ.get(key)
    if raw is not None:
        return [part.strip() for part in raw.split(",") if part.strip()]
    if isinstance(default, (tuple, list)):
        return [str(item).strip() for item in default if str(item).strip()]
    return [part.strip() for part in default.split(",") if part.strip()]


def _env_bool(key: str, default: bool = False) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# ─── Varsayılan seed UUID'ler — sync_loadtest_config.py ─────────
# Kaynak: http://20.20.24.106 | admin=admin | şube=Merkez Şube (fccb2971-4f9f-42e5-81c3-081d80592ae1)
# Senkron: 2026-06-30 06:32 UTC
DEFAULT_BRANCH = "fccb2971-4f9f-42e5-81c3-081d80592ae1"
DEFAULT_PRODUCTS = (
    "0eaa99fd-783c-4169-969c-ba8b61617863",
    "b1843541-446a-49be-869b-784e4b49e951",
    "0403fb5a-ed0c-4bc6-a5fc-67ebdf1c49aa",
    "879086de-6434-4f9f-b121-78cffc2ea0e5",
    "593a148c-0289-4680-9ddc-da559d584a40",
    "f10902b5-a40a-4755-9ee3-9bb6b9a3e10c",
    "5da7d059-e61f-4a0a-87ed-7cf62128fea4",
    "47ce7ebd-8af0-4fc5-90d4-c94fbc6925ed",
    "7728a7ff-14d4-464f-9853-9384cf4765e3",
)
DEFAULT_TABLES = (
    "ffc495d8-c9a2-47ed-90ba-7af6117b268b",
    "e065650d-2dee-4435-9fc4-40133e0cc0e9",
    "7690d406-4c0e-43df-917e-d17454f75653",
    "abd27dd4-8d85-4cae-8541-87351e435d6c",
    "57cf8ff2-5ca8-4a96-b964-3294e2501729",
    "f10f4b8e-4df0-4283-b134-7c483e5a4485",
    "9954fb04-ab1f-4c25-b083-aea9abfa016c",
    "683e399a-550c-47a5-a671-e2850c7ca70e",
    "88cd02c3-4ba8-4c82-97b3-7e78ca94e151",
    "a5822832-21da-464a-9f8a-b62c5940ba43",
    "eb28ef79-16f1-4c7e-a768-2cfab292a1b1",
)
DEFAULT_TERMINALS = "47aca88c-b1da-4216-9baf-8f1d3c7e206c"

BRANCH_ID = _env("RAMIS_LOADTEST_BRANCH_ID", DEFAULT_BRANCH)
PRODUCTS = _env_csv("RAMIS_LOADTEST_PRODUCT_IDS", DEFAULT_PRODUCTS)
TABLES = _env_csv("RAMIS_LOADTEST_TABLE_IDS", DEFAULT_TABLES)
POS_TERMINALS = _env_csv("RAMIS_LOADTEST_POS_TERMINAL_IDS", DEFAULT_TERMINALS)
LOADTEST_PASSWORD = _env("RAMIS_LOADTEST_PASSWORD", "Sk74833.")
LOADTEST_CASHIER_PIN = _env("RAMIS_LOADTEST_CASHIER_PIN", "1234")
CASHIER_USE_PIN = _env_bool("RAMIS_LOADTEST_CASHIER_USE_PIN", True)

WAITER_USER = _env("RAMIS_LOADTEST_WAITER_USER", "garson_test")
CHEF_USER = _env("RAMIS_LOADTEST_CHEF_USER", "asci_test")
CASHIER_USER = _env("RAMIS_LOADTEST_CASHIER_USER", "kasiyer_test")
POS_USER = _env("RAMIS_LOADTEST_POS_USER", CASHIER_USER)

# Split mimari: WS ayrı host olabilir (Daphne).
# Varsayılan: HTTP host'tan türet (Nginx arkası için).
WS_HOST = _env("RAMIS_LOADTEST_WS_HOST", "")

WS_PING_INTERVAL_SEC = float(_env("RAMIS_LOADTEST_WS_PING_SEC", "30"))
LOGIN_MAX_RETRIES = int(_env("RAMIS_LOADTEST_LOGIN_MAX_RETRIES", "8"))
TOKEN_CACHE_TTL_SEC = float(_env("RAMIS_LOADTEST_TOKEN_CACHE_SEC", "1500"))
LOGIN_STAGGER_SEC = float(_env("RAMIS_LOADTEST_LOGIN_STAGGER_SEC", "0.4"))
SKIP_PREFETCH = _env_bool("RAMIS_LOADTEST_SKIP_PREFETCH", False)

ORDER_CREATE_REQUIRED_ALL = ("orders.manage_order",)
ORDER_CREATE_REQUIRED_ANY = ("pos.view_pos", "waiter.access")

_THROTTLE_WAIT_RE = re.compile(r"(\d+)\s*saniye", re.IGNORECASE)

# init sırasında doldurulur
WAITER_ELIGIBLE_TABLES: list[str] = []
WAITER_PREFETCH_PERMISSIONS: list[str] = []
USER_BRANCH_IDS: dict[str, str] = {}
_BRANCH_ID_EXPLICIT = bool(os.environ.get("RAMIS_LOADTEST_BRANCH_ID", "").strip())


# ─── Yardımcılar ─────────────────────────────────────────────────────


def _short_detail(text: str, limit: int = 180) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _detail_from_body(text: str) -> str:
    try:
        body = json.loads(text)
    except json.JSONDecodeError:
        return _short_detail(text)
    detail = body.get("detail")
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        return _short_detail(json.dumps(detail, ensure_ascii=False))
    return _short_detail(text)


def _parse_throttle_wait_seconds(
    status_code: int, text: str, headers: dict | None = None
) -> float:
    if headers:
        retry_after = headers.get("Retry-After") or headers.get("retry-after")
        if retry_after:
            try:
                return max(float(retry_after), 1.0) + 0.5
            except (TypeError, ValueError):
                pass
    if status_code == 429:
        detail = _detail_from_body(text)
        match = _THROTTLE_WAIT_RE.search(detail)
        if match:
            return float(match.group(1)) + 0.5
    return 5.0


def _format_http_error(status_code: int, text: str, context: str) -> str:
    detail = _detail_from_body(text)
    if status_code == 403:
        return f"403 Forbidden ({context}): {detail}"
    if status_code == 429:
        return f"429 Too Many Requests ({context}): {detail}"
    return f"{status_code} ({context}): {detail}"


def _order_table_id(order: dict) -> str | None:
    table_id = order.get("table_id")
    if table_id:
        return str(table_id)
    table = order.get("table")
    if isinstance(table, dict) and table.get("id"):
        return str(table["id"])
    if table:
        return str(table)
    return None


def finish_table_cleaning(
    client,
    table_id: str,
    *,
    request_name: str = "Table: Finish Cleaning",
) -> bool:
    """Ödeme sonrası CLEANING → FREE (frontend: finish_cleaning)."""
    with client.post(
        f"/api/v1/tables/{table_id}/finish_cleaning/",
        catch_response=True,
        name=request_name,
    ) as response:
        if response.status_code in (200, 201):
            return True
        response.failure(
            _format_http_error(
                response.status_code,
                response.text,
                f"finish_cleaning masa={table_id[:8]}…",
            )
        )
        return False


def _check_order_create_permissions(permissions: list[str]) -> tuple[bool, str]:
    missing_all = [p for p in ORDER_CREATE_REQUIRED_ALL if p not in permissions]
    if missing_all:
        return False, f"Eksik izinler: {', '.join(missing_all)}"
    if not any(p in permissions for p in ORDER_CREATE_REQUIRED_ANY):
        need = " veya ".join(ORDER_CREATE_REQUIRED_ANY)
        return False, f"Eksik izinler: {need} (en az biri gerekli)"
    return True, ""


def _extract_permissions(profile: dict) -> list[str]:
    perms = profile.get("all_permissions") or profile.get("permission_codes") or []
    return [str(p) for p in perms]


def _available_branch_ids(profile: dict) -> list[str]:
    ids: list[str] = []
    branch = profile.get("branch")
    if branch:
        ids.append(str(branch))
    for row in profile.get("available_branches") or []:
        if isinstance(row, dict) and row.get("id"):
            bid = str(row["id"])
            if bid not in ids:
                ids.append(bid)
    return ids


def _pick_profile_branch(profile: dict, preferred: str | None = None) -> str | None:
    available = _available_branch_ids(profile)
    if preferred and preferred in available:
        return preferred
    if profile.get("branch"):
        return str(profile["branch"])
    if len(available) == 1:
        return available[0]
    if available:
        return available[0]
    return None


def get_user_branch_id(username: str) -> str:
    return USER_BRANCH_IDS.get(username, BRANCH_ID)


def _extract_table_ids(payload) -> list[str]:
    if isinstance(payload, list):
        rows = payload
    elif isinstance(payload, dict):
        rows = payload.get("results", [])
    else:
        return []
    ids: list[str] = []
    for row in rows:
        if isinstance(row, dict) and row.get("id"):
            ids.append(str(row["id"]))
    return ids


def _ws_base_url(http_host: str) -> str:
    """HTTP host'tan WS URL türet. Split mimaride WS_HOST varsa onu kullan."""
    if WS_HOST:
        return WS_HOST.rstrip("/")
    if http_host.startswith("https://"):
        return "wss://" + http_host[len("https://") :]
    if http_host.startswith("http://"):
        return "ws://" + http_host[len("http://") :]
    return "ws://" + http_host


def build_ws_url(
    http_host: str,
    path: str,
    token: str | None,
    branch_id: str | None = None,
) -> str:
    """Frontend authWsUrl ile uyumlu: ?token=…&branch_id=…"""
    base = _ws_base_url(http_host).rstrip("/") + path
    params: dict[str, str] = {}
    if token:
        params["token"] = token
    if branch_id:
        params["branch_id"] = branch_id
    if not params:
        return base
    return f"{base}?{urlencode(params)}"


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _pin_login_usernames() -> set[str]:
    """Frontend ile uyumlu: kasiyer/POS kullanıcıları check-pin → token/pin akışını kullanır."""
    if not CASHIER_USE_PIN:
        return set()
    return {u for u in (CASHIER_USER, POS_USER) if u}


# ─── Token önbelleği ─────────────────────────────────────────────────


class TokenCache:
    """Kullanıcı başına JWT önbelleği — login throttle (5/dk/IP) patlamasını önler."""

    _entries: dict[str, tuple[str, float]] = {}
    _pin_check_cache: dict[str, tuple[bool, bool]] = {}
    _locks: dict[str, threading.Lock] = {}
    _meta_lock = threading.Lock()

    @classmethod
    def _lock_for(cls, username: str) -> threading.Lock:
        with cls._meta_lock:
            lock = cls._locks.get(username)
            if lock is None:
                lock = threading.Lock()
                cls._locks[username] = lock
            return lock

    @classmethod
    def get(cls, username: str) -> str | None:
        entry = cls._entries.get(username)
        if not entry:
            return None
        token, expires_at = entry
        if time.time() >= expires_at:
            cls._entries.pop(username, None)
            return None
        return token

    @classmethod
    def set(cls, username: str, token: str) -> None:
        cls._entries[username] = (token, time.time() + TOKEN_CACHE_TTL_SEC)

    @classmethod
    def unique_usernames(cls) -> list[str]:
        return sorted({WAITER_USER, CHEF_USER, CASHIER_USER, POS_USER})

    @classmethod
    def acquire(
        cls,
        username: str,
        password: str,
        *,
        host: str | None = None,
        locust_client=None,
    ) -> tuple[str | None, str | None]:
        cached = cls.get(username)
        if cached:
            return cached, None

        with cls._lock_for(username):
            cached = cls.get(username)
            if cached:
                return cached, None

            if LOGIN_STAGGER_SEC > 0:
                time.sleep(random.uniform(0, LOGIN_STAGGER_SEC))

            for attempt in range(1, LOGIN_MAX_RETRIES + 1):
                if locust_client is not None:
                    token, status, text, headers = cls._login_once_locust(
                        locust_client, username, password
                    )
                else:
                    if not host:
                        return None, "Host belirtilmedi"
                    token, status, text, headers = cls._login_once_requests(
                        host, username, password
                    )

                if token:
                    cls.set(username, token)
                    return token, None

                if status == 429 and attempt < LOGIN_MAX_RETRIES:
                    wait = _parse_throttle_wait_seconds(status, text, headers)
                    logger.warning(
                        "Login throttle (%s), %.0fs bekleniyor (%s/%s)",
                        username,
                        wait,
                        attempt,
                        LOGIN_MAX_RETRIES,
                    )
                    time.sleep(wait)
                    continue

                return None, _format_http_error(
                    status, text, f"login {username}"
                )

            return None, (
                f"Login throttle: {username} için {LOGIN_MAX_RETRIES} deneme tükendi "
                "(aynı IP'den auth endpoint limiti — bir dakika bekleyip tekrar deneyin)"
            )

    @classmethod
    def _should_use_pin_flow(cls, username: str) -> bool:
        return username in _pin_login_usernames()

    @classmethod
    def _cached_pin_check(cls, username: str) -> tuple[bool, bool] | None:
        return cls._pin_check_cache.get(username)

    @classmethod
    def _store_pin_check(cls, username: str, has_pin: bool, has_cashier_role: bool) -> None:
        cls._pin_check_cache[username] = (has_pin, has_cashier_role)

    @classmethod
    def _login_once_requests(
        cls, host: str, username: str, password: str
    ) -> tuple[str | None, int, str, dict]:
        if cls._should_use_pin_flow(username):
            cached = cls._cached_pin_check(username)
            if cached is None:
                has_pin, has_cashier, status, text, headers = cls._check_pin_requests(
                    host, username
                )
                if status != 200:
                    return None, status, text, headers
                cls._store_pin_check(username, has_pin, has_cashier)
            else:
                has_pin, has_cashier = cached
            if has_pin and has_cashier:
                return cls._login_pin_requests(host, username, LOADTEST_CASHIER_PIN)
        return cls._login_password_requests(host, username, password)

    @classmethod
    def _login_once_locust(
        cls, client, username: str, password: str
    ) -> tuple[str | None, int, str, dict]:
        if cls._should_use_pin_flow(username):
            cached = cls._cached_pin_check(username)
            if cached is None:
                has_pin, has_cashier, status, text, headers = cls._check_pin_locust(
                    client, username
                )
                if status != 200:
                    return None, status, text, headers
                cls._store_pin_check(username, has_pin, has_cashier)
            else:
                has_pin, has_cashier = cached
            if has_pin and has_cashier:
                return cls._login_pin_locust(client, username, LOADTEST_CASHIER_PIN)
        return cls._login_password_locust(client, username, password)

    @classmethod
    def _check_pin_requests(
        cls, host: str, username: str
    ) -> tuple[bool, bool, int, str, dict]:
        if requests is None:
            return False, False, 0, "requests paketi yüklü değil", {}
        url = host.rstrip("/") + "/api/v1/auth/check-pin/"
        try:
            response = requests.post(
                url,
                json={"username": username},
                timeout=30,
            )
        except requests.RequestException as exc:
            return False, False, 0, str(exc), {}
        headers = dict(response.headers)
        if response.status_code != 200:
            return False, False, response.status_code, response.text, headers
        try:
            body = response.json()
        except json.JSONDecodeError:
            return False, False, 200, response.text, headers
        return (
            bool(body.get("has_pin")),
            bool(body.get("has_cashier_role")),
            200,
            "",
            headers,
        )

    @classmethod
    def _check_pin_locust(
        cls, client, username: str
    ) -> tuple[bool, bool, int, str, dict]:
        with client.post(
            "/api/v1/auth/check-pin/",
            json={"username": username},
            catch_response=True,
            name="Auth: check-pin",
        ) as response:
            headers = dict(response.headers) if response.headers else {}
            if response.status_code != 200:
                msg = _format_http_error(
                    response.status_code, response.text, f"check-pin {username}"
                )
                response.failure(msg)
                return False, False, response.status_code, response.text, headers
            try:
                body = response.json()
            except json.JSONDecodeError:
                response.failure("check-pin yanıtı JSON değil")
                return False, False, 200, response.text, headers
            return (
                bool(body.get("has_pin")),
                bool(body.get("has_cashier_role")),
                200,
                "",
                headers,
            )

    @classmethod
    def _login_pin_requests(
        cls, host: str, username: str, pin: str
    ) -> tuple[str | None, int, str, dict]:
        if requests is None:
            return None, 0, "requests paketi yüklü değil", {}
        url = host.rstrip("/") + "/api/v1/auth/token/pin/"
        try:
            response = requests.post(
                url,
                json={
                    "username": username,
                    "pin": pin,
                    "remember_me": True,
                },
                timeout=30,
            )
        except requests.RequestException as exc:
            return None, 0, str(exc), {}
        headers = dict(response.headers)
        if response.status_code == 200:
            token = response.json().get("access")
            if token:
                return token, 200, "", headers
        return None, response.status_code, response.text, headers

    @classmethod
    def _login_pin_locust(
        cls, client, username: str, pin: str
    ) -> tuple[str | None, int, str, dict]:
        with client.post(
            "/api/v1/auth/token/pin/",
            json={
                "username": username,
                "pin": pin,
                "remember_me": True,
            },
            catch_response=True,
            name="Auth: token/pin",
        ) as response:
            headers = dict(response.headers) if response.headers else {}
            if response.status_code == 200:
                try:
                    token = response.json().get("access")
                except json.JSONDecodeError:
                    response.failure("PIN login yanıtı JSON değil")
                    return None, 200, response.text, headers
                if token:
                    return token, 200, "", headers
                response.failure("PIN login yanıtında access token yok")
                return None, 200, response.text, headers
            msg = _format_http_error(
                response.status_code, response.text, f"pin login {username}"
            )
            response.failure(msg)
            return None, response.status_code, response.text, headers

    @classmethod
    def _login_password_requests(
        cls, host: str, username: str, password: str
    ) -> tuple[str | None, int, str, dict]:
        if requests is None:
            return None, 0, "requests paketi yüklü değil", {}
        url = host.rstrip("/") + "/api/v1/auth/token/"
        try:
            response = requests.post(
                url,
                json={
                    "username": username,
                    "password": password,
                    "remember_me": True,
                },
                timeout=30,
            )
        except requests.RequestException as exc:
            return None, 0, str(exc), {}
        if response.status_code == 200:
            token = response.json().get("access")
            if token:
                return token, 200, "", dict(response.headers)
        return None, response.status_code, response.text, dict(response.headers)

    @classmethod
    def _login_password_locust(cls, client, username: str, password: str):
        with client.post(
            "/api/v1/auth/token/",
            json={
                "username": username,
                "password": password,
                "remember_me": True,
            },
            catch_response=True,
            name="Auth: token",
        ) as response:
            headers = dict(response.headers) if response.headers else {}
            if response.status_code == 200:
                try:
                    token = response.json().get("access")
                except json.JSONDecodeError:
                    response.failure("Login yanıtı JSON değil")
                    return None, 200, response.text, headers
                if token:
                    return token, 200, "", headers
                response.failure("Login yanıtında access token yok")
                return None, 200, response.text, headers
            msg = _format_http_error(
                response.status_code, response.text, f"login {username}"
            )
            response.failure(msg)
            return None, response.status_code, response.text, headers

    @classmethod
    def prefetch_all(cls, host: str, password: str) -> None:
        for index, username in enumerate(cls.unique_usernames()):
            if index > 0 and LOGIN_STAGGER_SEC > 0:
                time.sleep(LOGIN_STAGGER_SEC)
            token, err = cls.acquire(username, password, host=host)
            if err:
                logger.error(
                    "[loadtest] Ön-login başarısız (%s): %s", username, err
                )
            else:
                logger.info("[loadtest] Token önbelleğe alındı: %s", username)


# ─── HTTP ön-yükleme (init) ──────────────────────────────────────────


def fetch_me_permissions_http(host: str, token: str) -> list[str] | None:
    profile = fetch_me_profile_http(host, token)
    if not profile:
        return None
    return _extract_permissions(profile)


def fetch_me_profile_http(host: str, token: str) -> dict | None:
    if requests is None:
        return None
    url = host.rstrip("/") + "/api/v1/auth/me/"
    try:
        response = requests.get(url, headers=_auth_headers(token), timeout=20)
    except requests.RequestException as exc:
        logger.error("[loadtest] /auth/me/ isteği başarısız: %s", exc)
        return None
    if response.status_code != 200:
        logger.error(
            "[loadtest] /auth/me/ %s: %s",
            response.status_code,
            _short_detail(response.text),
        )
        return None
    try:
        body = response.json()
    except json.JSONDecodeError:
        logger.error("[loadtest] /auth/me/ yanıtı JSON değil")
        return None
    return body if isinstance(body, dict) else None


def fetch_me_profile(client) -> dict | None:
    with client.get(
        "/api/v1/auth/me/", catch_response=True, name="Auth: me"
    ) as response:
        if response.status_code != 200:
            response.failure(
                _format_http_error(
                    response.status_code, response.text, "auth/me"
                )
            )
            return None
        try:
            body = response.json()
        except json.JSONDecodeError:
            response.failure("Auth/me yanıtı JSON değil")
            return None
        return body if isinstance(body, dict) else None


def resolve_runtime_config(host: str) -> None:
    """Sunucudan şube kapsamını çöz; WS 403 (branch deny) riskini azalt."""
    global BRANCH_ID

    profiles: dict[str, dict] = {}
    for username in TokenCache.unique_usernames():
        token = TokenCache.get(username)
        if not token:
            continue
        profile = fetch_me_profile_http(host, token)
        if profile:
            profiles[username] = profile

    if not profiles:
        logger.warning(
            "[loadtest] Test kullanıcı profilleri alınamadı — BRANCH_ID=%s (seed varsayılan)",
            BRANCH_ID,
        )
        return

    anchor = profiles.get(WAITER_USER) or next(iter(profiles.values()))
    preferred = BRANCH_ID if _BRANCH_ID_EXPLICIT else None
    resolved_branch = _pick_profile_branch(anchor, preferred)
    if not resolved_branch:
        logger.error(
            "[loadtest] Erişilebilir şube bulunamadı — kullanıcıların branch / "
            "WaiterBranchAssignment / CookStationAssignment atamasını kontrol edin"
        )
        return

    anchor_available = _available_branch_ids(anchor)
    if _BRANCH_ID_EXPLICIT and BRANCH_ID not in anchor_available:
        logger.warning(
            "[loadtest] RAMIS_LOADTEST_BRANCH_ID=%s erişilebilir şubelerde yok (%s) — "
            "otomatik %s kullanılıyor",
            BRANCH_ID,
            ", ".join(anchor_available) or "-",
            resolved_branch,
        )
    elif resolved_branch != BRANCH_ID:
        logger.info(
            "[loadtest] Şube otomatik ayarlandı: %s → %s",
            BRANCH_ID,
            resolved_branch,
        )
    BRANCH_ID = resolved_branch

    for username, profile in profiles.items():
        user_branch = _pick_profile_branch(profile, BRANCH_ID) or resolved_branch
        USER_BRANCH_IDS[username] = user_branch
        available = _available_branch_ids(profile)
        if BRANCH_ID not in available:
            logger.warning(
                "[loadtest] %s: test şubesi %s kullanıcının erişiminde değil (%s) — "
                "WS için %s kullanılacak",
                username,
                BRANCH_ID,
                ", ".join(available) or "-",
                user_branch,
            )
        else:
            logger.info(
                "[loadtest] %s şube kapsamı OK — branch=%s",
                username,
                user_branch,
            )


def fetch_waiter_tables_http(
    host: str, token: str, branch_id: str
) -> list[str]:
    if requests is None:
        return []
    url = (
        host.rstrip("/")
        + f"/api/v1/tables/?branch_id={branch_id}&scope=waiter"
    )
    try:
        response = requests.get(url, headers=_auth_headers(token), timeout=20)
    except requests.RequestException as exc:
        logger.error("[loadtest] Garson masa listesi alınamadı: %s", exc)
        return []
    if response.status_code != 200:
        logger.error(
            "[loadtest] Garson masaları %s: %s",
            response.status_code,
            _short_detail(response.text),
        )
        return []
    try:
        return _extract_table_ids(response.json())
    except json.JSONDecodeError:
        return []


def fetch_me_permissions(client) -> list[str] | None:
    with client.get(
        "/api/v1/auth/me/", catch_response=True, name="Auth: me"
    ) as response:
        if response.status_code != 200:
            response.failure(
                _format_http_error(
                    response.status_code, response.text, "auth/me"
                )
            )
            return None
        try:
            return _extract_permissions(response.json())
        except json.JSONDecodeError:
            response.failure("Auth/me yanıtı JSON değil")
            return None


def fetch_waiter_tables(client, branch_id: str) -> list[str]:
    with client.get(
        f"/api/v1/tables/?branch_id={branch_id}&scope=waiter",
        catch_response=True,
        name="Waiter: scoped tables",
    ) as response:
        if response.status_code != 200:
            response.failure(
                _format_http_error(
                    response.status_code, response.text, "waiter tables"
                )
            )
            return []
        try:
            return _extract_table_ids(response.json())
        except json.JSONDecodeError:
            response.failure("Garson masa listesi JSON değil")
            return []


def resolve_waiter_tables(
    client, permissions: list[str] | None
) -> list[str]:
    global WAITER_ELIGIBLE_TABLES
    if WAITER_ELIGIBLE_TABLES:
        return list(WAITER_ELIGIBLE_TABLES)

    scoped = fetch_waiter_tables(client, BRANCH_ID)
    if scoped:
        WAITER_ELIGIBLE_TABLES = scoped
        return scoped

    perms = permissions or fetch_me_permissions(client) or []
    ok, perm_msg = _check_order_create_permissions(perms)
    if not ok:
        logger.error("[loadtest] Garson izinleri yetersiz: %s", perm_msg)
        return []

    if "waiter.access" in perms:
        logger.warning(
            "[loadtest] %s: waiter.access var ama şube garson ataması/masa yok. "
            "WaiterBranchAssignment tanımlayın veya kasiyer hesabı kullanın. "
            "Geçici olarak RAMIS_LOADTEST_TABLE_IDS (varsayılan) kullanılıyor.",
            WAITER_USER,
        )

    fallback = TABLES
    if fallback:
        logger.warning(
            "[loadtest] Garson kapsamı boş; RAMIS_LOADTEST_TABLE_IDS kullanılıyor (%d masa)",
            len(fallback),
        )
        WAITER_ELIGIBLE_TABLES = list(fallback)
        return list(fallback)

    return []


# ─── Locust init ─────────────────────────────────────────────────────


@events.init.add_listener
def _on_locust_init(environment, **_kwargs) -> None:
    host = getattr(getattr(environment, "parsed_options", None), "host", None)
    if not host or SKIP_PREFETCH:
        if SKIP_PREFETCH:
            logger.info(
                "[loadtest] RAMIS_LOADTEST_SKIP_PREFETCH=1 — ön-login atlandı"
            )
        return

    logger.info("[loadtest] Test hesapları için token önbelleği dolduruluyor…")
    if CASHIER_USE_PIN:
        logger.info(
            "[loadtest] Kasiyer/POS girişi frontend akışı: check-pin → token/pin "
            "(PIN=%s, kullanıcılar=%s)",
            LOADTEST_CASHIER_PIN,
            ", ".join(sorted(_pin_login_usernames())) or "-",
        )
    TokenCache.prefetch_all(host, LOADTEST_PASSWORD)
    resolve_runtime_config(host)

    waiter_token = TokenCache.get(WAITER_USER)
    if not waiter_token:
        logger.error(
            "[loadtest] Garson token yok — sipariş senaryosu muhtemelen başarısız olur"
        )
        return

    perms = fetch_me_permissions_http(host, waiter_token) or []
    ok, perm_msg = _check_order_create_permissions(perms)
    if ok:
        logger.info("[loadtest] %s sipariş izinleri OK", WAITER_USER)
    else:
        logger.error(
            "[loadtest] %s sipariş izinleri: %s", WAITER_USER, perm_msg
        )

    global WAITER_ELIGIBLE_TABLES, WAITER_PREFETCH_PERMISSIONS
    WAITER_PREFETCH_PERMISSIONS = list(perms)
    WAITER_ELIGIBLE_TABLES = fetch_waiter_tables_http(
        host, waiter_token, BRANCH_ID
    )
    if WAITER_ELIGIBLE_TABLES:
        logger.info(
            "[loadtest] Garson masa kapsamı: %d masa",
            len(WAITER_ELIGIBLE_TABLES),
        )
    elif "waiter.access" in perms:
        logger.warning(
            "[loadtest] Garson için atanmış masa yok (WaiterBranchAssignment). "
            "resolve_waiter_tables varsayılan TABLES listesine düşecek."
        )

    # Split mimari bilgisi
    if WS_HOST:
        logger.info(
            "[loadtest] Split mimari: HTTP → %s | WS → %s", host, WS_HOST
        )
    else:
        logger.info(
            "[loadtest] WS host ayrı tanımlanmamış (Nginx arkası veya monolitik)"
        )


# ─── WebSocket keep-alive ────────────────────────────────────────────


class WsKeepAlive:
    """Arka planda ping gönderir; sunucu kopuk bağlantıyı erken kapatsın."""

    def __init__(self, url: str, ping_interval: float = WS_PING_INTERVAL_SEC):
        self.url = url
        self.ping_interval = ping_interval
        self._ws = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._context = ""

    def connect(self, *, username: str = "", branch_id: str = "") -> bool:
        ctx_parts = [p for p in (username, branch_id) if p]
        self._context = " ".join(ctx_parts)
        if websocket is None:
            logger.warning(
                "websocket-client yüklü değil — pip install websocket-client"
            )
            return False
        try:
            self._ws = websocket.create_connection(self.url, timeout=15)
            self._stop.clear()
            self._thread = threading.Thread(
                target=self._loop, name="ws-keepalive", daemon=True
            )
            self._thread.start()
            return True
        except WebSocketBadStatusException as wse:
            ctx = f" ({self._context})" if self._context else ""
            logger.warning(
                "WebSocket HTTP %s%s — branch_id kullanıcının erişilebilir şubelerinde "
                "olmayabilir (RBAC yetkisi ≠ şube kapsamı), JWT geçersiz olabilir veya "
                "nginx /ws/ Daphne'ye yönlendirilmiyor olabilir. "
                "RAMIS_LOADTEST_BRANCH_ID ve RAMIS_LOADTEST_WS_HOST kontrol edin.",
                wse.status_code,
                ctx,
            )
            return False
        except Exception as exc:
            ctx = f" ({self._context})" if self._context else ""
            logger.warning(
                "WebSocket bağlantısı kurulamadı%s: %s", ctx, exc
            )
            return False

    def _loop(self) -> None:
        last_ping = 0.0
        while not self._stop.is_set() and self._ws is not None:
            try:
                now = time.time()
                if now - last_ping >= self.ping_interval:
                    self._ws.send(json.dumps({"type": "ping"}))
                    last_ping = now
                self._ws.settimeout(1.0)
                try:
                    self._ws.recv()
                except websocket.WebSocketTimeoutException:
                    pass
            except Exception:
                break

    def close(self) -> None:
        self._stop.set()
        if self._ws is not None:
            try:
                self._ws.close()
            except Exception:
                pass
            self._ws = None


# ─── Auth mixin ──────────────────────────────────────────────────────


class RamisAuthMixin:
    """JWT login — paylaşımlı token önbelleği + Bearer header."""

    access_token: str | None = None
    is_logged_in: bool = False
    branch_id: str = ""

    def ramis_login(self, username: str, password: str) -> bool:
        self.is_logged_in = False
        self.access_token = None
        self.branch_id = get_user_branch_id(username)
        token, err = TokenCache.acquire(
            username,
            password,
            host=self.host,
            locust_client=self.client,
        )
        if err or not token:
            if err:
                logger.warning(
                    "[loadtest] Giriş başarısız (%s): %s", username, err
                )
            return False
        if username not in USER_BRANCH_IDS:
            profile = fetch_me_profile(self.client)
            if profile:
                picked = _pick_profile_branch(profile, BRANCH_ID)
                if picked:
                    USER_BRANCH_IDS[username] = picked
                    self.branch_id = picked
        else:
            self.branch_id = get_user_branch_id(username)
        self.access_token = token
        self.client.headers.update(_auth_headers(token))
        self.is_logged_in = True
        return True


# ─── Kullanıcı senaryoları ───────────────────────────────────────────


class WaiterUser(HttpUser, RamisAuthMixin):
    weight = 15
    wait_time = between(30, 120)

    waiter_tables: list[str] = []
    can_create_orders: bool = False
    _setup_warned = False

    def on_start(self) -> None:
        if not self.ramis_login(WAITER_USER, LOADTEST_PASSWORD):
            return
        perms = fetch_me_permissions(self.client)
        ok, perm_msg = _check_order_create_permissions(perms or [])
        self.waiter_tables = resolve_waiter_tables(self.client, perms)
        self.can_create_orders = bool(
            ok and self.waiter_tables and PRODUCTS
        )

        if not self.can_create_orders and not WaiterUser._setup_warned:
            WaiterUser._setup_warned = True
            if not ok:
                logger.error(
                    "[loadtest] WaiterUser devre dışı — %s", perm_msg
                )
            elif not self.waiter_tables:
                logger.error(
                    "[loadtest] WaiterUser devre dışı — kullanılabilir masa yok "
                    "(garson ataması kontrol edin)"
                )
            elif not PRODUCTS:
                logger.error(
                    "[loadtest] WaiterUser devre dışı — ürün listesi boş"
                )

    @task
    def create_order(self) -> None:
        if not self.is_logged_in or not self.can_create_orders:
            return
        table_id = random.choice(self.waiter_tables)
        payload = {
            "branch_id": BRANCH_ID,
            "table_id": table_id,
            "order_type": "TABLE",
            "items": [
                {
                    "product_id": random.choice(PRODUCTS),
                    "quantity": random.randint(1, 3),
                    "unit_price": "100.0000",
                }
            ],
        }
        with self.client.post(
            "/api/v1/orders/main/",
            json=payload,
            catch_response=True,
            name="Waiter: Create Order",
        ) as response:
            if response.status_code == 201:
                return
            if response.status_code in (401, 403):
                response.failure(
                    _format_http_error(
                        response.status_code,
                        response.text,
                        f"sipariş masa={table_id[:8]}…",
                    )
                )
                return
            if response.status_code == 429:
                response.failure(
                    _format_http_error(429, response.text, "sipariş oluşturma")
                )
                return
            response.failure(
                _format_http_error(
                    response.status_code, response.text, "sipariş"
                )
            )


class ChefUser(HttpUser, RamisAuthMixin):
    weight = 2
    wait_time = between(60, 300)
    ws_session: WsKeepAlive | None = None

    def on_start(self) -> None:
        if not self.ramis_login(CHEF_USER, LOADTEST_PASSWORD):
            return
        url = build_ws_url(
            self.host,
            "/ws/kitchen/notifications/",
            self.access_token,
            self.branch_id,
        )
        self.ws_session = WsKeepAlive(url)
        self.ws_session.connect(username=CHEF_USER, branch_id=self.branch_id)

    @task
    def process_kitchen(self) -> None:
        if not self.is_logged_in:
            return
        with self.client.get(
            f"/api/v1/orders/main/kds_active/?branch_id={BRANCH_ID}",
            catch_response=True,
            name="Chef: View KDS",
        ) as response:
            if response.status_code != 200:
                response.failure(
                    _format_http_error(
                        response.status_code, response.text, "KDS"
                    )
                )
                return
            try:
                orders = response.json()
            except json.JSONDecodeError:
                response.failure("KDS yanıtı JSON değil")
                return
            if not isinstance(orders, list):
                response.failure("KDS yanıtı liste değil")
                return
            for order in orders:
                for item in order.get("items", []):
                    if item.get("status") != "PENDING":
                        continue
                    item_id = item.get("id")
                    if not item_id:
                        continue
                    with self.client.post(
                        f"/api/v1/orders/items/{item_id}/set_status/",
                        json={"status": "PREPARING"},
                        catch_response=True,
                        name="Chef: Mark Preparing",
                    ) as prep:
                        if prep.status_code not in (200, 201):
                            prep.failure(
                                _format_http_error(
                                    prep.status_code, prep.text, "PREPARING"
                                )
                            )
                            return
                    with self.client.post(
                        f"/api/v1/orders/items/{item_id}/set_status/",
                        json={"status": "READY"},
                        catch_response=True,
                        name="Chef: Mark Ready",
                    ) as ready:
                        if ready.status_code not in (200, 201):
                            ready.failure(
                                _format_http_error(
                                    ready.status_code, ready.text, "READY"
                                )
                            )
                    return

    def on_stop(self) -> None:
        if self.ws_session is not None:
            self.ws_session.close()


class CashierUser(HttpUser, RamisAuthMixin):
    weight = 3
    wait_time = between(45, 90)

    def on_start(self) -> None:
        self.ramis_login(CASHIER_USER, LOADTEST_PASSWORD)

    @task
    def complete_payment(self) -> None:
        if not self.is_logged_in or not POS_TERMINALS:
            return
        with self.client.get(
            f"/api/v1/orders/main/?branch_id={BRANCH_ID}&status=READY",
            catch_response=True,
            name="Cashier: List Ready Orders",
        ) as response:
            if response.status_code != 200:
                response.failure(
                    _format_http_error(
                        response.status_code, response.text, "READY listesi"
                    )
                )
                return
            try:
                body = response.json()
            except json.JSONDecodeError:
                response.failure("Liste yanıtı JSON değil")
                return
            results = body.get("results", body if isinstance(body, list) else [])
            if not results:
                return
            order = random.choice(results)
            order_id = order.get("id")
            if not order_id:
                return
            with self.client.post(
                f"/api/v1/orders/main/{order_id}/complete/",
                json={
                    "payment_method": "CASH",
                    "pos_terminal_id": random.choice(POS_TERMINALS),
                },
                catch_response=True,
                name="Cashier: Complete Payment",
            ) as pay:
                if pay.status_code not in (200, 201):
                    pay.failure(
                        _format_http_error(
                            pay.status_code,
                            pay.text,
                            f"ödeme order={order_id[:8]}…",
                        )
                    )
                    return
                table_id = _order_table_id(order)
                if table_id:
                    finish_table_cleaning(self.client, table_id)


class PosSyncUser(HttpUser, RamisAuthMixin):
    """POS / masa ekranı — paylaşımlı /ws/pos/sync/ yükü."""

    weight = 5
    wait_time = between(15, 45)
    ws_session: WsKeepAlive | None = None

    def on_start(self) -> None:
        if not self.ramis_login(POS_USER, LOADTEST_PASSWORD):
            return
        terminal = random.choice(POS_TERMINALS) if POS_TERMINALS else None
        url = build_ws_url(
            self.host,
            "/ws/pos/sync/",
            self.access_token,
            self.branch_id,
        )
        if terminal:
            url += "&" if "?" in url else "?"
            url += urlencode({"terminal_id": terminal, "platform": "web"})
        self.ws_session = WsKeepAlive(url)
        self.ws_session.connect(username=POS_USER, branch_id=self.branch_id)

    @task
    def poll_tables(self) -> None:
        if not self.is_logged_in:
            return
        with self.client.get(
            f"/api/v1/tables/?branch_id={BRANCH_ID}",
            catch_response=True,
            name="POS: List Tables",
        ) as response:
            if response.status_code != 200:
                response.failure(
                    _format_http_error(
                        response.status_code, response.text, "masa listesi"
                    )
                )

    def on_stop(self) -> None:
        if self.ws_session is not None:
            self.ws_session.close()
