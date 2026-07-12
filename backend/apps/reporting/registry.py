import logging

logger = logging.getLogger(__name__)

class ReportRegistry:
    """
    Modül bazlı raporların (Sabit Raporlar) sisteme kaydedildiği merkezi registry.
    Singleton pattern kullanılır.
    """
    _instance = None
    _reports = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ReportRegistry, cls).__new__(cls)
        return cls._instance

    def register(self, report_class):
        """
        Bir rapor sınıfını sisteme kaydeder.
        Sınıf, BaseModuleReport'tan türemiş olmalı ve bir slug'ı olmalıdır.
        """
        slug = getattr(report_class, 'slug', None)
        if not slug:
            logger.error(f"Report class {report_class.__name__} does not have a 'slug' attribute.")
            return
        
        self._reports[slug] = report_class
        logger.info(f"Registered module report: {slug}")

    def get_report(self, slug):
        """Slug'a göre kayıtlı rapor sınıfını döner."""
        return self._reports.get(slug)

    def list_reports(self):
        """Tüm kayıtlı raporların meta verilerini döner."""
        return [
            {
                'slug': slug,
                'name': getattr(repo, 'name', slug),
                'description': getattr(repo, 'description', ''),
                'category': getattr(repo, 'category', 'GENERAL'),
            }
            for slug, repo in self._reports.items()
        ]

# Global registry instance
report_registry = ReportRegistry()
