from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import get_user_model, authenticate
from django.utils import timezone
from django.utils.translation import gettext as _
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from rbac.drf import RBACPermission
from rbac.models import Role, RolePermission, PermissionCategory
from core.branch_scope import accessible_branch_id_strings

from .throttling import LoginRateThrottle, PasswordResetRateThrottle

from .serializers import (
    UserListSerializer, UserDetailSerializer, UserCreateSerializer,
    UserUpdateSerializer, RoleSerializer, PermissionSerializer,
    PermissionCategorySerializer, UserProfileSerializer,
    ChangePasswordSerializer,
    PosScreenPreferencesPatchSerializer,
)
from .services import (
    assign_pos_terminal_preference,
    set_jwt_auth_cookies,
    assert_actor_may_set_branch,
    assert_actor_may_assign_roles,
    assert_actor_may_manage_target,
)

User = get_user_model()

DEFAULT_POS_SCREEN_PREFS = {
    "show_ready_notifs": True,
    "show_waiter_call_notifs": True,
    "play_notif_sound": True,
    "show_customer_display": True,
    "order_printers": [],
    "payment_printers": [],
    "auto_print_order": True,
    "auto_print_payment": False,
    "stock_tracking_mode": "PRODUCT",
    "performance_mode": False,
}

# JSON'da saklanır; DEFAULT_POS_SCREEN_PREFS'te yok — yalnızca kullanıcı kaydettiğinde _merged_pos_prefs'e girer
TERMINAL_ASSIGNMENT_PREF_KEYS = frozenset(
    {"assigned_pos_terminal_uuid", "assigned_terminal_code"}
)


def _merged_pos_prefs(stored: dict | None) -> dict:
    base = {**DEFAULT_POS_SCREEN_PREFS}
    if stored and isinstance(stored, dict):
        for k, v in stored.items():
            if k in DEFAULT_POS_SCREEN_PREFS:
                base[k] = v
        for k in TERMINAL_ASSIGNMENT_PREF_KEYS:
            if k in stored:
                base[k] = stored[k]
    return base


class PosScreenPreferencesView(APIView):
    """Oturum açmış kullanıcının POS / garson ekranı tercihleri (sunucu tarafı)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ctx = (request.query_params.get("context") or "pos").lower()
        if ctx not in ("pos", "waiter"):
            return Response(
                {"error": _("context pos veya waiter olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from .models import UserPosScreenPreferences

        obj, _ = UserPosScreenPreferences.objects.get_or_create(
            user=request.user,
            ui_context=ctx,
            defaults={"data": {}},
        )
        return Response(
            {
                "context": ctx,
                "preferences": _merged_pos_prefs(obj.data),
            }
        )

    def patch(self, request):
        ctx = (request.query_params.get("context") or "pos").lower()
        if ctx not in ("pos", "waiter"):
            return Response(
                {"error": _("context pos veya waiter olmalıdır.")},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser = PosScreenPreferencesPatchSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        patch = ser.validated_data
        if not patch:
            from .models import UserPosScreenPreferences

            obj = UserPosScreenPreferences.objects.filter(
                user=request.user, ui_context=ctx
            ).first()
            merged = _merged_pos_prefs(obj.data if obj else None)
            return Response({"context": ctx, "preferences": merged})

        from .models import UserPosScreenPreferences

        obj, _ = UserPosScreenPreferences.objects.get_or_create(
            user=request.user,
            ui_context=ctx,
            defaults={"data": {}},
        )
        current = dict(obj.data or {})
        for key, value in patch.items():
            if key in DEFAULT_POS_SCREEN_PREFS:
                if key in ("order_printers", "payment_printers"):
                    current[key] = list(value)
                else:
                    current[key] = value
            elif key in TERMINAL_ASSIGNMENT_PREF_KEYS:
                if key == "assigned_pos_terminal_uuid":
                    current[key] = str(value) if value is not None else None
                else:
                    current[key] = value
        obj.data = current
        obj.save(update_fields=["data", "updated_at"])
        return Response(
            {
                "context": ctx,
                "preferences": _merged_pos_prefs(obj.data),
            }
        )


class UserAdminViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('branch').prefetch_related('roles').order_by('-date_joined')
    permission_classes = [RBACPermission]
    permission_codes = ['users.manage_user']
    required_permissions = {
        'list': [
            'users.view_user',
            'users.manage_user',
            'shifts.view_shift',
            'sales.view_sale',
        ],
        'retrieve': ['users.view_user', 'users.manage_user'],
    }
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'is_staff', 'branch', 'is_superuser']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['username', 'email', 'date_joined', 'last_login']
    ordering = ['-date_joined']

    def get_queryset(self):
        qs = super().get_queryset()
        allowed = accessible_branch_id_strings(self.request.user)
        if allowed is not None:
            if not allowed:
                return qs.none()
            alist = list(allowed)
            qs = qs.filter(Q(branch_id__in=alist) | Q(branches__id__in=alist)).distinct()
        
        has_permission = self.request.query_params.get('has_permission')
        if has_permission:
            qs = qs.filter(Q(is_superuser=True) | Q(roles__permissions__code=has_permission)).distinct()
            
        return qs

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        if self.action == 'retrieve':
            return UserDetailSerializer
        return UserListSerializer

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        assert_actor_may_manage_target(request.user, user)
        return super().destroy(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        branch_id = data.get('branch_id')
        assert_actor_may_set_branch(request.user, branch_id)
        role_ids = assert_actor_may_assign_roles(request.user, data.get('role_ids') or [])

        user = User.objects.create_user(
            username=data['username'],
            email=data['email'],
            password=data['password'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            branch_id=branch_id,
        )
        if role_ids:
            user.roles.set(role_ids)

        return Response(
            UserDetailSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        assert_actor_may_manage_target(request.user, user)
        serializer = UserUpdateSerializer(data=request.data, instance=user)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        for field in ['email', 'first_name', 'last_name', 'is_active']:
            if field in data:
                setattr(user, field, data[field])
        if 'branch_id' in data:
            assert_actor_may_set_branch(request.user, data['branch_id'])
            user.branch_id = data['branch_id']
        user.save()

        if 'role_ids' in data:
            role_ids = assert_actor_may_assign_roles(request.user, data['role_ids'] or [])
            user.roles.set(role_ids)

        return Response(UserDetailSerializer(user).data)

    @action(detail=True, methods=['post'], permission_codes=['users.manage_user'])
    def set_roles(self, request, pk=None):
        user = self.get_object()
        assert_actor_may_manage_target(request.user, user)
        role_ids = request.data.get('role_ids', [])
        if not isinstance(role_ids, list):
            return Response(
                {'error': _('role_ids bir liste olmalıdır.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        valid_ids = assert_actor_may_assign_roles(request.user, role_ids)
        user.roles.set(valid_ids)
        return Response(UserDetailSerializer(user).data)

    @action(detail=True, methods=['post'], permission_codes=['users.manage_user'])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        assert_actor_may_manage_target(request.user, user)
        new_password = request.data.get('password')
        if not new_password:
            return Response(
                {'error': _('Şifre alanı boş olamaz.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response(
                {'error': e.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.set_password(new_password)
        user.save()
        return Response({'status': 'password_updated'})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['current_password']):
            return Response(
                {'error': _('Mevcut şifre yanlış.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'status': 'password_changed'})


class RoleAdminViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.prefetch_related('permissions').order_by('name')
    serializer_class = RoleSerializer
    permission_classes = [RBACPermission]
    permission_codes = ['rbac.manage_role']
    pagination_class = None

    @action(detail=True, methods=['post'], permission_codes=['rbac.manage_role'])
    def set_permissions(self, request, pk=None):
        role = self.get_object()
        permission_ids = request.data.get('permission_ids', [])
        if not isinstance(permission_ids, list):
            return Response(
                {'error': _('permission_ids bir liste olmalıdır.')},
                status=status.HTTP_400_BAD_REQUEST,
            )
        valid_ids = list(
            RolePermission.objects.filter(id__in=permission_ids).values_list('id', flat=True)
        )
        role.permissions.set(valid_ids)
        return Response(RoleSerializer(role).data)


class PermissionAdminViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RolePermission.objects.select_related('category').order_by('category', 'name')
    serializer_class = PermissionSerializer
    permission_classes = [RBACPermission]
    permission_codes = ['rbac.manage_role']
    pagination_class = None


class PermissionCategoryAdminViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PermissionCategory.objects.prefetch_related('permissions').order_by('name')
    serializer_class = PermissionCategorySerializer
    permission_classes = [RBACPermission]
    permission_codes = ['rbac.manage_role']
    pagination_class = None


from django.conf import settings
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

class CustomTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        remember_me = request.data.get('remember_me', True)
        if isinstance(remember_me, str):
            remember_me = remember_me.lower() not in ('false', '0', '')

        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            is_secure = getattr(
                settings, "SESSION_COOKIE_SECURE", not settings.DEBUG
            )
            access_token = response.data.get('access')
            refresh_token = response.data.get('refresh')

            access_max_age = (
                int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
                if remember_me else None
            )
            refresh_max_age = (
                int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())
                if remember_me else None
            )

            if access_token:
                response.set_cookie(
                    'access_token', access_token,
                    httponly=True,
                    samesite='Lax',
                    secure=is_secure,
                    max_age=access_max_age,
                    path='/',
                )
            if refresh_token:
                response.set_cookie(
                    'refresh_token', refresh_token,
                    httponly=True,
                    samesite='Lax',
                    secure=is_secure,
                    max_age=refresh_max_age,
                    path='/',
                )
            response.set_cookie(
                'ramis_remember', '1' if remember_me else '0',
                httponly=False,
                samesite='Lax',
                secure=is_secure,
                max_age=refresh_max_age if remember_me else None,
                path='/',
            )
        return response

class CustomTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        refresh_cookie = request.COOKIES.get('refresh_token')

        if not data.get('refresh') and refresh_cookie:
            data['refresh'] = refresh_cookie

        serializer = self.get_serializer(data=data)
        try:
            serializer.is_valid(raise_exception=True)
        except Exception:
            return Response({"error": _("Token geçersiz veya süresi dolmuş.")}, status=401)

        remember_me = request.COOKIES.get('ramis_remember') == '1'
        is_secure = getattr(
            settings, "SESSION_COOKIE_SECURE", not settings.DEBUG
        )

        response = Response(serializer.validated_data, status=200)
        access_token = serializer.validated_data.get('access')
        new_refresh_token = serializer.validated_data.get('refresh')

        if access_token:
            response.set_cookie(
                'access_token', access_token,
                httponly=True,
                samesite='Lax',
                secure=is_secure,
                max_age=(
                    int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds())
                    if remember_me else None
                ),
                path='/',
            )

        if new_refresh_token:
            refresh_max_age = (
                int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()
                    if remember_me else None)
            )
            response.set_cookie(
                'refresh_token', new_refresh_token,
                httponly=True,
                samesite='Lax',
                secure=is_secure,
                max_age=refresh_max_age,
                path='/',
            )

        return response

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        response = Response({'status': 'Logged out'})
        # Refresh token'ı blacklist'e al (token çalınmışsa bile artık kullanılamaz)
        refresh_cookie = request.COOKIES.get('refresh_token')
        if refresh_cookie:
            try:
                from rest_framework_simplejwt.tokens import RefreshToken
                token = RefreshToken(refresh_cookie)
                token.blacklist()
            except Exception:
                pass  # Token zaten geçersiz / süresi dolmuş
        response.delete_cookie('access_token', path='/')
        response.delete_cookie('refresh_token', path='/')
        response.delete_cookie('ramis_remember', path='/')
        return response


class WsTicketView(APIView):
    """
    Kısa ömürlü WebSocket ticket üretir.
    JWT'nin query string ile log/proxy'ye sızmasını önlemek için mobil istemciler bunu kullanır.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        import os
        import secrets

        from django.core.cache import cache

        ttl = int(os.environ.get("WS_TICKET_TTL_SECONDS", "120"))
        ticket = secrets.token_urlsafe(32)
        cache.set(f"ws_ticket:{ticket}", str(request.user.pk), timeout=ttl)
        return Response({"ticket": ticket, "expires_in": ttl})


class CheckPinUserView(APIView):
    """
    Kullanıcı adının Kasiyer rolüne sahip olup olmadığını ve atanmış bir PIN'i
    bulunup bulunmadığını kontrol eder.
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        username = request.data.get("username", "").strip()
        if not username:
            return Response(
                {"error": _("Kullanıcı adı boş olamaz.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        try:
            user = User.objects.get(username=username, is_active=True)
            has_cashier_role = user.roles.filter(name__in=["Kasiyer", "Cashier"]).exists()
            from apps.shifts.models import CashierPinAssignment
            has_pin = CashierPinAssignment.objects.filter(user=user).exists()
        except User.DoesNotExist:
            has_cashier_role = False
            has_pin = False

        return Response({
            "has_pin": has_pin,
            "has_cashier_role": has_cashier_role
        })


class PinTokenObtainView(APIView):
    """
    Kasiyer PIN ile hızlı giriş yapılmasını sağlar.
    """
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        username = request.data.get("username", "").strip()
        pin = request.data.get("pin", "").strip()
        remember_me = request.data.get("remember_me", True)
        if isinstance(remember_me, str):
            remember_me = remember_me.lower() not in ('false', '0', '')

        if not username or not pin:
            return Response(
                {"error": _("Kullanıcı adı ve PIN boş olamaz.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        User = get_user_model()
        try:
            user = User.objects.get(username=username, is_active=True)
        except User.DoesNotExist:
            return Response(
                {"error": _("Kullanıcı bulunamadı veya pasif.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Kasiyer rol kontrolü
        if not user.roles.filter(name__in=["Kasiyer", "Cashier"]).exists():
            return Response(
                {"error": _("Bu kullanıcı Kasiyer rolüne sahip değil.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. PIN Ataması kontrolü
        from apps.shifts.models import CashierPinAssignment
        try:
            assignment = CashierPinAssignment.objects.get(user=user)
        except CashierPinAssignment.DoesNotExist:
            return Response(
                {"error": _("Bu kullanıcıya ait bir PIN tanımlanmamış.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3. PIN eşleşme kontrolü
        if assignment.pin != pin:
            return Response(
                {"error": _("Girdiğiniz PIN kodu yanlış.")},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Token Üretimi ve Cookie Tanımlaması
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)

        # 5. Eğer kasiyere atanmış tek bir POS terminali varsa, doğrudan o terminali tercih olarak kaydedelim
        assigned_terminals = list(assignment.pos_terminals.all())
        assign_pos_terminal_preference(user, assigned_terminals)

        response = Response({
            "access": access_token,
            "refresh": refresh_token
        }, status=200)

        set_jwt_auth_cookies(response, access_token, refresh_token, remember_me)
        return response

