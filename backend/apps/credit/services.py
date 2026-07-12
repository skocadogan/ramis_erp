"""Ödenmez (müşteri kredisi) iş mantığı servisleri."""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils.translation import gettext as _

from core.decimal_constants import ZERO_MONEY

from .models import (
    CreditAccount,
    CreditPolicy,
    CreditTransaction,
    CreditTransactionType,
)
from .selectors import account_available_balance


class CreditError(Exception):
    """Ödenmez iş mantığı kural ihlali."""

    pass


class CreditService:
    # ──────────────────────────────────────────────
    # Hesap yaşam döngüsü
    # ──────────────────────────────────────────────
    @staticmethod
    def _get_for_update(account_id) -> CreditAccount:
        acc = (
            CreditAccount.objects.select_for_update()
            .filter(pk=account_id, is_active=True)
            .first()
        )
        if not acc:
            raise CreditError(_("Ödenmez hesabı bulunamadı."))
        return acc

    @staticmethod
    @transaction.atomic
    def create_account(
        *,
        first_name,
        last_name="",
        user=None,
        phone="",
        email="",
        address="",
        notes="",
        branch_id=None,
        is_global=False,
        credit_policy=CreditPolicy.BLOCK,
        created_by=None,
    ) -> CreditAccount:
        first_name = (first_name or "").strip()
        if not first_name:
            raise CreditError(_("Ad alanı zorunludur."))

        if user is not None:
            existing = CreditAccount.objects.filter(user=user, is_active=True).first()
            if existing:
                raise CreditError(_("Bu kullanıcı için zaten aktif bir ödenmez hesabı var."))

        if not is_global and not branch_id:
            raise CreditError(_("Şubeye özel hesap için şube seçilmelidir."))

        acc = CreditAccount.objects.create(
            user=user,
            first_name=first_name,
            last_name=(last_name or "").strip(),
            phone=phone or "",
            email=email or "",
            address=address or "",
            notes=notes or "",
            branch_id=None if is_global else branch_id,
            is_global=bool(is_global),
            credit_policy=credit_policy or CreditPolicy.BLOCK,
            created_by=created_by if created_by and getattr(created_by, "is_authenticated", False) else None,
        )
        return acc

    @staticmethod
    @transaction.atomic
    def update_account(account_id, **fields) -> CreditAccount:
        acc = CreditService._get_for_update(account_id)

        editable = (
            "first_name",
            "last_name",
            "phone",
            "email",
            "address",
            "notes",
            "credit_policy",
        )
        for key in editable:
            if key in fields and fields[key] is not None:
                setattr(acc, key, fields[key])

        if "user" in fields:
            new_user = fields["user"]
            if new_user is not None:
                existing = (
                    CreditAccount.objects.filter(user=new_user, is_active=True)
                    .exclude(pk=account_id)
                    .exists()
                )
                if existing:
                    raise CreditError(_("Bu kullanıcı için zaten aktif bir ödenmez hesabı var."))
            acc.user = new_user

        if "is_global" in fields and fields["is_global"] is not None:
            acc.is_global = bool(fields["is_global"])
        if "branch_id" in fields:
            acc.branch_id = fields["branch_id"]

        if acc.is_global:
            acc.branch_id = None
        elif not acc.branch_id:
            raise CreditError(_("Şubeye özel hesap için şube seçilmelidir."))

        if not (acc.first_name or "").strip():
            raise CreditError(_("Ad alanı zorunludur."))

        acc.save()
        return acc

    @staticmethod
    @transaction.atomic
    def delete_account(account_id) -> None:
        acc = CreditService._get_for_update(account_id)
        # Merkezi soft-delete (BaseModel.delete → is_active=False)
        acc.delete()

    # ──────────────────────────────────────────────
    # Bakiye işlemleri
    # ──────────────────────────────────────────────
    @staticmethod
    def available_balance(account: CreditAccount) -> Decimal:
        return account_available_balance(account)

    @staticmethod
    @transaction.atomic
    def topup(account_id, amount, *, user=None, branch_id=None, notes="") -> CreditTransaction:
        acc = CreditService._get_for_update(account_id)
        amount = Decimal(str(amount))
        if amount <= ZERO_MONEY:
            raise CreditError(_("Yükleme tutarı sıfırdan büyük olmalıdır."))

        return CreditTransaction.objects.create(
            account=acc,
            transaction_type=CreditTransactionType.TOPUP,
            amount=amount,
            branch_id=branch_id or acc.branch_id,
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
            notes=notes or "",
        )

    @staticmethod
    def can_use_in_branch(account: CreditAccount, branch_id) -> bool:
        if account.is_global:
            return True
        if branch_id is None:
            return True
        return str(account.branch_id) == str(branch_id)

    @staticmethod
    def validate_charge(account: CreditAccount, amount, branch_id) -> dict:
        """
        Harcamayı doğrular. Sonuç:
        ``{"ok": bool, "warn": bool, "available": Decimal, "reason": str|None}``

        - BLOCK: yetersiz bakiyede ``ok=False``.
        - WARN_ALLOW: yetersiz bakiyede ``ok=True, warn=True``.
        - OPEN_TAB: her zaman ``ok=True``.
        """
        amount = Decimal(str(amount))
        if amount <= ZERO_MONEY:
            return {"ok": False, "warn": False, "available": ZERO_MONEY, "reason": _("Geçersiz tutar.")}

        if not CreditService.can_use_in_branch(account, branch_id):
            return {
                "ok": False,
                "warn": False,
                "available": ZERO_MONEY,
                "reason": _("Bu hesap bu şubede kullanılamaz."),
            }

        available = CreditService.available_balance(account)
        sufficient = available >= amount

        if account.credit_policy == CreditPolicy.OPEN_TAB:
            return {"ok": True, "warn": not sufficient, "available": available, "reason": None}

        if account.credit_policy == CreditPolicy.WARN_ALLOW:
            return {"ok": True, "warn": not sufficient, "available": available, "reason": None}

        # BLOCK
        if sufficient:
            return {"ok": True, "warn": False, "available": available, "reason": None}
        return {
            "ok": False,
            "warn": False,
            "available": available,
            "reason": _("Yetersiz ödenmez bakiyesi. Kalan: %(bal)s") % {"bal": available},
        }

    @staticmethod
    def apply_charges_for_sale(pay_list, sale, *, user=None, branch_id=None):
        """
        Satış ödeme satırlarındaki CREDIT kalemleri için harcama kaydı oluşturur.
        Çağrı, satış oluşturma atomik bloğu içinde yapılmalıdır.
        """
        from apps.sales.models import PaymentMethod

        credit_lines = [p for p in pay_list if p.get("method") == PaymentMethod.CREDIT]
        if not credit_lines:
            return []

        account_ids = []
        for p in credit_lines:
            acc_id = p.get("credit_account_id")
            if not acc_id:
                raise CreditError(_("Ödenmez ödemesi için credit_account_id zorunludur."))
            account_ids.append(str(acc_id))

        # select_for_update + Sum annotate (GROUP BY) aynı sorguda desteklenmez.
        accounts = {
            str(a.id): a
            for a in CreditAccount.objects.select_for_update().filter(
                pk__in=account_ids, is_active=True
            )
        }

        txs = []
        for p in credit_lines:
            acc_id = str(p["credit_account_id"])
            acc = accounts.get(acc_id)
            if not acc:
                raise CreditError(_("Ödenmez hesabı bulunamadı."))

            check = CreditService.validate_charge(acc, p["amount"], branch_id)
            if not check["ok"]:
                raise CreditError(check["reason"] or _("Ödenmez ile ödeme yapılamadı."))

            txs.append(
                CreditTransaction.objects.create(
                    account=acc,
                    transaction_type=CreditTransactionType.CHARGE,
                    amount=p["amount"],
                    branch_id=branch_id or acc.branch_id,
                    sale=sale,
                    created_by=user if user and getattr(user, "is_authenticated", False) else None,
                    notes=p.get("notes", "") or "",
                )
            )
        return txs
