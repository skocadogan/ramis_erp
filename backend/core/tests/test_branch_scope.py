"""
TEST-3: core/branch_scope.py birim testleri.

Fonksiyonlar:
  - accessible_branch_id_strings
  - branch_filter_qs
  - user_may_access_branch
  - user_accessible_warehouse_id_strings
  - filter_queryset_by_accessible_warehouses
  - filter_warehouse_transfer_queryset
"""
import pytest
from unittest.mock import MagicMock, PropertyMock
from django.contrib.auth import get_user_model

from apps.branches.models import Branch
from apps.sales.models import Sale, PaymentMethod
from apps.orders.models import Order, OrderStatus
from core.branch_scope import (
    accessible_branch_id_strings,
    branch_filter_qs,
    resolve_dashboard_branch_ids,
    resolve_websocket_branch_subscription,
    user_may_access_branch,
)

User = get_user_model()


# ------------------------------------------------------------------ #
# Yardımcı: mock request                                              #
# ------------------------------------------------------------------ #

def _mock_request(user, branch_id_param=None):
    request = MagicMock()
    request.user = user
    request.query_params = {'branch_id': branch_id_param} if branch_id_param else {}
    return request


# ------------------------------------------------------------------ #
# accessible_branch_id_strings                                        #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestAccessibleBranchIdStrings:
    def test_kimlik_dogrulanmamis_bos_frozenset_doner(self):
        user = MagicMock()
        user.is_authenticated = False
        result = accessible_branch_id_strings(user)
        assert result == frozenset()

    def test_superuser_none_doner(self, db):
        user = User.objects.create_superuser(
            username='suptest', password='pw', email='sup@test.com'
        )
        result = accessible_branch_id_strings(user)
        assert result is None

    def test_normal_kullanici_kendi_subesini_doner(self, db):
        branch = Branch.objects.create(name='Şube A', code='A')
        user = User.objects.create_user(
            username='userA', password='pw', email='userA@test.com', branch=branch
        )
        result = accessible_branch_id_strings(user)
        assert str(branch.id) in result

    def test_sube_atanmamis_kullanici_bos_doner(self, db):
        user = User.objects.create_user(
            username='nobranchuser', password='pw', email='nobranch@test.com'
        )
        result = accessible_branch_id_strings(user)
        assert len(result) == 0

    def test_soft_delete_edilmis_atama_kapsama_girmez(self, db):
        from apps.branches.models import WaiterBranchAssignment

        branch = Branch.objects.create(name='WBA Şube', code='WBA')
        user = User.objects.create_user(
            username='waiter_soft', password='pw', email='waiter_soft@test.com'
        )
        assignment = WaiterBranchAssignment.objects.create(user=user, branch=branch)
        assert str(branch.id) in accessible_branch_id_strings(user)

        assignment.is_active = False
        assignment.save(update_fields=['is_active', 'updated_at'])
        if hasattr(user, '_accessible_branch_ids_cache'):
            delattr(user, '_accessible_branch_ids_cache')

        result = accessible_branch_id_strings(user)
        assert str(branch.id) not in result


# ------------------------------------------------------------------ #
# user_may_access_branch                                              #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestUserMayAccessBranch:
    def test_kimlik_dogrulanmamis_false_doner(self):
        user = MagicMock()
        user.is_authenticated = False
        assert user_may_access_branch(user, 'some-uuid') is False

    def test_superuser_her_subeye_erisebilir(self, db):
        user = User.objects.create_superuser(
            username='suptest2', password='pw', email='sup2@test.com'
        )
        branch = Branch.objects.create(name='Herhangi Şube', code='H1')
        assert user_may_access_branch(user, str(branch.id)) is True

    def test_kullanici_kendi_subesine_erisebilir(self, db):
        branch = Branch.objects.create(name='Kullanıcı Şubesi', code='KS')
        user = User.objects.create_user(
            username='ksuser', password='pw', email='ks@test.com', branch=branch
        )
        assert user_may_access_branch(user, str(branch.id)) is True

    def test_kullanici_baska_subeye_erisilemez(self, db):
        branch_a = Branch.objects.create(name='Şube A', code='A2')
        branch_b = Branch.objects.create(name='Şube B', code='B2')
        user = User.objects.create_user(
            username='ausrb', password='pw', email='ausrb@test.com', branch=branch_a
        )
        assert user_may_access_branch(user, str(branch_b.id)) is False

    def test_none_branch_id_false_doner(self, db):
        user = User.objects.create_user(
            username='anyusr', password='pw', email='any@test.com'
        )
        assert user_may_access_branch(user, None) is False

    def test_bos_branch_id_false_doner(self, db):
        user = User.objects.create_user(
            username='anyusr2', password='pw', email='any2@test.com'
        )
        assert user_may_access_branch(user, '') is False


# ------------------------------------------------------------------ #
# branch_filter_qs                                                    #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestBranchFilterQs:
    def test_kimlik_dogrulanmamis_bos_queryset_doner(self, db):
        branch = Branch.objects.create(name='Filtre Şubesi', code='FS')
        order1 = Order.objects.create(branch=branch, status=OrderStatus.PENDING, total_amount=0)

        user = MagicMock()
        user.is_authenticated = False
        request = _mock_request(user)
        qs = Order.objects.all()
        result = branch_filter_qs(qs, request)
        assert result.count() == 0

    def test_superuser_tum_kayitlari_doner(self, db):
        branch_a = Branch.objects.create(name='Süper A', code='SA')
        branch_b = Branch.objects.create(name='Süper B', code='SB')
        Order.objects.create(branch=branch_a, status=OrderStatus.PENDING, total_amount=0)
        Order.objects.create(branch=branch_b, status=OrderStatus.PENDING, total_amount=0)

        superuser = User.objects.create_superuser(
            username='superfilter', password='pw', email='superfilter@test.com'
        )
        request = _mock_request(superuser)
        qs = Order.objects.all()
        result = branch_filter_qs(qs, request)
        assert result.count() == 2

    def test_normal_kullanici_kendi_subesini_gorur(self, db):
        branch_a = Branch.objects.create(name='Normal A', code='NA')
        branch_b = Branch.objects.create(name='Normal B', code='NB')
        order_a = Order.objects.create(branch=branch_a, status=OrderStatus.PENDING, total_amount=0)
        Order.objects.create(branch=branch_b, status=OrderStatus.PENDING, total_amount=0)

        user = User.objects.create_user(
            username='normalfilter', password='pw', email='normalfilter@test.com', branch=branch_a
        )
        request = _mock_request(user)
        qs = Order.objects.all()
        result = branch_filter_qs(qs, request)
        assert result.count() == 1
        assert result.first() == order_a

    def test_query_param_branch_id_ile_daraltma(self, db):
        branch_a = Branch.objects.create(name='Param A', code='PA')
        branch_b = Branch.objects.create(name='Param B', code='PB')
        order_a = Order.objects.create(branch=branch_a, status=OrderStatus.PENDING, total_amount=0)
        Order.objects.create(branch=branch_b, status=OrderStatus.PENDING, total_amount=0)

        superuser = User.objects.create_superuser(
            username='superparamtest', password='pw', email='superparam@test.com'
        )
        request = _mock_request(superuser, branch_id_param=str(branch_a.id))
        qs = Order.objects.all()
        result = branch_filter_qs(qs, request)
        assert result.count() == 1
        assert result.first() == order_a

    def test_kullanici_baska_subeyi_query_param_ile_talep_ederse_bos_doner(self, db):
        branch_a = Branch.objects.create(name='Param C', code='PC')
        branch_b = Branch.objects.create(name='Param D', code='PD')
        Order.objects.create(branch=branch_b, status=OrderStatus.PENDING, total_amount=0)

        user = User.objects.create_user(
            username='paramuser', password='pw', email='paramuser@test.com', branch=branch_a
        )
        # branch_a'daki kullanıcı branch_b'yi talep ediyor → boş döner
        request = _mock_request(user, branch_id_param=str(branch_b.id))
        qs = Order.objects.all()
        result = branch_filter_qs(qs, request)
        assert result.count() == 0


# ------------------------------------------------------------------ #
# KDS Branch Scope Güvenlik Testi (P1-1 regresyon)                   #
# ------------------------------------------------------------------ #

@pytest.mark.django_db
class TestKdsBranchScopeSecurity:
    """
    Rapor P1-1: kds_active endpoint'i branch_filter_qs uyguluyor mu?
    branch_filter_qs fonksiyonu üzerinden doğrulama yapılır.
    """

    def test_kds_kullanicisi_baska_subenin_siparisini_gorememeli(self, db):
        branch_mine = Branch.objects.create(name='Benim Şubem', code='BM')
        branch_other = Branch.objects.create(name='Diğer Şube', code='DO')

        order_mine = Order.objects.create(
            branch=branch_mine, status=OrderStatus.PENDING, total_amount=0
        )
        order_other = Order.objects.create(
            branch=branch_other, status=OrderStatus.PENDING, total_amount=0
        )

        kds_user = User.objects.create_user(
            username='kdssecurity', password='pw', email='kdssec@test.com', branch=branch_mine
        )
        request = _mock_request(kds_user)
        qs = Order.objects.all()
        filtered = branch_filter_qs(qs, request)

        ids = list(filtered.values_list('id', flat=True))
        assert order_mine.id in ids
        assert order_other.id not in ids


# ------------------------------------------------------------------ #
# resolve_dashboard_branch_ids                                       #
# ------------------------------------------------------------------ #


@pytest.mark.django_db
class TestResolveDashboardBranchIds:
    def test_superuser_without_param_tum_subeler(self, db):
        user = User.objects.create_superuser(
            username="dashsup", password="pw", email="dashsup@test.com"
        )
        req = _mock_request(user)
        ids, err = resolve_dashboard_branch_ids(req)
        assert err is None
        assert ids is None

    def test_superuser_with_param_tek_sube(self, db):
        branch = Branch.objects.create(name="D1", code="D1")
        user = User.objects.create_superuser(
            username="dashsup2", password="pw", email="dashsup2@test.com"
        )
        req = _mock_request(user, branch_id_param=str(branch.id))
        ids, err = resolve_dashboard_branch_ids(req)
        assert err is None
        assert ids == [str(branch.id)]

    def test_normal_kullanici_param_yoksa_tek_subesi(self, db):
        b1 = Branch.objects.create(name="E1", code="E1")
        Branch.objects.create(name="E2", code="E2")
        user = User.objects.create_user(
            username="dashusr", password="pw", email="dashusr@test.com", branch=b1
        )
        req = _mock_request(user)
        ids, err = resolve_dashboard_branch_ids(req)
        assert err is None
        assert ids == [str(b1.id)]

    def test_normal_kullanici_yanlis_subede_forbidden(self, db):
        b1 = Branch.objects.create(name="F1", code="F1")
        b2 = Branch.objects.create(name="F2", code="F2")
        user = User.objects.create_user(
            username="dashusr2", password="pw", email="dashusr2@test.com", branch=b1
        )
        req = _mock_request(user, branch_id_param=str(b2.id))
        ids, err = resolve_dashboard_branch_ids(req)
        assert err == "forbidden"
        assert ids is None


# ------------------------------------------------------------------ #
# resolve_websocket_branch_subscription                              #
# ------------------------------------------------------------------ #


@pytest.mark.django_db
class TestResolveWebsocketBranchSubscription:
    def test_superuser_query_yok_global(self, db):
        user = User.objects.create_superuser(
            username="wssup", password="pw", email="wssup@test.com"
        )
        bid, mode = resolve_websocket_branch_subscription(user, None)
        assert mode == "global"
        assert bid is None

    def test_normal_kullanici_tek_sube_otomatik(self, db):
        branch = Branch.objects.create(name="WS1", code="WS1")
        user = User.objects.create_user(
            username="wsusr", password="pw", email="wsusr@test.com", branch=branch
        )
        bid, mode = resolve_websocket_branch_subscription(user, None)
        assert mode == "branch"
        assert bid == str(branch.id)

    def test_query_ile_baska_subeye_erisim_red(self, db):
        b1 = Branch.objects.create(name="WS4", code="WS4")
        b2 = Branch.objects.create(name="WS5", code="WS5")
        user = User.objects.create_user(
            username="wsusr3", password="pw", email="wsusr3@test.com", branch=b1
        )
        bid, mode = resolve_websocket_branch_subscription(user, str(b2.id))
        assert mode == "deny"
