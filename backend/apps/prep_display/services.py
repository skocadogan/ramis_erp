from apps.branches.models import KitchenStation


def get_active_station(station_id, branch_id):
    """Aktif istasyonu bulur, yoksa None döner."""
    return KitchenStation.objects.filter(
        id=station_id,
        branch_id=branch_id,
        is_active=True,
    ).select_related("branch").first()


def station_to_response_dict(station):
    """İstasyonu API yanıt formatına dönüştürür."""
    return {
        "id": str(station.id),
        "name": station.name,
        "color": station.color,
        "branch": str(station.branch_id),
        "branch_name": station.branch.name,
    }
