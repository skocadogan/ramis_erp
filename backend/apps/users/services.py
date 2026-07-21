from django.conf import settings
from django.utils.translation import gettext as _
from rest_framework.exceptions import PermissionDenied, ValidationError

from core.branch_scope import user_may_access_branch


def assign_pos_terminal_preference(user, assigned_terminals):
    """Kasiyere tek POS terminali atanmışsa tercih kaydını oluşturur."""
    if len(assigned_terminals) != 1:
        return
    from apps.users.models import UserPosScreenPreferences, PosUiContext
    pref, created = UserPosScreenPreferences.objects.get_or_create(
        user=user,
        ui_context=PosUiContext.POS,
        defaults={"data": {}},
    )
    pref_data = dict(pref.data or {})
    pref_data["assigned_pos_terminal_uuid"] = str(assigned_terminals[0].id)
    pref_data["assigned_terminal_code"] = assigned_terminals[0].code
    pref.data = pref_data
    pref.save(update_fields=["data", "updated_at"])


def set_jwt_auth_cookies(response, access_token, refresh_token, remember_me):
    """JWT token'ları httpOnly cookie olarak response'a ekler."""
    is_secure = getattr(settings, "SESSION_COOKIE_SECURE", not settings.DEBUG)
    access_max_age = (
        int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
        if remember_me else None
    )
    refresh_max_age = (
        int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
        if remember_me else None
    )
    response.set_cookie(
        'access_token', access_token,
        httponly=True, samesite='Lax', secure=is_secure,
        max_age=access_max_age, path='/',
    )
    response.set_cookie(
        'refresh_token', refresh_token,
        httponly=True, samesite='Lax', secure=is_secure,
        max_age=refresh_max_age, path='/',
    )
    response.set_cookie(
        'ramis_remember', '1' if remember_me else '0',
        httponly=False, samesite='Lax', secure=is_secure,
        max_age=refresh_max_age if remember_me else None, path='/',
    )


def assert_actor_may_set_branch(actor, branch_id) -> None:
    """
    Non-superuser: branch_id zorunlu ve erişilebilir olmalı.
    Superuser: branch_id None olabilir; verilmişse her şube geçerli.
    """
    if getattr(actor, "is_superuser", False):
        return
    if branch_id is None:
        raise PermissionDenied(_("Şube seçimi zorunludur."))
    if not user_may_access_branch(actor, str(branch_id)):
        raise PermissionDenied(_("Bu şube için yetkiniz yok."))


def assert_actor_may_assign_roles(actor, role_ids: list) -> list:
    """
    Atanacak rollerin izin kümesi, aktörün izinlerinin alt kümesi olmalı.
    Superuser kısıtsız. Geçersiz / pasif rol id'leri reddedilir.
    Dönüş: doğrulanmış aktif rol id listesi.
    """
    from rbac.models import Role

    if not role_ids:
        return []

    roles = list(Role.objects.filter(id__in=role_ids, is_active=True))
    found = {r.id for r in roles}
    missing = [rid for rid in role_ids if rid not in found]
    if missing:
        raise ValidationError(
            {"role_ids": _("Geçersiz veya pasif rol: %(ids)s") % {"ids": missing}}
        )

    if getattr(actor, "is_superuser", False):
        return [r.id for r in roles]

    actor_perms = actor.get_all_permissions()
    for role in roles:
        role_perms = role.get_inherited_permission_codes()
        if not role_perms.issubset(actor_perms):
            raise PermissionDenied(
                _("«%(role)s» rolünü atamak için yeterli izniniz yok.")
                % {"role": role.name}
            )
    return [r.id for r in roles]


def assert_actor_may_manage_target(actor, target) -> None:
    """Non-superuser süper kullanıcıyı yönetemez."""
    if getattr(target, "is_superuser", False) and not getattr(actor, "is_superuser", False):
        raise PermissionDenied(_("Süper kullanıcı hesapları yönetilemez."))
