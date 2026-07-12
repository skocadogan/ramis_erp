"""
Şube veri sızıntısını önlemek: süper kullanıcı dışında queryset'ler kullanıcının erişebildiği şubelerle sınırlanır.
tüm modüllerde kullanılan kritik bir güvenlik bileşeni.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.apps import apps
from django.db.models import QuerySet

if TYPE_CHECKING:
    from django.contrib.auth.models import AbstractBaseUser

logger = logging.getLogger(__name__)


def accessible_branch_id_strings(user: AbstractBaseUser) -> frozenset[str] | None:
    """
    None  => süper kullanıcı; ek şube filtresi uygulanmaz (isteğe bağlı query param ile daraltılır).
    boş set => erişilebilir şube yok.
    """
    if not user.is_authenticated:
        return frozenset()
    
    # Per-request cache check
    if hasattr(user, "_accessible_branch_ids_cache"):
        return user._accessible_branch_ids_cache

    if getattr(user, "is_superuser", False):
        user._accessible_branch_ids_cache = None
        return None

    ids: set[str] = set()
    bid = getattr(user, "branch_id", None)
    if bid is not None:
        ids.add(str(bid))

    try:
        # 1. Direkt üyelikler (M2M)
        for raw in user.branches.values_list("id", flat=True):
            ids.add(str(raw))

        # 2. Garson atamaları (lazy-load ile döngüsel bağımlılık önlenir)
        WaiterBranchAssignment = apps.get_model("branches", "WaiterBranchAssignment")
        wba = WaiterBranchAssignment.objects.filter(user=user).values_list("branch_id", flat=True)
        for raw in wba:
            ids.add(str(raw))

        # 3. Aşçı atamaları
        CookStationAssignment = apps.get_model("branches", "CookStationAssignment")
        csa = CookStationAssignment.objects.filter(user=user).values_list("branch_id", flat=True)
        for raw in csa:
            ids.add(str(raw))

        # 4. Müdür atamaları
        ManagerBranchAssignment = apps.get_model("branches", "ManagerBranchAssignment")
        mba = ManagerBranchAssignment.objects.filter(user=user).values_list("branch_id", flat=True)
        for raw in mba:
            ids.add(str(raw))
    except Exception:
        logger.exception("accessible_branch_id_strings: şube kapsamı çözümlenirken hata oluştu")

    res = frozenset(ids)
    user._accessible_branch_ids_cache = res
    return res


def branch_filter_qs(qs: QuerySet, request, *, field: str = "branch_id") -> QuerySet:
    """
    Şube FK alanı `field` (örn. branch_id, zone__branch_id) üzerinden filtreler.
    Süper kullanıcı: yalnızca ?branch_id verilmişse o şubeye daraltır.
    """
    user = request.user
    if not user.is_authenticated:
        return qs.none()

    qp_branch = (request.query_params.get("branch_id") or "").strip() or None
    allowed = accessible_branch_id_strings(user)

    if allowed is None:
        if qp_branch:
            return qs.filter(**{field: qp_branch})
        return qs

    if not allowed:
        return qs.none()

    if qp_branch:
        if qp_branch not in allowed:
            return qs.none()
        return qs.filter(**{field: qp_branch})

    return qs.filter(**{f"{field}__in": allowed})


def _product_ids_visible_for_pos_branches(branch_ids: list[str]):
    """
    POS için: aktif + show_on_pos ürünlerinden verilen şubelerden en az biriyle eşleşenler.
    """
    Product = apps.get_model("menu", "Product")

    if not branch_ids:
        return Product.objects.none().values_list("id", flat=True)

    return (
        Product.objects.filter(is_active=True, show_on_pos=True)
        .filter(branches__id__in=branch_ids)
        .values_list("id", flat=True)
    )


def user_may_access_branch(user: AbstractBaseUser, branch_id: str | None) -> bool:
    if not branch_id or not str(branch_id).strip():
        return False
    s = str(branch_id).strip()
    if not user.is_authenticated:
        return False
    if getattr(user, "is_superuser", False):
        return True
    allowed = accessible_branch_id_strings(user)
    if allowed is None:
        return True
    return s in allowed


def menu_category_queryset_filtered(base_qs, request):
    """CategoryViewSet: şube kapsamı + mevcut OR mantığı."""
    from django.db.models import Q

    branch_id = (request.query_params.get("branch_id") or "").strip() or None
    allowed = accessible_branch_id_strings(request.user)

    if allowed is None:
        if not branch_id:
            return base_qs
        pids = _product_ids_visible_for_pos_branches([branch_id])
        return base_qs.filter(
            Q(products__id__in=pids)
            | Q(station__branch_id=branch_id)
            | Q(station__isnull=True),
            is_active=True,
        ).distinct()

    if not allowed:
        return base_qs.none()

    if branch_id:
        if branch_id not in allowed:
            return base_qs.none()
        bids = [branch_id]
    else:
        bids = list(allowed)

    pids = _product_ids_visible_for_pos_branches(bids)
    q = Q(station__isnull=True) | Q(products__id__in=pids)
    for bid in bids:
        q |= Q(station__branch_id=bid)
    return base_qs.filter(q, is_active=True).distinct()


def filter_queryset_by_accessible_warehouses(
    qs: QuerySet,
    user: AbstractBaseUser,
    *,
    warehouse_id_field: str = "warehouse_id",
) -> QuerySet:
    """Tek bir warehouse FK alanı üzerinden (depo PK) erişim."""
    allowed_wh = user_accessible_warehouse_id_strings(user)
    if allowed_wh is None:
        return qs
    if not allowed_wh:
        return qs.none()
    return qs.filter(**{f"{warehouse_id_field}__in": list(allowed_wh)})


def filter_warehouse_transfer_queryset(qs: QuerySet, user: AbstractBaseUser) -> QuerySet:
    allowed_wh = user_accessible_warehouse_id_strings(user)
    if allowed_wh is None:
        return qs
    if not allowed_wh:
        return qs.none()
    from django.db.models import Q

    lst = list(allowed_wh)
    return qs.filter(
        Q(source_warehouse_id__in=lst) | Q(target_warehouse_id__in=lst)
    )


def user_accessible_warehouse_id_strings(user: AbstractBaseUser) -> frozenset[str] | None:
    """
    Depo erişimi: depo–şube M2M kesişimi.
    Eğer kullanıcının istasyon ataması (Aşçı) varsa ve yönetim yetkisi yoksa 
    erişimi SADECE o istasyonların depolarına daraltır.
    """
    if not user.is_authenticated:
        return frozenset()
    
    # Per-request cache check
    if hasattr(user, "_accessible_warehouse_ids_cache"):
        return user._accessible_warehouse_ids_cache

    if getattr(user, "is_superuser", False):
        user._accessible_warehouse_ids_cache = None
        return None

    CookStationAssignment = apps.get_model("branches", "CookStationAssignment")
    Warehouse = apps.get_model("warehouse", "Warehouse")

    # 1. Aşçı ataması var mı?
    csa_qs = CookStationAssignment.objects.filter(user=user)
    has_assignments = csa_qs.exists()

    # 2. Yönetim yetkisi var mı? (inventory.manage_stock_item)
    has_manage_perm = user.roles.filter(
        is_active=True, 
        permissions__code="inventory.manage_stock_item"
    ).exists()

    # 3. Daraltılmış kapsam (Staff Scoping)
    # Eğer ataması varsa ve yönetici değilse, kapsam daraltılır.
    if has_assignments and not has_manage_perm:
        ids = set(
            str(x) for x in csa_qs.values_list("stations__warehouse_id", flat=True).distinct()
            if x
        )
        res = frozenset(ids)
        user._accessible_warehouse_ids_cache = res
        return res

    # 4. Geniş kapsam (Managerial Scoping) - Mevcut mantık
    allowed = accessible_branch_id_strings(user)
    if allowed is None:
        user._accessible_warehouse_ids_cache = None
        return None
    if not allowed:
        res = frozenset()
        user._accessible_warehouse_ids_cache = res
        return res

    # Şubeler üzerinden erişilebilen tüm depolar
    ids = set(
        str(x) for x in Warehouse.objects.filter(is_active=True, branches__id__in=allowed)
        .values_list("id", flat=True)
        .distinct()
    )

    # Atanan istasyonların depolarını her ihtimale karşı ekle (Union)
    if has_assignments:
        ids.update(
            str(x) for x in csa_qs.values_list("stations__warehouse_id", flat=True).distinct()
            if x
        )

    res = frozenset(ids)
    user._accessible_warehouse_ids_cache = res
    return res


def filter_recipe_queryset_by_accessible_branches(qs: QuerySet, user: AbstractBaseUser) -> QuerySet:
    """
    Reçete listesi/detay kapsamı.

    - Reçeteye şube atanmışsa yalnızca ``branches`` M2M kaydı esas alınır (sıkı filtre).
    - Reçeteye şube atanmamışsa bağlı menü ürününün şubeleri veya bağımsız global
      görünürlük devreye girer.
    """
    from django.db.models import Count, Q

    allowed = accessible_branch_id_strings(user)
    if allowed is None:
        return qs
    if not allowed:
        return qs.none()

    allowed_list = list(allowed)
    return (
        qs.annotate(_nbranch=Count("branches", distinct=True))
        .filter(
            Q(_nbranch__gt=0, branches__id__in=allowed_list)
            | Q(
                _nbranch=0,
                product__isnull=True,
            )
            | Q(
                _nbranch=0,
                product__branches__id__in=allowed_list,
            ),
        )
        .distinct()
    )


def menu_product_queryset_filtered(base_qs, request):
    """ProductViewSet şube filtresi.

    Eğer bir menü ürününün şube erişimi işaretlenmemişse (yani şubesi boşsa),
    hiçbir şubede gösterilmez. Sadece eşleşen şubelerde listelenir.
    """
    branch_id = (request.query_params.get("branch_id") or "").strip() or None
    allowed = accessible_branch_id_strings(request.user)

    def scope_by_branches(qs, branch_ids: list[str]):
        if not branch_ids:
            return qs.none()
        return (
            qs.filter(is_active=True)
            .filter(branches__id__in=branch_ids)
            .distinct()
        )

    if allowed is None:
        if branch_id:
            return scope_by_branches(base_qs, [branch_id])
        return base_qs

    if not allowed:
        return base_qs.none()

    if branch_id:
        if branch_id not in allowed:
            return base_qs.none()
        return scope_by_branches(base_qs, [branch_id])

    return scope_by_branches(base_qs, list(allowed))


def resolve_dashboard_branch_ids(request) -> tuple[list[str] | None, str | None]:
    """
    Dashboard API: satış / envanter özetleri için şube kapsamı.

    Dönüş ``(branch_ids, error)`` — ``error`` ``None`` veya ``'forbidden'``:

    - ``(None, None)`` — süper kullanıcı, ``branch_id`` yok → tüm şubeler (filtre yok).
    - ``([...], None)`` — ``branch_id__in`` ile sınırla; boş liste erişilebilir şube yok demektir.
    - ``(None, 'forbidden')`` — istenen şubeye yetki yok.

    Normal kullanıcıda ``branch_id`` verilmezse yalnızca erişilebilir şubeler birleştirilir.
    """
    bid = (request.query_params.get("branch_id") or "").strip() or None
    allowed = accessible_branch_id_strings(request.user)

    if allowed is None:
        if bid:
            return [bid], None
        return None, None

    if not allowed:
        return [], None

    if bid:
        if bid not in allowed:
            return None, "forbidden"
        return [bid], None

    return list(allowed), None


def resolve_websocket_branch_subscription(user, query_branch_id_raw: str | None) -> tuple[str | None, str]:
    """
    WebSocket: şube kanalına abonelik.

    Dönüş ``(effective_branch_id, mode)``:

    - ``mode == 'branch'`` — ``effective_branch_id`` dolu; ``..._{id}`` grubuna katıl.
    - ``mode == 'global'`` — yalnızca süper kullanıcı; sorguda şube yok, global grup.
    - ``mode == 'deny'`` — bağlantı reddedilmeli.

    Normal kullanıcıda sorguda ``branch_id`` yoksa: tek erişilebilir şube varsa o seçilir;
    birden fazla şube varsa açık ``branch_id`` zorunludur.
    """
    q = (query_branch_id_raw or "").strip() or None
    if q:
        if not user_may_access_branch(user, q):
            return None, "deny"
        return q, "branch"

    if getattr(user, "is_superuser", False):
        return None, "global"

    allowed = accessible_branch_id_strings(user)
    if not allowed:
        return None, "deny"
    if len(allowed) == 1:
        return next(iter(allowed)), "branch"
    return None, "deny"
