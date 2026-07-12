from django.utils import timezone
from django.utils.translation import gettext as _
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.branches.models import Table
from apps.orders.models import Order
from apps.pos_display.models import PosTerminal
from apps.pos_display.ws_tokens import verify_display_subscribe_token
from apps.sales.models import Sale
from core.branch_scope import user_may_access_branch
from rbac.drf import RBACPermission

from .models import Survey, SurveyResponse, SurveySessionStatus, SurveySource, TableSurveySessionState
from .serializers import (
    DisplaySurveyCloseSerializer,
    DisplaySurveySubmitSerializer,
    DisplaySurveySerializer,
    DisplaySurveyPromptSerializer,
    SmartTableSurveyOpenSerializer,
    SurveyResponseAttentionSerializer,
    SurveyResponseSerializer,
    SurveySerializer,
)
from .services import (
    close_smart_table_survey,
    build_display_prompt_payload,
    close_customer_display_survey,
    get_active_smart_table_surveys,
    get_accessible_responses_queryset,
    get_accessible_surveys_queryset,
    open_customer_display_survey,
    open_smart_table_survey,
    resolve_open_display_prompt,
    submit_customer_display_survey,
)


class SurveyPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class SurveyResponsePagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 250


class SurveyViewSet(viewsets.ModelViewSet):
    serializer_class = SurveySerializer
    permission_classes = [RBACPermission]
    permission_description = 'Anket Yönetimi'
    pagination_class = SurveyPagination

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.permission_codes = ['surveys.view_survey', 'surveys.manage_survey']
        else:
            self.permission_codes = ['surveys.manage_survey']
        return super().get_permissions()

    def get_queryset(self):
        qs = get_accessible_surveys_queryset(self.request.user)
        branch_id = (self.request.query_params.get('branch_id') or '').strip()
        search = (self.request.query_params.get('search') or '').strip()
        display_channel = (self.request.query_params.get('channel') or '').strip().upper()

        if branch_id:
            qs = qs.filter(branches__id=branch_id)
        if search:
            qs = qs.filter(title__icontains=search)
        if display_channel == SurveySource.POS_DISPLAY:
            qs = qs.filter(is_customer_display_active=True)
        elif display_channel == SurveySource.SMART_TABLE:
            qs = qs.filter(is_smart_table_active=True)

        return qs.distinct().order_by('sort_order', 'title')


class SurveyResponseViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = SurveyResponseSerializer
    permission_classes = [RBACPermission]
    permission_description = 'Anket Sonuçları'
    pagination_class = SurveyResponsePagination

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            self.permission_codes = ['surveys.view_response', 'surveys.manage_response']
        else:
            self.permission_codes = ['surveys.manage_response']
        return super().get_permissions()

    def get_queryset(self):
        qs = get_accessible_responses_queryset(self.request.user)
        survey_id = (self.request.query_params.get('survey_id') or '').strip()
        branch_id = (self.request.query_params.get('branch_id') or '').strip()
        attention_status = (self.request.query_params.get('attention_status') or '').strip()
        needs_attention = (self.request.query_params.get('needs_attention') or '').strip().lower()

        if survey_id:
            qs = qs.filter(survey_id=survey_id)
        if branch_id:
            qs = qs.filter(branch_id=branch_id)
        if attention_status:
            qs = qs.filter(attention_status=attention_status)
        if needs_attention in ('true', '1', 'yes'):
            qs = qs.filter(needs_attention=True)
        elif needs_attention in ('false', '0', 'no'):
            qs = qs.filter(needs_attention=False)

        return qs.order_by('-created_at')

    @action(detail=True, methods=['patch'], permission_classes=[RBACPermission], url_path='attention')
    def attention(self, request, pk=None):
        self.permission_codes = ['surveys.manage_response']
        response_obj = self.get_object()
        serializer = SurveyResponseAttentionSerializer(response_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        for attr, value in serializer.validated_data.items():
            setattr(response_obj, attr, value)

        response_obj.attention_reviewed_by = request.user
        response_obj.attention_reviewed_at = timezone.now()
        response_obj.save(
            update_fields=[
                'attention_status',
                'attention_note',
                'attention_reviewed_by',
                'attention_reviewed_at',
                'updated_at',
            ]
        )

        return Response(SurveyResponseSerializer(response_obj).data)


class DisplaySurveyOpenView(APIView):
    permission_classes = [IsAuthenticated, RBACPermission]
    permission_codes = ['pos.manage_display']

    def post(self, request):
        sale_id = (request.data.get('sale_id') or '').strip()
        order_id = (request.data.get('order_id') or '').strip()
        survey_id = (request.data.get('survey_id') or '').strip() or None
        terminal_code = (request.data.get('terminal_code') or '').strip()

        if not sale_id and not order_id:
            return Response({'detail': _('sale_id veya order_id gerekli.')}, status=status.HTTP_400_BAD_REQUEST)

        sale = None
        order = None

        if sale_id:
            sale = (
                Sale.objects.select_related(
                    'branch',
                    'order__table',
                    'order__customer',
                    'order__user',
                    'created_by',
                    'pos_terminal',
                )
                .filter(id=sale_id, is_deleted=False)
                .first()
            )
            if sale is None:
                return Response({'detail': _('Satış bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)
            if not user_may_access_branch(request.user, str(sale.branch_id)):
                return Response({'detail': _('Bu şube için yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)

        if order_id:
            order = (
                Order.objects.select_related(
                    'branch',
                    'table',
                    'customer',
                    'user',
                )
                .filter(id=order_id, is_active=True)
                .first()
            )
            if order is None:
                return Response({'detail': _('Sipariş bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)
            if not user_may_access_branch(request.user, str(order.branch_id)):
                return Response({'detail': _('Bu şube için yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)

        branch = sale.branch if sale is not None else order.branch

        if not terminal_code and sale and sale.pos_terminal:
            terminal_code = sale.pos_terminal.code
        if not terminal_code:
            return Response({'detail': _('terminal_code gerekli.')}, status=status.HTTP_400_BAD_REQUEST)

        pos_terminal = PosTerminal.objects.filter(
            branch_id=branch.id,
            code=terminal_code,
            is_active=True,
        ).first()
        if pos_terminal is None:
            return Response(
                {'detail': _('Geçersiz veya pasif POS terminali.')},
                status=status.HTTP_400_BAD_REQUEST,
            )

        state = open_customer_display_survey(
            pos_terminal=pos_terminal,
            survey_id=survey_id,
            sale=sale,
            order=order,
        )
        return Response(
            {
                'status': 'ok',
                'prompt': build_display_prompt_payload(state),
            }
        )


class DisplaySurveyCurrentView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, terminal_code: str):
        display_token = (request.query_params.get('display_token') or request.query_params.get('t') or '').strip()
        if not display_token:
            return Response({'detail': _('display_token gerekli.')}, status=status.HTTP_400_BAD_REQUEST)
        if not verify_display_subscribe_token(display_token, terminal_code):
            return Response({'detail': _('Geçersiz ekran tokenı.')}, status=status.HTTP_403_FORBIDDEN)

        state = resolve_open_display_prompt(terminal_code=terminal_code)
        if state is None:
            return Response({'prompt': None})
        return Response({'prompt': build_display_prompt_payload(state)})


class DisplaySurveySubmitView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DisplaySurveySubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        terminal_code = (request.data.get('terminal_code') or '').strip()
        display_token = (request.data.get('display_token') or request.data.get('t') or '').strip()
        if not terminal_code:
            return Response({'detail': _('terminal_code gerekli.')}, status=status.HTTP_400_BAD_REQUEST)
        if not display_token:
            return Response({'detail': _('display_token gerekli.')}, status=status.HTTP_400_BAD_REQUEST)
        if not verify_display_subscribe_token(display_token, terminal_code):
            return Response({'detail': _('Geçersiz ekran tokenı.')}, status=status.HTTP_403_FORBIDDEN)

        state = (
            TableSurveySessionState.objects.select_related(
                'survey',
                'branch',
                'table',
                'order',
                'sale',
                'customer',
                'staff_user',
                'pos_terminal',
            )
            .filter(
                id=serializer.validated_data['session_id'],
                pos_terminal__code=terminal_code,
                source=SurveySource.POS_DISPLAY,
                status=SurveySessionStatus.OPENED,
                is_active=True,
            )
            .first()
        )
        if state is None:
            return Response({'detail': _('Açık anket oturumu bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)

        response_obj = submit_customer_display_survey(
            state=state,
            answers_payload=serializer.validated_data['answers'],
        )
        return Response(
            {
                'status': 'ok',
                'response_id': str(response_obj.id),
                'needs_attention': response_obj.needs_attention,
                'completion_signal': 'PAYMENT',
            }
        )


class DisplaySurveyCloseView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DisplaySurveyCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        terminal_code = (request.data.get('terminal_code') or '').strip()
        display_token = (request.data.get('display_token') or request.data.get('t') or '').strip()
        if not terminal_code:
            return Response({'detail': _('terminal_code gerekli.')}, status=status.HTTP_400_BAD_REQUEST)

        state = (
            TableSurveySessionState.objects.select_related(
                'survey',
                'branch',
                'table',
                'order',
                'sale',
                'customer',
                'staff_user',
                'pos_terminal',
            )
            .filter(
                id=serializer.validated_data['session_id'],
                pos_terminal__code=terminal_code,
                source=SurveySource.POS_DISPLAY,
                is_active=True,
            )
            .first()
        )
        if state is None:
            return Response({'detail': _('Anket oturumu bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)

        if display_token:
            if not verify_display_subscribe_token(display_token, terminal_code):
                return Response({'detail': _('Geçersiz ekran tokenı.')}, status=status.HTTP_403_FORBIDDEN)
        else:
            user = request.user
            if user is None or not user.is_authenticated:
                return Response({'detail': _('Yetkilendirme gerekli.')}, status=status.HTTP_403_FORBIDDEN)
            if not user_may_access_branch(user, str(state.branch_id)):
                return Response({'detail': _('Bu şube için yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)
            has_permission = getattr(user, 'is_superuser', False)
            if not has_permission and hasattr(user, 'has_permission'):
                has_permission = user.has_permission('pos.manage_display')
            if not has_permission:
                return Response({'detail': _('Bu işlem için yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)

        close_customer_display_survey(state=state)
        return Response({'status': 'ok'})


def _resolve_smart_table_order_context(*, user, table_id: str, order_id: str):
    table = (
        Table.objects.select_related('zone__branch')
        .filter(id=table_id, is_active=True)
        .first()
    )
    if table is None:
        return None, None, Response({'detail': _('Masa bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)

    branch_id = str(table.zone.branch_id)
    if not user_may_access_branch(user, branch_id):
        return None, None, Response({'detail': _('Bu şube için yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)

    order = (
        Order.objects.select_related('branch', 'table', 'customer')
        .filter(id=order_id, table_id=table.id, branch_id=table.zone.branch_id, is_active=True)
        .first()
    )
    if order is None:
        return table, None, Response({'detail': _('Aktif sipariş bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)

    return table, order, None


class SmartTableSurveyAvailableView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        table_id = (request.query_params.get('table_id') or '').strip()
        order_id = (request.query_params.get('order_id') or '').strip()
        if not table_id or not order_id:
            return Response({'detail': _('table_id ve order_id gerekli.')}, status=status.HTTP_400_BAD_REQUEST)

        table, order, error_response = _resolve_smart_table_order_context(
            user=request.user,
            table_id=table_id,
            order_id=order_id,
        )
        if error_response is not None:
            return error_response

        surveys = get_active_smart_table_surveys(
            branch_id=str(table.zone.branch_id),
            table_id=str(table.id),
        )
        serializer = DisplaySurveySerializer(surveys, many=True)
        has_answered_survey = TableSurveySessionState.objects.filter(
            table_id=table.id,
            source=SurveySource.SMART_TABLE,
            status=SurveySessionStatus.ANSWERED,
            is_active=True,
        ).exists()
        return Response(
            {
                'surveys': serializer.data,
                'order_id': str(order.id),
                'has_answered_survey': has_answered_survey,
            }
        )


class SmartTableSurveyOpenView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        table_id = (request.data.get('table_id') or '').strip()
        serializer = SmartTableSurveyOpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        table, order, error_response = _resolve_smart_table_order_context(
            user=request.user,
            table_id=table_id,
            order_id=str(serializer.validated_data['order_id']),
        )
        if error_response is not None:
            return error_response

        state = open_smart_table_survey(
            table=table,
            survey_id=str(serializer.validated_data['survey_id']),
            order=order,
        )
        return Response(
            {
                'status': 'ok',
                'prompt': DisplaySurveyPromptSerializer(state).data,
            }
        )


class SmartTableSurveySubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DisplaySurveySubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        state = (
            TableSurveySessionState.objects.select_related(
                'survey',
                'branch',
                'table',
                'order',
                'sale',
                'customer',
                'staff_user',
                'pos_terminal',
            )
            .filter(
                id=serializer.validated_data['session_id'],
                source=SurveySource.SMART_TABLE,
                is_active=True,
            )
            .first()
        )
        if state is None:
            return Response({'detail': _('Açık anket oturumu bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)
        if not user_may_access_branch(request.user, str(state.branch_id)):
            return Response({'detail': _('Bu şube için yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)

        response_obj = submit_customer_display_survey(
            state=state,
            answers_payload=serializer.validated_data['answers'],
        )
        return Response(
            {
                'status': 'ok',
                'response_id': str(response_obj.id),
                'needs_attention': response_obj.needs_attention,
            }
        )


class SmartTableSurveyCloseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = DisplaySurveyCloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        state = (
            TableSurveySessionState.objects.select_related('branch')
            .filter(
                id=serializer.validated_data['session_id'],
                source=SurveySource.SMART_TABLE,
                is_active=True,
            )
            .first()
        )
        if state is None:
            return Response({'detail': _('Anket oturumu bulunamadı.')}, status=status.HTTP_404_NOT_FOUND)
        if not user_may_access_branch(request.user, str(state.branch_id)):
            return Response({'detail': _('Bu şube için yetkiniz yok.')}, status=status.HTTP_403_FORBIDDEN)

        close_smart_table_survey(state=state)
        return Response({'status': 'ok'})
