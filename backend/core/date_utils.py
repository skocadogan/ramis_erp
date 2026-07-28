"""Tarih aralığı parse yardımcıları."""
from __future__ import annotations

from datetime import date

from django.utils.dateparse import parse_date


def parse_date_range(
    start_date: str | date | None,
    end_date: str | date | None,
) -> tuple[date | None, date | None]:
    """start/end tarihlerini date'e çevirir; geçersiz string → None."""
    if isinstance(start_date, date):
        start = start_date
    elif start_date:
        start = parse_date(str(start_date))
    else:
        start = None

    if isinstance(end_date, date):
        end = end_date
    elif end_date:
        end = parse_date(str(end_date))
    else:
        end = None

    return start, end


def parse_date_range_strict(
    start_str: str | None,
    end_str: str | None,
) -> tuple[date | None, date | None, bool]:
    """Query param tarihleri; geçersiz formatta err=True döner."""
    start, end = parse_date_range(start_str, end_str)
    err = bool((start_str and start is None) or (end_str and end is None))
    return start, end, err
