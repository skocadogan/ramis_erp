"""Ödenmez modül raporları."""
from django.utils.translation import gettext, gettext_lazy

from apps.credit.models import CreditAccount
from apps.credit.selectors import account_transactions_qs, annotate_account_balances
from core.decimal_constants import ZERO_MONEY
from apps.reporting.registry import report_registry
from apps.reporting.reports.base_report import BaseModuleReport


class CreditAccountStatementReport(BaseModuleReport):
    """Ödenmez hesap ekstresi (PDF / Excel)."""

    slug = "credit-account-statement"
    name = gettext_lazy("Ödenmez Hesap Ekstresi")
    description = gettext_lazy("Seçili ödenmez hesabının kredi yüklemeleri ve harcamaları.")
    category = "CREDIT"
    template_name = "reports/credit_account_statement.html"

    def get_context(self) -> dict:
        account_id = self.kwargs.get("account_id")
        if not account_id:
            raise ValueError(gettext("account_id parametresi zorunludur."))

        account = (
            annotate_account_balances(
                CreditAccount.objects.filter(pk=account_id, is_active=True).select_related(
                    "user", "branch"
                )
            ).first()
        )
        if not account:
            raise ValueError(gettext("Ödenmez hesabı bulunamadı."))

        credited = getattr(account, "total_credited", None) or ZERO_MONEY
        spent = getattr(account, "total_spent", None) or ZERO_MONEY
        balance = {
            "total_credited": credited,
            "total_spent": spent,
            "balance": credited - spent,
        }
        txs = list(account_transactions_qs(account_id))

        return {
            "report_name": self.name,
            "report_description": self.description,
            "account": account,
            "balance": balance,
            "transactions": txs,
            "filters": self.kwargs,
        }

    def get_excel_data(self, context: dict):
        txs = context.get("transactions", [])
        account = context.get("account")
        balance = context.get("balance", {})
        columns = [
            {"key": "created_at", "label": gettext("Tarih")},
            {"key": "type", "label": gettext("Tür")},
            {"key": "amount", "label": gettext("Tutar")},
            {"key": "order_number", "label": gettext("Sipariş No")},
            {"key": "notes", "label": gettext("Açıklama")},
        ]
        data = []
        for tx in txs:
            data.append(
                {
                    "created_at": tx.created_at.strftime("%Y-%m-%d %H:%M") if tx.created_at else "",
                    "type": tx.get_transaction_type_display(),
                    "amount": float(tx.amount),
                    "order_number": getattr(getattr(tx, "sale", None), "order", None)
                    and tx.sale.order.order_number
                    or "",
                    "notes": tx.notes or "",
                }
            )
        if account:
            data.insert(
                0,
                {
                    "created_at": "",
                    "type": gettext("Hesap"),
                    "amount": float(balance.get("balance", 0)),
                    "order_number": account.full_name,
                    "notes": gettext("Güncel bakiye"),
                },
            )
        return data, columns


report_registry.register(CreditAccountStatementReport)
