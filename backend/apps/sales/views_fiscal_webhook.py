"""Token X-Connect Cloud webhook endpoint (public, JWT gerektirmez)."""
import logging

from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.pos_display.models import FiscalType, PosTerminal
from apps.sales.fiscal.webhook_service import FiscalWebhookAuthError, handle_token_webhook

logger = logging.getLogger(__name__)


@method_decorator(csrf_exempt, name="dispatch")
class FiscalWebhookView(APIView):
    """
    POST /api/v1/sales/fiscal/webhook/<terminal_id>/

    Token Inc. Set Client Settings API ile tanımlanan webhook hedefi.
    """

    authentication_classes = []
    permission_classes = [AllowAny]
    # AnonRateThrottle (varsayılan 30/dk) — throttle_classes=[] bilinçli olarak kaldırıldı.

    def post(self, request, terminal_id):
        terminal = PosTerminal.objects.filter(
            pk=terminal_id,
            is_active=True,
            fiscal_type=FiscalType.BEKO_GMP3,
        ).first()

        if terminal is None:
            logger.warning("Fiscal webhook: terminal bulunamadı veya BEKO değil: %s", terminal_id)
            return Response({"status": "ignored"}, status=status.HTTP_404_NOT_FOUND)

        settings_json = terminal.fiscal_settings or {}
        if settings_json.get("connection_type") != "CLOUD":
            return Response({"status": "ignored"}, status=status.HTTP_404_NOT_FOUND)

        webhook_secret = str(settings_json.get("webhook_secret") or "").strip()
        if webhook_secret:
            incoming = (
                request.headers.get("X-Ramis-Webhook-Secret")
                or request.headers.get("X-Webhook-Secret")
                or ""
            )
            if incoming != webhook_secret:
                logger.warning("Fiscal webhook secret uyuşmazlığı: terminal=%s", terminal_id)
                return Response({"status": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        payload = request.data
        if not isinstance(payload, dict):
            return Response({"status": "invalid_payload"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            handle_token_webhook(terminal, payload)
        except FiscalWebhookAuthError:
            return Response({"status": "forbidden"}, status=status.HTTP_403_FORBIDDEN)
        except Exception:
            logger.exception("Fiscal webhook işleme hatası: terminal=%s", terminal_id)
            return Response({"status": "error"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"status": "ok"}, status=status.HTTP_200_OK)
