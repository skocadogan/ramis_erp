import uuid
from django.db import models

class BaseModel(models.Model):
    """ Tüm modellerin miras aldığı soyut temel model. 
    UUID tabanlı birincil anahtar, zaman damgaları ve soft-delete
    mekanizması sağlar.
    
    Soft-delete mekanizması:
    - delete() metodu varsayılan olarak soft-delete uygular:
    - is_active = False yaparak kaydı pasifleştirir
    - hard=True parametresiyle gerçek silme yapılır
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        abstract = True
        indexes = [
            # Partial index: is_active=True kayıtlar çoğunlukta olduğu için
            # `WHERE is_active = true` partial index, full index'e göre daha az yer kaplar
            # ve daha hızlıdır. Her tablo kendi %(class)s prefix'ini alır.
            models.Index(
                fields=["id"],
                name="%(class)s_active_idx",
                condition=models.Q(is_active=True),
            ),
        ]

    def delete(self, *args, **kwargs):
        hard = kwargs.pop('hard', False)
        if hard:
            return super().delete(*args, **kwargs)
        self.is_active = False
        self.save(update_fields=['is_active', 'updated_at'])
