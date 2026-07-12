from rest_framework import serializers


class RelativeMediaUrlField(serializers.ImageField):
    """Medya dosyası URL'sini göreli path olarak döner (/media/...).

    DRF ImageField varsayılan olarak request.build_absolute_uri kullanır; ters
    vekil arkasında bu localhost:8000 üretebilir. Frontend sayfa origin'i ile
    birleştirmek için göreli path yeterlidir.
    """

    def to_representation(self, value):
        if not value:
            return None
        try:
            return value.url
        except Exception:
            return None
