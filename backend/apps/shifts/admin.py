from django.contrib import admin

from apps.shifts.models import Shift, ShiftExpense, ShiftCashMovement, CashierPinAssignment


class ShiftExpenseInline(admin.TabularInline):
    model = ShiftExpense
    extra = 0


class ShiftCashMovementInline(admin.TabularInline):
    model = ShiftCashMovement
    extra = 0


@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("branch", "status", "opened_at", "closed_at", "opening_cash", "expected_cash", "actual_cash")
    list_filter = ("status", "branch")
    inlines = [ShiftExpenseInline, ShiftCashMovementInline]


@admin.register(ShiftExpense)
class ShiftExpenseAdmin(admin.ModelAdmin):
    list_display = ("shift", "description", "amount", "created_at")


@admin.register(ShiftCashMovement)
class ShiftCashMovementAdmin(admin.ModelAdmin):
    list_display = ("shift", "movement_type", "amount", "description", "created_at")


@admin.register(CashierPinAssignment)
class CashierPinAssignmentAdmin(admin.ModelAdmin):
    list_display = ("user", "branch", "pin", "created_at")
    filter_horizontal = ("pos_terminals",)

