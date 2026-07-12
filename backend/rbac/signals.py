"""
RBAC sinyalleri: rol/izin değişiminde cache invalidation ve audit log.
"""
import logging
import threading

from django.db.models.signals import m2m_changed, post_save, post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# Thread-local storage: eşzamanlı isteklerde kullanıcı bağlamı karışmasın
_audit_user_local = threading.local()


def _get_request_user():
    """Mevcut istek bağlamındaki kullanıcıyı al (management command veya view)."""
    return getattr(_audit_user_local, 'user', None)


def set_audit_user(user):
    """Audit log için kullanıcıyı thread-local olarak ayarla (management command'larda)."""
    _audit_user_local.user = user


def clear_audit_user():
    """Audit aktörünü temizle; işlem sonunda çağrılmalı (aktör sızıntısı önlenir)."""
    if hasattr(_audit_user_local, 'user'):
        delattr(_audit_user_local, 'user')


def audit_user_context(user):
    """
    Context manager: audit aktörü ayarlar, çıkışta temizler.
    with audit_user_context(request.user):
        ...
    """
    set_audit_user(user)
    try:
        yield
    finally:
        clear_audit_user()


@receiver(m2m_changed)
def rbac_m2m_changed(sender, instance, action, model, pk_set, **kwargs):
    """Role izin ataması veya User-Role ataması değiştiğinde cache invalidation."""
    from rbac import Role, RBACAuditLog
    from rbac.cache import invalidate_user_permissions, invalidate_users_with_role
    from django.contrib.auth import get_user_model

    if action not in ('post_add', 'post_remove', 'post_clear'):
        return

    # Role.permissions M2M değişti
    if sender == Role.permissions.through:
        invalidate_users_with_role(instance)
        _log_audit(RBACAuditLog.TARGET_ROLE, instance.pk, str(instance),
                   RBACAuditLog.ACTION_UPDATE if action != 'post_clear' else RBACAuditLog.ACTION_REVOKE,
                   {'action': action, 'permission_ids': list(pk_set) if pk_set else []})
        return

    # User.roles M2M değişti - instance = User, model = Role
    User = get_user_model()
    if model == Role and isinstance(instance, User):
        invalidate_user_permissions(instance)


@receiver(post_save)
def rbac_post_save(sender, **kwargs):
    """Rol/Permission/Category kaydedildiğinde cache invalidation."""
    from rbac import Role, RolePermission, PermissionCategory
    from rbac.cache import invalidate_users_with_role

    instance = kwargs.get('instance')
    if isinstance(instance, Role):
        invalidate_users_with_role(instance)
    elif isinstance(instance, RolePermission):
        for role in Role.objects.filter(permissions=instance):
            invalidate_users_with_role(role)


@receiver(post_delete)
def rbac_post_delete(sender, **kwargs):
    """Rol/Permission silindiğinde cache invalidation."""
    from rbac import Role, RolePermission
    from rbac.cache import invalidate_users_with_role

    instance = kwargs.get('instance')
    if isinstance(instance, Role):
        invalidate_users_with_role(instance)
    elif isinstance(instance, RolePermission):
        for role in Role.objects.filter(permissions=instance):
            invalidate_users_with_role(role)


def _log_audit(target_type, target_id, target_repr, action, changes=None):
    """
    Audit log kaydı oluştur.
    Aktör bilinmiyorsa (arka plan/otomasyon) user=None yazılır; superuser fallback
    kullanılmaz çünkü yanlış aktör ataması yapılabilir.
    Aktör DB'de yoksa (örn. test rollback sonrası) user=None kullanılır.
    """
    try:
        from rbac import RBACAuditLog
        user = _get_request_user()
        if user and user.pk:
            try:
                from django.contrib.auth import get_user_model
                if not get_user_model().objects.filter(pk=user.pk).exists():
                    user = None
            except Exception:
                user = None
        RBACAuditLog.objects.create(
            user=user,
            action=action,
            target_type=target_type,
            target_id=target_id,
            target_repr=target_repr or '',
            changes=changes or {},
        )
    except Exception as e:
        logger.debug("Audit log yazılamadı: %s", e)
