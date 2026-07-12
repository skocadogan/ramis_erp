from django.contrib import admin

from apps.reservations.models import Reservation


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ("customer_name", "branch", "scheduled_date", "scheduled_time", "party_size", "status")
    list_filter = ("branch", "status", "scheduled_date")
