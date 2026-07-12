"""
KDS: sipariş kalemi (OrderItem) mutfak istasyonu kapsamı.

`orders.view_kds` yetkisi olan ve `branches.manage_station` / süper kullanıcı olmayan
kullanıcılar, yalnızca kendi aşçı istasyon atamalarıyla (CookStationAssignment) veya
istasyonu belirtilmemiş (ortak) kalemler üzerinde durum değiştirebilir.
"""


from apps.branches.models import CookStationAssignment


def user_may_kds_line_item_by_assignment(user, order_item) -> bool:
    """
    ``orders.view_kds`` hattı için: kalemi bu kullanıcının Mutfak (KDS) açısından
    güncellemeye yetkili mi.

    Dönüş:
    - ``orders.view_kds`` yok: True (POST/POS, garson vb. mevcut kurallar ayrı).
    - Süper kullanıcı, ``branches.manage_station`` veya ``orders.manage_order``: True.
    - ``CookStationAssignment`` yok veya boş: False (KDS ekranında atanan istasyon yok).
    - ``order_item.station_id`` NULL: ataması ve istasyonu olan tüm aşçılar.
    - Aksi halde: kalem ``assignment.stations`` içinde olmalı.
    """
    if not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    if not hasattr(user, "has_permission"):
        return False
    if not user.has_permission("orders.view_kds"):
        return True
    if user.has_permission("branches.manage_station"):
        return True
    if user.has_permission("orders.manage_order"):
        return True

    branch_id = str(order_item.order.branch_id)
    assignment = (
        CookStationAssignment.objects.filter(user_id=user.id, branch_id=branch_id)
        .prefetch_related("stations")
        .first()
    )
    if not assignment or not assignment.stations.exists():
        return False

    sid = order_item.station_id
    if sid is None:
        return True

    return assignment.stations.filter(id=sid).exists()
