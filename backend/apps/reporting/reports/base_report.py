from abc import ABC, abstractmethod

class BaseModuleReport(ABC):
    """
    Tüm sabit/modül raporları için temel sınıf.
    """
    slug = None
    name = None
    description = ""
    category = "GENERAL"
    template_name = None  # Dosya sistemindeki şablon yolu (örn: 'reports/sales_summary.html')

    def __init__(self, request=None, **kwargs):
        self.request = request
        self.kwargs = kwargs

    @abstractmethod
    def get_context(self) -> dict:
        """
        Raporun render edilmesi için gereken veriyi döner.
        """
        pass

    def get_template_name(self) -> str:
        """
        Rapor için kullanılacak şablon dosyasının adını döner.
        """
        if not self.template_name:
            raise NotImplementedError("template_name must be defined in the report class or get_template_name overridden.")
        return self.template_name
