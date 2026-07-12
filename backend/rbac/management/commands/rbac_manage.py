import json

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction

from rbac import PermissionCategory, RolePermission, Role
from rbac.utils import create_default_permissions

User = get_user_model()


class Command(BaseCommand):
    help = 'RBAC sistemi için izinler, kategoriler ve roller oluşturmaya yarar'

    def add_arguments(self, parser):
        subparsers = parser.add_subparsers(dest='command', help='Alt komutlar')
        category_parser = subparsers.add_parser('category', help='İzin kategorisi oluştur')
        category_parser.add_argument('code', type=str, help='Kategori kodu')
        category_parser.add_argument('name', type=str, help='Kategori adı')
        category_parser.add_argument('--description', type=str, help='Açıklama')

        permission_parser = subparsers.add_parser('permission', help='Tekil izin oluştur')
        permission_parser.add_argument('category_code', type=str, help='Kategori kodu')
        permission_parser.add_argument('code', type=str, help='İzin kodu')
        permission_parser.add_argument('name', type=str, help='İzin adı')
        permission_parser.add_argument('--description', type=str, help='Açıklama')

        crud_parser = subparsers.add_parser('crud', help='CRUD izinleri oluştur')
        crud_parser.add_argument('category_code', type=str, help='Kategori kodu')
        crud_parser.add_argument('model_name', type=str, help='Model adı (çoğul)')

        role_parser = subparsers.add_parser('assign', help='Role izin ata')
        role_parser.add_argument('role_name', type=str, help='Rol adı')
        role_parser.add_argument('permission_codes', type=str, nargs='+', help='İzin kodları')

        create_role_parser = subparsers.add_parser('create_role', help='Rol oluştur')
        create_role_parser.add_argument('name', type=str, help='Rol adı')
        create_role_parser.add_argument('--description', type=str, help='Açıklama')
        create_role_parser.add_argument('--parent', type=str, dest='parent_role', help='Üst rol adı (hiyerarşi)')

        user_role_parser = subparsers.add_parser('user_role', help='Kullanıcıya rol ata')
        user_role_parser.add_argument('username', type=str, help='Kullanıcı adı')
        user_role_parser.add_argument('role_names', type=str, nargs='+', help='Rol adları')

        list_parser = subparsers.add_parser('list', help='Listele')
        list_parser.add_argument('type', choices=['categories', 'permissions', 'roles'])
        list_parser.add_argument('--category', type=str, help='Kategori kodu')
        list_parser.add_argument('--role', type=str, help='Rol adı')
        list_parser.add_argument('--json', action='store_true', dest='json_output', help='JSON çıktı')

        for p in [category_parser, permission_parser, crud_parser, role_parser, create_role_parser, user_role_parser]:
            p.add_argument('--yes', '-y', action='store_true', dest='yes', help='Onay sormadan işlem yap')

    def handle(self, *args, **options):
        cmd = options.get('command')
        handlers = {
            'category': self.create_category,
            'permission': self.create_permission,
            'crud': self.create_crud_permissions,
            'assign': self.assign_permissions,
            'create_role': self.create_role,
            'user_role': self.assign_user_role,
            'list': self.list_items,
        }
        if cmd in handlers:
            handlers[cmd](options)
        else:
            self.print_help()

    def print_help(self):
        self.stdout.write('Kullanım: python manage.py rbac_manage <category|permission|crud|assign|create_role|user_role|list> ...')

    def create_category(self, opts):
        code = opts['code'].strip().lower()
        if not code.isidentifier():
            raise CommandError(
                f'Kategori kodu geçerli bir Python tanımlayıcısı olmalıdır: "{opts["code"]}"'
            )
        cat, created = PermissionCategory.objects.get_or_create(
            code=code,
            defaults={'name': opts['name'], 'description': opts.get('description') or opts['name']}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Kategori oluşturuldu: {cat.name}'))
        else:
            cat.name = opts['name']
            if opts.get('description'):
                cat.description = opts['description']
            cat.save()
            self.stdout.write(self.style.SUCCESS('Kategori güncellendi'))

    def create_permission(self, opts):
        cat_code = opts['category_code'].strip().lower()
        perm_code = opts['code'].strip().lower()
        if not cat_code.isidentifier() or not perm_code.isidentifier():
            raise CommandError('Kategori ve izin kodu geçerli Python tanımlayıcısı olmalıdır.')

        try:
            category = PermissionCategory.objects.get(code=cat_code)
        except PermissionCategory.DoesNotExist:
            raise CommandError(f"Kategori bulunamadı: {cat_code}")

        full_code = f"{cat_code}.{perm_code}"
        perm, created = RolePermission.objects.get_or_create(
            code=full_code,
            defaults={'name': opts['name'], 'description': opts.get('description') or opts['name'], 'category': category}
        )
        if not created:
            perm.name = opts['name']
            perm.description = opts.get('description') or opts['name']
            perm.save()
        self.stdout.write(self.style.SUCCESS(f'İzin {"oluşturuldu" if created else "güncellendi"}: {perm.code}'))

    def create_crud_permissions(self, opts):
        cat_code = opts['category_code'].strip().lower()
        if not cat_code.isidentifier():
            raise CommandError(f'Kategori kodu geçerli Python tanımlayıcısı olmalıdır: "{opts["category_code"]}"')
        try:
            category = PermissionCategory.objects.get(code=cat_code)
        except PermissionCategory.DoesNotExist:
            category, _ = PermissionCategory.objects.get_or_create(
                code=cat_code,
                defaults={'name': cat_code.capitalize(), 'description': f"{cat_code} izinleri"}
            )
        perms = create_default_permissions(cat_code, opts['model_name'], category)
        self.stdout.write(self.style.SUCCESS(f'{len(perms)} CRUD izni oluşturuldu'))

    def assign_permissions(self, opts):
        try:
            role = Role.objects.get(name=opts['role_name'])
        except Role.DoesNotExist:
            raise CommandError(f"Rol bulunamadı: {opts['role_name']}")

        for code in opts['permission_codes']:
            try:
                perm = RolePermission.objects.get(code=code)
                role.permissions.add(perm)
                self.stdout.write(f'  + {perm.code}')
            except RolePermission.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'  ! {code} bulunamadı'))
        self.stdout.write(self.style.SUCCESS('İzinler atandı'))

    def create_role(self, opts):
        parent = None
        if opts.get('parent_role'):
            try:
                parent = Role.objects.get(name=opts['parent_role'])
            except Role.DoesNotExist:
                raise CommandError(f"Üst rol bulunamadı: {opts['parent_role']}")
        role, created = Role.objects.get_or_create(
            name=opts['name'],
            defaults={
                'description': opts.get('description') or opts['name'],
                'is_active': True,
                'parent_role': parent,
            }
        )
        if not created and parent:
            role.parent_role = parent
            role.save()
        self.stdout.write(self.style.SUCCESS(f'Rol {"oluşturuldu" if created else "mevcut"}: {role.name}'))

    def assign_user_role(self, opts):
        try:
            user = User.objects.get(username=opts['username'])
        except User.DoesNotExist:
            raise CommandError(f"Kullanıcı bulunamadı: {opts['username']}")

        for role_name in opts['role_names']:
            try:
                role = Role.objects.get(name=role_name)
            except Role.DoesNotExist:
                raise CommandError(f"Rol bulunamadı: {role_name}")
            user.roles.add(role)
            self.stdout.write(f'  + {role.name}')
        self.stdout.write(self.style.SUCCESS('Roller atandı'))

    def list_items(self, opts):
        t = opts['type']
        json_out = opts.get('json_output', False)

        if t == 'categories':
            data = [
                {'name': c.name, 'code': c.code, 'permission_count': c.permissions.count()}
                for c in PermissionCategory.objects.all().order_by('name')
            ]
            if json_out:
                self.stdout.write(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                for c in data:
                    self.stdout.write(f"  - {c['name']} ({c['code']}): {c['permission_count']} izin")
        elif t == 'permissions':
            qs = RolePermission.objects.all().order_by('category__name', 'name')
            if opts.get('category'):
                cat_code = opts['category'].strip().lower()
                qs = qs.filter(category__code=cat_code)
            elif opts.get('role'):
                try:
                    role = Role.objects.get(name=opts['role'])
                except Role.DoesNotExist:
                    raise CommandError(f"Rol bulunamadı: {opts['role']}")
                qs = role.permissions.all().order_by('category__name', 'name')
            data = [{'category': p.category.name, 'name': p.name, 'code': p.code} for p in qs]
            if json_out:
                self.stdout.write(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                for p in data:
                    self.stdout.write(f"  - {p['category']} - {p['name']} ({p['code']})")
        elif t == 'roles':
            data = [
                {'name': r.name, 'parent': str(r.parent_role) if r.parent_role else None,
                 'permission_count': r.permissions.count(), 'user_count': r.users.count()}
                for r in Role.objects.all().order_by('name')
            ]
            if json_out:
                self.stdout.write(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                for r in data:
                    parent_str = f", üst: {r['parent']}" if r['parent'] else ""
                    self.stdout.write(f"  - {r['name']}{parent_str}: {r['permission_count']} izin, {r['user_count']} kullanıcı")
