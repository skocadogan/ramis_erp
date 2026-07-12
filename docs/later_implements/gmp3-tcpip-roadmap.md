# GMP-3 TCP/IP (Kablolu Ağ) — Uygulama Planı

> **Oluşturulma:** 2026-06-26  
> **Durum:** Faz 1–3 uygulandı (istemci, sepet, wired sürücü, Beko IP yönlendirmesi)  
> **İlgili:** `docs/wiki/Fiscal_Integration.md`, `.omnirule/research/gmp3-protokol-kullanim-rehberi-2026-06-25.md`

---

## 1. Kapsam

**GMP-3** (GİB Mali Protokol 3): YN ÖKC ile **yerel ağ (TCP/IP)** üzerinden JSON mesajlaşma. Ramis backend doğrudan cihaz IP:port'una bağlanır.

| Bağlantı | Bu planda |
|----------|-----------|
| **IP (TCP/GMP-3)** | ✅ Uygulandı |
| **SERIAL (USB/COM)** | ❌ Sonraki faz — Token DLL / pyserial |
| **CLOUD (Token X-Connect)** | ✅ Ayrı (`beko_driver.py` CLOUD dalı) |

---

## 2. Mimari

```
create_sale_for_order
    → FiscalDriverFactory.get_driver(terminal)
    → BekoFiscalDriver (connection_type=IP)
        → Gmp3WiredFiscalDriver
            → GMP3Client (socket)
            → build_gmp3_basket_from_sale()
            → parse_basket_result_payload()
```

**Dosyalar:**

| Dosya | Rol |
|-------|-----|
| `gmp3_client.py` | 4 bayt framing, TCP connect, getFiscalParameters, sendBasket |
| `gmp3_basket.py` | Sale → GMP-3 sepet JSON, KDV kısım eşleştirme |
| `gmp3_wired_driver.py` | `BaseFiscalDriver` — IP bağlantı akışı |
| `beko_driver.py` | `IP` → wired driver; `CLOUD` → Token API; `SERIAL` → hata |

---

## 3. Fazlar

### Faz 1 — Protokol istemcisi ✅

- `_recvn`, `send_json`, `recv_json` (4 bayt big-endian + UTF-8 JSON)
- `GMP3Client`: `connect`, `disconnect`, `get_fiscal_parameters`, `send_basket`, `send_basket_and_wait`, `check_health`
- Context manager (`with GMP3Client(...) as client`)
- Varsayılan port: `1111`, timeout: `120` sn (kasiyer onayı)

### Faz 2 — Sepet ve sürücü ✅

- `build_gmp3_basket_from_sale(sale, fiscal_params)` — kuruş/mili-adet, ödeme tipi eşlemesi
- `match_gmp3_section_no()` — cihaz `sections[]` ile KDV eşleştirme
- `Gmp3WiredFiscalDriver.send_invoice_or_receipt` — bağlan → parametre al → sepet gönder → sonuç parse
- `get_status()` — TCP health check

### Faz 3 — Beko entegrasyonu ve testler ✅

- `BekoFiscalDriver`: `connection_type == "IP"` → `Gmp3WiredFiscalDriver`
- `SERIAL` → `OrderValidationError` (sessiz mock kaldırıldı)
- Unit testler: framing, basket builder, wired driver mock socket

### Faz 4 — Sonraki (planlandı)

- [ ] Fiş iptali (`isVoid`, `receiptNo`)
- [ ] Z raporu entegrasyonu (shift kapanış)
- [ ] `app_no` eşleştirme (üretici gateway)
- [ ] Hugin `HUGIN_GMP3` + IP → aynı `Gmp3WiredFiscalDriver`
- [ ] SERIAL / Token Integration Hub DLL köprüsü
- [ ] Celery async sepet (uzun timeout'tan worker kurtulma)
- [ ] GMP-3 simülatör ile CI entegrasyon testi

---

## 4. Terminal ayarları (admin)

`connection_type: "IP"` için `fiscal_settings`:

```json
{
  "connection_type": "IP",
  "ip_address": "192.168.1.100",
  "port": "1111",
  "serial_number": "AV0000123"
}
```

| Alan | Zorunlu | Açıklama |
|------|---------|----------|
| `ip_address` | Evet | ÖKC LAN IP |
| `port` | Hayır | Varsayılan `1111` (Beko/Token bazen `8080`) |
| `serial_number` | Önerilir | Fiş/QR doğrulama, sonuç parse |

---

## 5. Operasyonel gereksinimler

- Ramis backend ile ÖKC **aynı LAN**'da veya routable olmalı
- Firewall: backend → cihaz `TCP port` açık
- Cihazda GMP-3 / harici uygulama eşleştirmesi (üretici dokümanı)
- Üretimde MOCK yerine gerçek cihaz veya GİB simülatörü ile doğrulama

---

## 6. Kabul kriterleri (Faz 1–3)

- [x] IP terminal ile ödeme akışı mock değil gerçek socket çağrısı yapar
- [x] Eksik IP → anlamlı `OrderValidationError`
- [x] Başarılı GMP-3 yanıtı → `Sale` mali alanları dolar
- [x] İptal/void status → rollback (mevcut `create_sale_for_order` kuralı)
- [x] Unit testler yeşil
