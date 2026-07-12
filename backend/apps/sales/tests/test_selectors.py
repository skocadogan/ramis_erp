"""SaleSelector testleri — aggregate ve queryset filtreleme."""
import pytest
from decimal import Decimal

from apps.sales.models import Sale, PaymentMethod
from apps.sales.selectors import aggregate_sale_money_totals, get_sales_queryset


@pytest.mark.django_db
class TestAggregateSaleMoneyTotals:
    def test_toplam_degerler_dogru_hesaplanir(self, sale, sale_with_discount):
        qs = Sale.objects.all()
        result = aggregate_sale_money_totals(qs)

        # sale: net=200, disc=0, gross=200
        # sale_with_discount: net=150, disc=50, gross=200
        assert result['net_total'] == pytest.approx(350.0)
        assert result['discount_total'] == pytest.approx(50.0)
        assert result['gross_total'] == pytest.approx(400.0)

    def test_bos_queryset_sifir_doner(self, db):
        qs = Sale.objects.none()
        result = aggregate_sale_money_totals(qs)
        assert result['net_total'] == 0.0
        assert result['discount_total'] == 0.0
        assert result['gross_total'] == 0.0


@pytest.mark.django_db
class TestGetSalesQueryset:
    def test_varsayilan_olarak_silinmemis_getirir(self, sale, sale_with_discount):
        qs = get_sales_queryset()
        assert sale in qs
        assert sale_with_discount in qs

    def test_silinmis_satislar_filtrelenir(self, sale, sale_with_discount):
        from apps.sales.services import SaleService
        SaleService.soft_delete(sale.id)

        qs = get_sales_queryset()
        assert sale not in qs
        assert sale_with_discount in qs

    def test_deleted_true_ile_silinen_getirilir(self, sale, sale_with_discount):
        from apps.sales.services import SaleService
        SaleService.soft_delete(sale.id)

        qs = get_sales_queryset(deleted=True)
        assert sale in qs
        assert sale_with_discount not in qs

    def test_sube_filtresi(self, sale, sale_with_discount, other_branch):
        """sale ikisi de aynı şubede; other_branch filtrelenince boş gelmeli."""
        qs = get_sales_queryset(branch_id=str(other_branch.id))
        assert sale not in qs
        assert sale_with_discount not in qs

    def test_odeme_yontemi_filtresi(self, sale, sale_with_discount):
        qs = get_sales_queryset(payment_method='CASH')
        assert sale in qs
        assert sale_with_discount not in qs

    def test_indirim_filtresi(self, sale, sale_with_discount):
        qs = get_sales_queryset(discount_only=True)
        assert sale not in qs
        assert sale_with_discount in qs

    def test_tarih_aralik_filtresi(self, sale):
        from django.utils import timezone
        today = timezone.now().date().isoformat()
        qs = get_sales_queryset(start_date=today, end_date=today)
        assert sale in qs

    def test_gelecek_tarih_filtresi_bos_doner(self, sale):
        qs = get_sales_queryset(start_date='2099-01-01')
        assert sale not in qs
