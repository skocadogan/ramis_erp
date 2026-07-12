"""Ödenmez servis birim testleri."""
import pytest
from decimal import Decimal

from apps.credit.models import CreditPolicy, CreditTransactionType
from apps.credit.services import CreditError, CreditService
from apps.sales.models import PaymentMethod
from apps.sales.payment_utils import aggregation_bucket


@pytest.mark.django_db
class TestCreditService:
    def test_topup_ve_bakiye(self, credit_account):
        CreditService.topup(credit_account.id, Decimal("500.00"))
        bal = CreditService.available_balance(credit_account)
        assert bal == Decimal("500.0000")

    def test_block_policy_yetersiz_bakiye(self, credit_account):
        check = CreditService.validate_charge(credit_account, Decimal("10.00"), credit_account.branch_id)
        assert check["ok"] is False

    def test_warn_allow_policy_yetersiz_bakiyede_izin(self, credit_account):
        credit_account.credit_policy = CreditPolicy.WARN_ALLOW
        credit_account.save(update_fields=["credit_policy"])
        check = CreditService.validate_charge(credit_account, Decimal("10.00"), credit_account.branch_id)
        assert check["ok"] is True
        assert check["warn"] is True

    def test_open_tab_her_zaman_izin(self, credit_account):
        credit_account.credit_policy = CreditPolicy.OPEN_TAB
        credit_account.save(update_fields=["credit_policy"])
        check = CreditService.validate_charge(credit_account, Decimal("9999.00"), credit_account.branch_id)
        assert check["ok"] is True

    def test_apply_charges_for_sale(self, credit_account, sale):
        CreditService.topup(credit_account.id, Decimal("200.00"))
        txs = CreditService.apply_charges_for_sale(
            [{"method": PaymentMethod.CREDIT, "amount": Decimal("100.00"), "credit_account_id": str(credit_account.id)}],
            sale,
            branch_id=credit_account.branch_id,
        )
        assert len(txs) == 1
        assert txs[0].transaction_type == CreditTransactionType.CHARGE
        assert CreditService.available_balance(credit_account) == Decimal("100.0000")

    def test_apply_charges_credit_account_id_zorunlu(self, credit_account, sale):
        with pytest.raises(CreditError, match="credit_account_id"):
            CreditService.apply_charges_for_sale(
                [{"method": PaymentMethod.CREDIT, "amount": Decimal("10.00")}],
                sale,
            )

    def test_kullanici_basi_tek_hesap(self, branch, django_user_model):
        user = django_user_model.objects.create_user(username="credit_user", password="x")
        CreditService.create_account(first_name="A", branch_id=branch.id, user=user)
        with pytest.raises(CreditError, match="zaten aktif"):
            CreditService.create_account(first_name="B", branch_id=branch.id, user=user)


class TestPaymentAggregation:
    def test_credit_other_kovasina_katilir(self):
        assert aggregation_bucket(PaymentMethod.CREDIT) == PaymentMethod.OTHER
