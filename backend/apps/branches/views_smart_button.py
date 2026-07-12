from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .call_waiter import CallWaiterBadRequest, parse_table_id
from .models import Table


class SmartButtonTableView(APIView):
    """
    Akıllı buton kurulumu için masa bilgisi (kimlik doğrulama yok).
    GET /api/v1/smart-button/table/?table_id=<uuid>
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        table_id = (request.query_params.get("table_id") or "").strip()
        if not table_id:
            return Response(
                {"detail": "table_id zorunludur."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            table_uuid = parse_table_id(table_id)
        except CallWaiterBadRequest as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            table = Table.objects.select_related("zone").get(pk=table_uuid, is_active=True)
        except Table.DoesNotExist:
            return Response(
                {"detail": _("Masa bulunamadı.")},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "table_id": str(table.id),
                "table_name": table.name,
                "zone_name": table.zone.name,
            }
        )
