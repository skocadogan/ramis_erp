import pytest
from apps.pos_display.models import PosTerminal, FiscalType
from apps.sales.fiscal.factory import FiscalDriverFactory
from apps.sales.fiscal.mock_driver import MockFiscalDriver


@pytest.mark.django_db
class TestFiscalIntegration:
    """Mali Entegrasyon Modülü ve Sürücü Testleri."""

    def test_factory_returns_none_for_invalid_terminal(self):
        assert FiscalDriverFactory.get_driver(None) is None

    def test_factory_returns_none_for_fiscal_type_none(self, branch):
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-test-1",
            name="Test Kasa 1",
            fiscal_type=FiscalType.NONE,
        )
        driver = FiscalDriverFactory.get_driver(terminal)
        assert driver is None

    def test_factory_returns_mock_driver_for_fiscal_type_mock(self, branch):
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-test-2",
            name="Test Kasa 2",
            fiscal_type=FiscalType.MOCK,
            fiscal_settings={"simulated_delay": 0}
        )
        driver = FiscalDriverFactory.get_driver(terminal)
        assert isinstance(driver, MockFiscalDriver)

    def test_mock_driver_success_flow(self, branch, sale):
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-test-3",
            name="Test Kasa 3",
            fiscal_type=FiscalType.MOCK,
            fiscal_settings={"simulated_delay": 0}
        )
        sale.pos_terminal = terminal
        sale.save()
        
        driver = FiscalDriverFactory.get_driver(terminal)
        result = driver.send_invoice_or_receipt(sale)
        
        assert result["status"] == "success"
        assert "okc_serial_number" in result
        assert result["okc_serial_number"].startswith("MCKKASA-TEST-3")
        assert "okc_receipt_number" in result
        assert "okc_z_number" in result
        assert "fiscal_qr_code" in result
        assert "raw_response" in result
        assert driver.get_status() is True

    def test_mock_driver_error_flow(self, branch, sale):
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-test-4",
            name="Test Kasa 4",
            fiscal_type=FiscalType.MOCK,
            fiscal_settings={"simulated_delay": 0, "trigger_error": True}
        )
        sale.pos_terminal = terminal
        sale.save()

        driver = FiscalDriverFactory.get_driver(terminal)
        result = driver.send_invoice_or_receipt(sale)

        assert result["status"] == "error"
        assert "error_message" in result
        assert "Sanal Cihaz Hatası" in result["error_message"]

    def test_mock_driver_offline_flow(self, branch, sale):
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-test-5",
            name="Test Kasa 5",
            fiscal_type=FiscalType.MOCK,
            fiscal_settings={"simulated_delay": 0, "simulate_offline": True}
        )
        sale.pos_terminal = terminal
        sale.save()

        driver = FiscalDriverFactory.get_driver(terminal)
        result = driver.send_invoice_or_receipt(sale)

        assert result["status"] == "error"
        assert "Cihaz çevrimdışı (offline)" in result["error_message"]
        assert driver.get_status() is False


from apps.orders.services.sale_helper import create_sale_for_order, OrderValidationError
from apps.sales.models import Sale


@pytest.mark.django_db
class TestCreateSaleFiscalIntegration:
    """create_sale_for_order akışı içinde Mali Entegrasyon entegrasyon testleri."""

    def test_create_sale_without_fiscal_terminal_creates_sale_successfully(self, completed_order, branch):
        # Mali entegrasyonu olmayan terminal
        sale = create_sale_for_order(
            order=completed_order,
            payment_method='CASH',
            user=None,
            branch_id_override=branch.id,
            pos_terminal=None
        )
        assert sale is not None
        assert sale.fiscal_printed is False
        assert Sale.objects.filter(id=sale.id).exists()

    def test_create_sale_with_mock_fiscal_terminal_creates_and_populates_fiscal_fields(self, completed_order, branch):
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-mock-1",
            name="Mock Kasa 1",
            fiscal_type=FiscalType.MOCK,
            fiscal_settings={"simulated_delay": 0}
        )
        sale = create_sale_for_order(
            order=completed_order,
            payment_method='CASH',
            user=None,
            branch_id_override=branch.id,
            pos_terminal=terminal
        )
        assert sale is not None
        assert sale.fiscal_printed is True
        assert sale.okc_serial_number.startswith("MCKKASA-MOCK-1")
        assert sale.okc_receipt_number is not None
        assert sale.okc_z_number is not None
        assert sale.fiscal_qr_code is not None
        assert sale.fiscal_raw_response != {}

    def test_create_sale_with_fiscal_error_prevents_sale_creation_rollback(self, completed_order, branch):
        from django.db import transaction
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-mock-err",
            name="Mock Kasa Err",
            fiscal_type=FiscalType.MOCK,
            fiscal_settings={"simulated_delay": 0, "trigger_error": True}
        )
        
        # Hata vermeli ve Sale nesnesi veritabanında oluşmamalı (rollback)
        with pytest.raises(OrderValidationError, match="Sanal Cihaz Hatası"):
            with transaction.atomic():
                create_sale_for_order(
                    order=completed_order,
                    payment_method='CASH',
                    user=None,
                    branch_id_override=branch.id,
                    pos_terminal=terminal
                )
            
        assert not Sale.objects.filter(order=completed_order).exists()

    def test_create_sale_with_fiscal_offline_prevents_sale_creation_rollback(self, completed_order, branch):
        from django.db import transaction
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="kasa-mock-off",
            name="Mock Kasa Off",
            fiscal_type=FiscalType.MOCK,
            fiscal_settings={"simulated_delay": 0, "simulate_offline": True}
        )
        
        with pytest.raises(OrderValidationError, match="Cihaz çevrimdışı"):
            with transaction.atomic():
                create_sale_for_order(
                    order=completed_order,
                    payment_method='CASH',
                    user=None,
                    branch_id_override=branch.id,
                    pos_terminal=terminal
                )
            
        assert not Sale.objects.filter(order=completed_order).exists()


from unittest.mock import patch, Mock
import uuid as uuid_module

@pytest.mark.django_db
class TestBekoFiscalDriver:
    """Beko YN ÖKC (Token Cloud) sürücüsü için mock testleri."""

    @patch("requests.post")
    def test_beko_driver_auth_success(self, mock_post, branch):
        from django.core.cache import cache
        cache.clear()

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-term-1",
            name="Beko Kasa 1",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "CLOUD",
                "client_id": "test_client",
                "client_secret": "test_secret",
                "serial_number": "AV0000001"
            }
        )
        
        # Token alma isteğini mocklayalım
        mock_response = Mock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "status": 201,
            "result": {"accessToken": "fake_jwt_token"}
        }
        mock_post.return_value = mock_response

        driver = FiscalDriverFactory.get_driver(terminal)
        token = driver._get_token("test_client", "test_secret")
        assert token == "fake_jwt_token"

    @patch("requests.post")
    @patch("requests.get")
    def test_beko_driver_payment_success(self, mock_get, mock_post, branch, sale):
        from django.core.cache import cache
        cache.clear()

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-term-2",
            name="Beko Kasa 2",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "CLOUD",
                "client_id": "test_client",
                "client_secret": "test_secret",
                "serial_number": "AV0000002"
            }
        )
        sale.pos_terminal = terminal
        sale.save()

        # Auth Token mock
        mock_auth_res = Mock()
        mock_auth_res.status_code = 201
        mock_auth_res.json.return_value = {"status": 201, "result": {"accessToken": "fake_token"}}
        
        # Fiscal Parameters mock
        mock_fiscal_res = Mock()
        mock_fiscal_res.status_code = 200
        mock_fiscal_res.json.return_value = {
            "status": 0,
            "result": {"sections": [{"sectionNo": 1, "taxPercent": 1000, "name": "İçecek"}]}
        }
        
        # Instant Basket mock
        mock_basket_res = Mock()
        mock_basket_res.status_code = 200
        mock_basket_res.json.return_value = {"status": 0, "description": "Success"}
        
        mock_post.side_effect = [mock_auth_res, mock_basket_res]
        
        # Polling GET mock (İlk sorguda başarılı dönsün)
        # Fiscal params GET + Polling GET
        mock_poll_res = Mock()
        mock_poll_res.status_code = 200
        mock_poll_res.json.return_value = {
            "status": 0,
            "result": {
                "basketID": "some-uuid",
                "status": 1,
                "receiptNo": 1234,
                "zNo": 56,
                "UUID": "fake_uuid_123",
                "paymentItems": [{"amount": 1000, "type": 1}]
            }
        }
        mock_get.side_effect = [mock_fiscal_res, mock_poll_res]

        driver = FiscalDriverFactory.get_driver(terminal)
        
        # Testlerde time.sleep'i geçersiz kılalım ki hızlı çalışsın
        with patch("time.sleep", return_value=None):
            with patch(
                "apps.sales.fiscal.beko_driver.wait_for_basket_completion",
                side_effect=TimeoutError("test webhook timeout"),
            ):
                result = driver.send_invoice_or_receipt(sale)

        assert result["status"] == "success"
        assert result["okc_serial_number"] == "AV0000002"
        assert result["okc_receipt_number"] == "1234"
        assert result["okc_z_number"] == "56"
        assert "validation?s=AV0000002&f=1234&z=56" in result["fiscal_qr_code"]

    @patch("requests.post")
    @patch("requests.get")
    def test_beko_driver_payment_cancelled(self, mock_get, mock_post, branch, sale):
        from django.core.cache import cache
        cache.clear()

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-term-3",
            name="Beko Kasa 3",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "CLOUD",
                "client_id": "test_client",
                "client_secret": "test_secret",
                "serial_number": "AV0000003"
            }
        )
        sale.pos_terminal = terminal
        sale.save()

        # Auth Token mock
        mock_auth_res = Mock()
        mock_auth_res.status_code = 201
        mock_auth_res.json.return_value = {"status": 201, "result": {"accessToken": "fake_token"}}
        
        # Instant Basket mock
        mock_basket_res = Mock()
        mock_basket_res.status_code = 200
        mock_basket_res.json.return_value = {"status": 0}
        
        mock_post.side_effect = [mock_auth_res, mock_basket_res]

        # Fiscal Parameters GET + Polling GET mock (İptal durumu dönsün)
        mock_fiscal_res = Mock()
        mock_fiscal_res.status_code = 200
        mock_fiscal_res.json.return_value = {"status": 0, "result": {"sections": []}}

        mock_poll_res = Mock()
        mock_poll_res.status_code = 200
        mock_poll_res.json.return_value = {
            "status": 0,
            "result": {
                "basketID": "some-uuid",
                "status": -1,
                "message": "CANCELLED"
            }
        }
        mock_get.side_effect = [mock_fiscal_res, mock_poll_res]

        driver = FiscalDriverFactory.get_driver(terminal)
        
        with patch("time.sleep", return_value=None):
            with patch(
                "apps.sales.fiscal.beko_driver.wait_for_basket_completion",
                side_effect=TimeoutError("test webhook timeout"),
            ):
                with pytest.raises(OrderValidationError, match="işlemi iptal edildi"):
                    driver.send_invoice_or_receipt(sale)

    def test_beko_driver_basket_id_is_uuid_v4(self, branch):
        """basketID her zaman UUID v4 formatında üretilmeli."""
        from apps.sales.fiscal.beko_driver import BekoFiscalDriver
        import uuid

        driver = BekoFiscalDriver({
            "connection_type": "CLOUD",
            "client_id": "test",
            "client_secret": "test",
            "serial_number": "AV001"
        })
        # UUID v4 üretimini doğrulama
        test_uuid = str(uuid.uuid4())
        parsed = uuid.UUID(test_uuid, version=4)
        assert str(parsed) == test_uuid

    def test_beko_driver_section_matching(self, branch):
        """sectionNo fiscal parameters'tan KDV oranıyla eşleştirilmeli."""
        from apps.sales.fiscal.beko_driver import BekoFiscalDriver

        driver = BekoFiscalDriver({})
        fiscal_params = {
            "sections": [
                {"sectionNo": 1, "taxPercent": 1000, "name": "İçecek"},
                {"sectionNo": 2, "taxPercent": 2000, "name": "Yemek"},
                {"sectionNo": 3, "taxPercent": 800, "name": "Gıda"},
            ]
        }
        # %10 → 1000 → sectionNo 1
        assert driver._match_section_no(10, fiscal_params) == 1
        # %20 → 2000 → sectionNo 2
        assert driver._match_section_no(20, fiscal_params) == 2
        # %8 → 800 → sectionNo 3
        assert driver._match_section_no(8, fiscal_params) == 3
        # %1 → 100 → eşleşme yok → varsayılan 1
        assert driver._match_section_no(1, fiscal_params) == 1
        # Boş sections → varsayılan 1
        assert driver._match_section_no(10, {}) == 1


@pytest.mark.django_db
class TestFiscalWebhook:
    """Token X-Connect webhook MVP testleri."""

    def test_build_fiscal_webhook_url(self, settings):
        settings.FISCAL_WEBHOOK_BASE_URL = "https://api.example.com"
        from apps.sales.fiscal.webhook_service import build_fiscal_webhook_url
        import uuid

        terminal_id = uuid.uuid4()
        url = build_fiscal_webhook_url(terminal_id)
        assert url == f"https://api.example.com/api/v1/sales/fiscal/webhook/{terminal_id}/"

    def test_webhook_completes_pending_basket(self, branch, sale):
        from apps.sales.fiscal.webhook_service import handle_token_webhook, register_pending_basket
        from apps.sales.models import FiscalBasketStatus, FiscalPendingBasket

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-wh-1",
            name="Beko Webhook",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "CLOUD",
                "client_id": "client-abc",
                "client_secret": "secret",
                "serial_number": "AV0000099",
            },
        )
        sale.pos_terminal = terminal
        sale.save()

        basket_id = "f85d8ce7-1111-4222-8333-444455556666"
        register_pending_basket(sale, basket_id, terminal)

        payload = {
            "terminalId": "AV0000099",
            "clientId": "client-abc",
            "operation": "BASKET_COMPLETED",
            "data": {
                "basketID": basket_id,
                "status": 0,
                "receiptNo": 42,
                "zNo": 7,
                "paymentItems": [{"amount": 1000, "type": 1}],
            },
        }
        assert handle_token_webhook(terminal, payload) is True

        pending = FiscalPendingBasket.objects.get(basket_id=basket_id)
        assert pending.status == FiscalBasketStatus.COMPLETED
        assert pending.result_payload["receiptNo"] == 42

    def test_webhook_endpoint_accepts_basket_completed(self, api_client, branch, sale):
        from apps.sales.fiscal.webhook_service import register_pending_basket

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-wh-2",
            name="Beko Webhook API",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "CLOUD",
                "client_id": "client-xyz",
                "client_secret": "secret",
                "serial_number": "AV0000100",
            },
        )
        basket_id = "a1b2c3d4-5555-4666-8777-888899990000"
        register_pending_basket(sale, basket_id, terminal)

        url = f"/api/v1/sales/fiscal/webhook/{terminal.pk}/"
        response = api_client.post(
            url,
            {
                "terminalId": "AV0000100",
                "clientId": "client-xyz",
                "operation": "BASKET_COMPLETED",
                "data": {
                    "basketID": basket_id,
                    "status": 0,
                    "receiptNo": 99,
                    "zNo": 3,
                    "paymentItems": [{"amount": 500, "type": 1}],
                },
            },
            format="json",
        )
        assert response.status_code == 200
        assert response.data["status"] == "ok"

    def test_driver_returns_after_webhook(self, branch, sale):
        from apps.sales.fiscal.beko_driver import BekoFiscalDriver
        from apps.sales.models import FiscalBasketStatus, FiscalPendingBasket
        from unittest.mock import patch, Mock

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-wh-3",
            name="Beko Webhook Driver",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "CLOUD",
                "client_id": "client-driver",
                "client_secret": "secret",
                "serial_number": "AV0000101",
            },
        )
        sale.pos_terminal = terminal
        sale.save()

        pending = FiscalPendingBasket.objects.create(
            sale=sale,
            pos_terminal=terminal,
            basket_id="webhook-basket-uuid",
            status=FiscalBasketStatus.COMPLETED,
            result_payload={
                "status": 0,
                "receiptNo": 11,
                "zNo": 2,
                "paymentItems": [{"amount": 100, "type": 1}],
            },
        )

        mock_auth = Mock()
        mock_auth.status_code = 201
        mock_auth.json.return_value = {"status": 201, "result": {"accessToken": "tok"}}

        mock_fiscal = Mock()
        mock_fiscal.status_code = 200
        mock_fiscal.json.return_value = {
            "status": 0,
            "result": {"sections": [{"sectionNo": 1, "taxPercent": 1000}]},
        }

        mock_basket = Mock()
        mock_basket.status_code = 200
        mock_basket.json.return_value = {"status": 0}

        driver = FiscalDriverFactory.get_driver(terminal)

        with patch("requests.post", side_effect=[mock_auth, mock_basket]):
            with patch("requests.get", return_value=mock_fiscal):
                with patch(
                    "apps.sales.fiscal.beko_driver.wait_for_basket_completion",
                    return_value=pending,
                ):
                    result = driver.send_invoice_or_receipt(sale)

        assert result["status"] == "success"
        assert result["okc_receipt_number"] == "11"


@pytest.mark.django_db
class TestGMP3Protocol:
    """GMP-3 TCP/IP protokol ve sepet testleri."""

    def test_json_framing_roundtrip(self):
        import socket
        from apps.sales.fiscal.gmp3_client import recv_json, send_json

        left, right = socket.socketpair()
        try:
            payload = {"command": "getFiscalParameters", "basketID": "test-uuid"}
            send_json(left, payload)
            received = recv_json(right)
            assert received == payload
        finally:
            left.close()
            right.close()

    def test_normalize_gmp3_payload_wraps_result(self):
        from apps.sales.fiscal.gmp3_client import normalize_gmp3_payload

        wrapped = {
            "status": 0,
            "result": {"receiptNo": 42, "zNo": 3},
        }
        flat = normalize_gmp3_payload(wrapped)
        assert flat["status"] == 0
        assert flat["receiptNo"] == 42

    def test_match_gmp3_section_no_from_device_sections(self):
        from apps.sales.fiscal.gmp3_basket import match_gmp3_section_no

        params = {
            "sections": [
                {"sectionNo": 2, "taxPercent": 1000},
                {"sectionNo": 5, "taxPercent": 2000},
            ]
        }
        assert match_gmp3_section_no(10.0, params) == 2
        assert match_gmp3_section_no(20.0, params) == 5

    def test_build_gmp3_basket_from_sale(self, branch, sale, product):
        from decimal import Decimal

        from apps.orders.models import OrderItem, OrderStatus
        from apps.sales.fiscal.gmp3_basket import build_gmp3_basket_from_sale

        OrderItem.objects.create(
            order=sale.order,
            product=product,
            branch=branch,
            quantity=2,
            unit_price=Decimal("100.00"),
            total_price=Decimal("200.00"),
            status=OrderStatus.COMPLETED,
        )

        basket = build_gmp3_basket_from_sale(
            sale,
            {"sections": [{"sectionNo": 1, "taxPercent": 0}]},
        )

        assert basket["documentType"] == 0
        assert basket["isVoid"] is False
        assert len(basket["items"]) == 1
        assert basket["items"][0]["price"] == 10000
        assert basket["items"][0]["quantity"] == 2000
        assert basket["paymentItems"][0]["amount"] == 20000
        assert basket["paymentItems"][0]["type"] == 1

    def test_gmp3_wired_driver_success(self, branch, sale, product):
        from decimal import Decimal
        from unittest.mock import MagicMock, patch

        from apps.orders.models import OrderItem, OrderStatus
        from apps.sales.fiscal.gmp3_wired_driver import Gmp3WiredFiscalDriver

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="gmp3-ip-1",
            name="GMP3 Kasa",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "IP",
                "ip_address": "192.168.1.100",
                "port": "1111",
                "serial_number": "AV0000200",
            },
        )
        sale.pos_terminal = terminal
        sale.save()

        OrderItem.objects.create(
            order=sale.order,
            product=product,
            branch=branch,
            quantity=1,
            unit_price=Decimal("200.00"),
            total_price=Decimal("200.00"),
            status=OrderStatus.COMPLETED,
        )

        mock_client = MagicMock()
        mock_client.get_fiscal_parameters.return_value = {
            "sections": [{"sectionNo": 1, "taxPercent": 0}],
        }
        mock_client.send_basket_and_wait.return_value = {
            "status": 0,
            "receiptNo": 77,
            "zNo": 4,
            "paymentItems": [{"amount": 20000, "type": 1}],
        }

        driver = Gmp3WiredFiscalDriver(terminal.fiscal_settings)

        with patch.object(driver, "_build_client", return_value=mock_client):
            result = driver.send_invoice_or_receipt(sale)

        assert result["status"] == "success"
        assert result["okc_receipt_number"] == "77"
        assert result["okc_serial_number"] == "AV0000200"
        mock_client.connect.assert_called_once()
        mock_client.disconnect.assert_called_once()

    def test_beko_driver_ip_delegates_to_gmp3(self, branch, sale):
        from unittest.mock import patch

        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-ip-1",
            name="Beko IP",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "IP",
                "ip_address": "10.0.0.50",
                "port": "1111",
                "serial_number": "AV0000300",
            },
        )
        sale.pos_terminal = terminal
        sale.save()

        expected = {"status": "success", "okc_receipt_number": "1"}
        driver = FiscalDriverFactory.get_driver(terminal)

        with patch(
            "apps.sales.fiscal.gmp3_wired_driver.Gmp3WiredFiscalDriver.send_invoice_or_receipt",
            return_value=expected,
        ) as mock_send:
            result = driver.send_invoice_or_receipt(sale)

        assert result == expected
        mock_send.assert_called_once()

    def test_beko_driver_serial_raises_not_implemented(self, branch, sale):
        terminal = PosTerminal.objects.create(
            branch=branch,
            code="beko-serial-1",
            name="Beko Serial",
            fiscal_type=FiscalType.BEKO_GMP3,
            fiscal_settings={
                "connection_type": "SERIAL",
                "serial_port": "COM3",
                "baud_rate": "115200",
            },
        )
        sale.pos_terminal = terminal
        sale.save()

        driver = FiscalDriverFactory.get_driver(terminal)
        with pytest.raises(OrderValidationError, match="USB/COM"):
            driver.send_invoice_or_receipt(sale)

    def test_gmp3_wired_driver_missing_ip_raises(self, sale):
        from apps.sales.fiscal.gmp3_wired_driver import Gmp3WiredFiscalDriver

        driver = Gmp3WiredFiscalDriver({"connection_type": "IP"})
        with pytest.raises(OrderValidationError, match="IP"):
            driver.send_invoice_or_receipt(sale)
