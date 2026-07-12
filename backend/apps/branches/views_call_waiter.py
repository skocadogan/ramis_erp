from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .call_waiter import CallWaiterBadRequest, CallWaiterNotFound, call_waiter, parse_table_id


class CallWaiterView(APIView):
    """
    Akıllı buton garson çağrısı (kimlik doğrulama yok).
    GET /api/v1/call-waiter/?table_id=<uuid>&message=<opsiyonel>
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

        customer_message = request.query_params.get("message")

        try:
            result = call_waiter(table_id, message=customer_message)
        except CallWaiterBadRequest as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except CallWaiterNotFound as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_404_NOT_FOUND)

        body = {
            "status": result.status,
            "table_id": result.table_id,
        }
        if result.table_name:
            body["table_name"] = result.table_name
        if result.reason:
            body["reason"] = result.reason
        if result.call_id:
            body["call_id"] = result.call_id
        if result.status == "accepted":
            body["notified_count"] = result.notified_count

        return Response(body, status=status.HTTP_200_OK)
