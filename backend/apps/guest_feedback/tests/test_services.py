import uuid
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from apps.branches.models import Branch, Table, TableStatus, Zone
from apps.customers.models import Customer
from apps.guest_feedback.models import (
    AttentionStatus,
    Survey,
    SurveyQuestion,
    SurveyQuestionRole,
    SurveyQuestionType,
    SurveySessionStatus,
    SurveySource,
)
from apps.guest_feedback.services import (
    broadcast_display_survey_event,
    close_customer_display_survey,
    get_active_smart_table_surveys,
    open_customer_display_survey,
    open_smart_table_survey,
    reset_smart_table_survey_sessions_for_table,
    submit_customer_display_survey,
)
from apps.orders.models import Order, OrderStatus
from apps.orders.services.sale_helper import create_sale_for_order
from apps.pos_display.models import PosTerminal
from apps.sales.models import PaymentMethod, Sale
from apps.users.models import User
from core.decimal_constants import ZERO_MONEY


@pytest.fixture
def branch(db):
    return Branch.objects.create(name="Anket Şubesi", code="ANK")


@pytest.fixture
def zone(db, branch):
    return Zone.objects.create(branch=branch, name="Salon")


@pytest.fixture
def table(db, zone):
    return Table.objects.create(zone=zone, name="Masa 1", table_number=1, status=TableStatus.OCCUPIED)


@pytest.fixture
def staff_user(db, branch):
    return User.objects.create_user(
        username="anket-personel",
        password="pw",
        email="anket-personel@test.com",
        branch=branch,
    )


@pytest.fixture
def customer(db):
    return Customer.objects.create(name="Test Misafir")


@pytest.fixture
def order(db, branch, table, staff_user, customer):
    return Order.objects.create(
        branch=branch,
        table=table,
        user=staff_user,
        customer=customer,
        status=OrderStatus.COMPLETED,
        total_amount=Decimal("250.00"),
        discount_amount=ZERO_MONEY,
    )


@pytest.fixture
def sale(db, branch, order, staff_user):
    return Sale.objects.create(
        order=order,
        branch=branch,
        created_by=staff_user,
        payment_method=PaymentMethod.CASH,
        total_amount=Decimal("250.00"),
        discount_amount=ZERO_MONEY,
    )


@pytest.fixture
def pos_terminal(db, branch):
    return PosTerminal.objects.create(
        branch=branch,
        name="Ana Kasa",
        code="kasa-01",
        is_active=True,
    )


@pytest.fixture
def survey(db, branch):
    survey = Survey.objects.create(
        title="Memnuniyet Anketi",
        is_active=True,
        is_customer_display_active=True,
    )
    survey.branches.add(branch)
    return survey


@pytest.fixture
def smart_table_survey(db, branch):
    survey = Survey.objects.create(
        title="Smart Table Anketi",
        is_active=True,
        is_smart_table_active=True,
    )
    survey.branches.add(branch)
    return survey


@pytest.fixture
def nps_question(db, survey):
    return SurveyQuestion.objects.create(
        survey=survey,
        text="Bizi tavsiye eder misiniz?",
        answer_type=SurveyQuestionType.RATING,
        question_role=SurveyQuestionRole.NPS,
        rating_min_value=0,
        rating_max_value=10,
        sort_order=0,
    )


@pytest.fixture
def service_question(db, survey):
    return SurveyQuestion.objects.create(
        survey=survey,
        text="Servis sizi memnun etti mi?",
        answer_type=SurveyQuestionType.YES_NO,
        question_role=SurveyQuestionRole.SERVICE,
        sort_order=1,
    )


@pytest.fixture
def smart_table_nps_question(db, smart_table_survey):
    return SurveyQuestion.objects.create(
        survey=smart_table_survey,
        text="Smart Table deneyiminizi puanlar mısınız?",
        answer_type=SurveyQuestionType.RATING,
        question_role=SurveyQuestionRole.NPS,
        rating_min_value=0,
        rating_max_value=10,
        sort_order=0,
    )


@pytest.mark.django_db
@patch("apps.guest_feedback.services.async_to_sync", side_effect=lambda fn: fn)
@patch("apps.guest_feedback.services.get_channel_layer")
def test_broadcast_display_survey_event_serializes_uuid_values(
    get_channel_layer_mock,
    _async_to_sync_mock,
):
    captured = {}

    class FakeChannelLayer:
        def group_send(self, group_name, message):
            captured["group_name"] = group_name
            captured["message"] = message

    get_channel_layer_mock.return_value = FakeChannelLayer()

    sale_id = uuid.uuid4()
    question_id = uuid.uuid4()
    broadcast_display_survey_event(
        terminal_code="kasa-01",
        payload={
            "action": "open",
            "prompt": {
                "sale": sale_id,
                "questions": [
                    {
                        "id": question_id,
                    }
                ],
            },
        },
    )

    assert captured["group_name"] == "pos_display_kasa-01"
    assert captured["message"]["payload"]["prompt"]["sale"] == str(sale_id)
    assert captured["message"]["payload"]["prompt"]["questions"][0]["id"] == str(question_id)


@pytest.mark.django_db
@patch("apps.guest_feedback.services.broadcast_display_survey_event")
def test_open_customer_display_survey_creates_open_session(
    broadcast_mock,
    sale,
    pos_terminal,
    survey,
    nps_question,
):
    state = open_customer_display_survey(sale=sale, pos_terminal=pos_terminal)

    assert state.survey_id == survey.id
    assert state.sale_id == sale.id
    assert state.order_id == sale.order_id
    assert state.table_id == sale.order.table_id
    assert state.customer_id == sale.order.customer_id
    assert state.staff_user_id == sale.created_by_id
    assert state.pos_terminal_id == pos_terminal.id
    assert state.status == SurveySessionStatus.OPENED

    broadcast_mock.assert_called_once()
    assert broadcast_mock.call_args.kwargs["terminal_code"] == pos_terminal.code
    assert broadcast_mock.call_args.kwargs["payload"]["action"] == "open"


@pytest.mark.django_db
@patch("apps.guest_feedback.services.broadcast_display_survey_event")
def test_submit_customer_display_survey_marks_negative_feedback_for_attention(
    broadcast_mock,
    sale,
    pos_terminal,
    survey,
    nps_question,
    service_question,
):
    state = open_customer_display_survey(sale=sale, pos_terminal=pos_terminal)
    broadcast_mock.reset_mock()

    response = submit_customer_display_survey(
        state=state,
        answers_payload=[
            {"question_id": str(nps_question.id), "rating_value": 5},
            {"question_id": str(service_question.id), "boolean_value": False},
        ],
    )

    assert response.needs_attention is True
    assert response.attention_status == AttentionStatus.OPEN
    assert response.nps_score == 5
    assert response.service_rating is None
    assert response.answers.count() == 2

    state.refresh_from_db()
    assert state.status == SurveySessionStatus.ANSWERED
    assert state.completed_at is not None

    broadcast_mock.assert_called_once()
    assert broadcast_mock.call_args.kwargs["payload"]["action"] == "close"


@pytest.mark.django_db
@patch("apps.guest_feedback.services.broadcast_display_survey_event")
def test_submit_customer_display_survey_is_idempotent_after_first_response(
    broadcast_mock,
    sale,
    pos_terminal,
    survey,
    nps_question,
):
    state = open_customer_display_survey(sale=sale, pos_terminal=pos_terminal)
    broadcast_mock.reset_mock()

    first_response = submit_customer_display_survey(
        state=state,
        answers_payload=[
            {"question_id": str(nps_question.id), "rating_value": 8},
        ],
    )
    second_response = submit_customer_display_survey(
        state=state,
        answers_payload=[
            {"question_id": str(nps_question.id), "rating_value": 2},
        ],
    )

    assert second_response.id == first_response.id
    assert first_response.answers.count() == 1
    assert broadcast_mock.call_count == 1


@pytest.mark.django_db
@patch("apps.guest_feedback.services.broadcast_display_survey_event")
def test_close_customer_display_survey_marks_session_closed(
    broadcast_mock,
    sale,
    pos_terminal,
    survey,
    nps_question,
):
    state = open_customer_display_survey(sale=sale, pos_terminal=pos_terminal)
    broadcast_mock.reset_mock()

    close_customer_display_survey(state=state)

    state.refresh_from_db()
    assert state.status == SurveySessionStatus.CLOSED
    assert state.completed_at is not None
    broadcast_mock.assert_called_once()
    assert broadcast_mock.call_args.kwargs["payload"]["action"] == "close"


@pytest.mark.django_db
@patch("apps.guest_feedback.services.broadcast_display_survey_event")
def test_payment_created_after_submit_backfills_sale_reference(
    broadcast_mock,
    branch,
    order,
    staff_user,
    pos_terminal,
    survey,
    nps_question,
):
    state = open_customer_display_survey(order=order, pos_terminal=pos_terminal)
    broadcast_mock.reset_mock()

    response = submit_customer_display_survey(
        state=state,
        answers_payload=[
            {"question_id": str(nps_question.id), "rating_value": 9},
        ],
    )

    assert response.sale is None

    sale = create_sale_for_order(
        order=order,
        payment_method=PaymentMethod.CASH,
        user=staff_user,
        pos_terminal=pos_terminal,
    )

    response.refresh_from_db()
    state.refresh_from_db()

    assert response.sale_id == sale.id
    assert state.sale_id == sale.id


@pytest.mark.django_db
@patch("apps.guest_feedback.services.broadcast_display_survey_event")
def test_new_table_order_can_open_new_survey_after_previous_table_order_answered(
    broadcast_mock,
    branch,
    table,
    staff_user,
    customer,
    order,
    pos_terminal,
    survey,
    nps_question,
):
    first_state = open_customer_display_survey(order=order, pos_terminal=pos_terminal)
    submit_customer_display_survey(
        state=first_state,
        answers_payload=[
            {"question_id": str(nps_question.id), "rating_value": 7},
        ],
    )

    new_order = Order.objects.create(
        branch=branch,
        table=table,
        user=staff_user,
        customer=customer,
        status=OrderStatus.COMPLETED,
        total_amount=Decimal("180.00"),
        discount_amount=ZERO_MONEY,
    )

    second_state = open_customer_display_survey(order=new_order, pos_terminal=pos_terminal)

    assert second_state.id != first_state.id
    assert second_state.order_id == new_order.id
    assert second_state.status == SurveySessionStatus.OPENED
    assert second_state.session_key != first_state.session_key


@pytest.mark.django_db
def test_open_smart_table_survey_creates_order_based_session(
    table,
    order,
    smart_table_survey,
    smart_table_nps_question,
):
    state = open_smart_table_survey(
        table=table,
        order=order,
        survey_id=str(smart_table_survey.id),
    )

    assert state.source == SurveySource.SMART_TABLE
    assert state.order_id == order.id
    assert state.table_id == table.id
    assert state.pos_terminal_id is None
    assert state.session_key == f"SMART_TABLE:order:{order.id}"
    assert state.status == SurveySessionStatus.OPENED


@pytest.mark.django_db
def test_answered_smart_table_survey_is_excluded_from_available_list(
    branch,
    table,
    order,
    smart_table_survey,
    smart_table_nps_question,
):
    state = open_smart_table_survey(
        table=table,
        order=order,
        survey_id=str(smart_table_survey.id),
    )
    submit_customer_display_survey(
        state=state,
        answers_payload=[
            {"question_id": str(smart_table_nps_question.id), "rating_value": 8},
        ],
    )

    surveys = list(
        get_active_smart_table_surveys(
            branch_id=str(branch.id),
            table_id=str(table.id),
        )
    )

    assert surveys == []


@pytest.mark.django_db
def test_reset_smart_table_survey_sessions_for_table_deactivates_states(
    table,
    order,
    smart_table_survey,
    smart_table_nps_question,
):
    state = open_smart_table_survey(
        table=table,
        order=order,
        survey_id=str(smart_table_survey.id),
    )
    submit_customer_display_survey(
        state=state,
        answers_payload=[
            {"question_id": str(smart_table_nps_question.id), "rating_value": 9},
        ],
    )

    updated_count = reset_smart_table_survey_sessions_for_table(table_id=table.id)

    state.refresh_from_db()
    assert updated_count == 1
    assert state.is_active is False


@pytest.mark.django_db
def test_smart_table_available_endpoint_marks_answered_state(
    table,
    order,
    staff_user,
    smart_table_survey,
    smart_table_nps_question,
):
    state = open_smart_table_survey(
        table=table,
        order=order,
        survey_id=str(smart_table_survey.id),
    )
    submit_customer_display_survey(
        state=state,
        answers_payload=[
            {"question_id": str(smart_table_nps_question.id), "rating_value": 10},
        ],
    )

    api_client = APIClient()
    api_client.force_authenticate(user=staff_user)
    response = api_client.get(
        reverse('guest-feedback-smart-table-available'),
        {
            'table_id': str(table.id),
            'order_id': str(order.id),
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.data['has_answered_survey'] is True
    assert response.data['surveys'] == []
