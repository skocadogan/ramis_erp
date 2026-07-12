from decimal import Decimal, InvalidOperation

from django.utils.translation import gettext
from jinja2 import Environment, FileSystemLoader, select_autoescape

from apps.reporting.utils import get_currency_symbol

class ReportRenderer:
    def __init__(self, language_code: str = 'tr'):
        # Dosya tabanlı şablonlar için tüm app dizinlerine bak
        self.env = Environment(
            loader=FileSystemLoader(self._get_template_dirs()),
            autoescape=select_autoescape(['html', 'xml']),
            extensions=['jinja2.ext.do']
        )
        # Add common filters for reports
        self.env.filters['currency'] = self._currency_filter
        self.env.filters['date_tr'] = self._date_filter
        self.env.filters['qty'] = self._qty_filter
        
        # Add common globals (Jinja2: {% trans %} yok; {{ _('...') }} ile gettext)
        from django.utils import timezone

        self.env.globals['now'] = timezone.now
        self.env.globals['_'] = gettext
        self.set_language(language_code)

    def set_language(self, language_code: str):
        """Aktif dili ve para birimi sembolünü ayarlar."""
        self.env.globals['currency_sym'] = get_currency_symbol(language_code)

    def _get_template_dirs(self):
        """Tüm uygulamaların templates dizinlerini döner."""
        import os
        from django.apps import apps
        template_dirs = []
        for app_config in apps.get_app_configs():
            template_path = os.path.join(app_config.path, 'templates')
            if os.path.isdir(template_path):
                template_dirs.append(template_path)
        return template_dirs

    def render_string(self, template_content: str, context: dict) -> str:
        """Renders a template from a string (Veritabanı dökümleri için)."""
        template = self.env.from_string(template_content)
        return template.render(**context)

    def render_file(self, template_name: str, context: dict) -> str:
        """Renders a template from a file (Standart modül raporları için)."""
        template = self.env.get_template(template_name)
        return template.render(**context)

    def _currency_filter(self, value, sym=None):
        """Para tutarını biçimlendirir, dil bazlı para birimi sembolünü ekler.
        Kullanımı: {{ value|currency }}  →  "1.234,56 ₺"  (dile göre sembol)
                   {{ value|currency('') }} → "1.234,56" (sembolsüz)
        """
        if sym is None:
            sym = self.env.globals.get('currency_sym', '₺')
        prefix = f"{sym} " if sym else ""
        try:
            num = f"{float(value):,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
            return f"{prefix}{num}".strip()
        except (ValueError, TypeError):
            return f"0,00 {sym}"

    def _qty_filter(self, value):
        """Miktar: gereksiz sondaki sıfırları atar; ondalık ayırıcı virgül (PDF okunabilirliği)."""
        if value is None or value == '':
            return '0'
        try:
            d = Decimal(str(value))
        except (InvalidOperation, ValueError, TypeError):
            return '0'
        d = d.normalize()
        if (d % 1).is_zero():
            return str(int(d))
        s = format(d, 'f').rstrip('0').rstrip('.')
        return s.replace('.', ',')

    def _date_filter(self, value, format='%d.%m.%Y'):
        if not value:
            return ""
        return value.strftime(format)
