from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from rbac.drf import RBACPermission

from .waiter_call_sync import WaiterCallDismissBadRequest, dismiss_waiter_calls


class WaiterCallDismissView(APIView):
    """
    Garson çağrısını görüldü işaretle — tüm POS / garson / mobil istemcilere WS ile yayınlanır.
    POST /api/v1/waiter-calls/dismiss/
    """

    permission_classes = [RBACPermission]
    permission_codes = ["pos.view_pos", "waiter.access"]

    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        branch_id = (body.get("branch_id") or request.query_params.get("branch_id") or "").strip()
        call_id = body.get("call_id")
        call_ids = body.get("call_ids")
        dismiss_all = bool(body.get("dismiss_all"))

        if call_ids is not None and not isinstance(call_ids, list):
            return Response(
                {"detail": "call_ids bir dizi olmalıdır."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = dismiss_waiter_calls(
                user=request.user,
                branch_id=branch_id,
                call_id=str(call_id).strip() if call_id else None,
                call_ids=[str(x) for x in call_ids] if call_ids else None,
                dismiss_all=dismiss_all,
            )
        except WaiterCallDismissBadRequest as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)
