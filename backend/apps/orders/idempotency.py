import hashlib
import json
import logging

from django.db import IntegrityError
from django.utils.translation import gettext as _
from rest_framework import status
from rest_framework.response import Response

from .models import PosIdempotencyRecord, PosIdempotencyScope

logger = logging.getLogger(__name__)

MAX_KEY_LEN = 128


def extract_idempotency_key(request) -> str | None:
    key = request.headers.get('Idempotency-Key') or request.META.get('HTTP_IDEMPOTENCY_KEY')
    if not key:
        return None
    key = str(key).strip()
    if not key:
        return None
    return key[:MAX_KEY_LEN]


def hash_request_payload(data) -> str:
    canonical = json.dumps(data, sort_keys=True, default=str, separators=(',', ':'))
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


def _conflict_response(code: str, detail: str) -> Response:
    return Response({'detail': detail, 'code': code, 'error': detail}, status=status.HTTP_409_CONFLICT)


def _audit_idempotency_event(request, *, action: str, key: str, scope: str, code: str) -> None:
    from apps.audit.services import record_audit
    from apps.branches.models import Branch

    branch = None
    branch_id = getattr(request, 'branch_id', None)
    if branch_id is None and hasattr(request, 'data'):
        branch_id = request.data.get('branch_id')
    if branch_id:
        try:
            branch = Branch.objects.get(pk=branch_id)
        except Branch.DoesNotExist:
            branch = None

    record_audit(
        action=action,
        target_type='orders.pos_idempotency',
        target_id=key,
        actor=getattr(request, 'user', None),
        branch=branch,
        metadata={'scope': scope, 'code': code},
    )


def _lookup_record(key: str) -> PosIdempotencyRecord | None:
    return PosIdempotencyRecord.objects.filter(idempotency_key=key, is_active=True).first()


def _validate_existing(existing: PosIdempotencyRecord, scope: str, req_hash: str, request=None) -> Response | None:
    if existing.scope != scope:
        resp = _conflict_response(
            'IDEMPOTENCY_SCOPE_MISMATCH',
            _('Idempotency anahtarı farklı bir işlem kapsamında kayıtlı.'),
        )
        if request is not None:
            _audit_idempotency_event(
                request,
                action='pos.idempotency.scope_mismatch',
                key=existing.idempotency_key,
                scope=scope,
                code='IDEMPOTENCY_SCOPE_MISMATCH',
            )
        return resp
    if existing.request_hash != req_hash:
        resp = _conflict_response(
            'IDEMPOTENCY_CONFLICT',
            _('Aynı idempotency anahtarı farklı istek gövdesi ile kullanıldı.'),
        )
        if request is not None:
            _audit_idempotency_event(
                request,
                action='pos.idempotency.conflict',
                key=existing.idempotency_key,
                scope=scope,
                code='IDEMPOTENCY_CONFLICT',
            )
        return resp
    return None


def cached_response(existing: PosIdempotencyRecord) -> Response:
    raw = existing.response_body
    if isinstance(raw, dict):
        body = {**raw}
        if body.get('status') == 'created':
            body['status'] = 'already_processed'
    else:
        body = raw
    return Response(body, status=existing.response_status)


def _json_safe(data) -> dict:
    return json.loads(json.dumps(data, default=str))


def save_idempotency_record(
    *,
    key: str,
    scope: str,
    req_hash: str,
    response_status: int,
    response_body: dict,
    branch_id,
    actor,
    resource_id: str = '',
) -> PosIdempotencyRecord | None:
    try:
        return PosIdempotencyRecord.objects.create(
            idempotency_key=key,
            scope=scope,
            request_hash=req_hash,
            response_status=response_status,
            response_body=_json_safe(response_body),
            branch_id=branch_id,
            actor=actor if actor and getattr(actor, 'is_authenticated', False) else None,
            resource_id=resource_id or '',
        )
    except IntegrityError:
        existing = _lookup_record(key)
        if existing:
            return existing
        logger.exception('PosIdempotencyRecord race without existing row: %s', key)
        raise


def idempotent_execute(
    request,
    *,
    scope: str,
    request_payload,
    branch_id,
    perform,
) -> Response:
    """
    Idempotency-Key varsa önbellekten döner veya işlemi bir kez çalıştırıp kaydeder.
    perform() -> (response_body: dict, http_status: int, resource_id: str)
    """
    key = extract_idempotency_key(request)
    req_hash = hash_request_payload(request_payload)

    if key:
        existing = _lookup_record(key)
        if existing:
            conflict = _validate_existing(existing, scope, req_hash, request)
            if conflict:
                return conflict
            return cached_response(existing)

    body, http_status, resource_id = perform()

    if key:
        envelope = body if isinstance(body, dict) else {'data': body}
        if 'idempotency_key' not in envelope:
            envelope = {**envelope, 'idempotency_key': key}
        safe_body = _json_safe(envelope)

        try:
            save_idempotency_record(
                key=key,
                scope=scope,
                req_hash=req_hash,
                response_status=http_status,
                response_body=safe_body,
                branch_id=branch_id,
                actor=request.user,
                resource_id=resource_id,
            )
        except IntegrityError:
            existing = _lookup_record(key)
            if existing:
                conflict = _validate_existing(existing, scope, req_hash, request)
                if conflict:
                    return conflict
                return cached_response(existing)
        body = safe_body

    return Response(body, status=http_status)


def build_order_create_envelope(order_data, *, key: str | None, replay: bool) -> dict:
    return {
        'status': 'already_processed' if replay else 'created',
        'idempotency_key': key,
        'order': order_data,
        'sale_id': None,
    }


def build_order_complete_envelope(order_data, sale_id, *, key: str | None, replay: bool) -> dict:
    return {
        'status': 'already_processed' if replay else 'created',
        'idempotency_key': key,
        'order': order_data,
        'sale_id': sale_id,
    }


def build_complete_table_envelope(
    completed_count: int,
    order_ids: list[str],
    *,
    key: str | None,
    replay: bool,
) -> dict:
    return {
        'status': 'already_processed' if replay else 'created',
        'idempotency_key': key,
        'completed_count': completed_count,
        'order_ids': order_ids,
    }


SCOPE_CREATE = PosIdempotencyScope.ORDER_CREATE
SCOPE_COMPLETE = PosIdempotencyScope.ORDER_COMPLETE
SCOPE_COMPLETE_TABLE = PosIdempotencyScope.ORDER_COMPLETE_TABLE


def respond_if_table_already_settled(request, table_id, idem_key, hash_payload):
    """
    complete_table tekrarı: ödeme alınmış, masada aktif sipariş kalmamış ve masa boşsa 200 döner.
    """
    from apps.branches.models import Table, TableStatus
    from .models import Order, OrderStatus

    from apps.branches.virtual_table_ids import (
        is_virtual_table_id,
        order_filter_q_for_table_scope,
    )

    from .order_scope import OPEN_ORDER_STATUSES

    active_exists = Order.objects.filter(
        order_filter_q_for_table_scope(table_id),
        status__in=OPEN_ORDER_STATUSES,
    ).exists()
    if active_exists:
        return None

    if idem_key:
        existing = _lookup_record(idem_key)
        if existing:
            conflict = _validate_existing(existing, SCOPE_COMPLETE_TABLE, hash_payload, request)
            if conflict:
                return conflict
            return cached_response(existing)

    if is_virtual_table_id(table_id):
        return None

    try:
        table = Table.objects.get(pk=table_id)
    except (Table.DoesNotExist, ValueError):
        return None

    if table.status in (TableStatus.FREE, TableStatus.CLEANING):
        body = build_complete_table_envelope(0, [], key=idem_key, replay=True)
        return Response(body, status=status.HTTP_200_OK)
    return None
