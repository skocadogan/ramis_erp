from django.contrib import admin

from .models import WaiterCallLog


@admin.register(WaiterCallLog)
class WaiterCallLogAdmin(admin.ModelAdmin):
    list_display = (
        'called_at',
        'table_name',
        'branch',
        'status',
        'dismissed_by',
        'response_seconds',
    )
    list_filter = ('status', 'branch', 'source')
    search_fields = ('table_name', 'id')
    readonly_fields = (
        'id',
        'branch',
        'table',
        'table_name',
        'zone_name',
        'source',
        'status',
        'notified_count',
        'called_at',
        'dismissed_at',
        'dismissed_by',
        'response_seconds',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
