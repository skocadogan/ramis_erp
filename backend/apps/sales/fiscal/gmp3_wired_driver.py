"""GMP-3 TCP/IP (yerel ağ) mali sürücüsü."""
from __future__ import annotations

import logging

from django.utils.translation import gettext_lazy as _

from apps.orders.services.sale_helper import OrderValidationError
from apps.sales.fiscal.beko_result import parse_basket_result_payload
from apps.sales.fiscal.gmp3_basket import build_gmp3_basket_from_sale
from apps.sales.fiscal.gmp3_client import (
    DEFAULT_GMP3_PORT,
    DEFAULT_GMP3_TIMEOUT_SECONDS,
    GMP3Client,
    GMP3ConnectionError,
)

from .base import BaseFiscalDriver

logger = logging.getLogger(__name__)


class Gmp3WiredFiscalDriver(BaseFiscalDriver):
    """
    YN ÖKC ile GMP-3 protokolü üzerinden TCP/IP haberleşmesi.

    fiscal_settings:
        ip_address (zorunlu)
        port (opsiyonel, varsayılan 1111)
        serial_number (opsiyonel, fiş/QR için)
        timeout (opsiyonel, saniye)
    """

    def _get_ip(self) -> str:
        return (self.settings.get("ip_address") or "").strip()

    def _get_port(self) -> int:
        raw = self.settings.get("port")
        if raw in (None, ""):
            return DEFAULT_GMP3_PORT
        try:
            return int(raw)
        except (TypeError, ValueError):
            return DEFAULT_GMP3_PORT

    def _get_timeout(self) -> float:
        raw = self.settings.get("timeout")
        if raw in (None, ""):
            return DEFAULT_GMP3_TIMEOUT_SECONDS
        try:
            return float(raw)
        except (TypeError, ValueError):
            return DEFAULT_GMP3_TIMEOUT_SECONDS

    def _get_terminal_serial(self, sale) -> str:
        serial = (self.settings.get("serial_number") or "").strip()
        if serial:
            return serial
        if sale.pos_terminal:
            return sale.pos_terminal.code
        return "GMP3"

    def _build_client(self) -> GMP3Client:
        ip = self._get_ip()
        if not ip:
            raise OrderValidationError(
                _("GMP-3 entegrasyonu için cihaz IP adresi tanımlanmamış.")
            )
        return GMP3Client(
            ip,
            self._get_port(),
            timeout=self._get_timeout(),
        )

    def get_status(self) -> bool:
        try:
            client = self._build_client()
            return client.check_health()
        except OrderValidationError:
            return False

    def get_fiscal_parameters(self) -> dict:
        try:
            with self._build_client() as client:
                return client.get_fiscal_parameters()
        except GMP3ConnectionError as exc:
            logger.warning("GMP-3 fiscal parameters alınamadı: %s", exc)
            return {}

    def send_invoice_or_receipt(self, sale) -> dict:
        terminal_serial = self._get_terminal_serial(sale)
        client = self._build_client()

        try:
            client.connect()
            fiscal_params = client.get_fiscal_parameters()
            basket = build_gmp3_basket_from_sale(sale, fiscal_params)

            logger.info(
                "GMP-3 sepet gönderiliyor: %s:%s basketID=%s",
                self._get_ip(),
                self._get_port(),
                basket.get("basketID"),
            )
            raw_result = client.send_basket_and_wait(basket)
        except GMP3ConnectionError as exc:
            logger.error("GMP-3 iletişim hatası: %s", exc, exc_info=True)
            raise OrderValidationError(
                _("Yazar kasa bağlantı hatası: %(error)s") % {"error": str(exc)}
            ) from exc
        finally:
            client.disconnect()

        success, error = parse_basket_result_payload(raw_result, terminal_serial)
        if error:
            raise OrderValidationError(error)
        if success:
            success = dict(success)
            success["raw_response"] = {
                **raw_result,
                "connection": "gmp3_tcp",
                "ip_address": self._get_ip(),
                "port": self._get_port(),
            }
            return success

        raise OrderValidationError(
            _("Yazar kasadan geçerli mali yanıt alınamadı.")
        )
