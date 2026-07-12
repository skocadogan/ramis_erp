from apps.pos_display.models import FiscalType
from .mock_driver import MockFiscalDriver


class FiscalDriverFactory:
    """
    Terminalin mali konfigürasyonuna göre uygun sürücüyü üreten fabrika sınıfı.
    """

    @staticmethod
    def get_driver(terminal):
        """
        Verilen terminale ait mali sürücü nesnesini döndürür.
        """
        if not terminal:
            return None

        fiscal_type = terminal.fiscal_type
        settings = terminal.fiscal_settings or {}

        if fiscal_type == FiscalType.NONE:
            return None
        elif fiscal_type == FiscalType.MOCK:
            return MockFiscalDriver(settings)
        elif fiscal_type == FiscalType.BEKO_GMP3:
            from .beko_driver import BekoFiscalDriver
            return BekoFiscalDriver(settings)
        elif fiscal_type == FiscalType.HUGIN_GMP3:
            # İleride gerçek Hugin entegrasyon sürücüsü buraya eklenecektir
            raise NotImplementedError("Hugin ÖKC GMP3 entegrasyonu henüz hazır değil.")
        elif fiscal_type == FiscalType.EARSIV_UYUMSOFT:
            # İleride gerçek Uyumsoft e-Arşiv entegrasyon sürücüsü buraya eklenecektir
            raise NotImplementedError("Uyumsoft e-Arşiv entegrasyonu henüz hazır değil.")
        
        return None
