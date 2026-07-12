from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'branch', 'is_active', 'is_staff']
    list_filter = ['is_active', 'is_staff', 'is_superuser', 'branch']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    filter_horizontal = ['roles']
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Ramis ERP', {'fields': ('branch', 'roles')}),
    )
