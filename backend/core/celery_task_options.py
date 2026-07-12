"""Ortak Celery görev seçenekleri."""


from django.db import DatabaseError, OperationalError

# Beat / bakım görevleri — geçici altyapı hatalarında yeniden dene
MAINTENANCE_TASK_OPTIONS = {
    'ignore_result': True,
    'autoretry_for': (OperationalError, DatabaseError, ConnectionError, OSError, TimeoutError),
    'retry_backoff': True,
    'retry_jitter': True,
    'max_retries': 3,
}

# Termal baskı — yazıcı kilidi geçici meşguliyetinde yeniden dene; kalıcı hata PrintJob.status ile yönetilir
PRINTING_TASK_OPTIONS = {
    'ignore_result': True,
    'autoretry_for': (TimeoutError,),
    'retry_backoff': True,
    'retry_jitter': True,
    'max_retries': 5,
}
