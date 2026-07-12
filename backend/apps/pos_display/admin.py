from django.contrib import admin
from .models import DisplaySettings, PromotionSlide, PosTerminal


@admin.register(DisplaySettings)
class DisplaySettingsAdmin(admin.ModelAdmin):
    list_display = ('branch', 'idle_timeout', 'transition_speed', 'show_clock', 'updated_at')
    search_fields = ('branch__name',)
    readonly_fields = ('created_at', 'updated_at')


@admin.register(PosTerminal)
class PosTerminalAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "branch", "fiscal_type", "sort_order", "is_active", "updated_at")
    list_filter = ("is_active", "branch", "fiscal_type")
    search_fields = ("name", "code", "branch__name")
    ordering = ("branch", "sort_order", "name")
    fields = (
        "branch",
        "name",
        "code",
        "sort_order",
        "fiscal_type",
        "fiscal_settings",
        "is_active",
    )


@admin.register(PromotionSlide)
class PromotionSlideAdmin(admin.ModelAdmin):
    list_display = ('title', 'branch', 'type', 'order', 'is_active', 'duration', 'created_at')
    list_filter = ('type', 'is_active', 'branch')
    search_fields = ('title', 'branch__name')
    list_editable = ('order', 'is_active')
    readonly_fields = ('created_at', 'updated_at')
