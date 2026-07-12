"""GMP-3 (GİB Mali Protokol 3) TCP/IP istemcisi — 4 bayt framing + JSON."""
from __future__ import annotations

import json
import logging
import socket
import struct
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_GMP3_PORT = 1111
DEFAULT_GMP3_TIMEOUT_SECONDS = 120


class GMP3ConnectionError(ConnectionError):
    """ÖKC TCP bağlantı veya protokol hatası."""


def recvn(sock: socket.socket, nbytes: int) -> bytes:
    """Soketten tam olarak nbytes bayt oku."""
    buffer = b""
    while len(buffer) < nbytes:
        chunk = sock.recv(nbytes - len(buffer))
        if not chunk:
            raise GMP3ConnectionError("ÖKC bağlantısı beklenmedik şekilde kapandı.")
        buffer += chunk
    return buffer


def send_json(sock: socket.socket, data: dict[str, Any]) -> None:
    """JSON veriyi 4 bayt big-endian uzunluk öneki ile gönder."""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    header = struct.pack(">I", len(payload))
    sock.sendall(header + payload)


def recv_json(sock: socket.socket) -> dict[str, Any]:
    """4 bayt uzunluk öneki ile JSON oku."""
    raw_len = recvn(sock, 4)
    msg_len = struct.unpack(">I", raw_len)[0]
    if msg_len <= 0 or msg_len > 10_000_000:
        raise GMP3ConnectionError(f"Geçersiz GMP-3 mesaj uzunluğu: {msg_len}")
    raw_payload = recvn(sock, msg_len)
    try:
        parsed = json.loads(raw_payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise GMP3ConnectionError(f"GMP-3 JSON parse hatası: {exc}") from exc
    if not isinstance(parsed, dict):
        raise GMP3ConnectionError("GMP-3 yanıtı JSON nesnesi olmalıdır.")
    return parsed


class GMP3Client:
    """
    GMP-3 protokolü ile YN ÖKC cihazına TCP bağlantısı.

    Kullanım:
        with GMP3Client("192.168.1.100", 1111) as client:
            params = client.get_fiscal_parameters()
            result = client.send_basket_and_wait(basket)
    """

    def __init__(
        self,
        ip_address: str,
        port: int = DEFAULT_GMP3_PORT,
        *,
        timeout: float = DEFAULT_GMP3_TIMEOUT_SECONDS,
    ):
        self.ip_address = ip_address.strip()
        self.port = int(port)
        self.timeout = float(timeout)
        self._sock: socket.socket | None = None

    def __enter__(self) -> GMP3Client:
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.disconnect()

    @property
    def is_connected(self) -> bool:
        return self._sock is not None

    def connect(self) -> None:
        if self._sock is not None:
            return
        if not self.ip_address:
            raise GMP3ConnectionError("ÖKC IP adresi tanımlanmamış.")
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            sock.connect((self.ip_address, self.port))
            self._sock = sock
            logger.info("GMP-3 bağlantısı kuruldu: %s:%s", self.ip_address, self.port)
        except (socket.timeout, ConnectionRefusedError, OSError) as exc:
            raise GMP3ConnectionError(
                f"ÖKC bağlantı hatası ({self.ip_address}:{self.port}): {exc}"
            ) from exc

    def disconnect(self) -> None:
        if self._sock is None:
            return
        try:
            self._sock.close()
        except OSError:
            pass
        finally:
            self._sock = None

    def _require_socket(self) -> socket.socket:
        if self._sock is None:
            raise RuntimeError("GMP-3 bağlantısı yok. Önce connect() çağırın.")
        return self._sock

    def get_fiscal_parameters(self) -> dict[str, Any]:
        """Cihazdan mali parametreleri al (kısımlar, limitler)."""
        sock = self._require_socket()
        send_json(sock, {"command": "getFiscalParameters"})
        response = recv_json(sock)
        return normalize_gmp3_payload(response)

    def send_basket(self, basket: dict[str, Any]) -> dict[str, Any]:
        """Sepeti gönder ve ilk yanıtı al."""
        sock = self._require_socket()
        send_json(sock, basket)
        response = recv_json(sock)
        return normalize_gmp3_payload(response)

    def send_basket_and_wait(self, basket: dict[str, Any]) -> dict[str, Any]:
        """
        Sepeti gönder; status=1 (işlem devam) ise bildirim mesajını bekle.

        Bazı ÖKC'ler önce {status: 1} döner, kasiyer onayından sonra asıl sonucu iletir.
        """
        response = self.send_basket(basket)
        status = response.get("status")
        if status == 1:
            sock = self._require_socket()
            notification = normalize_gmp3_payload(recv_json(sock))
            logger.info(
                "GMP-3 bildirim alındı: basketID=%s status=%s",
                notification.get("basketID") or basket.get("basketID"),
                notification.get("status"),
            )
            return notification
        return response

    def check_health(self) -> bool:
        """TCP bağlantısı kurulabiliyor mu?"""
        try:
            self.connect()
            return True
        except GMP3ConnectionError:
            return False
        finally:
            self.disconnect()


def normalize_gmp3_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Üreticiye göre değişen sarmalayıcıları düzleştir.

    Örnek: {"status": 0, "result": {"receiptNo": 1, ...}}
    """
    result = payload.get("result")
    if isinstance(result, dict):
        merged = dict(result)
        if "status" not in merged and "status" in payload:
            merged["status"] = payload["status"]
        if "message" not in merged and payload.get("message"):
            merged["message"] = payload["message"]
        return merged
    return payload
