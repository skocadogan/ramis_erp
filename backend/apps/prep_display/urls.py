from django.urls import path

from .views import (
    PrepDisplaySessionView,
    PrepDisplaySetupBranchesView,
    PrepDisplaySetupStationsView,
    PrepDisplayStationView,
    PrepDisplayTasksView,
    PrepDisplayVerifyTokenView,
)

urlpatterns = [
    path("setup/branches/", PrepDisplaySetupBranchesView.as_view(), name="prep-display-setup-branches"),
    path("setup/stations/", PrepDisplaySetupStationsView.as_view(), name="prep-display-setup-stations"),
    path("session/", PrepDisplaySessionView.as_view(), name="prep-display-session"),
    path("verify/", PrepDisplayVerifyTokenView.as_view(), name="prep-display-verify"),
    path("station/", PrepDisplayStationView.as_view(), name="prep-display-station"),
    path("tasks/", PrepDisplayTasksView.as_view(), name="prep-display-tasks"),
]
