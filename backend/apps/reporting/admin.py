from django.contrib import admin
from .models import ReportTemplate

@admin.register(ReportTemplate)
class ReportTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'category', 'is_default', 'is_active')
    list_filter = ('category', 'is_default', 'is_active')
    search_fields = ('name', 'slug')
    prepopulated_fields = {'slug': ('name',)}
    
    fieldsets = (
        (None, {
            'fields': ('name', 'slug', 'category', 'is_active', 'is_default')
        }),
        ('İçerik', {
            'fields': ('html_body', 'css_styles'),
            'description': 'HTML gövdesinde Jinja2 değişkenleri kullanılabilir.'
        }),
    )
