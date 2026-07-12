"""
RBAC yardımcı fonksiyonları.
Bağımsız - sadece rbac modellerini kullanır.
"""
import inspect
import importlib
import logging
import os
from dataclasses import dataclass
from typing import List, Optional

from django.apps import apps

from rbac import Role, RolePermission, PermissionCategory

logger = logging.getLogger(__name__)


@dataclass
class ScannedPermission:
    """Taranan izin bilgisi (kod taramasından)."""
    permission_code: str
    permission_description: str
    source_type: str  # 'class' veya 'function'
    source_name: str
    app_label: str
    module_path: str


@dataclass
class DbPermission:
    """Veritabanındaki izin bilgisi."""
    permission_code: str
    permission_description: str
    category_code: str
    category_name: str
    id: Optional[int] = None


def scan_project_permissions_from_views(app_name: Optional[str] = None) -> List[ScannedPermission]:
    """
    Projedeki Class-Based View'ların permission_required/permission_description alanlarını
    ve @permission_required decorator'lü Function-Based View'ları tarar.
    Sonuçları liste halinde döndürür.

    Args:
        app_name: Belirtilirse sadece bu uygulama taranır. None ise tüm uygulamalar taranır.

    Returns:
        ScannedPermission nesnelerinden oluşan liste.
    """
    from django.conf import settings
    exclude_apps = getattr(settings, 'RBAC_SCAN_EXCLUDE_APPS', ['rbac'])

    result: List[ScannedPermission] = []
    app_configs = [apps.get_app_config(app_name)] if app_name else apps.get_app_configs()

    for app_config in app_configs:
        app_path = app_config.path
        app_label = app_config.label

        if app_label in exclude_apps:
            continue

        view_files = []
        views_dir = os.path.join(app_path, 'views')
        if os.path.exists(views_dir) and os.path.isdir(views_dir):
            for filename in os.listdir(views_dir):
                if filename.endswith('.py') and not filename.startswith('__'):
                    norm = os.path.join('views', filename[:-3]).replace('\\', '/').replace('/', '.')
                    view_files.append(norm)
        if os.path.exists(os.path.join(app_path, 'views.py')):
            view_files.append('views')

        for module_path in view_files:
            try:
                module_name = f"{app_config.name}.{module_path}"
                module = importlib.import_module(module_name)

                # Class-based views
                for name, obj in inspect.getmembers(module, inspect.isclass):
                    if hasattr(obj, 'permission_required'):
                        perm_required = obj.permission_required
                        perm_desc = getattr(obj, 'permission_description', f"{name} için gerekli izin")
                        perms = (
                            [perm_required] if isinstance(perm_required, str)
                            else list(perm_required) if isinstance(perm_required, (list, tuple))
                            else []
                        )
                        for perm in perms:
                            if '.' in perm:
                                app_part, codename = perm.split('.', 1)
                                result.append(ScannedPermission(
                                    permission_code=f"{app_part}.{codename}",
                                    permission_description=perm_desc,
                                    source_type='class',
                                    source_name=name,
                                    app_label=app_label,
                                    module_path=module_name,
                                ))

                # Function-based views (@permission_required decorator)
                for name, obj in inspect.getmembers(module, inspect.isfunction):
                    if hasattr(obj, 'permission_required'):
                        perm_required = obj.permission_required
                        perm_desc = getattr(obj, 'permission_description', f"{name} için gerekli izin")
                        perms = (
                            [perm_required] if isinstance(perm_required, str)
                            else list(perm_required) if isinstance(perm_required, (list, tuple))
                            else []
                        )
                        for perm in perms:
                            if '.' in perm:
                                app_part, codename = perm.split('.', 1)
                                result.append(ScannedPermission(
                                    permission_code=f"{app_part}.{codename}",
                                    permission_description=perm_desc,
                                    source_type='function',
                                    source_name=name,
                                    app_label=app_label,
                                    module_path=module_name,
                                ))
            except (ImportError, ModuleNotFoundError) as e:
                logger.warning(
                    "İzin taraması import hatası [%s.%s]: %s",
                    app_label, module_path, e
                )

    return result


def scan_project_permissions_from_db(app_name: Optional[str] = None) -> List[DbPermission]:
    """
    Veritabanındaki RolePermission kayıtlarını sorgulayıp liste halinde döndürür.

    Args:
        app_name: Belirtilirse sadece bu kategori (app_label) ile eşleşen izinler döner.
                  None ise tüm izinler döner.

    Returns:
        DbPermission nesnelerinden oluşan liste.
    """
    qs = RolePermission.objects.select_related('category').order_by('category__code', 'code')

    if app_name:
        qs = qs.filter(category__code=app_name)

    result: List[DbPermission] = []
    for perm in qs:
        result.append(DbPermission(
            permission_code=perm.code,
            permission_description=perm.description or perm.name or '',
            category_code=perm.category.code,
            category_name=perm.category.name,
            id=perm.id,
        ))
    return result


def create_permission_code(category_code, action):
    """İzin kodu oluştur (örn: 'user.view_users')"""
    return f"{category_code}.{action}"


def create_default_permissions(category_code, model_name, category_instance=None):
    """
    Bir model için varsayılan CRUD izinlerini oluşturur
    """
    if not category_instance:
        category, _ = PermissionCategory.objects.get_or_create(
            code=category_code,
            defaults={
                'name': category_code.capitalize(),
                'description': f"{category_code.capitalize()} modülü izinleri"
            }
        )
    else:
        category = category_instance

    permission_list = []
    actions = [
        ('view', f'{model_name} görüntüleme'),
        ('add', f'Yeni {model_name} ekleme'),
        ('change', f'{model_name} düzenleme'),
        ('delete', f'{model_name} silme')
    ]

    for action_code, description in actions:
        perm_code = create_permission_code(category_code, f"{action_code}_{model_name}")
        permission, created = RolePermission.objects.get_or_create(
            code=perm_code,
            defaults={
                'name': description.capitalize(),
                'description': description.capitalize(),
                'category': category
            }
        )
        permission_list.append(permission)

    return permission_list


def create_default_roles():
    """Varsayılan rolleri oluşturur"""
    admin_role, admin_created = Role.objects.get_or_create(
        name='Admin',
        defaults={'description': 'Tüm yetkiye sahip yönetici rolü'}
    )

    user_role, user_created = Role.objects.get_or_create(
        name='User',
        defaults={'description': 'Standart kullanıcı rolü'}
    )

    if admin_created:
        permissions = RolePermission.objects.all()
        admin_role.permissions.add(*permissions)

    if user_created:
        view_permissions = RolePermission.objects.filter(code__contains='view_')
        user_role.permissions.add(*view_permissions)

    return admin_role, user_role
