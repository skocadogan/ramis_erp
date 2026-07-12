from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from rbac.drf import RBACPermission

from .waiter_call_pending import WaiterCallPendingBadRequest, list_pending_waiter_calls


class WaiterCallPendingView(APIView):
    """
    Bekleyen garson çağrılarını döndürür — istemci açılışında WS kaçırılan çağrıları yükler.
    GET /api/v1/waiter-calls/pending/?branch_id=<uuid>
    """

    permission_classes = [RBACPermission]
    permission_codes = ["pos.view_pos", "waiter.access"]

    def get(self, request):
        branch_id = (request.query_params.get("branch_id") or "").strip()
        try:
            calls = list_pending_waiter_calls(user=request.user, branch_id=branch_id)
        except WaiterCallPendingBadRequest as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"calls": calls}, status=status.HTTP_200_OK)
