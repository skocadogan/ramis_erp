import json
import logging
import os
import inspect
import importlib
from dataclasses import dataclass, asdict
from typing import Optional, List, Any

from django.core.management.base import BaseCommand
from django.apps import apps
from django.contrib.auth.models import Permission as DjangoPermission
from django.contrib.contenttypes.models import ContentType
from django.db import transaction

from rbac import PermissionCategory, RolePermission, Role

logger = logging.getLogger(__name__)


@dataclass
class MissingPermission:
    """Eksik izin bilgisi - tutarlı veri yapısı."""
    app_label: str
    codename: str
    name: str
    description: str
    django_exists: bool
    role_exists: bool
    role_permission_id: Optional[int] = None


class Command(BaseCommand):
    help = 'View sınıflarını tarayıp permission_required alanlarını bulur ve eksik izinleri oluşturur'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', dest='dry_run',
                           help='İzinleri oluşturmadan önce neler yapılacağını gösterir')
        parser.add_argument('--yes', '-y', action='store_true', dest='yes',
                           help='Onay sormadan işlemi gerçekleştirir (reset/reset-perms-only için)')
        parser.add_argument('--json', action='store_true', dest='json_output',
                           help='Dry-run çıktısını JSON formatında verir')
        parser.add_argument('--app', dest='app', help='Belirli bir uygulama için izinleri kontrol eder')
        parser.add_argument('--add-custom', dest='custom_permissions',
                           help='Özel izinleri ekler (format: "app.codename:Açıklama,app2.codename2:Açıklama2")')
        parser.add_argument('--force', action='store_true', dest='force',
                           help='Mevcut izinleri zorunlu olarak günceller')
        parser.add_argument('--reset', action='store_true', dest='reset',
                           help='Tüm izinleri ve rolleri siler. DİKKAT: Kullanıcı-rol ilişkileri silinir!')
        parser.add_argument('--reset-perms-only', action='store_true', dest='reset_perms_only',
                           help='Sadece izinleri siler, rollere dokunmaz.')

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        yes = options.get('yes', False)
        json_output = options.get('json_output', False)
        app_name = options.get('app', None)
        custom_permissions = options.get('custom_permissions', None)
        force = options.get('force', False)
        reset = options.get('reset', False)
        reset_perms_only = options.get('reset_perms_only', False)

        if reset and dry_run:
            report = {'action': 'reset', 'dry_run': True, 'message': 'Tüm izinler ve roller silinecek.'}
            self._output_json(report) if json_output else self.stdout.write(
                self.style.WARNING('DRY RUN: --reset ile tüm izinler ve roller silinecek.'))
            return
        if reset_perms_only and dry_run:
            report = {'action': 'reset_perms_only', 'dry_run': True, 'message': 'Tüm izinler silinecek.'}
            self._output_json(report) if json_output else self.stdout.write(
                self.style.WARNING('DRY RUN: --reset-perms-only ile tüm izinler silinecek.'))
            return

        if reset and not dry_run:
            if yes or self._confirm("Bu işlem tüm izinleri, rolleri ve rol-kullanıcı ilişkilerini silecek. Devam?"):
                self._reset_all()
                return
            else:
                self.stdout.write(self.style.WARNING('İşlem iptal edildi.'))
                return

        if reset_perms_only and not dry_run:
            if yes or self._confirm("Bu işlem tüm izinleri silecek (roller korunacak). Devam?"):
                self._reset_perms_only()
                return
            else:
                self.stdout.write(self.style.WARNING('İşlem iptal edildi.'))
                return

        if not json_output:
            self.stdout.write(self.style.SUCCESS('View izinleri taranıyor...'))
        detected_permissions = self._scan_for_permissions(app_name)

        if custom_permissions:
            custom_perms = self._parse_custom_permissions(custom_permissions)
            detected_permissions.extend(custom_perms)
            if not json_output:
                self.stdout.write(self.style.SUCCESS(f'{len(custom_perms)} özel izin eklendi'))

        missing_permissions = self._find_missing_permissions(detected_permissions, force)

        if dry_run:
            report = self._build_dry_run_report(missing_permissions)
            if json_output:
                self._output_json(report)
            else:
                self.stdout.write(self.style.WARNING('DRY RUN: Aşağıdaki izinler oluşturulacak:'))
                for item in missing_permissions:
                    self.stdout.write(f'  - {item.app_label}.{item.codename}: {item.description}')
        else:
            self._create_permissions(missing_permissions)

        if not json_output:
            self.stdout.write(self.style.SUCCESS('İşlem tamamlandı!'))

    def _confirm(self, message):
        self.stdout.write(self.style.WARNING(f"UYARI: {message}"))
        return input("Onaylamak için 'evet' yazın: ").lower() == 'evet'

    def _output_json(self, data: dict) -> None:
        """JSON çıktı yazdır."""
        self.stdout.write(json.dumps(data, indent=2, ensure_ascii=False))

    def _build_dry_run_report(self, missing_permissions: List) -> dict:
        """Dry-run raporu oluştur."""
        return {
            'dry_run': True,
            'action': 'create_permissions',
            'count': len(missing_permissions),
            'permissions': [
                {
                    'app_label': m.app_label,
                    'codename': m.codename,
                    'code': f"{m.app_label}.{m.codename}",
                    'description': m.description,
                    'django_exists': m.django_exists,
                    'role_exists': m.role_exists,
                }
                for m in missing_permissions
            ],
        }

    @transaction.atomic
    def _reset_all(self):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        for user in User.objects.all():
            user.roles.clear()
        for role in Role.objects.all():
            role.permissions.clear()
        Role.objects.all().delete()
        RolePermission.objects.all().delete()
        self.stdout.write(self.style.SUCCESS('Tüm izinler ve roller temizlendi.'))

    @transaction.atomic
    def _reset_perms_only(self):
        for role in Role.objects.all():
            role.permissions.clear()
        RolePermission.objects.all().delete()
        self.stdout.write(self.style.SUCCESS('Tüm izinler temizlendi. Roller korundu.'))

    def _parse_custom_permissions(self, custom_permissions_string):
        result = []
        for perm_entry in custom_permissions_string.split(','):
            if ':' in perm_entry:
                perm_code, description = perm_entry.strip().split(':', 1)
            else:
                perm_code, description = perm_entry.strip(), "Özel izin"
            if '.' in perm_code:
                app_label, codename = perm_code.split('.', 1)
                result.append((app_label, codename, "Özel izin", description))
        return result

    def _scan_for_permissions(self, app_name=None):
        detected = []
        app_configs = [apps.get_app_config(app_name)] if app_name else apps.get_app_configs()
        from django.conf import settings
        exclude_apps = getattr(settings, 'RBAC_SCAN_EXCLUDE_APPS', ['rbac'])

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

            import_errors = 0
            for module_path in view_files:
                try:
                    module_name = f"{app_config.name}.{module_path}"
                    module = importlib.import_module(module_name)
                    # Class-based views
                    for name, obj in inspect.getmembers(module, inspect.isclass):
                        if hasattr(obj, 'permission_required'):
                            perm_required = obj.permission_required
                            perm_desc = getattr(obj, 'permission_description', f"{name} için gerekli izin")
                            perms = [perm_required] if isinstance(perm_required, str) else list(perm_required) if isinstance(perm_required, (list, tuple)) else []
                            for perm in perms:
                                if '.' in perm:
                                    app_part, codename = perm.split('.', 1)
                                    detected.append((app_part, codename, f"{app_label} {name}", perm_desc))
                    # Function-based views (@permission_required decorator)
                    for name, obj in inspect.getmembers(module, inspect.isfunction):
                        if hasattr(obj, 'permission_required'):
                            perm_required = obj.permission_required
                            perm_desc = getattr(obj, 'permission_description', f"{name} için gerekli izin")
                            perms = [perm_required] if isinstance(perm_required, str) else list(perm_required) if isinstance(perm_required, (list, tuple)) else []
                            for perm in perms:
                                if '.' in perm:
                                    app_part, codename = perm.split('.', 1)
                                    detected.append((app_part, codename, f"{app_label} {name}", perm_desc))
                except (ImportError, ModuleNotFoundError) as e:
                    import_errors += 1
                    logger.warning(
                        "İzin taraması import hatası [%s.%s]: %s",
                        app_label, module_path, e
                    )
            if import_errors and not getattr(settings, 'RBAC_SCAN_QUIET', False):
                self.stdout.write(self.style.WARNING(
                    f'  {app_label}: {import_errors} modül import hatası (detay: log)'
                ))
        return detected

    def _find_missing_permissions(self, detected_permissions, force=False):
        missing = []
        existing_django = {f"{p.content_type.app_label}.{p.codename}" for p in DjangoPermission.objects.all()}
        existing_role = {}
        for perm in RolePermission.objects.all():
            key = perm.code if '.' in perm.code else f"{perm.category.code}.{perm.code}"
            existing_role[key] = perm.id
        for app_label, codename, name, perm_desc in detected_permissions:
            key = f"{app_label}.{codename}"
            django_exists = key in existing_django
            role_exists = key in existing_role
            role_perm_id = existing_role.get(key) if role_exists else None
            if force and role_exists:
                missing.append(MissingPermission(
                    app_label, codename, name, perm_desc, django_exists, role_exists, role_perm_id
                ))
            elif not django_exists or not role_exists:
                missing.append(MissingPermission(
                    app_label, codename, name, perm_desc, django_exists, role_exists, None
                ))
        return missing

    @transaction.atomic
    def _create_permissions(self, missing_permissions):
        created_django = created_role = updated_role = 0
        for item in missing_permissions:
            try:
                if not item.django_exists:
                    try:
                        content_type = ContentType.objects.get(
                            app_label=item.app_label, model='__dummy__'
                        )
                    except ContentType.DoesNotExist:
                        try:
                            app_models = list(apps.get_app_config(item.app_label).get_models())
                            content_type = (
                                ContentType.objects.get_for_model(app_models[0])
                                if app_models else None
                            )
                        except LookupError:
                            content_type = None
                        if not content_type:
                            content_type = ContentType.objects.create(
                                app_label=item.app_label, model='__dummy__'
                            )
                    DjangoPermission.objects.get_or_create(
                        codename=item.codename,
                        content_type=content_type,
                        defaults={'name': item.description}
                    )
                    created_django += 1
                if item.role_permission_id:
                    rp = RolePermission.objects.get(id=item.role_permission_id)
                    rp.name = rp.description = item.description
                    rp.save()
                    updated_role += 1
                elif not item.role_exists:
                    try:
                        category = PermissionCategory.objects.get(code=item.app_label)
                    except PermissionCategory.DoesNotExist:
                        category, _ = PermissionCategory.objects.get_or_create(
                            code=item.app_label,
                            defaults={
                                'name': item.app_label.capitalize(),
                                'description': f"{item.app_label} modülü izinleri"
                            }
                        )
                    RolePermission.objects.get_or_create(
                        code=f"{item.app_label}.{item.codename}",
                        category=category,
                        defaults={'name': item.description, 'description': item.description}
                    )
                    created_role += 1
            except Exception as e:
                logger.warning("İzin oluşturma hatası: %s.%s - %s",
                              item.app_label, item.codename, e, exc_info=True)
                self.stdout.write(self.style.ERROR(f'Hata: {item.app_label}.{item.codename} - {e}'))
                self.stdout.write(self.style.ERROR(
                    'Atomik işlem: Hata nedeniyle tüm değişiklikler geri alındı (rollback).'))
                raise  # İlk hatada hemen rollback tetikle

        self.stdout.write(self.style.SUCCESS(
            f'{created_django} Django, {created_role} rol izni oluşturuldu, {updated_role} güncellendi.'))
