import time
import random
from django.utils import timezone
from .base import BaseFiscalDriver


class MockFiscalDriver(BaseFiscalDriver):
    """
    Sanal Mali Entegrasyon Sürücüsü.
    PC ve test ortamlarında gerçek cihaz olmadan ödeme akışını test etmek için kullanılır.
    """

    def send_invoice_or_receipt(self, sale) -> dict:
        # Eğer cihaz çevrimdışı (offline) ise bağlantı hatası simüle et
        if not self.get_status():
            return {
                "status": "error",
                "error_message": "Mali cihaz ile bağlantı kurulamadı. Cihaz çevrimdışı (offline).",
                "raw_response": {"error_code": 101, "desc": "Device offline / Connection refused"},
            }

        # Gerçek cihazın işlem süresini simüle etmek için küçük bir gecikme ekliyoruz.
        # Test ortamlarında (hızlı çalışması için) gecikmeyi atlıyoruz.
        simulated_delay = self.settings.get("simulated_delay", 1.0)
        if simulated_delay > 0:
            time.sleep(simulated_delay)

        # Hatalı ödeme simülasyonu (test etmek için settings içinde trigger_error tanımlanabilir)
        if self.settings.get("trigger_error", False):
            return {
                "status": "error",
                "error_message": "Sanal Cihaz Hatası: Yazar kasa kağıt sonu uyarısı veya bağlantı kesildi.",
                "raw_response": {"error_code": 105, "desc": "Paper out or connection failure"},
            }

        # Rastgele mali detaylar üretimi
        terminal_code = sale.pos_terminal.code if sale.pos_terminal else "GENERIC"
        okc_serial = f"MCK{terminal_code.upper()}{random.randint(100000, 999999)}"
        okc_receipt = f"{random.randint(1, 9999):04d}"
        okc_z = f"{random.randint(1, 999):03d}"
        
        raw_res = {
            "transaction_id": random.randint(1000000, 9990000),
            "amount": float(sale.total_amount),
            "payment_method": sale.payment_method,
            "status_code": "00",
            "message": "Approved",
        }

        # QR kodu verisi oluşturma
        qr_data = f"https://gib.gov.tr/okc/validation?s={okc_serial}&f={okc_receipt}&z={okc_z}&t={int(time.time())}"

        return {
            "status": "success",
            "okc_serial_number": okc_serial,
            "okc_receipt_number": okc_receipt,
            "okc_z_number": okc_z,
            "okc_receipt_datetime": timezone.now(),
            "fiscal_qr_code": qr_data,
            "raw_response": raw_res,
        }

    def get_status(self) -> bool:
        # Sanal cihaz her zaman online simüle edilir (ayardan offline yapılması tetiklenmediyse)
        return not self.settings.get("simulate_offline", False)
