
from dataclasses import dataclass

from apps.reservations.models import (
    DEFAULT_DUE_ALERT_INTERVAL_MINUTES,
    DEFAULT_DUE_ALERT_LEAD_MINUTES,
    ReservationBranchSettings,
)


@dataclass(frozen=True)
class ReservationAlertSettings:
    due_alert_lead_minutes: int = DEFAULT_DUE_ALERT_LEAD_MINUTES
    due_alert_interval_minutes: int = DEFAULT_DUE_ALERT_INTERVAL_MINUTES


def get_reservation_alert_settings(branch_id) -> ReservationAlertSettings:
    row = ReservationBranchSettings.objects.filter(
        branch_id=branch_id,
        is_active=True,
    ).first()
    if not row:
        return ReservationAlertSettings()
    return ReservationAlertSettings(
        due_alert_lead_minutes=row.due_alert_lead_minutes,
        due_alert_interval_minutes=row.due_alert_interval_minutes,
    )
