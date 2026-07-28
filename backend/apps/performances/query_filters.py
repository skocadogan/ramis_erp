"""Şube ve tarih aralığı filtreleri — satış ve performans modülleri ortak."""
from __future__ import annotations

from datetime import date, datetime, time

from django.db.models import QuerySet
from django.utils import timezone

from core.date_utils import parse_date_range


def apply_branch_filter(qs: QuerySet, branch_id: str | None, *, field: str = 'branch_id') -> QuerySet:
    if branch_id and str(branch_id).strip() not in ('', 'ALL'):
        return qs.filter(**{field: branch_id})
    return qs


def apply_called_at_range(
    qs: QuerySet,
    start_date: str | date | None,
    end_date: str | date | None,
    *,
    field: str = 'called_at',
) -> QuerySet:
    start, end = parse_date_range(start_date, end_date)
    if start:
        start_dt = timezone.make_aware(datetime.combine(start, time.min))
        qs = qs.filter(**{f'{field}__gte': start_dt})
    if end:
        end_dt = timezone.make_aware(datetime.combine(end, time.max))
        qs = qs.filter(**{f'{field}__lte': end_dt})
    return qs
