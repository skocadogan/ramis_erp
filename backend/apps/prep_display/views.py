from __future__ import annotations

from django.conf import settings
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.branches.models import Branch, KitchenStation
from apps.prep.models import PrepTask
from apps.prep.selectors import get_active_prep_tasks
from apps.prep.serializers import PrepTaskSerializer

from .authentication import PrepDisplayPrincipal, PrepDisplayTokenAuthentication
from .services import get_active_station, station_to_response_dict
from .ws_tokens import make_prep_display_token, verify_prep_display_token


class PrepDisplaySetupBranchesView(APIView):
    """Login gerektirmeyen şube listesi (yalnızca id + ad)."""

    permission_classes = [AllowAny]

    def get(self, request):
        rows = (
            Branch.objects.filter(is_active=True)
            .order_by("name")
            .values("id", "name")
        )
        return Response([{"id": str(r["id"]), "name": r["name"]} for r in rows])


class PrepDisplaySetupStationsView(APIView):
    """Login gerektirmeyen istasyon listesi (şube bazlı)."""

    permission_classes = [AllowAny]

    def get(self, request):
        branch_id = (request.query_params.get("branch_id") or "").strip()
        if not branch_id:
            return Response(
                {"detail": _("branch_id gerekli.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not Branch.objects.filter(id=branch_id, is_active=True).exists():
            return Response(
                {"detail": _("Geçersiz şube.")},
                status=status.HTTP_404_NOT_FOUND,
            )

        stations = (
            KitchenStation.objects.filter(branch_id=branch_id, is_active=True)
            .select_related("branch")
            .order_by("name")
        )
        payload = [
            {
                "id": str(s.id),
                "name": s.name,
                "color": s.color,
                "branch": str(s.branch_id),
                "branch_name": s.branch.name,
            }
            for s in stations
        ]
        return Response(payload)


class PrepDisplaySessionView(APIView):
    """Şube + istasyon seçiminden sonra kiosk token üretir."""

    permission_classes = [AllowAny]

    def post(self, request):
        branch_id = (request.data.get("branch_id") or "").strip()
        station_id = (request.data.get("station_id") or "").strip()
        if not branch_id or not station_id:
            return Response(
                {"detail": _("branch_id ve station_id gerekli.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        station = (
            KitchenStation.objects.filter(
                id=station_id,
                branch_id=branch_id,
                is_active=True,
                branch__is_active=True,
            )
            .select_related("branch")
            .first()
        )
        if station is None:
            return Response(
                {"detail": _("Geçersiz istasyon veya şube.")},
                status=status.HTTP_404_NOT_FOUND,
            )

        token = make_prep_display_token(branch_id, station_id)
        max_age = getattr(settings, "PREP_DISPLAY_TOKEN_MAX_AGE", 2592000)
        return Response(
            {
                "display_token": token,
                "max_age": max_age,
                "branch_id": branch_id,
                "station_id": station_id,
                "station": {
                    "id": str(station.id),
                    "name": station.name,
                    "color": station.color,
                    "branch": str(station.branch_id),
                    "branch_name": station.branch.name,
                },
            }
        )


class PrepDisplayStationView(APIView):
    authentication_classes = [PrepDisplayTokenAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        principal: PrepDisplayPrincipal = request.user  # type: ignore[assignment]
        station = get_active_station(principal.station_id, principal.branch_id)
        if station is None:
            return Response({"detail": _("İstasyon bulunamadı.")}, status=status.HTTP_404_NOT_FOUND)
        return Response(station_to_response_dict(station))


class PrepDisplayTasksView(APIView):
    authentication_classes = [PrepDisplayTokenAuthentication]
    permission_classes = [AllowAny]

    def get(self, request):
        principal: PrepDisplayPrincipal = request.user  # type: ignore[assignment]
        station_id = (request.query_params.get("station_id") or principal.station_id).strip()
        if station_id != principal.station_id:
            return Response(
                {"detail": _("Token bu istasyon için geçerli değil.")},
                status=status.HTTP_403_FORBIDDEN,
            )

        include_hist_raw = (request.query_params.get("include_historic_completed") or "").strip().lower()
        if include_hist_raw in ("1", "true", "yes", "on"):
            include_historic = True
        else:
            include_historic = False

        qs = get_active_prep_tasks(
            branch_id=principal.branch_id,
            station_id=principal.station_id,
            include_historic_completed=include_historic,
            user=None,
            has_manage_templates=True,
        )
        serializer = PrepTaskSerializer(qs, many=True)
        return Response(serializer.data)


class PrepDisplayVerifyTokenView(APIView):
    """Kayıtlı token geçerliliğini kontrol eder (Electron auto-start)."""

    permission_classes = [AllowAny]

    def post(self, request):
        token = (request.data.get("display_token") or request.data.get("t") or "").strip()
        parsed = verify_prep_display_token(token)
        if not parsed:
            return Response({"valid": False}, status=status.HTTP_401_UNAUTHORIZED)

        branch_id, station_id = parsed
        station = get_active_station(station_id, branch_id)
        if station is None:
            return Response({"valid": False}, status=status.HTTP_401_UNAUTHORIZED)

        return Response(
            {
                "valid": True,
                "branch_id": branch_id,
                "station_id": station_id,
                "display_token": token,
                "station": station_to_response_dict(station),
            }
        )
