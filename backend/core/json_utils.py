"""JSONField / API gövdeleri için JSON-serileştirilebilir değer dönüşümü."""


import datetime
from decimal import Decimal
from uuid import UUID


def to_json_safe(value):
    """Decimal, UUID, datetime vb. türleri JSON uyumlu Python türlerine çevirir."""
    if isinstance(value, dict):
        return {k: to_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json_safe(v) for v in value]
    if isinstance(value, Decimal):
        integral = value.to_integral_value()
        if value == integral:
            return int(integral)
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return value
