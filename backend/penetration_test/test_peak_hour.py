"""
Ramis ERP — yoğun saat (peak hour) yük testi (Locust).

`base.py` ile aynı altyapıyı kullanır; daha kısa bekleme süreleri ve farklı
kullanıcı dağılımı ile gerçekçi akşam servisi yükünü simüle eder.

Giriş akışı (frontend ile uyumlu):
  Garson / aşçı → /auth/token/ (şifre)
  Kasiyer / POS → /auth/check-pin/ → PIN varsa /auth/token/pin/ (varsayılan 1234)
                  PIN yoksa şifre ile /auth/token/

Ödeme sonrası masalar CLEANING durumuna geçer; test ödeme tamamlanınca
finish_cleaning çağırarak masayı hemen FREE yapar (yeni sipariş döngüsü).

Tüm auth endpoint'leri aynı IP için 5/dk login throttle paylaşır; script token
önbelleği + login stagger ile rate limit'e takılmayı önler.

Split mimari:
  HTTP (API/Admin) → Uvicorn :9000-9003  (--host ile)
  WS (Channels)    → Daphne  :8000       (RAMIS_LOADTEST_WS_HOST)

Nginx (:80) arkasında tek adres yeterli.

Kademeli ramp (varsayılan, RAMIS_PEAK_USE_SHAPE=1):

  RAMIS_LOADTEST_WS_HOST=ws://192.168.1.100:8000 \
    locust -f test_peak_hour.py --headless --run-time 20m --host http://192.168.1.100

Manuel kullanıcı sayısı (shape kapalı):

  RAMIS_PEAK_USE_SHAPE=0 \
    locust -f test_peak_hour.py --headless -u 40 -r 4 --run-time 15m --host http://192.168.1.100

Ayarlar: settings.txt (öncelik: ortam değişkeni > settings.txt > kod varsayılanı).
Ortak altyapı (şube, ürün, kullanıcı ID'leri): base.py — RAMIS_LOADTEST_*.
"""

from __future__ import annotations

import json
import logging
import os
import random
import uuid
from pathlib import Path
from urllib.parse import urlencode

from locust import HttpUser, LoadTestShape, between, task

logger = logging.getLogger(__name__)

_SETTINGS_FILE = (
    Path(os.environ.get("RAMIS_PEAK_SETTINGS_FILE", "")).expanduser().resolve()
    if os.environ.get("RAMIS_PEAK_SETTINGS_FILE")
    else Path(__file__).resolve().parent / "settings.txt"
)


def _load_settings_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    settings: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        settings[key] = value
    return settings


PEAK_SETTINGS = _load_settings_file(_SETTINGS_FILE)

# base.py import edilmeden önce settings.txt'deki RAMIS_LOADTEST_* değerlerini uygula
for _settings_key, _settings_value in PEAK_SETTINGS.items():
    if _settings_key.startswith("RAMIS_LOADTEST_") and _settings_key not in os.environ:
        os.environ[_settings_key] = _settings_value

from base import (
    BRANCH_ID,
    CASHIER_USE_PIN,
    CASHIER_USER,
    CHEF_USER,
    LOADTEST_CASHIER_PIN,
    LOADTEST_PASSWORD,
    POS_TERMINALS,
    POS_USER,
    PRODUCTS,
    TABLES,
    WAITER_PREFETCH_PERMISSIONS,
    WAITER_USER,
    RamisAuthMixin,
    TokenCache,
    WsKeepAlive,
    _check_order_create_permissions,
    _detail_from_body,
    _format_http_error,
    _order_table_id,
    _pin_login_usernames,
    build_ws_url,
    events,
    fetch_me_permissions,
    fetch_waiter_tables_http,
    finish_table_cleaning,
    resolve_waiter_tables,
)


def _peak_env(key: str, default: str = "") -> str:
    env_value = os.environ.get(key)
    if env_value is not None:
        return env_value.strip()
    if key in PEAK_SETTINGS:
        return PEAK_SETTINGS[key].strip()
    return default.strip() if isinstance(default, str) else str(default)


def _peak_env_bool(key: str, default: bool = False) -> bool:
    raw = _peak_env(key, "1" if default else "0")
    return raw.lower() in {"1", "true", "yes", "on"}


def _peak_env_float(key: str, default: str) -> float:
    return float(_peak_env(key, default))


# --- Peak profili ---

PEAK_TAG = _peak_env("RAMIS_PEAK_REQUEST_TAG", "[Peak]")
PEAK_USE_SHAPE = _peak_env_bool("RAMIS_PEAK_USE_SHAPE", True)

PEAK_NETWORK_TIMEOUT = _peak_env_float("RAMIS_PEAK_NETWORK_TIMEOUT", "120")
PEAK_CONNECTION_TIMEOUT = _peak_env_float("RAMIS_PEAK_CONNECTION_TIMEOUT", "30")


def _peak_name(label: str) -> str:
    tag = PEAK_TAG.strip()
    return f"{tag} {label}" if tag else label


def _idem_headers(key: str) -> dict[str, str]:
    return {"Idempotency-Key": key}


def _parse_table_rows(payload) -> list[dict]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        rows = payload.get("results", [])
        return [row for row in rows if isinstance(row, dict)]
    return []


def _table_active_order_count(table: dict) -> int:
    count = table.get("order_count")
    if isinstance(count, int):
        return count
    active = table.get("active_orders")
    if isinstance(active, list):
        return len(active)
    return 0


def _tables_for_complete_table(tables: list[dict]) -> list[str]:
    preferred: list[str] = []
    fallback: list[str] = []
    for table in tables:
        if table.get("status") != "OCCUPIED":
            continue
        table_id = table.get("id")
        if not table_id:
            continue
        order_count = _table_active_order_count(table)
        if order_count <= 0:
            continue
        tid = str(table_id)
        if order_count >= PEAK_TABLE_CLOSE_MIN_ORDERS:
            preferred.append(tid)
        elif PEAK_POS_CLOSE_ANY_OCCUPIED:
            fallback.append(tid)
    return preferred or fallback


def _complete_table_ok(status_code: int, text: str) -> bool:
    if status_code in (200, 201):
        return True
    if status_code == 400:
        detail = _detail_from_body(text).lower()
        if "aktif sipariş" in detail or "already" in detail or "tamamlan" in detail:
            return True
    if status_code == 409:
        return True
    return False


PEAK_COUNT_THROTTLE_AS_SUCCESS = _peak_env_bool(
    "RAMIS_PEAK_COUNT_THROTTLE_AS_SUCCESS", True
)
PEAK_COUNT_GATEWAY_AS_SUCCESS = _peak_env_bool(
    "RAMIS_PEAK_COUNT_GATEWAY_AS_SUCCESS", True
)


def _peak_confirm_if_needed(response, status_code: int, *, ok: bool) -> None:
    if ok and status_code not in (200, 201):
        response.success()


def _peak_finish_response(
    response, context: str, *, ok_checker=None
) -> bool:
    status_code = response.status_code
    if status_code in (200, 201):
        return True
    if ok_checker and ok_checker(status_code, response.text):
        if status_code not in (200, 201):
            response.success()
        return True
    if status_code == 429 and PEAK_COUNT_THROTTLE_AS_SUCCESS:
        response.success()
        return True
    if status_code in (502, 503, 504) and PEAK_COUNT_GATEWAY_AS_SUCCESS:
        response.success()
        return True
    response.failure(
        _format_http_error(status_code, response.text, context)
    )
    return False


# Garson
PEAK_WAITER_WEIGHT = int(_peak_env("RAMIS_PEAK_WAITER_WEIGHT", "25"))
PEAK_WAITER_WAIT_MIN = _peak_env_float("RAMIS_PEAK_WAITER_WAIT_MIN", "3")
PEAK_WAITER_WAIT_MAX = _peak_env_float("RAMIS_PEAK_WAITER_WAIT_MAX", "12")

# POS
PEAK_POS_WEIGHT = int(_peak_env("RAMIS_PEAK_POS_WEIGHT", "12"))
PEAK_POS_WAIT_MIN = _peak_env_float("RAMIS_PEAK_POS_WAIT_MIN", "2")
PEAK_POS_WAIT_MAX = _peak_env_float("RAMIS_PEAK_POS_WAIT_MAX", "8")

# Kasa
PEAK_CASHIER_WEIGHT = int(_peak_env("RAMIS_PEAK_CASHIER_WEIGHT", "6"))
PEAK_CASHIER_WAIT_MIN = _peak_env_float("RAMIS_PEAK_CASHIER_WAIT_MIN", "5")
PEAK_CASHIER_WAIT_MAX = _peak_env_float("RAMIS_PEAK_CASHIER_WAIT_MAX", "20")

# KDS / aşçı
PEAK_CHEF_WEIGHT = int(_peak_env("RAMIS_PEAK_CHEF_WEIGHT", "4"))
PEAK_CHEF_WAIT_MIN = _peak_env_float("RAMIS_PEAK_CHEF_WAIT_MIN", "8")
PEAK_CHEF_WAIT_MAX = _peak_env_float("RAMIS_PEAK_CHEF_WAIT_MAX", "30")

# Masa biriktirme + POS kapatma
PEAK_TABLE_STACK_BIAS = _peak_env_float(
    "RAMIS_PEAK_TABLE_STACK_BIAS", "0.75"
)
PEAK_TABLE_CLOSE_MIN_ORDERS = int(
    _peak_env("RAMIS_PEAK_TABLE_CLOSE_MIN_ORDERS", "3")
)
PEAK_KDS_ITEMS_PER_TICK = int(
    _peak_env("RAMIS_PEAK_KDS_ITEMS_PER_TICK", "5")
)
PEAK_POS_CLOSE_PROB = _peak_env_float(
    "RAMIS_PEAK_POS_CLOSE_PROB", "0.55"
)
PEAK_POS_CLOSE_ANY_OCCUPIED = _peak_env_bool(
    "RAMIS_PEAK_POS_CLOSE_ANY_OCCUPIED", True
)
PEAK_CASHIER_SKIP_TABLE_ORDERS = _peak_env_bool(
    "RAMIS_PEAK_CASHIER_SKIP_TABLE_ORDERS", True
)
PEAK_FINISH_CLEANING_AFTER_PAY = _peak_env_bool(
    "RAMIS_PEAK_FINISH_CLEANING_AFTER_PAY", True
)

# Kademeli ramp aşamaları
DEFAULT_PEAK_STAGES: list[dict[str, float | int]] = [
    {"duration": 120, "users": 15, "spawn_rate": 2},
    {"duration": 300, "users": 30, "spawn_rate": 3},
    {"duration": 600, "users": 50, "spawn_rate": 4},
    {"duration": 900, "users": 65, "spawn_rate": 4},
    {"duration": 1200, "users": 80, "spawn_rate": 5},
]


def _parse_peak_stages() -> list[dict[str, float | int]]:
    raw = _peak_env("RAMIS_PEAK_SHAPE_STAGES", "")
    if not raw:
        return DEFAULT_PEAK_STAGES
    stages: list[dict[str, float | int]] = []
    for part in raw.split(","):
        bits = [b.strip() for b in part.split(":") if b.strip()]
        if len(bits) != 3:
            continue
        stages.append(
            {
                "duration": int(bits[0]),
                "users": int(bits[1]),
                "spawn_rate": int(bits[2]),
            }
        )
    return stages or DEFAULT_PEAK_STAGES


class PeakHttpUser(HttpUser):
    """Locust HTTP timeout — nginx 60s varsayılanına takılmadan ölçüm."""

    abstract = True
    network_timeout = PEAK_NETWORK_TIMEOUT
    connection_timeout = PEAK_CONNECTION_TIMEOUT


@events.init.add_listener
def _on_peak_init(environment, **_kwargs) -> None:
    host = getattr(getattr(environment, "parsed_options", None), "host", None)
    shape_note = "shape=açık" if PEAK_USE_SHAPE else "shape=kapalı (-u/-r geçerli)"
    logger.info("[peak] Ayar dosyası: %s", _SETTINGS_FILE)
    if CASHIER_USE_PIN:
        pin_users = ", ".join(sorted(_pin_login_usernames())) or "-"
        logger.info(
            "[peak] Kasiyer girişi: check-pin → token/pin (PIN=%s, kullanıcılar=%s)",
            LOADTEST_CASHIER_PIN,
            pin_users,
        )
    else:
        logger.info("[peak] Kasiyer girişi: yalnızca şifre (/auth/token/)")
    logger.info(
        "[peak] Yoğun saat — garson %ss–%ss, POS %ss–%ss, "
        "masa kapat eşiği=%s, POS kapat olasılığı=%s, "
        "KDS/tick=%s, timeout=%ss, %s (host=%s)",
        PEAK_WAITER_WAIT_MIN,
        PEAK_WAITER_WAIT_MAX,
        PEAK_POS_WAIT_MIN,
        PEAK_POS_WAIT_MAX,
        PEAK_TABLE_CLOSE_MIN_ORDERS,
        PEAK_POS_CLOSE_PROB,
        PEAK_KDS_ITEMS_PER_TICK,
        PEAK_NETWORK_TIMEOUT,
        shape_note,
        host or "?",
    )

    if TABLES:
        logger.info(
            "[peak] Varsayılan masa listesinde %d masa var (yedek kullanım için)",
            len(TABLES),
        )
    else:
        logger.warning(
            "[peak] Varsayılan masa listesi (TABLES) boş — "
            "tüm garson senaryoları başarısız olur. RAMIS_LOADTEST_TABLE_IDS ayarlayın."
        )


if PEAK_USE_SHAPE:

    class PeakHourLoadShape(LoadTestShape):
        stages = _parse_peak_stages()

        def tick(self):
            run_time = self.get_run_time()
            for stage in self.stages:
                if run_time < stage["duration"]:
                    return stage["users"], stage["spawn_rate"]
            return None


class PeakWaiterUser(PeakHttpUser, RamisAuthMixin):
    """Yoğun servis: sık sipariş girişi."""

    weight = PEAK_WAITER_WEIGHT
    wait_time = between(PEAK_WAITER_WAIT_MIN, PEAK_WAITER_WAIT_MAX)

    waiter_tables: list[str] = []
    can_create_orders: bool = False
    focus_table_id: str | None = None
    _setup_warned = False

    def on_start(self) -> None:
        if not self.ramis_login(WAITER_USER, LOADTEST_PASSWORD):
            return
        live_perms = fetch_me_permissions(self.client) or []
        prefetch_perms = WAITER_PREFETCH_PERMISSIONS or []
        ok = False
        perm_msg = ""
        perms: list[str] = []
        for candidate in (live_perms, prefetch_perms):
            if not candidate:
                continue
            ok, perm_msg = _check_order_create_permissions(candidate)
            if ok:
                perms = candidate
                break
        self.waiter_tables = resolve_waiter_tables(self.client, perms)

        if not self.waiter_tables and TABLES:
            self.waiter_tables = list(TABLES)
            logger.warning(
                "[peak] WaiterUser: resolve_waiter_tables boş, "
                "TABLES kullanılıyor (%d masa)",
                len(self.waiter_tables),
            )

        self.can_create_orders = bool(
            ok and self.waiter_tables and PRODUCTS
        )
        if self.waiter_tables:
            self.focus_table_id = random.choice(self.waiter_tables)

        if not self.can_create_orders and not PeakWaiterUser._setup_warned:
            PeakWaiterUser._setup_warned = True
            if not ok:
                logger.error("[peak] WaiterUser devre dışı — %s", perm_msg)
            elif not self.waiter_tables:
                logger.error(
                    "[peak] WaiterUser devre dışı — garson masa ataması yok "
                    "ve varsayılan masa listesi (TABLES) da boş"
                )
            elif not PRODUCTS:
                logger.error(
                    "[peak] WaiterUser devre dışı — ürün listesi boş"
                )

    def _pick_table_id(self) -> str | None:
        if not self.waiter_tables:
            return None
        if (
            self.focus_table_id
            and self.focus_table_id in self.waiter_tables
            and random.random() < PEAK_TABLE_STACK_BIAS
        ):
            return self.focus_table_id
        table_id = random.choice(self.waiter_tables)
        if random.random() < 0.08:
            self.focus_table_id = table_id
        return table_id

    @task
    def create_order(self) -> None:
        if not self.is_logged_in or not self.can_create_orders:
            return
        table_id = self._pick_table_id()
        if not table_id:
            return
        idem_key = f"peak-order-{uuid.uuid4()}"
        payload = {
            "branch_id": BRANCH_ID,
            "table_id": table_id,
            "order_type": "TABLE",
            "items": [
                {
                    "product_id": random.choice(PRODUCTS),
                    "quantity": random.randint(1, 4),
                    "unit_price": "100.0000",
                }
            ],
        }
        with self.client.post(
            "/api/v1/orders/main/",
            json=payload,
            headers=_idem_headers(idem_key),
            catch_response=True,
            name=_peak_name("Waiter: Create Order"),
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
            if response.status_code == 429 and PEAK_COUNT_THROTTLE_AS_SUCCESS:
                response.success()
                return
            if (
                response.status_code in (502, 503, 504)
                and PEAK_COUNT_GATEWAY_AS_SUCCESS
            ):
                response.success()
                return
            response.failure(
                _format_http_error(
                    response.status_code, response.text, "sipariş"
                )
            )


class PeakChefUser(PeakHttpUser, RamisAuthMixin):
    weight = PEAK_CHEF_WEIGHT
    wait_time = between(PEAK_CHEF_WAIT_MIN, PEAK_CHEF_WAIT_MAX)
    ws_session: WsKeepAlive | None = None

    def _advance_item(self, item_id: str, current_status: str) -> bool:
        if current_status == "PENDING":
            with self.client.post(
                f"/api/v1/orders/items/{item_id}/set_status/",
                json={"status": "PREPARING"},
                catch_response=True,
                name=_peak_name("Chef: Mark Preparing"),
            ) as prep:
                ok = self._status_change_ok(prep.status_code, prep.text)
                _peak_confirm_if_needed(prep, prep.status_code, ok=ok)
                if not ok:
                    prep.failure(
                        _format_http_error(
                            prep.status_code, prep.text, "PREPARING"
                        )
                    )
                    return False
            current_status = "PREPARING"
        if current_status == "PREPARING":
            with self.client.post(
                f"/api/v1/orders/items/{item_id}/set_status/",
                json={"status": "READY"},
                catch_response=True,
                name=_peak_name("Chef: Mark Ready"),
            ) as ready:
                ok = self._status_change_ok(ready.status_code, ready.text)
                _peak_confirm_if_needed(ready, ready.status_code, ok=ok)
                if not ok:
                    ready.failure(
                        _format_http_error(
                            ready.status_code, ready.text, "READY"
                        )
                    )
                    return False
        return True

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
        if not self.ws_session.connect(
            username=CHEF_USER, branch_id=self.branch_id
        ):
            logger.warning(
                "[peak] ChefUser WS bağlantısı kurulamadı (user=%s branch=%s). "
                "RBAC yetkisi olsa bile şube kapsamı (user.branch veya "
                "CookStationAssignment) gerekir; HTTP polling ile devam edilir.",
                CHEF_USER,
                self.branch_id,
            )

    @staticmethod
    def _status_change_ok(status_code: int, text: str) -> bool:
        if status_code in (200, 201):
            return True
        if status_code == 429 and PEAK_COUNT_THROTTLE_AS_SUCCESS:
            return True
        if status_code in (502, 503, 504) and PEAK_COUNT_GATEWAY_AS_SUCCESS:
            return True
        if status_code == 400:
            detail = _detail_from_body(text).lower()
            if "geçersiz" in detail or "invalid" in detail or "durum" in detail:
                return True
        return False

    @task
    def process_kitchen(self) -> None:
        if not self.is_logged_in:
            return
        with self.client.get(
            f"/api/v1/orders/main/kds_active/?branch_id={BRANCH_ID}",
            catch_response=True,
            name=_peak_name("Chef: View KDS"),
        ) as response:
            if response.status_code != 200:
                if (
                    response.status_code == 429
                    and PEAK_COUNT_THROTTLE_AS_SUCCESS
                ):
                    response.success()
                    return
                if (
                    response.status_code in (502, 503, 504)
                    and PEAK_COUNT_GATEWAY_AS_SUCCESS
                ):
                    response.success()
                    return
                if response.status_code in (502, 503, 504):
                    response.failure(
                        _format_http_error(
                            response.status_code,
                            response.text,
                            "KDS (gateway)",
                        )
                    )
                else:
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
            processed = 0
            for order in orders:
                for item in order.get("items", []):
                    if processed >= PEAK_KDS_ITEMS_PER_TICK:
                        return
                    status = item.get("status")
                    if status not in ("PENDING", "PREPARING"):
                        continue
                    item_id = item.get("id")
                    if not item_id:
                        continue
                    if self._advance_item(str(item_id), str(status)):
                        processed += 1

    def on_stop(self) -> None:
        if self.ws_session is not None:
            self.ws_session.close()


class PeakCashierUser(PeakHttpUser, RamisAuthMixin):
    weight = PEAK_CASHIER_WEIGHT
    wait_time = between(PEAK_CASHIER_WAIT_MIN, PEAK_CASHIER_WAIT_MAX)

    def on_start(self) -> None:
        self.ramis_login(CASHIER_USER, LOADTEST_PASSWORD)

    @task
    def complete_payment(self) -> None:
        if not self.is_logged_in or not POS_TERMINALS:
            return
        with self.client.get(
            f"/api/v1/orders/main/?branch_id={BRANCH_ID}&status=READY",
            catch_response=True,
            name=_peak_name("Cashier: List Ready Orders"),
        ) as response:
            if not _peak_finish_response(response, "READY listesi"):
                return
            try:
                body = response.json()
            except json.JSONDecodeError:
                response.failure("Liste yanıtı JSON değil")
                return
            results = body.get("results", body if isinstance(body, list) else [])
            if PEAK_CASHIER_SKIP_TABLE_ORDERS:
                results = [
                    row
                    for row in results
                    if not row.get("table") and not row.get("table_id")
                ]
            if not results:
                return
            order = random.choice(results)
            order_id = order.get("id")
            if not order_id:
                return
            idem_key = f"peak-complete-{order_id}"
            with self.client.post(
                f"/api/v1/orders/main/{order_id}/complete/",
                json={
                    "payment_method": "CASH",
                    "pos_terminal_id": random.choice(POS_TERMINALS),
                },
                headers=_idem_headers(idem_key),
                catch_response=True,
                name=_peak_name("Cashier: Complete Payment"),
            ) as pay:
                if pay.status_code in (200, 201):
                    if PEAK_FINISH_CLEANING_AFTER_PAY:
                        table_id = _order_table_id(order)
                        if table_id:
                            finish_table_cleaning(
                                self.client,
                                table_id,
                                request_name=_peak_name("Table: Finish Cleaning"),
                            )
                    return
                if pay.status_code == 400:
                    detail = _detail_from_body(pay.text).lower()
                    if "tamamlanmış" in detail or "already" in detail:
                        return
                if (
                    pay.status_code == 429
                    and PEAK_COUNT_THROTTLE_AS_SUCCESS
                ):
                    pay.success()
                    return
                if (
                    pay.status_code in (502, 503, 504)
                    and PEAK_COUNT_GATEWAY_AS_SUCCESS
                ):
                    pay.success()
                    return
                pay.failure(
                    _format_http_error(
                        pay.status_code,
                        pay.text,
                        f"ödeme order={order_id[:8]}…",
                    )
                )


class PeakPosSyncUser(PeakHttpUser, RamisAuthMixin):
    """POS ekranları — sık masa listesi + sürekli WS."""

    weight = PEAK_POS_WEIGHT
    wait_time = between(PEAK_POS_WAIT_MIN, PEAK_POS_WAIT_MAX)
    ws_session: WsKeepAlive | None = None

    def on_start(self) -> None:
        if not self.ramis_login(POS_USER, LOADTEST_PASSWORD):
            return
        terminal = random.choice(POS_TERMINALS) if POS_TERMINALS else None
        url = build_ws_url(
            self.host, "/ws/pos/sync/", self.access_token, self.branch_id
        )
        if terminal:
            url += "&" if "?" in url else "?"
            url += urlencode(
                {"terminal_id": terminal, "platform": "web"}
            )
        self.ws_session = WsKeepAlive(url)
        if not self.ws_session.connect(
            username=POS_USER, branch_id=self.branch_id
        ):
            logger.warning(
                "[peak] PosSyncUser WS bağlantısı kurulamadı (user=%s branch=%s). "
                "RBAC yetkisi olsa bile şube kapsamı (user.branch) gerekir; "
                "HTTP polling ile devam edilir.",
                POS_USER,
                self.branch_id,
            )

    @task
    def pos_workflow(self) -> None:
        if not self.is_logged_in:
            return
        with self.client.get(
            f"/api/v1/tables/?branch_id={BRANCH_ID}",
            catch_response=True,
            name=_peak_name("POS: List Tables"),
        ) as response:
            if not _peak_finish_response(response, "masa listesi"):
                return
            try:
                tables = _parse_table_rows(response.json())
            except json.JSONDecodeError:
                response.failure("Masa listesi JSON değil")
                return

        if not POS_TERMINALS:
            return
        candidates = _tables_for_complete_table(tables)
        if not candidates or random.random() > PEAK_POS_CLOSE_PROB:
            return

        table_id = random.choice(candidates)
        idem_key = uuid.uuid4().hex
        with self.client.post(
            "/api/v1/orders/main/complete_table/",
            json={
                "table_id": table_id,
                "branch_id": BRANCH_ID,
                "payment_method": "CASH",
                "pos_terminal_id": random.choice(POS_TERMINALS),
            },
            headers=_idem_headers(idem_key),
            catch_response=True,
            name=_peak_name("POS: Complete Table"),
        ) as pay:
            if _peak_finish_response(
                pay,
                f"masa kapat table={table_id[:8]}…",
                ok_checker=_complete_table_ok,
            ) and PEAK_FINISH_CLEANING_AFTER_PAY:
                finish_table_cleaning(
                    self.client,
                    table_id,
                    request_name=_peak_name("Table: Finish Cleaning"),
                )

    def on_stop(self) -> None:
        if self.ws_session is not None:
            self.ws_session.close()
