from django.conf import settings
from django.db.models import Exists, OuterRef, Q, Value, BooleanField
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.cache import cache
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.utils.translation import gettext as _
from rbac.drf import RBACPermission
from core.branch_scope import branch_filter_qs, user_may_access_branch
from apps.sales.models import Sale
from apps.shifts.models import Shift, ShiftStatus
from apps.shifts.selectors import get_active_shift
from .models import DisplaySettings, PromotionSlide, PosTerminal
from .serializers import DisplaySettingsSerializer, PromotionSlideSerializer, PosTerminalSerializer
from .services import get_terminal_by_code_for_branch, get_effective_display_settings
from .ws_tokens import make_display_subscribe_token


class PosDisplayWsSubscribeTokenView(APIView):
    """
    Müşteri ekranı WebSocket için imzalı abonelik token'ı.
    Yalnızca POS erişimi olan kasiyer talep edebilir; token URL ile müşteri ekranına taşınır.
    """

    permission_classes = [IsAuthenticated, RBACPermission]
    permission_codes = ["pos.view_pos"]

    def get(self, request):
        terminal_code = (request.query_params.get("terminal_id") or "").strip()
        branch_id = (request.query_params.get("branch_id") or "").strip()
        if not terminal_code:
            return Response({"detail": _("terminal_id gerekli.")}, status=status.HTTP_400_BAD_REQUEST)
        if not branch_id:
            return Response({"detail": _("branch_id gerekli.")}, status=status.HTTP_400_BAD_REQUEST)
        if not user_may_access_branch(request.user, branch_id):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)
        if get_terminal_by_code_for_branch(branch_id, terminal_code) is None:
            return Response(
                {"detail": _("Geçersiz veya pasif POS terminali.")},
                status=status.HTTP_403_FORBIDDEN,
            )
        token = make_display_subscribe_token(terminal_code)
        max_age = getattr(settings, "POS_DISPLAY_WS_TOKEN_MAX_AGE", 86400)
        return Response({"display_token": token, "max_age": max_age})

class DisplaySettingsViewSet(viewsets.ModelViewSet):
    queryset = DisplaySettings.objects.filter(is_active=True)
    serializer_class = DisplaySettingsSerializer
    permission_classes = [RBACPermission]
    permission_description = 'POS Müşteri Ekranı Ayarları'

    def get_permissions(self):
        # Ayarları sadece yetkililer yönetebilir. 
        # Müşteri ekranı (unauthenticated) görüntüleyebilir.
        if self.action in ['list', 'retrieve']:
            return [permissions.AllowAny()]
            
        self.permission_codes = ['pos.manage_display']
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        branch_id = self.request.query_params.get('branch_id')
        if not branch_id and self.action in ['list', 'retrieve']:
            return DisplaySettings.objects.none()
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
        return queryset

    def list(self, request, *args, **kwargs):
        branch_id = request.query_params.get('branch_id')
        if not branch_id:
            return Response({'results': []})
        terminal_code = (request.query_params.get('terminal_code') or '').strip()
        if terminal_code:
            term = get_terminal_by_code_for_branch(branch_id, terminal_code)
            eff = get_effective_display_settings(branch_id, term)
            if not eff:
                return Response({'results': []})
            serializer = self.get_serializer(eff)
            return Response({'results': [serializer.data]})
        pos_terminal_id = (request.query_params.get('pos_terminal_id') or '').strip()
        qs = self.filter_queryset(self.get_queryset())
        if pos_terminal_id:
            qs = qs.filter(pos_terminal_id=pos_terminal_id)
        else:
            qs = qs.filter(pos_terminal__isnull=True)
        serializer = self.get_serializer(qs, many=True)
        return Response({'results': serializer.data})

    @action(detail=False, methods=['post'], url_path='apply-changes')
    def apply_changes(self, request):
        branch_id = request.data.get('branch_id')
        pos_terminal_id = request.data.get('pos_terminal_id')

        if not branch_id:
            return Response({'detail': _('branch_id gerekli.')}, status=status.HTTP_400_BAD_REQUEST)

        if not user_may_access_branch(request.user, branch_id):
            return Response({"detail": _("Bu şube için yetkiniz yok.")}, status=status.HTTP_403_FORBIDDEN)

        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if not channel_layer:
            return Response({'detail': _('WebSocket kanalı aktif değil.')}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        terminals = PosTerminal.objects.filter(branch_id=branch_id, is_active=True)
        if pos_terminal_id:
            terminals = terminals.filter(id=pos_terminal_id)

        count = 0
        for term in terminals:
            if term.code:
                async_to_sync(channel_layer.group_send)(
                    f"pos_display_{term.code}",
                    {
                        "type": "pos_display_refresh",
                        "data": {"reason": "settings_updated"}
                    }
                )
                count += 1

        return Response({'status': 'ok', 'notified_terminals': count})


class PromotionSlideViewSet(viewsets.ModelViewSet):
    queryset = PromotionSlide.objects.all()
    serializer_class = PromotionSlideSerializer
    permission_classes = [RBACPermission]
    permission_description = 'POS Tanıtım Slaytları'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'active']:
            return [permissions.AllowAny()]
            
        self.permission_codes = ['pos.manage_display']
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        branch_id = self.request.query_params.get('branch_id')
        # reorder dahil tüm read/write aksiyonlarda şube filtresi zorunlu
        if not branch_id and self.action in ['list', 'retrieve', 'active', 'reorder']:
            return PromotionSlide.objects.none()
        if branch_id:
            queryset = queryset.filter(branch_id=branch_id)
            pos_terminal_id = (self.request.query_params.get('pos_terminal_id') or '').strip()
            if pos_terminal_id:
                queryset = queryset.filter(Q(pos_terminal__isnull=True) | Q(pos_terminal_id=pos_terminal_id))
            else:
                queryset = queryset.filter(pos_terminal__isnull=True)
        return queryset

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Aktif slaytlar. terminal_code verilirse şube geneli + o terminale özel slaytlar."""
        branch_id = request.query_params.get('branch_id')
        if not branch_id:
            return Response(
                {'detail': _('branch_id gerekli.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        terminal_code = (request.query_params.get('terminal_code') or '').strip()
        term = get_terminal_by_code_for_branch(branch_id, terminal_code) if terminal_code else None
        queryset = PromotionSlide.objects.filter(branch_id=branch_id, is_active=True)
        if term:
            queryset = queryset.filter(Q(pos_terminal__isnull=True) | Q(pos_terminal_id=term.pk))
        else:
            queryset = queryset.filter(pos_terminal__isnull=True)
        serializer = self.get_serializer(queryset.order_by('order', '-created_at'), many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Slayt sıralamasını günceller."""
        order_ids = request.data.get('order_ids', [])
        if not order_ids:
            return Response({'error': _('Sıra verisi sağlanmadı.')}, status=status.HTTP_400_BAD_REQUEST)

        # IDOR koruması: sadece kullanıcının erişebildiği slaytları güncelle
        allowed_qs = self.get_queryset()
        matching = allowed_qs.filter(id__in=order_ids)
        if matching.count() != len(order_ids):
            return Response({'error': _('Yetkisiz kayıt.')}, status=status.HTTP_403_FORBIDDEN)

        from django.db.models import Case, When, Value, IntegerField
        matching.update(
            order=Case(
                *[When(id=slide_id, then=Value(index)) for index, slide_id in enumerate(order_ids)],
                output_field=IntegerField()
            )
        )
        return Response({'status': 'ok'})


class PosTerminalViewSet(viewsets.ModelViewSet):
    """Şube bazlı POS ödeme noktası tanımları."""

    queryset = PosTerminal.objects.select_related("branch").all()
    serializer_class = PosTerminalSerializer
    permission_classes = [RBACPermission]
    permission_description = "POS terminalleri"
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "screen_preferences"):
            # Garson uygulaması POS seçimi için terminalleri okur; kasiyerde `pos.view_pos` vardır.
            self.permission_codes = ["pos.view_pos", "pos.manage_display", "waiter.access"]
        elif self.action == "connections":
            # RBAC katmanı: `connections` metodu OR ile view_pos | manage_connections kontrol eder.
            # Eskiden `else` dalına düşüp yalnızca `pos.manage_display` istiyordu; bu yüzden
            # view_pos + manage_connections olan kasiyer 403 alıyordu (ekran yönetimi yoksa).
            self.permission_codes = [
                "pos.view_pos",
                "pos.manage_display",
                "waiter.access",
                "pos.manage_connections",
            ]
        elif self.action == "disconnect_connection":
            self.permission_codes = ["pos.manage_connections"]
        else:
            self.permission_codes = ["pos.manage_display"]
        return super().get_permissions()

    def get_queryset(self):
        qs = branch_filter_qs(super().get_queryset(), self.request, field="branch_id")
        bid = (self.request.query_params.get("branch_id") or "").strip()
        if self.action == "list" and not bid:
            return PosTerminal.objects.none()
        if bid:
            qs = qs.filter(branch_id=bid)
        if self.action == "list" and bid:
            qs = qs.annotate(
                has_open_shift_at_terminal=Exists(
                    Shift.objects.filter(
                        branch_id=bid,
                        status=ShiftStatus.OPEN,
                        opened_at_terminal_id=OuterRef("pk"),
                    )
                )
            )
            active = get_active_shift(bid)
            if active:
                qs = qs.annotate(
                    used_in_open_shift=Exists(
                        Sale.objects.filter(
                            shift_id=active.id,
                            pos_terminal_id=OuterRef("pk"),
                            is_deleted=False,
                        )
                    )
                )
            else:
                qs = qs.annotate(used_in_open_shift=Value(False, output_field=BooleanField()))
        return qs.order_by("sort_order", "name")

    def perform_create(self, serializer):
        branch = serializer.validated_data.get("branch")
        branch_id = str(branch.pk) if branch is not None else ""
        if not user_may_access_branch(self.request.user, branch_id):
            raise PermissionDenied(_("Bu şube için yetkiniz yok."))
        serializer.save()

    def perform_update(self, serializer):
        inst = serializer.instance
        if not user_may_access_branch(self.request.user, str(inst.branch_id)):
            raise PermissionDenied(_("Bu şube için yetkiniz yok."))
        branch = serializer.validated_data.get("branch")
        if branch is not None and str(branch.pk) != str(inst.branch_id):
            if not user_may_access_branch(self.request.user, str(branch.pk)):
                raise PermissionDenied(_("Bu şube için yetkiniz yok."))
        serializer.save()

    def perform_destroy(self, instance):
        if not user_may_access_branch(self.request.user, str(instance.branch_id)):
            raise PermissionDenied(_("Bu şube için yetkiniz yok."))
        instance.delete()

    @action(detail=True, methods=["get"], url_path="screen-preferences")
    def screen_preferences(self, request, pk=None):
        """Terminale bağlı POS ekran tercihleri (garson mobil: ürün takip yöntemi vb.)."""
        terminal = self.get_object()
        if not user_may_access_branch(request.user, str(terminal.branch_id)):
            raise PermissionDenied(_("Bu şube için yetkiniz yok."))

        from apps.users.pos_terminal_preferences import resolve_stock_tracking_mode_for_terminal

        mode = resolve_stock_tracking_mode_for_terminal(
            str(terminal.id),
            branch_id=str(terminal.branch_id),
        )
        return Response({"stock_tracking_mode": mode})

    @action(detail=True, methods=["get"], permission_classes=[RBACPermission])
    def connections(self, request, pk=None):
        """Bu terminale bağlı olan WebSocket kullanıcılarını listeler."""
        # Check permissions
        if not request.user.has_permission("pos.manage_connections") and not request.user.has_permission("pos.view_pos"):
            raise PermissionDenied(_("Bağlantıları görüntüleme yetkiniz yok."))
            
        terminal = self.get_object()
        if not user_may_access_branch(request.user, str(terminal.branch_id)):
            raise PermissionDenied(_("Bu şube için yetkiniz yok."))
            
        cache_key = f"pos_connections_{terminal.id}"
        connections = cache.get(cache_key, {})
        
        # Convert dictionary to list
        conn_list = []
        for channel_name, data in connections.items():
            conn_list.append({
                "channel_name": channel_name,
                "user_id": data.get("user_id"),
                "name": data.get("name"),
                "platform": data.get("platform"),
                "connected_at": data.get("connected_at")
            })
            
        # Optional: Sort by connected_at
        conn_list.sort(key=lambda x: x.get("connected_at", ""), reverse=True)
        return Response({"results": conn_list})

    @action(detail=True, methods=["post"], permission_classes=[RBACPermission])
    def disconnect_connection(self, request, pk=None):
        """Belirli bir WebSocket kanalının bağlantısını zorla keser."""
        if not request.user.has_permission("pos.manage_connections"):
            raise PermissionDenied(_("Bağlantıları kesme yetkiniz yok."))
            
        terminal = self.get_object()
        if not user_may_access_branch(request.user, str(terminal.branch_id)):
            raise PermissionDenied(_("Bu şube için yetkiniz yok."))
            
        channel_name = request.data.get("channel_name")
        if not channel_name:
            return Response({"detail": _("channel_name gerekli.")}, status=status.HTTP_400_BAD_REQUEST)
            
        channel_layer = get_channel_layer()
        if not channel_layer:
            return Response({'detail': _('WebSocket kanalı aktif değil.')}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
        async_to_sync(channel_layer.send)(
            channel_name,
            {
                "type": "force_disconnect"
            }
        )
        
        # Also remove from cache directly so it disappears instantly
        cache_key = f"pos_connections_{terminal.id}"
        connections = cache.get(cache_key, {})
        if channel_name in connections:
            del connections[channel_name]
            cache.set(cache_key, connections, timeout=86400)
            
        return Response({"status": "ok"})
