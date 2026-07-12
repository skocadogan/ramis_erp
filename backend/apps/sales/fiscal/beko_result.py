"""Token X-Connect basket sonuç payload'ını sürücü yanıtına dönüştürür."""
import time

from django.utils import timezone


def parse_basket_result_payload(result: dict, terminal_id: str) -> tuple[dict | None, str | None]:
    """
    Token basket result / BASKET_COMPLETED data alanını işler.

    Returns:
        (success_driver_dict, error_message)
        success_driver_dict: None ve hata da None → henüz tamamlanmamış (polling devam)
    """
    basket_status = result.get("status")
    message = (result.get("message") or "").upper()

    if basket_status == -1 or message == "CANCELLED":
        return None, "Yazar kasadan ödeme işlemi iptal edildi (Kullanıcı iptali)."

    if basket_status == 99:
        return None, "Yazar kasadan fiş iptal edildi."

    payment_items = result.get("paymentItems") or []
    if len(payment_items) > 0 or basket_status in (0, 1):
        receipt_no = result.get("receiptNo") or result.get("receipt_no") or int(time.time()) % 10000
        z_no = result.get("zNo") or result.get("z_no") or "1"
        qr_data = (
            f"https://gib.gov.tr/okc/validation?"
            f"s={terminal_id}&f={receipt_no}&z={z_no}&t={int(time.time())}"
        )
        return {
            "status": "success",
            "okc_serial_number": terminal_id,
            "okc_receipt_number": str(receipt_no),
            "okc_z_number": str(z_no),
            "okc_receipt_datetime": timezone.now(),
            "fiscal_qr_code": qr_data,
            "raw_response": result,
        }, None

    return None, None
