"""SaleService birim testleri."""
import pytest
from apps.sales.models import Sale
from apps.sales.services import SaleService, SaleValidationError


@pytest.mark.django_db
class TestSaleServiceSoftDelete:
    def test_satis_soft_delete_yapilir(self, sale):
        SaleService.soft_delete(sale.id)
        sale.refresh_from_db()
        assert sale.is_deleted is True
        assert sale.deleted_at is not None

    def test_zaten_silinmis_satis_tekrar_silinemez(self, sale):
        SaleService.soft_delete(sale.id)
        with pytest.raises(SaleValidationError, match='zaten silinmiş'):
            SaleService.soft_delete(sale.id)

    def test_olmayan_satis_hata_verir(self):
        import uuid
        with pytest.raises(SaleValidationError, match='bulunamadı'):
            SaleService.soft_delete(uuid.uuid4())


@pytest.mark.django_db
class TestSaleServiceBulkRestore:
    def test_silinmis_satislar_geri_yuklenir(self, sale, sale_with_discount):
        SaleService.soft_delete(sale.id)
        SaleService.soft_delete(sale_with_discount.id)

        count = SaleService.bulk_restore([sale.id, sale_with_discount.id])
        assert count == 2

        sale.refresh_from_db()
        sale_with_discount.refresh_from_db()
        assert sale.is_deleted is False
        assert sale.deleted_at is None
        assert sale_with_discount.is_deleted is False

    def test_bos_liste_hata_verir(self):
        with pytest.raises(SaleValidationError):
            SaleService.bulk_restore([])


@pytest.mark.django_db
class TestSaleServiceBulkDeletePermanent:
    def test_kalici_silme_yalnizca_is_deleted_olanlara_uygulanir(self, sale, sale_with_discount):
        SaleService.soft_delete(sale.id)
        # sale_with_discount silinmedi — kalıcı silmeden etkilenmemeli

        deleted_count = SaleService.bulk_delete_permanent([sale.id, sale_with_discount.id])
        assert deleted_count == 1
        assert not Sale.objects.filter(id=sale.id).exists()
        assert Sale.objects.filter(id=sale_with_discount.id).exists()

    def test_bos_liste_hata_verir(self):
        with pytest.raises(SaleValidationError):
            SaleService.bulk_delete_permanent([])


@pytest.mark.django_db
class TestSaleServiceReturn:
    def test_sale_return_creates_flow(self, sale, branch):
        """return_sale, ReturnDisposalFlow ve ReturnDisposalFlowItem oluşturmalı."""
        result = SaleService.return_sale(
            sale_id=sale.id,
            reason_code='CUSTOMER_REQUEST',
            reason_text='Müşteri memnuniyetsizliği',
        )
        result.refresh_from_db()
        from apps.inventory.models import ReturnDisposalFlow

        assert result.return_reason_code == 'CUSTOMER_REQUEST'
        assert result.return_reason_text == 'Müşteri memnuniyetsizliği'
        assert result.return_flow_id is not None

        flow = ReturnDisposalFlow.objects.get(id=result.return_flow_id)
        assert flow.flow_type == 'CUSTOMER_RETURN'
        assert flow.sale_id == sale.id

    def test_already_returned_sale_raises_error(self, sale):
        SaleService.return_sale(sale_id=sale.id, reason_code='TEST')
        with pytest.raises(SaleValidationError, match='zaten iade edilmiş'):
            SaleService.return_sale(sale_id=sale.id, reason_code='TEST2')

    def test_deleted_sale_cannot_be_returned(self, sale):
        SaleService.soft_delete(sale.id)
        with pytest.raises(SaleValidationError, match='Silinmiş'):
            SaleService.return_sale(sale_id=sale.id, reason_code='TEST')
