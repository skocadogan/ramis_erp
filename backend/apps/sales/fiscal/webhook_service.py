"""Token X-Connect Cloud webhook işleme ve sepet bekleme servisi."""
import logging
import time

from django.conf import settings
from django.utils import timezone

from apps.orders.services.sale_helper import OrderValidationError
from apps.sales.fiscal.beko_result import parse_basket_result_payload
from apps.sales.models import FiscalBasketStatus, FiscalPendingBasket

logger = logging.getLogger(__name__)

WEBHOOK_WAIT_INTERVAL_SECONDS = 1.5
WEBHOOK_WAIT_TIMEOUT_SECONDS = 120


def build_fiscal_webhook_url(terminal_id) -> str | None:
    """Token Set Client Settings için kaydedilecek public webhook URL."""
    base = (getattr(settings, "FISCAL_WEBHOOK_BASE_URL", None) or "").rstrip("/")
    if not base:
        return None
    return f"{base}/api/v1/sales/fiscal/webhook/{terminal_id}/"


def register_pending_basket(sale, basket_id: str, terminal) -> FiscalPendingBasket:
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
    """Webhook veya DB güncellemesini bekler. Zaman aşımında TimeoutError fırlatır."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        pending = FiscalPendingBasket.objects.filter(basket_id=basket_id).first()
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

        time.sleep(interval)

    raise TimeoutError(f"Webhook zaman aşımı ({timeout}s): basket_id={basket_id}")


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
    logger.info(
        "Token webhook BASKET_COMPLETED işlendi: basket_id=%s status=%s",
        basket_id,
        pending.status,
    )
    return True
