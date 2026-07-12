import os
from celery import Celery

# Django ayarlarını Celery için tanımla
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('ramis_erp')

# Ayarları 'CELERY_' prefixi ile Django ayarlarından oku
app.config_from_object('django.conf:settings', namespace='CELERY')

# Tüm kayıtlı taskları otomatik bul
app.autodiscover_tasks()

