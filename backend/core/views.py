from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from django.apps import apps
from django.db import models
from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.utils.translation import gettext as _
import uuid

from core.recycle_bin_errors import (
    describe_protected_objects,
    format_partial_empty_bin_message,
    format_protected_delete_error,
)
from core.recycle_bin_force_delete import (
    ForceDeleteLimitError,
    format_force_delete_success_message,
    force_hard_delete,
    preview_force_delete_dependencies,
)

# RecycleBin sadece superuser'lara açık olmalı.
class RecycleBinPermission(IsAdminUser):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)

def get_model_soft_delete_info(model):
    """Returns field_name and deleted_value if the model supports soft-delete."""
    if hasattr(model, 'is_deleted') and isinstance(model._meta.get_field('is_deleted'), models.BooleanField):
        return 'is_deleted', True
    elif hasattr(model, 'is_active') and isinstance(model._meta.get_field('is_active'), models.BooleanField):
        return 'is_active', False
    return None, None

def get_base_models():
    """Soft-delete (is_active veya is_deleted) alanlarına sahip tüm modelleri döndürür."""
    base_models = []
    for model in apps.get_models():
        if not model._meta.abstract:
            field, _ = get_model_soft_delete_info(model)
            if field:
                base_models.append(model)
    return base_models

class RecycleBinSummaryView(APIView):
    permission_classes = [RecycleBinPermission]

    def get(self, request):
        summary = []
        for model in get_base_models():
            field, val = get_model_soft_delete_info(model)
            count = model.objects.filter(**{field: val}).count()
            if count > 0:
                summary.append({
                    'app_label': model._meta.app_label,
                    'model_name': model._meta.model_name,
                    'verbose_name': str(model._meta.verbose_name),
                    'count': count
                })
        return Response(summary)

class RecycleBinListView(APIView):
    permission_classes = [RecycleBinPermission]

    def get(self, request, app_label, model_name):
        try:
            model = apps.get_model(app_label, model_name)
        except LookupError:
            return Response({'error': _('Model bulunamadı.')}, status=404)
        
        field, val = get_model_soft_delete_info(model)
        if not field:
             return Response({'error': _('Bu model soft-delete desteklemiyor.')}, status=400)

        # Get search and pagination params
        search_query = request.query_params.get('search', '').lower()
        limit = request.query_params.get('limit')
        
        qs = model.objects.filter(**{field: val})
        if hasattr(model, 'deleted_at'):
             qs = qs.order_by('-deleted_at')
        elif hasattr(model, 'updated_at'):
             qs = qs.order_by('-updated_at')
        
        if limit:
            try:
                qs = qs[:max(1, int(limit))]
            except (ValueError, TypeError):
                pass
        
        results = []
        for obj in qs:
            name_val = getattr(obj, 'name', None)
            if not name_val:
                name_val = getattr(obj, 'username', None)
            if not name_val:
                 name_val = str(obj)

            if search_query and search_query not in name_val.lower():
                continue

            del_at = getattr(obj, 'deleted_at', getattr(obj, 'updated_at', None))

            results.append({
                'id': str(obj.pk) if hasattr(obj, 'pk') else None,
                'name': name_val,
                'deleted_at': del_at,
                'app_label': app_label,
                'model_name': model_name,
            })
            
        # Basit pagination olmadan tüm datayı gönder (genelde çöp kutusunda devasa data olmaz, eğer olursa eklenebilir)
        return Response(results)

class RecycleBinActionView(APIView):
    permission_classes = [RecycleBinPermission]

    def post(self, request):
        app_label = request.data.get('app_label')
        model_name = request.data.get('model_name')
        obj_id = request.data.get('id')
        action = request.data.get('action')  # restore, hard_delete, force_hard_delete, preview_force_delete, ...

        if not all([app_label, model_name, action]):
             return Response({'error': _('Eksik parametre.')}, status=400)

        if action in ('restore', 'hard_delete', 'force_hard_delete', 'preview_force_delete') and not obj_id:
             return Response({'error': _('Bu işlem için ID gereklidir.')}, status=400)

        try:
            model = apps.get_model(app_label, model_name)
        except LookupError:
            return Response({'error': _('Model bulunamadı.')}, status=404)

        field, val = get_model_soft_delete_info(model)
        if not field:
            return Response({'error': _('Bu model soft-delete desteklemiyor.')}, status=400)

        # Tekli işlemler
        if obj_id:
            try:
                obj = model.objects.get(**{'pk': obj_id, field: val})
            except model.DoesNotExist:
                 return Response({'error': _('Kayıt bulunamadı veya zaten aktif/silinmiş.')}, status=404)
            except Exception as e:
                 return Response({'error': _('Geçersiz ID: %(err)s') % {'err': str(e)}}, status=400)

            if action == 'restore':
                setattr(obj, field, not val) # e.g. is_active=True or is_deleted=False
                update_fields = [field]
                if hasattr(obj, 'updated_at'):
                    update_fields.append('updated_at')
                if hasattr(obj, 'deleted_at'):
                    obj.deleted_at = None
                    update_fields.append('deleted_at')
                obj.save(update_fields=update_fields)
                return Response({'status': 'ok', 'message': _('Kayıt başarıyla geri yüklendi.')})
            
            elif action == 'hard_delete':
                try:
                    if hasattr(model, 'is_deleted') and not hasattr(obj, 'is_active'):
                         obj.delete()
                    else:
                         try:
                             obj.delete(hard=True)
                         except TypeError:
                             obj.delete()
                    return Response({'status': 'ok', 'message': _('Kayıt kalıcı olarak silindi.')})
                except ProtectedError as exc:
                    deps = describe_protected_objects(
                        getattr(exc, "protected_objects", ()),
                        max_items=10,
                    )
                    return Response(
                        {
                            'error': format_protected_delete_error(exc),
                            'dependencies': deps,
                            'can_force_delete': True,
                        },
                        status=400,
                    )
                except Exception as e:
                    return Response({'error': _('Silme işlemi başarısız: %(err)s') % {'err': str(e)}}, status=400)

            elif action == 'preview_force_delete':
                try:
                    deps = preview_force_delete_dependencies(obj)
                    return Response({'dependencies': deps})
                except ForceDeleteLimitError as exc:
                    return Response({'error': str(exc)}, status=400)
                except Exception as e:
                    return Response(
                        {'error': _('Bağımlılık önizlemesi başarısız: %(err)s') % {'err': str(e)}},
                        status=400,
                    )

            elif action == 'force_hard_delete':
                try:
                    with transaction.atomic():
                        deleted_refs: list[str] = []
                        force_hard_delete(obj, deleted_refs=deleted_refs)
                    return Response(
                        {
                            'status': 'ok',
                            'message': format_force_delete_success_message(deleted_refs),
                            'deleted_refs': deleted_refs,
                        }
                    )
                except ForceDeleteLimitError as exc:
                    return Response({'error': str(exc)}, status=400)
                except ProtectedError as exc:
                    return Response(
                        {'error': format_protected_delete_error(exc)},
                        status=400,
                    )
                except Exception as e:
                    return Response(
                        {'error': _('Zorla silme başarısız: %(err)s') % {'err': str(e)}},
                        status=400,
                    )

        # Toplu işlemler
        queryset = model.objects.filter(**{field: val})
        count = queryset.count()

        if action == 'restore_all':
            if count == 0:
                return Response({'error': _('Geri yüklenecek kayıt bulunamadı.')}, status=400)
            
            # Bulk update can't handle complex logic like updated_at/deleted_at easily for all models
            # So we iterate if it's not too many, or just do a simple bulk update.
            # To be safe with signals and our custom fields, let's iterate.
            for obj in queryset:
                setattr(obj, field, not val)
                if hasattr(obj, 'deleted_at'):
                    obj.deleted_at = None
                obj.save()
            
            return Response({'status': 'ok', 'message': _("%(count)s kayıt başarıyla geri yüklendi.") % {'count': count}})

        elif action == 'empty_bin':
            if count == 0:
                return Response({'error': _('Temizlenecek kayıt bulunamadı.')}, status=400)
            
            deleted_count = 0
            protected_count = 0
            sample_refs: list[str] = []
            
            for obj in queryset:
                try:
                    if hasattr(model, 'is_deleted') and not hasattr(obj, 'is_active'):
                        obj.delete()
                    else:
                        try:
                            obj.delete(hard=True)
                        except TypeError:
                            obj.delete()
                    deleted_count += 1
                except ProtectedError as exc:
                    protected_count += 1
                    for ref in describe_protected_objects(
                        getattr(exc, "protected_objects", ()),
                        max_items=2,
                    ):
                        if ref not in sample_refs and len(sample_refs) < 5:
                            sample_refs.append(ref)
            
            if protected_count > 0:
                msg = format_partial_empty_bin_message(
                    deleted_count=deleted_count,
                    protected_count=protected_count,
                    sample_refs=sample_refs,
                )
                return Response({'status': 'partial', 'message': msg})

            msg = _("%(deleted)s kayıt temizlendi.") % {"deleted": deleted_count}
            return Response({'status': 'ok', 'message': msg})

        return Response({'error': _('Geçersiz işlem.')}, status=400)
