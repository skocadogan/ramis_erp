from decimal import Decimal, ROUND_HALF_UP
import logging
from django.db import IntegrityError
from django.utils.translation import gettext as _
from rest_framework.exceptions import APIException
from core.decimal_constants import ZERO_MONEY
from ..models import OrderItem, OrderStatus

MONEY_QUANT = Decimal('0.0001')

logger = logging.getLogger(__name__)

class OrderValidationError(APIException):
    """Sipariş iş mantığı kural ihlali.

    DRF tarafından otomatik olarak 400 Bad Request olarak döndürülür.
    Sipariş oluşturma sırasında ürünün kalmaması, yetersiz porsiyon gibi
    durumlar için kullanılır; bu sayede 500 yerine anlamlı 4xx kodu dönülür.
    """
    status_code = 400
    default_detail = _("Sipariş doğrulama hatası.")
    default_code = "order_validation_error"

def resolve_pos_terminal(branch_id, pos_terminal_id):
    """İstenmişse şube + aktif POS terminali doğrular."""
    if not pos_terminal_id:
        return None
    from apps.pos_display.services import get_terminal_by_id_for_branch

    t = get_terminal_by_id_for_branch(branch_id, pos_terminal_id)
    if t is None:
        raise OrderValidationError(_("Geçersiz veya pasif POS terminali."))
    return t

def build_pay_list(payment_method, payments, expected_total):
    """Ödeme yöntemi veya payments[] dizisinden doğrulanmış ödeme satırları üretir."""
    from apps.sales.models import PaymentMethod

    valid_methods = [m.value for m in PaymentMethod]
    expected_total = Decimal(str(expected_total))

    if payments is None:
        m = str(payment_method).upper()
        if m not in valid_methods:
            raise OrderValidationError(
                _("Geçersiz ödeme yöntemi: %(method)s. Geçerli: %(valid)s")
                % {"method": m, "valid": valid_methods}
            )
        pay_list = [{'method': m, 'amount': expected_total, 'notes': ''}]
    else:
        pay_list = []
        for p in payments:
            m = p.get('method') or p.get('payment_method')
            amt = p.get('amount')
            if m is None or amt is None:
                raise OrderValidationError(_("payments öğelerinde method ve amount zorunludur."))
            m = str(m).upper()
            if m not in valid_methods:
                raise OrderValidationError(
                    _("Geçersiz ödeme yöntemi: %(method)s. Geçerli: %(valid)s")
                    % {"method": m, "valid": valid_methods}
                )
            pay_list.append({
                'method': m,
                'amount': Decimal(str(amt)),
                'notes': p.get('notes', '') or '',
                'credit_account_id': p.get('credit_account_id'),
            })

    pay_sum = sum((p['amount'] for p in pay_list), ZERO_MONEY)
    if pay_sum != expected_total:
        raise OrderValidationError(
            _(
                "Ödeme tutarları toplamı sipariş tutarına eşit olmalı. "
                "Beklenen: %(expected)s, girilen: %(actual)s"
            )
            % {"expected": expected_total, "actual": pay_sum}
        )
    return pay_list


def distribute_table_payments(active_orders, table_pay_list):
    """Masa geneli bölünmüş ödemeyi sipariş tutarlarına orantılı dağıtır."""
    grand_total = sum((o.total_amount for o in active_orders), ZERO_MONEY)
    if grand_total <= ZERO_MONEY:
        raise OrderValidationError(_("Masada ödenecek tutar bulunamadı."))

    allocations = {str(order.id): [] for order in active_orders}

    for pay in table_pay_list:
        method = pay['method']
        total_amt = pay['amount']
        allocated = ZERO_MONEY
        for idx, order in enumerate(active_orders):
            if idx == len(active_orders) - 1:
                share = total_amt - allocated
            else:
                share = (total_amt * order.total_amount / grand_total).quantize(
                    MONEY_QUANT, ROUND_HALF_UP
                )
                allocated += share
            if share > ZERO_MONEY:
                line = {
                    'method': method,
                    'amount': share,
                    'notes': pay.get('notes', '') or '',
                }
                if pay.get('credit_account_id'):
                    line['credit_account_id'] = pay['credit_account_id']
                allocations[str(order.id)].append(line)

    for order in active_orders:
        order_pays = allocations[str(order.id)]
        order_sum = sum((p['amount'] for p in order_pays), ZERO_MONEY)
        if order_sum != order.total_amount:
            raise OrderValidationError(
                _(
                    "Sipariş %(order)s için dağıtılan ödeme tutarı eşleşmedi. "
                    "Beklenen: %(expected)s, dağıtılan: %(actual)s"
                )
                % {"order": order.order_number or order.id, "expected": order.total_amount, "actual": order_sum}
            )

    return allocations


def create_sale_for_order(
    order,
    payment_method,
    user,
    branch_id_override=None,
    payments=None,
    shift=None,
    pos_terminal=None,
):
    """Tek sipariş için satış + ödeme kalemleri."""
    from apps.sales.models import Sale, SalePayment

    pay_list = build_pay_list(payment_method, payments, order.total_amount)

    existing = Sale.objects.filter(order=order).first()
    if existing is not None:
        from apps.guest_feedback.services import (
            attach_sale_to_survey_records,
            reset_smart_table_survey_sessions_for_table,
        )

        attach_sale_to_survey_records(order=order, sale=existing)
        reset_smart_table_survey_sessions_for_table(table_id=order.table_id)
        return existing

    primary_method = pay_list[0]['method']
    is_split = len(pay_list) > 1

    note_text = ""
    if order.customer:
        note_text = _("%(customer_name)s adına fiş düzenlendi.") % {"customer_name": order.customer.name}

    try:
        sale = Sale.objects.create(
            order=order,
            branch_id=branch_id_override or order.branch_id,
            shift=shift,
            pos_terminal=pos_terminal,
            created_by=user if user and user.is_authenticated else None,
            payment_method=primary_method,
            is_split_payment=is_split,
            total_amount=order.total_amount,
            discount_amount=order.discount_amount,
            discount_type=order.discount_type,
            discount_applied_by=order.discount_by,
            notes=note_text,
        )
    except IntegrityError:
        existing = Sale.objects.filter(order=order).first()
        if existing is not None:
            from apps.guest_feedback.services import (
                attach_sale_to_survey_records,
                reset_smart_table_survey_sessions_for_table,
            )

            attach_sale_to_survey_records(order=order, sale=existing)
            reset_smart_table_survey_sessions_for_table(table_id=order.table_id)
            return existing
        raise
    payment_rows = []
    for p in pay_list:
        payment_rows.append(
            SalePayment(
                sale=sale,
                payment_method=p['method'],
                amount=p['amount'],
                notes=p.get('notes', '') or '',
            )
        )
    if payment_rows:
        SalePayment.objects.bulk_create(payment_rows)

    from apps.guest_feedback.services import (
        attach_sale_to_survey_records,
        reset_smart_table_survey_sessions_for_table,
    )

    attach_sale_to_survey_records(order=order, sale=sale)
    reset_smart_table_survey_sessions_for_table(table_id=order.table_id)

    from apps.sales.models import PaymentMethod
    from apps.credit.services import CreditError, CreditService

    credit_lines = [p for p in pay_list if p['method'] == PaymentMethod.CREDIT]
    if credit_lines:
        branch_id = branch_id_override or order.branch_id
        try:
            CreditService.apply_charges_for_sale(
                pay_list,
                sale,
                user=user,
                branch_id=str(branch_id) if branch_id else None,
            )
        except CreditError as e:
            raise OrderValidationError(str(e))

        from apps.credit.models import CreditAccount

        acc_ids = list(
            dict.fromkeys(
                str(p['credit_account_id'])
                for p in credit_lines
                if p.get('credit_account_id')
            )
        )
        names = []
        if acc_ids:
            name_map = {
                str(a.id): a.full_name
                for a in CreditAccount.objects.filter(pk__in=acc_ids).only(
                    'id', 'first_name', 'last_name'
                )
            }
            names = [name_map[aid] for aid in acc_ids if aid in name_map]
        if names:
            credit_note = _("%(name)s hesabından karşılandı.") % {"name": ", ".join(dict.fromkeys(names))}
            if sale.notes:
                sale.notes = f"{sale.notes} | {credit_note}"
            else:
                sale.notes = credit_note
            sale.save(update_fields=['notes'])

    # 4. YN ÖKC / Mali Entegrasyon Tetiklemesi
    if pos_terminal and pos_terminal.fiscal_type != 'NONE':
        from apps.sales.fiscal.factory import FiscalDriverFactory
        driver = FiscalDriverFactory.get_driver(pos_terminal)
        if driver:
            try:
                fiscal_res = driver.send_invoice_or_receipt(sale)
                if fiscal_res.get('status') == 'success':
                    sale.fiscal_printed = True
                    sale.okc_serial_number = fiscal_res.get('okc_serial_number')
                    sale.okc_receipt_number = fiscal_res.get('okc_receipt_number')
                    sale.okc_z_number = fiscal_res.get('okc_z_number')
                    sale.okc_receipt_datetime = fiscal_res.get('okc_receipt_datetime')
                    sale.fiscal_qr_code = fiscal_res.get('fiscal_qr_code')
                    sale.fiscal_raw_response = fiscal_res.get('raw_response') or {}
                    
                    sale.save(update_fields=[
                        'fiscal_printed',
                        'okc_serial_number',
                        'okc_receipt_number',
                        'okc_z_number',
                        'okc_receipt_datetime',
                        'fiscal_qr_code',
                        'fiscal_raw_response',
                        'updated_at'
                    ])
                else:
                    error_msg = fiscal_res.get('error_message') or _("Mali cihazdan hata alındı.")
                    raise OrderValidationError(error_msg)
            except Exception as e:
                logger.error(f"YN OKC Entegrasyon Hatasi: {str(e)}", exc_info=True)
                if isinstance(e, OrderValidationError):
                    raise
                raise OrderValidationError(
                    _("Mali entegrasyon işlemi başarısız oldu: %(error)s") % {"error": str(e)}
                )

    # Dashboard cache'ini temizle — sıcak veri tazeleme
    from apps.dashboard.selectors import invalidate_dashboard_cache
    invalidate_dashboard_cache(branch_id=sale.branch_id)

    return sale
