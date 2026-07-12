import uuid
import time
import base64
import requests
import logging
from django.utils import timezone
from django.core.cache import cache
from apps.orders.services.sale_helper import OrderValidationError
from apps.sales.fiscal.beko_result import parse_basket_result_payload
from apps.sales.fiscal.webhook_service import (
    pending_basket_to_driver_result,
    register_pending_basket,
    wait_for_basket_completion,
)
from .base import BaseFiscalDriver

logger = logging.getLogger(__name__)

# Token X-Connect Cloud API varsayılan URL'leri
DEFAULT_API_URL = "https://test-api.devtokeninc.com/app-store/external"

# Cache key prefix'leri
CACHE_PREFIX_TOKEN = "token_xconnect_access_"
CACHE_PREFIX_FISCAL_PARAMS = "token_xconnect_fiscal_params_"

# Token geçerlilik süresi (saniye) — API 86400 (24 saat) döner, güvenlik payı ile 23 saat
TOKEN_CACHE_TTL = 82800
# Fiscal parameters cache süresi (saniye) — 1 saat
FISCAL_PARAMS_CACHE_TTL = 3600


def _retry_request(method, url, headers, json=None, max_retries=3, timeout=15):
    """
    429 Rate Limit hataları için exponential backoff ile retry mekanizması.
    Backoff: 2s → 4s → 8s
    """
    last_exception = None
    for attempt in range(max_retries):
        try:
            if method == "POST":
                response = requests.post(url, headers=headers, json=json or {}, timeout=timeout)
            elif method == "GET":
                response = requests.get(url, headers=headers, timeout=timeout)
            else:
                raise ValueError(f"Desteklenmeyen HTTP method: {method}")

            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 2 ** (attempt + 1)))
                wait_time = min(retry_after, 2 ** (attempt + 1))
                logger.warning(
                    f"Token Cloud API 429 Rate Limit. Retry {attempt + 1}/{max_retries}, "
                    f"bekleniyor: {wait_time}s"
                )
                time.sleep(wait_time)
                continue

            return response
        except requests.exceptions.RequestException as e:
            last_exception = e
            if attempt < max_retries - 1:
                wait_time = 2 ** (attempt + 1)
                logger.warning(
                    f"Token Cloud API bağlantı hatası. Retry {attempt + 1}/{max_retries}, "
                    f"bekleniyor: {wait_time}s — {str(e)}"
                )
                time.sleep(wait_time)
            else:
                raise

    # Tüm retry'lar tükendiyse son hatayı fırlat
    if last_exception:
        raise last_exception
    raise OrderValidationError("Token bulut sunucusu 429 Rate Limit — tüm denemeler başarısız.")


class BekoFiscalDriver(BaseFiscalDriver):
    """
    Beko YN ÖKC - Token X-Connect Cloud Entegrasyon Sürücüsü.
    Token X-Connect bulut sunucuları üzerinden yazar kasalarla haberleşmeyi sağlar.

    Resmi döküman: https://developer.tokeninc.com/token-developer-portal-1/x-platform/
                   token-x-connect-cloud/gelistirici-dokumani-tr

    Entegrasyon akışı:
      1. Authenticate → access_token al (24 saat cache)
      2. Get Fiscal Parameters → kısım listesi al (sectionNo eşleştirme)
      3. Add Instant Basket → sepeti terminale gönder
      4. Webhook ile sonuç bekle (DB); zaman aşımında Token API polling fallback
    """

    def _get_api_url(self) -> str:
        """API URL'sini döndürür. Önce settings'ten okur, yoksa varsayılan kullanır."""
        return (self.settings.get("api_url") or DEFAULT_API_URL).rstrip("/")

    def _get_auth_url(self) -> str:
        """Auth URL'sini döndürür. Ayrı bir auth_url tanımlıysa onu kullanır."""
        auth_url = self.settings.get("auth_url")
        if auth_url:
            return auth_url.rstrip("/")
        return self._get_api_url()

    def _get_token(self, client_id: str, client_secret: str) -> str:
        """
        OAuth2 Basic Authentication kullanarak JWT access token alır.
        Token 24 saat geçerli olduğundan Django cache'te saklanır.
        """
        # Cache'ten oku
        cache_key = f"{CACHE_PREFIX_TOKEN}{client_id}"
        cached_token = cache.get(cache_key)
        if cached_token:
            return cached_token

        auth_str = f"{client_id}:{client_secret}"
        b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")

        url = f"{self._get_auth_url()}/v1/auth/token"
        headers = {
            "Authorization": f"Basic {b64_auth}",
            "Content-Type": "application/json"
        }

        try:
            response = _retry_request("POST", url, headers, timeout=10)
            res_data = response.json()

            if response.status_code == 201 or res_data.get("status") == 201:
                token = res_data.get("result", {}).get("accessToken")
                if token:
                    # Cache'e yaz (23 saat — güvenlik payı)
                    cache.set(cache_key, token, TOKEN_CACHE_TTL)
                    return token

            err_desc = res_data.get("description") or response.text
            raise OrderValidationError(f"Token bulut servisi kimlik doğrulama hatası: {err_desc}")
        except OrderValidationError:
            raise
        except Exception as e:
            logger.error(f"Token Cloud Auth Exception: {str(e)}", exc_info=True)
            raise OrderValidationError(f"Token bulut sunucusuna bağlanılamadı: {str(e)}")

    def get_fiscal_parameters(self) -> dict:
        """
        Token ÖKC'nin mali parametrelerini (kısım/section listesi) alır.
        Get Fiscal Parameters API: GET /v1/fiscal-parameters
        Header: terminal-id, Authorization: Bearer {accessToken}

        Cache'te 1 saat saklanır.
        """
        terminal_id = self.settings.get("serial_number")
        client_id = self.settings.get("client_id")
        client_secret = self.settings.get("client_secret")

        if not terminal_id or not client_id or not client_secret:
            return {}

        cache_key = f"{CACHE_PREFIX_FISCAL_PARAMS}{terminal_id}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            access_token = self._get_token(client_id, client_secret)
            url = f"{self._get_api_url()}/v1/fiscal-parameters"
            headers = {
                "Authorization": f"Bearer {access_token}",
                "terminal-id": terminal_id,
                "Content-Type": "application/json"
            }
            response = _retry_request("GET", url, headers, timeout=10)
            res_data = response.json()

            if res_data.get("status") == 0:
                result = res_data.get("result", {})
                cache.set(cache_key, result, FISCAL_PARAMS_CACHE_TTL)
                return result

            logger.warning(f"Fiscal parameters alınamadı: {res_data.get('description')}")
            return {}
        except Exception as e:
            logger.warning(f"Fiscal parameters API hatası: {str(e)}")
            return {}

    def _match_section_no(self, tax_rate_percent, fiscal_params: dict) -> int:
        """
        Ürünün KDV oranına göre uygun sectionNo'yu fiscal parameters'tan eşleştirir.
        tax_rate_percent: Yüzde cinsinden KDV oranı (ör: 10 = %10)
        Token API'de taxPercent binde cinsinden: %10 → 1000

        Eşleşme bulunamazsa varsayılan olarak 1 döner.
        """
        target_tax_permille = int(tax_rate_percent * 100)  # %10 → 1000
        sections = fiscal_params.get("sections", [])

        for section in sections:
            if section.get("taxPercent") == target_tax_permille:
                return section.get("sectionNo", 1)

        # Eşleşme bulunamadı — varsayılan
        if sections:
            logger.warning(
                f"KDV oranı {tax_rate_percent}% ({target_tax_permille}‰) için "
                f"eşleşen kısım bulunamadı. Varsayılan sectionNo=1 kullanılıyor."
            )
        return 1

    def _poll_token_basket_status(self, basket_id: str, headers: dict, terminal_id: str) -> dict:
        """Webhook zaman aşımında Token API polling fallback."""
        poll_url = f"{self._get_api_url()}/v1/basket/{basket_id}"
        max_attempts = 10
        initial_interval = 2.0
        max_interval = 8.0

        logger.info(f"Beko Cloud Polling Fallback Başladı. Sepet ID: {basket_id}")

        for attempt in range(max_attempts):
            poll_interval = min(initial_interval * (2 ** min(attempt, 2)), max_interval)
            time.sleep(poll_interval)
            try:
                poll_res = _retry_request("GET", poll_url, headers, timeout=10)
                basket_data = poll_res.json()

                if basket_data.get("status") != 0:
                    continue

                result = basket_data.get("result", {})
                success, error = parse_basket_result_payload(result, terminal_id)
                if error:
                    raise OrderValidationError(error)
                if success:
                    logger.info(
                        f"Beko Cloud Polling Fallback Başarılı. Fiş No: {success.get('okc_receipt_number')}"
                    )
                    return success
            except OrderValidationError:
                raise
            except Exception as e:
                logger.warning(f"Beko Polling Fallback Attempt {attempt} Error: {str(e)}")

        raise OrderValidationError("Yazar kasadan ödeme onayı alınamadı (İşlem zaman aşımına uğradı).")

    def send_invoice_or_receipt(self, sale) -> dict:
        connection_type = self.settings.get("connection_type", "CLOUD")

        if connection_type == "IP":
            from .gmp3_wired_driver import Gmp3WiredFiscalDriver
            return Gmp3WiredFiscalDriver(self.settings).send_invoice_or_receipt(sale)

        if connection_type == "SERIAL":
            raise OrderValidationError(
                "USB/COM (seri port) entegrasyonu henüz desteklenmiyor. "
                "Ağ (TCP/IP) veya Bulut bağlantısını kullanın."
            )

        if connection_type != "CLOUD":
            raise OrderValidationError(
                f"Desteklenmeyen bağlantı türü: {connection_type}"
            )

        client_id = self.settings.get("client_id")
        client_secret = self.settings.get("client_secret")
        terminal_id = self.settings.get("serial_number")

        if not client_id or not client_secret or not terminal_id:
            raise OrderValidationError(
                "Beko Bulut Entegrasyonu için eksik parametre: Client ID, Client Secret veya Terminal ID tanımlanmamış."
            )

        # 1. Access Token al (cache destekli)
        access_token = self._get_token(client_id, client_secret)

        # 2. Fiscal Parameters al (sectionNo eşleştirme için)
        fiscal_params = self.get_fiscal_parameters()

        # 3. Sepet kalemlerini ve tutarları hazırla (Token kuruş ve mili-birim formatında çalışır)
        items = []
        for item in sale.order.items.all():
            tax_rate_percent = float(item.product.tax_rate) if item.product.tax_rate else 0
            section_no = self._match_section_no(tax_rate_percent, fiscal_params)

            items.append({
                "name": item.product.name[:50],  # Max 50 karakter sınırı
                "price": int(item.price * 100),  # Kuruş cinsinden
                "sectionNo": section_no,
                "taxPercent": int(tax_rate_percent * 100),  # Binde cinsinden: %10 → 1000
                "quantity": int(item.quantity * 1000)  # Mili-adet
            })

        total_amount_cents = int(sale.total_amount * 100)

        # Sipariş ID'sinden numerik çek numarası türetme
        check_number = 1
        try:
            check_number = int(str(sale.order.id).replace('-', '')[:8], 16) % 10000
        except Exception:
            pass

        # basketID her zaman UUID v4 formatında olmalı — sale.id yerine yeni UUID üret
        basket_id = str(uuid.uuid4())
        pos_terminal = sale.pos_terminal

        basket_payload = {
            "basketID": basket_id,
            "total": total_amount_cents,
            "checkNumber": check_number,
            "title": f"Masa {sale.order.table.name}" if sale.order.table else "Paket Siparis",
            "items": items,
            "paymentItems": []
        }

        headers = {
            "Authorization": f"Bearer {access_token}",
            "terminal-id": terminal_id,
            "Content-Type": "application/json"
        }

        # Bekleyen sepet kaydı (webhook eşlemesi)
        register_pending_basket(sale, basket_id, pos_terminal)

        # 4. Anlık sepeti gönder (Add Instant Basket)
        send_url = f"{self._get_api_url()}/v1/basket/instant"
        try:
            logger.info(f"Beko Cloud Sepet Gönderiliyor: {basket_id} -> Terminal: {terminal_id}")
            response = _retry_request("POST", send_url, headers, json=basket_payload, timeout=15)
            res_json = response.json()

            # API Hata Kodları (Sıfır dışı kodlar hatadır)
            status_code = res_json.get("status")
            if status_code != 0:
                desc = res_json.get("description") or f"API Error Code: {status_code}"
                raise OrderValidationError(f"Yazar kasaya sepet gönderilemedi: {desc}")
        except OrderValidationError:
            raise
        except Exception as e:
            logger.error(f"Beko Cloud Send Basket Exception: {str(e)}", exc_info=True)
            raise OrderValidationError(f"Yazar kasa bulut servis bağlantı hatası: {str(e)}")

        # 5. Webhook ile sonuç bekle; zaman aşımında Token API polling fallback
        try:
            pending = wait_for_basket_completion(basket_id)
            return pending_basket_to_driver_result(pending, terminal_id)
        except TimeoutError:
            logger.warning(
                "Beko webhook zaman aşımı — Token API polling fallback devreye giriyor: %s",
                basket_id,
            )
            return self._poll_token_basket_status(basket_id, headers, terminal_id)

    def get_status(self) -> bool:
        """Cihaz veya bulut servis erişilebilirliğini test eder."""
        connection_type = self.settings.get("connection_type", "CLOUD")

        if connection_type == "IP":
            from .gmp3_wired_driver import Gmp3WiredFiscalDriver
            return Gmp3WiredFiscalDriver(self.settings).get_status()

        if connection_type != "CLOUD":
            return False

        client_id = self.settings.get("client_id")
        client_secret = self.settings.get("client_secret")

        if not client_id or not client_secret:
            return False

        try:
            token = self._get_token(client_id, client_secret)
            return token is not None
        except Exception:
            return False
