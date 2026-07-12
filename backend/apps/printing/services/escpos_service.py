import logging
import os
import socket

from django.utils import timezone
from django.utils.translation import gettext as _
from escpos.printer import Network, Usb, Dummy
from ..models import ConnectionType, PrinterType

logger = logging.getLogger(__name__)

class PrinterError(Exception):
    pass

class EscPosService:
    """
    ESC/POS yazıcılar için soyutlama katmanı.
    Kütüphane detaylarını gizler ve farklı bağlantı türlerini yönetir.
    """
    
    def __init__(self, printer_model):
        """
        :param printer_model: apps.printing.models.Printer nesnesi
        """
        self.config = printer_model
        self.device = None

    def _get_device(self):
        """Fiziksel yazıcıya bağlanır."""
        try:
            # En yaygın Türk termal yazıcılar için profil ve kod sayfası ayarları
            profile = "default"    # Varsayılan profil
            encoding = "cp857"     # Türkçe (Turkish)
            
            if self.config.connection_type == ConnectionType.NETWORK:
                if not self.config.ip_address:
                    raise PrinterError(_("IP adresi tanımlanmamış."))
                dev = Network(self.config.ip_address, port=self.config.port, profile=profile, encoding=encoding)
            
            elif self.config.connection_type == ConnectionType.USB:
                if not self.config.device_path:
                    raise PrinterError(_("USB cihaz yolu tanımlanmamış."))
                dev = Usb(self.config.device_path, profile=profile, encoding=encoding)
            else:
                dev = Dummy()
            
            # Yazıcıya Türkçe karakter setini kullanmasını söyle (Network/Usb zaten encoding=cp857 ile açılır)
            for code_name in ("CP857", "cp857"):
                try:
                    dev.charcode(code_name)
                    break
                except Exception:
                    continue
            else:
                logger.debug(
                    "Yazıcı charcode komutu desteklenmiyor; encoding=%s kullanılıyor.",
                    encoding,
                )
                
            return dev
        except Exception as e:
            logger.error(f"Printer connection failed: {str(e)}")
            raise PrinterError(_("Yazıcıya bağlanılamadı: %(err)s") % {"err": str(e)})

    def check_status(self) -> dict:
        """
        Check printer status without full printing.
        Returns: { 'online': bool, 'paper': str, 'error': str }
        """
        status = {
            'online': False,
            'paper': 'unknown', # 'ok', 'low', 'out', 'unknown'
            'error': ''
        }
        
        try:
            if self.config.connection_type == ConnectionType.NETWORK:
                if not self.config.ip_address:
                    status['error'] = _("IP adresi eksik")
                    return status

                # 1. TCP Connection Check
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.settimeout(2.0)
                    result = s.connect_ex((self.config.ip_address, self.config.port))
                    if result == 0:
                        status['online'] = True
                        
                        # 2. ESC/POS Status Query (DLE EOT 4 - Paper Status)
                        # Bazı yazıcılar hemen cevap vermeyebilir, bu kısım opsiyoneldir.
                        try:
                            s.sendall(b'\x10\x04\x04')
                            resp = s.recv(1)
                            if resp:
                                byte_val = ord(resp)
                                # ESC/POS Standard: 
                                # Bit 5: 1 (Paper near end), Bit 6: 1 (Paper end)
                                if (byte_val & 0x60) == 0x60: status['paper'] = 'out'
                                elif (byte_val & 0x0C) == 0x0C: status['paper'] = 'low'
                                else: status['paper'] = 'ok'
                        except Exception:
                            logger.debug("Yazıcı durum sorgusunda yanıt alınamadı (timeout)")
                    else:
                        status['error'] = _("Bağlantı reddedildi (Kod: %(code)s)") % {"code": result}
            
            elif self.config.connection_type == ConnectionType.USB:
                if not self.config.device_path:
                    status['error'] = _("USB yolu eksik")
                    return status
                    
                if os.path.exists(self.config.device_path):
                    if os.access(self.config.device_path, os.W_OK):
                        status['online'] = True
                        status['paper'] = 'unknown' # USB üzerinden okuma yetki/donanım bağımlıdır
                    else:
                        status['error'] = _("USB izni yok (Permission Denied)")
                else:
                    status['error'] = _("Cihaz bağlı değil")
                    
        except Exception as e:
            status['error'] = str(e)
            
        return status

    def print_raw_text(self, text: str):
        """Standard text printing."""
        device = self._get_device()
        try:
            device.text(text)
            device.text("\n\n\n")
            device.cut()
        finally:
            if hasattr(device, "close"):
                try:
                    device.close()
                except Exception as close_err:
                    logger.warning("Error closing printer device: %s", close_err)

    def print_ticket(self, payload: dict):
        """
        Yüksek seviyeli yazdırma mantığı (örneğin bir sipariş veya fatura için).
        Biçimlendirilmiş yükü kullanarak ESC/POS komutları oluşturur.
        """
        device = self._get_device()
        try:
            # Header
            device.set(align='center', bold=True, width=2, height=2)
            device.text(f"{payload.get('header', 'RAMIS')}\n")
            device.set(align='center', bold=False)
            device.text(f"{payload.get('sub_header', '')}\n")
            device.text("-" * 32 + "\n")
            
            # Body
            device.set(align='left')
            for item in payload.get('items', []):
                name = item.get('name', '')[:20].ljust(20)
                qty = str(item.get('qty', 1)).rjust(3)
                price = str(item.get('price', '')).rjust(8)
                device.text(f"{name} {qty} {price}\n")
            
            device.text("-" * 32 + "\n")
            
            # Footer
            if payload.get('total'):
                device.set(align='right', bold=True)
                device.text(_("TOPLAM: %(total)s\n") % {"total": payload['total']})
            
            device.set(align='center')
            device.text("\n" + _("Teşekkür Ederiz") + "\n\n")
            device.cut()
        except Exception as e:
            logger.error(f"Ticket printing failed: {str(e)}")
            raise PrinterError(_("Yazdırma işlemi başarısız: %(err)s") % {"err": str(e)})
        finally:
            if hasattr(device, "close"):
                try:
                    device.close()
                except Exception as close_err:
                    logger.warning("Error closing printer device: %s", close_err)
