from django.apps import AppConfig


class CreditConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.credit"
    verbose_name = "Ödenmez (Müşteri Kredisi)"

    def ready(self):
        # Modül raporlarını kaydet
        from apps.credit.reports import credit_reports  # noqa: F401
