from abc import ABC, abstractmethod


class BaseFiscalDriver(ABC):
    """
    Tüm mali entegrasyon yazar kasa ve e-fatura sürücüleri için ortak temel sınıf.
    """
    
    def __init__(self, terminal_settings=None):
        self.settings = terminal_settings or {}

    @abstractmethod
    def send_invoice_or_receipt(self, sale) -> dict:
        """
        Satış bilgisini mali sisteme yollar.
        Başarı durumunda şu formatta bir dict dönmelidir:
        {
            'status': 'success',
            'okc_serial_number': str,
            'okc_receipt_number': str,
            'okc_z_number': str,
            'okc_receipt_datetime': datetime/str,
            'fiscal_qr_code': str,
            'raw_response': dict
        }
        Hata durumunda status='error' içeren bir dict döner veya exception fırlatır:
        {
            'status': 'error',
            'error_message': str,
            'raw_response': dict
        }
        """
        pass

    @abstractmethod
    def get_status(self) -> bool:
        """
        Cihazın veya bulut servisinin online olup olmadığını kontrol eder.
        """
        pass

    def get_fiscal_parameters(self) -> dict:
        """
        Cihazın mali parametrelerini (kısım listesi, KDV oranları vb.) döndürür.
        Alt sınıflar bu metodu override ederek API'den güncel parametreleri alabilir.
        Varsayılan olarak boş bir dict döner.
        """
        return {}
