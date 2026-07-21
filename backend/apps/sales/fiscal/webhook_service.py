"""Token X-Connect Cloud webhook işleme ve sepet bekleme servisi."""
import logging
import time

from django.conf import settings
from django.utils import timezone

from apps.orders.services.sale_helper import OrderValidationError
from apps.sales.fiscal.beko_result import parse_basket_result_payload
from apps.sales.models import FiscalBasketStatus, FiscalPendingBasket

logger = logging.getLogger(__name__)

WEBHOOK_WAIT_INTERVAL_SECONDS = 0.25
WEBHOOK_WAIT_MAX_INTERVAL_SECONDS = 2.0
WEBHOOK_WAIT_TIMEOUT_SECONDS = 120
WEBHOOK_WAIT_REDIS_CHUNK_SECONDS = 5


def build_fiscal_webhook_url(terminal_id) -> str | None:
    """Token Set Client Settings için kaydedilecek public webhook URL."""
    base = (getattr(settings, "FISCAL_WEBHOOK_BASE_URL", None) or "").rstrip("/")
    if not base:
        return None
    return f"{base}/api/v1/sales/fiscal/webhook/{terminal_id}/"


def _basket_wait_key(basket_id: str) -> str:
    return f"fiscal:basket_wait:{basket_id}"


def _redis_client():
    """İsteğe bağlı Redis — yoksa None (locmem / import hatası)."""
    url = (getattr(settings, "REDIS_CACHE_URL", None) or "").strip()
    if not url:
        return None
    try:
        import redis
    except ImportError:
        return None
    try:
        return redis.from_url(url)
    except Exception:
        logger.debug("fiscal wait redis bağlantısı kurulamadı", exc_info=True)
        return None


def notify_basket_waiters(basket_id: str) -> None:
    """Webhook sonrası bekleyen thread'i uyandırır (Redis BLPOP)."""
    client = _redis_client()
    if client is None:
        return
    try:
        key = _basket_wait_key(basket_id)
        pipe = client.pipeline()
        pipe.lpush(key, "1")
        pipe.expire(key, int(WEBHOOK_WAIT_TIMEOUT_SECONDS) + 60)
        pipe.execute()
    except Exception:
        logger.debug("fiscal wait notify başarısız: basket_id=%s", basket_id, exc_info=True)


def register_pending_basket(sale, basket_id: str, terminal) -> FiscalPendingBasket:
    client = _redis_client()
    if client is not None:
        try:
            client.delete(_basket_wait_key(basket_id))
        except Exception:
            logger.debug("fiscal wait key temizlenemedi: basket_id=%s", basket_id, exc_info=True)
    return FiscalPendingBasket.objects.create(
        sale=sale,
        pos_terminal=terminal,
        basket_id=basket_id,
        status=FiscalBasketStatus.PENDING,
    )


def wait_for_basket_completion(
    basket_id: str,
    *,
    timeout: float = WEBHOOK_WAIT_TIMEOUT_SECONDS,
    interval: float = WEBHOOK_WAIT_INTERVAL_SECONDS,
) -> FiscalPendingBasket:
    """
    Webhook veya DB güncellemesini bekler. Zaman aşımında TimeoutError fırlatır.

    Redis varsa BLPOP ile bloklar (busy-spin yok); yoksa üstel backoff ile uyur.
    """
    deadline = time.monotonic() + timeout
    sleep_interval = interval
    client = _redis_client()
    wait_key = _basket_wait_key(basket_id)

    while True:
        pending = (
            FiscalPendingBasket.objects.filter(basket_id=basket_id)
            .only("id", "status", "error_message", "result_payload", "basket_id")
            .first()
        )
        if pending is None:
            raise OrderValidationError("Mali sepet kaydı bulunamadı.")

        if pending.status == FiscalBasketStatus.COMPLETED:
            return pending

        if pending.status == FiscalBasketStatus.CANCELLED:
            raise OrderValidationError(
                pending.error_message or "Yazar kasadan ödeme işlemi iptal edildi."
            )

        if pending.status == FiscalBasketStatus.FAILED:
            raise OrderValidationError(
                pending.error_message or "Yazar kasa mali işlemi başarısız oldu."
            )

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"Webhook zaman aşımı ({timeout}s): basket_id={basket_id}")

        if client is not None:
            try:
                chunk = max(1, min(int(remaining), WEBHOOK_WAIT_REDIS_CHUNK_SECONDS))
                client.blpop(wait_key, timeout=chunk)
                continue
            except Exception:
                logger.debug("fiscal wait blpop başarısız, sleep fallback", exc_info=True)

        time.sleep(min(sleep_interval, remaining))
        sleep_interval = min(
            sleep_interval * 1.5,
            WEBHOOK_WAIT_MAX_INTERVAL_SECONDS,
        )


def pending_basket_to_driver_result(pending: FiscalPendingBasket, terminal_id: str) -> dict:
    payload = pending.result_payload or {}
    success, error = parse_basket_result_payload(payload, terminal_id)
    if error:
        raise OrderValidationError(error)
    if success:
        return success
    raise OrderValidationError("Mali sepet tamamlandı ancak sonuç işlenemedi.")


def _verify_webhook_identity(terminal, payload: dict, data: dict) -> bool:
    settings_json = terminal.fiscal_settings or {}
    expected_serial = settings_json.get("serial_number")
    payload_terminal = payload.get("terminalId") or data.get("terminalId")
    if payload_terminal and expected_serial and payload_terminal != expected_serial:
        logger.warning(
            "Token webhook terminalId uyuşmazlığı: beklenen=%s gelen=%s terminal=%s",
            expected_serial,
            payload_terminal,
            terminal.pk,
        )
        return False

    expected_client = settings_json.get("client_id") or settings_json.get("api_key")
    payload_client = payload.get("clientId")
    if payload_client and expected_client and payload_client != expected_client:
        logger.warning(
            "Token webhook clientId uyuşmazlığı: terminal=%s",
            terminal.pk,
        )
        return False

    return True


def handle_token_webhook(terminal, payload: dict) -> bool:
    """
    Token X-Connect webhook payload'ını işler.
    Returns True if handled (recognized operation with basket_id).
    """
    operation = payload.get("operation")
    if operation not in ("BASKET_COMPLETED", "BASKET_LOCKED", "BASKET_UNLOCKED"):
        return False

    data = payload.get("data") or {}
    basket_id = data.get("basketID") or data.get("basket_id")
    if not basket_id:
        logger.warning("Token webhook basketID eksik: operation=%s", operation)
        return False

    if not _verify_webhook_identity(terminal, payload, data):
        return False

    pending = FiscalPendingBasket.objects.filter(
        basket_id=basket_id,
        pos_terminal=terminal,
    ).first()

    if pending is None:
        logger.info("Token webhook bilinmeyen sepet: basket_id=%s terminal=%s", basket_id, terminal.pk)
        return True

    if pending.status != FiscalBasketStatus.PENDING:
        return True

    if operation in ("BASKET_LOCKED", "BASKET_UNLOCKED"):
        logger.info(
            "Token webhook %s: basket_id=%s lockedBy=%s",
            operation,
            basket_id,
            data.get("lockedBy"),
        )
        return True

    terminal_id = (terminal.fiscal_settings or {}).get("serial_number") or ""
    success, error = parse_basket_result_payload(data, terminal_id)

    if error:
        pending.status = (
            FiscalBasketStatus.CANCELLED
            if "iptal" in error.lower()
            else FiscalBasketStatus.FAILED
        )
        pending.error_message = error
        pending.result_payload = data
    elif success:
        pending.status = FiscalBasketStatus.COMPLETED
        pending.result_payload = data
        pending.error_message = ""
    else:
        return True

    pending.completed_at = timezone.now()
    pending.save(
        update_fields=[
            "status",
            "result_payload",
            "error_message",
            "completed_at",
            "updated_at",
        ]
    )
    notify_basket_waiters(basket_id)
    logger.info(
        "Token webhook BASKET_COMPLETED işlendi: basket_id=%s status=%s",
        basket_id,
        pending.status,
    )
    return True
