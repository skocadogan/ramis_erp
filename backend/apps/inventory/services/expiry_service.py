"""ExpiryTrackingService - SKT takibi (FEFO) hizmeti."""

from apps.inventory import selectors


class ExpiryTrackingService:
    """FEFO: SKT yaklaşan veya geçmiş partileri raporlar."""

    @staticmethod
    def get_expiring_lots(
        warehouse_id=None,
        warehouse_ids: list[str] | None = None,
        days_ahead: int = 3,
    ):
        return selectors.get_expiring_lots_qs(
            warehouse_id=warehouse_id,
            warehouse_ids=warehouse_ids,
            days_ahead=days_ahead,
        )

    @staticmethod
    def get_expired_lots(warehouse_id=None, warehouse_ids: list[str] | None = None):
        return selectors.get_expired_lots_qs(
            warehouse_id=warehouse_id,
            warehouse_ids=warehouse_ids,
        )

    @staticmethod
    def get_summary(warehouse_id=None, limit_warehouse_ids: list[str] | None = None):
        return selectors.compute_expiry_summary(
            warehouse_id=warehouse_id,
            limit_warehouse_ids=limit_warehouse_ids,
        )
