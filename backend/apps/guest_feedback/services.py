from __future__ import annotations

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from core.branch_scope import accessible_branch_id_strings
from core.json_utils import to_json_safe
from apps.sales.models import Sale

from .models import (
    AttentionStatus,
    Survey,
    SurveyAnswer,
    SurveyQuestion,
    SurveyQuestionRole,
    SurveyQuestionType,
    SurveyResponse,
    SurveySessionStatus,
    SurveySource,
    TableSurveySessionState,
)
from .serializers import DisplaySurveyPromptSerializer

logger = logging.getLogger(__name__)


def get_accessible_surveys_queryset(user):
    qs = (
        Survey.objects.filter(is_active=True, branches__is_active=True)
        .prefetch_related(
            'branches',
            'questions__options',
        )
        .annotate(response_count=Count('responses', distinct=True))
        .distinct()
    )
    allowed = accessible_branch_id_strings(user)
    if allowed is None:
        return qs
    if not allowed:
        return qs.none()
    return qs.filter(branches__id__in=list(allowed)).distinct()


def get_accessible_responses_queryset(user):
    qs = (
        SurveyResponse.objects.filter(is_active=True)
        .select_related(
            'survey',
            'branch',
            'table',
            'customer',
            'staff_user',
            'order',
            'sale',
        )
        .prefetch_related('answers__question')
    )
    allowed = accessible_branch_id_strings(user)
    if allowed is None:
        return qs
    if not allowed:
        return qs.none()
    return qs.filter(branch_id__in=list(allowed))


def build_survey_session_key(*, source: str, sale_id: str | None = None, order_id: str | None = None, table_id: str | None = None):
    if sale_id:
        return f'{source}:sale:{sale_id}'
    if order_id:
        return f'{source}:order:{order_id}'
    if table_id:
        return f'{source}:table:{table_id}'
    raise ValueError('Session key için sale_id, order_id veya table_id gerekli.')


def get_active_customer_display_survey(*, branch_id: str, survey_id: str | None = None) -> Survey | None:
    qs = (
        Survey.objects.filter(
            is_active=True,
            is_customer_display_active=True,
            branches__id=branch_id,
        )
        .prefetch_related('questions__options')
        .distinct()
        .order_by('sort_order', 'created_at')
    )
    if survey_id:
        return qs.filter(id=survey_id).first()
    return qs.first()


def get_active_smart_table_surveys(*, branch_id: str, table_id: str | None = None):
    qs = (
        Survey.objects.filter(
            is_active=True,
            is_smart_table_active=True,
            branches__id=branch_id,
        )
        .prefetch_related('questions__options')
        .distinct()
        .order_by('sort_order', 'created_at')
    )
    if table_id:
        answered_survey_ids = TableSurveySessionState.objects.filter(
            is_active=True,
            source=SurveySource.SMART_TABLE,
            table_id=table_id,
            status=SurveySessionStatus.ANSWERED,
        ).values_list('survey_id', flat=True)
        qs = qs.exclude(id__in=answered_survey_ids)
    return qs


def get_active_smart_table_survey(
    *,
    branch_id: str,
    survey_id: str | None = None,
    table_id: str | None = None,
) -> Survey | None:
    qs = get_active_smart_table_surveys(branch_id=branch_id, table_id=table_id)
    if survey_id:
        return qs.filter(id=survey_id).first()
    return qs.first()


def resolve_open_display_prompt(*, terminal_code: str):
    return (
        TableSurveySessionState.objects.filter(
            is_active=True,
            source=SurveySource.POS_DISPLAY,
            status=SurveySessionStatus.OPENED,
            pos_terminal__code=terminal_code,
            survey__is_active=True,
            survey__is_customer_display_active=True,
        )
        .select_related('survey', 'sale', 'order', 'table')
        .prefetch_related('survey__questions__options')
        .order_by('-updated_at', '-created_at')
        .first()
    )


def build_display_prompt_payload(state: TableSurveySessionState) -> dict:
    payload = DisplaySurveyPromptSerializer(state).data
    payload['completion_signal'] = 'PAYMENT'
    return payload


def broadcast_display_survey_event(*, terminal_code: str, payload: dict):
    channel_layer = get_channel_layer()
    if not channel_layer:
        logger.warning('POS display survey event skipped: channel layer unavailable.')
        return

    async_to_sync(channel_layer.group_send)(
        f'pos_display_{terminal_code}',
        to_json_safe({
            'type': 'pos_display_survey_forward',
            'payload': payload,
        }),
    )


@transaction.atomic
def attach_sale_to_survey_records(*, order, sale):
    updated_state_ids = list(
        TableSurveySessionState.objects.filter(order=order, sale__isnull=True)
        .values_list('id', flat=True)
    )
    if not updated_state_ids:
        return

    TableSurveySessionState.objects.filter(id__in=updated_state_ids).update(
        sale=sale,
        updated_at=timezone.now(),
    )
    SurveyResponse.objects.filter(session_state_id__in=updated_state_ids, sale__isnull=True).update(
        sale=sale,
        updated_at=timezone.now(),
    )


@transaction.atomic
def reset_smart_table_survey_sessions_for_table(*, table_id):
    if not table_id:
        return 0
    return TableSurveySessionState.objects.filter(
        table_id=table_id,
        source=SurveySource.SMART_TABLE,
        is_active=True,
    ).update(
        is_active=False,
        updated_at=timezone.now(),
    )


@transaction.atomic
def close_customer_display_survey(*, state: TableSurveySessionState, completion_signal: str | None = None):
    if state.status == SurveySessionStatus.CLOSED:
        return state

    state.status = SurveySessionStatus.CLOSED
    state.completed_at = timezone.now()
    state.save(update_fields=['status', 'completed_at', 'updated_at'])

    if state.pos_terminal_id:
        payload = {
            'action': 'close',
            'session_id': str(state.id),
        }
        if completion_signal:
            payload['completion_signal'] = completion_signal
        broadcast_display_survey_event(
            terminal_code=state.pos_terminal.code,
            payload=payload,
        )

    return state


@transaction.atomic
def open_customer_display_survey(*, pos_terminal, survey_id: str | None = None, sale=None, order=None):
    if sale is None and order is None:
        raise ValidationError({'detail': 'Anket açmak için satış veya sipariş gerekli.'})

    target_order = sale.order if sale is not None else order
    branch = sale.branch if sale is not None else order.branch

    survey = get_active_customer_display_survey(
        branch_id=str(branch.id),
        survey_id=survey_id,
    )
    if survey is None:
        raise ValidationError({'detail': 'Aktif müşteri ekranı anketi bulunamadı.'})

    if sale is not None:
        session_key = build_survey_session_key(
            source=SurveySource.POS_DISPLAY,
            sale_id=str(sale.id),
        )
    else:
        session_key = build_survey_session_key(
            source=SurveySource.POS_DISPLAY,
            order_id=str(target_order.id),
        )

    state, _created = TableSurveySessionState.objects.select_for_update().get_or_create(
        session_key=session_key,
        survey=survey,
        source=SurveySource.POS_DISPLAY,
        defaults={
            'branch': branch,
            'table': target_order.table if target_order else None,
            'order': target_order,
            'sale': sale,
            'customer': target_order.customer if target_order else None,
            'staff_user': (sale.created_by if sale is not None else None) or (target_order.user if target_order else None),
            'pos_terminal': pos_terminal,
            'status': SurveySessionStatus.OPENED,
        },
    )

    if state.status == SurveySessionStatus.ANSWERED:
        raise ValidationError({'detail': 'Bu anket bu satış oturumunda zaten tamamlandı.'})

    state.branch = branch
    state.table = target_order.table if target_order else None
    state.order = target_order
    state.sale = sale
    state.customer = target_order.customer if target_order else None
    state.staff_user = (sale.created_by if sale is not None else None) or (target_order.user if target_order else None)
    state.pos_terminal = pos_terminal
    state.status = SurveySessionStatus.OPENED
    state.completed_at = None
    state.save(
        update_fields=[
            'branch',
            'table',
            'order',
            'sale',
            'customer',
            'staff_user',
            'pos_terminal',
            'status',
            'completed_at',
            'updated_at',
        ]
    )

    payload = build_display_prompt_payload(state)
    broadcast_display_survey_event(
        terminal_code=pos_terminal.code,
        payload={
            'action': 'open',
            'prompt': payload,
        },
    )
    return state


@transaction.atomic
def open_smart_table_survey(*, table, survey_id: str | None = None, order=None):
    if order is None:
        raise ValidationError({'detail': 'Smart Table anketi açmak için aktif sipariş gerekli.'})

    survey = get_active_smart_table_survey(
        branch_id=str(table.zone.branch_id),
        survey_id=survey_id,
        table_id=str(table.id),
    )
    if survey is None:
        raise ValidationError({'detail': 'Aktif Smart Table anketi bulunamadı.'})

    session_key = build_survey_session_key(
        source=SurveySource.SMART_TABLE,
        order_id=str(order.id),
    )
    state, _created = TableSurveySessionState.objects.select_for_update().get_or_create(
        session_key=session_key,
        survey=survey,
        source=SurveySource.SMART_TABLE,
        defaults={
            'branch_id': table.zone.branch_id,
            'table': table,
            'order': order,
            'customer': order.customer if order is not None else None,
            'status': SurveySessionStatus.OPENED,
        },
    )

    if state.status == SurveySessionStatus.ANSWERED and state.is_active:
        raise ValidationError({'detail': 'Bu anket bu masa oturumunda zaten tamamlandı.'})

    state.branch_id = table.zone.branch_id
    state.table = table
    state.order = order
    state.customer = order.customer if order is not None else None
    state.staff_user = None
    state.pos_terminal = None
    state.status = SurveySessionStatus.OPENED
    state.completed_at = None
    state.is_active = True
    state.save(
        update_fields=[
            'branch',
            'table',
            'order',
            'customer',
            'staff_user',
            'pos_terminal',
            'status',
            'completed_at',
            'is_active',
            'updated_at',
        ]
    )
    return state


def close_smart_table_survey(*, state: TableSurveySessionState):
    return close_customer_display_survey(state=state)


def _set_metric_value(normalized: dict, role: str, value: int):
    if role == SurveyQuestionRole.NPS:
        normalized['nps_score'] = value
    elif role == SurveyQuestionRole.FOOD:
        normalized['food_rating'] = value
    elif role == SurveyQuestionRole.SERVICE:
        normalized['service_rating'] = value
    elif role == SurveyQuestionRole.SPEED:
        normalized['speed_rating'] = value
    elif role == SurveyQuestionRole.CLEANLINESS:
        normalized['cleanliness_rating'] = value


@transaction.atomic
def submit_customer_display_survey(*, state: TableSurveySessionState, answers_payload: list[dict]):
    if state.status == SurveySessionStatus.ANSWERED and hasattr(state, 'response'):
        return state.response

    resolved_sale = state.sale
    if resolved_sale is None and state.order_id:
        resolved_sale = (
            Sale.objects.select_related('branch')
            .filter(order_id=state.order_id, is_deleted=False)
            .first()
        )
        if resolved_sale is not None:
            state.sale = resolved_sale
            state.save(update_fields=['sale', 'updated_at'])

    questions = list(
        state.survey.questions.filter(is_active=True)
        .prefetch_related('options')
        .order_by('sort_order', 'created_at')
    )
    question_map = {str(question.id): question for question in questions}
    payload_map = {str(item['question_id']): item for item in answers_payload}

    errors: dict[str, list[str]] = {}
    normalized: dict[str, int | None] = {
        'nps_score': None,
        'food_rating': None,
        'service_rating': None,
        'speed_rating': None,
        'cleanliness_rating': None,
    }
    prepared_answers: list[dict] = []
    needs_attention = False

    for question in questions:
        raw = payload_map.get(str(question.id))
        if raw is None:
            if question.is_required:
                errors[str(question.id)] = ['Bu soru zorunludur.']
            continue

        answer_data: dict = {'question': question}

        if question.answer_type == SurveyQuestionType.RATING:
            value = raw.get('rating_value')
            if value is None:
                errors[str(question.id)] = ['Puan seçmelisiniz.']
                continue
            if value < question.rating_min_value or value > question.rating_max_value:
                errors[str(question.id)] = ['Seçilen puan geçersiz.']
                continue
            answer_data['rating_value'] = value
            _set_metric_value(normalized, question.question_role, value)
            if question.question_role == SurveyQuestionRole.NPS:
                if 0 <= value <= 6:
                    needs_attention = True
            elif 1 <= value <= 2:
                needs_attention = True

        elif question.answer_type == SurveyQuestionType.YES_NO:
            value = raw.get('boolean_value')
            if value is None:
                errors[str(question.id)] = ['Bir seçim yapmalısınız.']
                continue
            answer_data['boolean_value'] = bool(value)
            if value is False:
                needs_attention = True

        elif question.answer_type == SurveyQuestionType.OPTION:
            option_id = raw.get('selected_option_id')
            if not option_id:
                errors[str(question.id)] = ['Bir seçenek seçmelisiniz.']
                continue
            option = next((item for item in question.options.all() if str(item.id) == str(option_id) and item.is_active), None)
            if option is None:
                errors[str(question.id)] = ['Seçilen seçenek geçersiz.']
                continue
            answer_data['selected_option'] = option
            answer_data['selected_option_label'] = option.label

        elif question.answer_type == SurveyQuestionType.SHORT_TEXT:
            text_value = (raw.get('text_value') or '').strip()
            if question.is_required and not text_value:
                errors[str(question.id)] = ['Bu alan boş bırakılamaz.']
                continue
            answer_data['text_value'] = text_value

        prepared_answers.append(answer_data)

    if errors:
        raise ValidationError({'answers': errors})

    response = SurveyResponse.objects.create(
        survey=state.survey,
        session_state=state,
        branch=state.branch,
        table=state.table,
        order=state.order,
        sale=resolved_sale,
        customer=state.customer,
        staff_user=state.staff_user,
        pos_terminal=state.pos_terminal,
        source=state.source,
        session_key=state.session_key,
        nps_score=normalized['nps_score'],
        food_rating=normalized['food_rating'],
        service_rating=normalized['service_rating'],
        speed_rating=normalized['speed_rating'],
        cleanliness_rating=normalized['cleanliness_rating'],
        needs_attention=needs_attention,
        attention_status=AttentionStatus.OPEN if needs_attention else AttentionStatus.RESOLVED,
    )

    SurveyAnswer.objects.bulk_create(
        [
            SurveyAnswer(
                response=response,
                question=item['question'],
                selected_option=item.get('selected_option'),
                selected_option_label=item.get('selected_option_label', ''),
                rating_value=item.get('rating_value'),
                boolean_value=item.get('boolean_value'),
                text_value=item.get('text_value', ''),
            )
            for item in prepared_answers
        ]
    )

    state.status = SurveySessionStatus.ANSWERED
    state.completed_at = timezone.now()
    state.save(update_fields=['status', 'completed_at', 'updated_at'])

    if state.pos_terminal_id:
        broadcast_display_survey_event(
            terminal_code=state.pos_terminal.code,
            payload={
                'action': 'close',
                'session_id': str(state.id),
                'completion_signal': 'PAYMENT',
            },
        )

    return response
