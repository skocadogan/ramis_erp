# Yerel Şube LAN — Mali Entegrasyon Yerleşimi

> **Bağlam:** Tek şube, yerel Ramis sunucusu (`192.168.0.100`), switch üzerinden POS/KDS/mobil istemciler.  
> **İlgili:** [fiscal-integration-master-plan.md](./fiscal-integration-master-plan.md), [gmp3-tcpip-roadmap.md](./gmp3-tcpip-roadmap.md), [fiscal-webhook-roadmap.md](./fiscal-webhook-roadmap.md), `docs/wiki/Fiscal_Integration_Production.md`

---

## Planlanan ağ topolojisi (özet)

```text
RAMIS SERVER (192.168.0.100)
        |
   Network Switch (kablolu + kablosuz)
        |
   +----+----+----+----+----+
   |    |    |    |    |
 POS  KDS  Prep Masa  Garson
 PC   PC   PC   mobil web/mobil
.101+ .10x .10x .10x  .10x
```

- **Sunucu:** Django API, DB, nginx, WebSocket (Daphne) — `192.168.0.100`
- **İstemciler:** Electron veya web; API hedefi `http://192.168.0.100`
- **ÖKC (önerilen):** Switch’e Ethernet, statik IP (ör. `192.168.0.150`) — diyagramda ayrıca gösterilmeli

Mali işlem **istemciden değil sunucudan** tetiklenir: POS → `POST /orders/.../complete/` + `pos_terminal_id` → backend sürücü.

---

## Genel uyumluluk

| Bileşen | `192.168.0.100` sunucu | Durum |
|---------|------------------------|--------|
| POS PC (Electron / web) | API → `http://192.168.0.100/api/v1` | Uyumlu |
| KDS / Prep / garson | Aynı API + WebSocket | Uyumlu |
| Smart table mobil | Aynı LAN WiFi | Uyumlu |
| Mali işlem tetikleme | `pos_terminal_id` ile backend | Uyumlu |
| GMP-3 **TCP/IP** | Sunucu → ÖKC IP (aynı switch) | **İdeal senaryo** |
| Token **CLOUD** + webhook | Sunucuya **internetten** POST | **Ek gereksinim** |

---

## ÖKC yerleşimi (öneri)

```text
192.168.0.100  → Ramis Server (Django, DB, nginx)
192.168.0.101+ → POS PC'ler (Electron / web)
192.168.0.15x  → ÖKC (ör. 192.168.0.150) — Ethernet, statik IP
```

- **GMP-3 IP:** Sunucu `192.168.0.100` üzerinden ÖKC IP’sine TCP açar; POS PC ile ÖKC aynı makinede olmak zorunda değil.
- **USB/COM (SERIAL):** ÖKC yalnızca POS PC’ye USB ile takılıysa mevcut mimaride **çalışmaz** (bağlantı sunucudan açılır; SERIAL desteği yok).

---

## Bağlantı türü seçimi

### Seçenek A — GMP-3 TCP/IP (bu topolojiye en uygun)

| Artı | Eksi |
|------|------|
| Tamamen yerel LAN | ÖKC Ethernet/WiFi ve GMP-3 eşleştirmesi gerekir |
| Public IP / webhook gerekmez | Üretici dokümanı + gerçek cihaz testi |
| `install.sh` IP modu ile uyumlu | Sunucu ↔ ÖKC arasında firewall kapalı olmalı |

**Admin:** Terminal → Beko GMP3 → **Ağ (TCP/IP)** → ÖKC IP + port (varsayılan `1111`, Beko’da bazen `8080`) + seri no.

### Seçenek B — Token X-Connect CLOUD

| Artı | Eksi |
|------|------|
| ÖKC internet üzerinden Token’a bağlı olabilir | **Webhook** için sunucunun dışarıdan erişilebilir olması gerekir |
| Kasada sadece bulut hesabı yeterli | `FISCAL_WEBHOOK_BASE_URL=http://192.168.0.100` **Token’dan erişilemez** |

`install.sh` IP kurulumda `FISCAL_WEBHOOK_BASE_URL=http://<API_DOMAIN>` yazar. Token sunucuları özel LAN IP’sine POST atamaz → webhook çalışmaz; sistem 120 sn bekleyip **polling fallback**’e düşer (yavaş, kırılgan).

**CLOUD için pratik yollar:**

1. Statik public IP + port yönlendirme → `https://sube.sirket.com` → `192.168.0.100`
2. Merkezi bulut sunucu (VPS) — o zaman API uzakta olur; yerel `192.168.0.100` şube diyagramından farklı model
3. Test: ngrok / staging HTTPS
4. Geçici: webhook olmadan yaşamak (önerilmez)

---

## Mimari diyagram (mali entegrasyon katmanı)

```text
                    [ İnternet ]
                         |
              (sadece CLOUD + webhook için)
                         |
    ┌────────────────────┴────────────────────┐
    │         Token X-Connect Cloud            │
    └────────────────────┬────────────────────┘
                         │ webhook POST
                         ▼
    ┌──────────────────────────────────────────┐
    │  Switch 192.168.0.0/24                     │
    │                                          │
    │  ┌─────────────────┐                     │
    │  │ RAMIS SERVER    │◄── HTTP ── POS PC1 │
    │  │ 192.168.0.100   │◄── HTTP ── POS PC2 │
    │  └────────┬────────┘                     │
    │           │ TCP GMP-3 (IP modu)          │
    │           ▼                              │
    │  ┌─────────────────┐                     │
    │  │ ÖKC / Beko      │                     │
    │  │ 192.168.0.150   │                     │
    │  └─────────────────┘                     │
    │                                          │
    │  KDS, mobil, garson → sadece API/WS      │
    └──────────────────────────────────────────┘
```

**Akış özeti:**

| Mod | Veri yolu |
|-----|-----------|
| **GMP-3 IP** | POS → HTTP → Sunucu → TCP → ÖKC (aynı LAN) |
| **CLOUD** | POS → HTTP → Sunucu → Token API → ÖKC; sonuç → webhook → Sunucu (public URL gerekir) |
| **KDS / garson / mobil** | Mali entegrasyona doğrudan dahil değil; yalnızca sipariş/ödeme API |

---

## Electron POS özelinde

- **API adresi:** Login ekranında `http://192.168.0.100` (veya kullanılan hostname).
- **Terminal UUID:** POS ayarlarından seçilir; mali parametreler (IP, CLOUD credential vb.) **yönetici panelinde** terminal kaydında tutulur.
- **Ek Electron kodu gerekmez** — mevcut paket, bundled `frontend/` ile aynı ödeme API’sini kullanır.
- **Yeniden build:** `electron_apps/pos` içinde `npm run build` / `package:win` — güncel frontend + backend deploy birlikte.
- **GMP-3 IP:** Sunucu ÖKC’ye TCP ile ulaşabildiği sürece Electron ile web POS arasında fark yok.

---

## Operasyonel checklist (bu LAN için)

### Her zaman

- [ ] POS / KDS / mobil → `192.168.0.100` (veya nginx hostname) erişimi
- [ ] `ALLOWED_HOSTS` ve nginx `server_name` doğru
- [ ] POS terminal kaydı: `fiscal_type`, `connection_type`, ilgili alanlar dolu
- [ ] Kasiyer POS’ta doğru terminal UUID seçili

### GMP-3 IP seçilirse

- [ ] ÖKC statik IP (ör. `192.168.0.150`), port (`1111` / `8080`)
- [ ] Sunucudan bağlantı testi: `nc -zv 192.168.0.150 1111` (veya eşdeğeri)
- [ ] Admin form: IP + port + yasal seri no (AV/AT…)
- [ ] Gerçek cihazla uçtan uca ödeme testi

### CLOUD seçilirse

- [ ] Webhook için **public HTTPS** (yalnızca `192.168.0.100` yeterli değil)
- [ ] `FISCAL_WEBHOOK_BASE_URL` = dışarıdan erişilebilir kök URL
- [ ] Token Set Client Settings ile webhook URL kaydı
- [ ] Prod API URL ve credential (test URL prod’da kullanılmamalı)
- [ ] nginx → `/api/v1/sales/fiscal/webhook/` → Uvicorn

### Electron dağıtımı

- [ ] Backend migration ve fiscal modülleri deploy edildi
- [ ] Electron POS yeniden paketlendi (güncel frontend)
- [ ] Kasa PC `apiUrl` = şube sunucusu

---

## Özet öneri

| Hedef | Öneri |
|-------|--------|
| Tek şube, sunucu LAN’da (`192.168.0.100`), public IP yok | **GMP-3 TCP/IP** |
| ÖKC yalnızca USB ile POS PC’de | Şimdilik destek yok; Ethernet veya **CLOUD** |
| Token bulut + webhook ile kasiyer onayı | Public URL veya port forward **şart** |
| Electron vs web POS | Fark yok; ikisi de aynı backend API |
| KDS / garson / smart table | Mali katmana doğrudan bağlı değil |

**Karar özeti:** Planladığınız yerel şube sunucusu + switch + POS PC mimarisi Ramis ile uyumludur. Public internet yoksa **Beko + Bağlantı Türü: Ağ (TCP/IP)** en düşük sürtünmeli yoldur. CLOUD seçilecekse webhook erişilebilirliği ayrıca planlanmalıdır.

---

## İlgili kod ve dokümanlar

| Konu | Konum |
|------|--------|
| GMP-3 istemci | `backend/apps/sales/fiscal/gmp3_client.py` |
| Wired sürücü | `backend/apps/sales/fiscal/gmp3_wired_driver.py` |
| Beko yönlendirme (IP/CLOUD) | `backend/apps/sales/fiscal/beko_driver.py` |
| Electron POS paketleme | `electron_apps/pos/bin/build-next.sh` |
| Prod kurulum | `docs/wiki/Fiscal_Integration_Production.md` |
