from django.contrib import admin
from .models import Branch, KitchenStation, Zone, Table, BranchTarget

@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "currency")
    search_fields = ("name", "code")

@admin.register(KitchenStation)
class KitchenStationAdmin(admin.ModelAdmin):
    list_display = ("name", "branch", "code")
    list_filter = ("branch",)

@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("name", "branch")
    list_filter = ("branch",)

@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ("name", "zone", "status")
    list_filter = ("zone__branch", "status")

@admin.register(BranchTarget)
class BranchTargetAdmin(admin.ModelAdmin):
    list_display = ("branch", "year", "month", "target_revenue")
    list_filter = ("branch", "year", "month")
    list_editable = ("target_revenue",)
