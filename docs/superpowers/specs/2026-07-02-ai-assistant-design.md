# AI Assistant — Tasarım Dokümanı

**Tarih:** 2026-07-02
**Proje:** Ramis ERP
**Durum:** Taslak (kullanıcı onayı bekliyor)

**Revizyon Notu (v2 — inceleme sonrası):** İlk taslakta pgvector, aksiyon/function-calling akışı, feedback→message_id ilişkisi ve RAG retrieval'ında RBAC/branch scope uygulanması arasında tutarsızlıklar tespit edildi. Bu doküman aşağıdaki başlıklarda güncellendi: §5 (gerçek pgvector `VectorField` + `branch_id`), §6 (aksiyon onay akışı ek model gerektirmeden `AIMessage.metadata` üzerinden; ilk fazda streaming yok), §7 (retrieval katmanında zorunlu rol+şube filtresi, rate limiting), §14 (SSE ileri faza taşındı). Ayrıntılı gerekçe implementasyon planındaki "Revizyon Log" bölümündedir.

**Revizyon Notu (v3 — model seçimi):** Varsayılan LLM `Qwen 2.5 7B` → **`Qwen3 8B`** (`qwen3:8b`) olarak güncellendi. Gerekçe: çok dilli destek, tool-calling güvenilirliği ve aynı RAM bütçesinde (~6-8 GB Q4_K_M) daha iyi agent davranışı. Qwen3'ün varsayılan "thinking" modu sohbet gecikmesini artırır — backend her istekte `think: false` gönderir.

**Revizyon Notu (v4 — geliştirici incelemesi sonrası):** İkinci bir kod-tabanı-karşılaştırmalı incelemede tespit edilen boşluklar işlendi:
1. **Read-only query tools katmanı eklendi (§4, §7):** "Stokta ne kadar kıyma var?", "Bugün kaç satış oldu?" gibi operasyonel/anlık sorular vektör RAG ile cevaplanamaz (aggregate + her zaman bayat). Bunlar için toggle'dan ve onay akışından bağımsız, RBAC/şube filtreli **salt-okunur sorgu tool'ları** tanımlandı. Vektör RAG, menü/alerjen gibi statik-metinsel içerikle sınırlandı.
2. **Rol tespiti projenin RBAC'ına bağlandı:** `is_staff`/`is_superuser` yerine `User.roles` (rbac.Role) kullanılır — garson/aşçı gibi çalışanlar `is_staff` olmadığı için eski yaklaşım tüm çalışanları "müşteri" sınıflardı.
3. **Kimlik açık sorusu netleştirildi (§1):** İlk faz yalnızca oturum açmış kullanıcılar içindir; anonim (QR menü) müşteri erişimi ileri faza ait açık bir tasarım sorusudur.
4. **Embedding üretimi Ollama `/api/embed` üzerinden (§3):** sentence-transformers her gunicorn worker'ında ~2 GB model kopyası yükler ve RAM bütçesini patlatır; Ollama'da tek kopya `bge-m3` kullanılır (torch bağımlılığı da kalkar).
5. **Embedding tazeliği faz 1'e alındı (§5):** `post_save` sinyali + Celery task; pasifleşen/silinen kayıtların embedding'leri temizlenir (aksi halde AI menüden kalkan ürünü önermeye devam eder). Retrieval'a cosine distance eşiği eklendi.
6. **Kapasite gerçekçiliği (§3.4):** `num_ctx` açıkça set edilir (Ollama varsayılanı prompt'u sessizce kırpar), timeout 120 sn, throttle 10/dk, senkron LLM çağrısının worker maliyeti belgelendi.
7. **TTS düzeltmesi (§9):** Piper `--output-raw` ham PCM üretir — backend WAV header ekler; endpoint GET → POST (metin access log'a sızmasın).
8. **SSS önbelleği ileri faza taşındı (§10.4, §14):** cache anahtarı rol+şube+dil içermeden veri sızıntısı riski taşır; ilk fazda yoktur.
9. **Few-shot benzerlik tabanlı (§10.3):** rastgele örnek yerine pgvector ile en yakın düzeltilmiş örnekler seçilir (spec'in "benzer soruda" vaadiyle uyum).
10. **Güvenlik sıkılaştırmaları (§7):** feedback'te mesaj sahipliği kontrolü, aksiyon onayında toggle/rol/parametre yeniden doğrulaması + 10 dk TTL, `OLLAMA_HOST=127.0.0.1` (Ollama auth'suzdur, ağa açılamaz), mesaj başına tek feedback.
11. **Task 0 spike + golden-set eval:** implementasyona başlamadan önce CPU'da Qwen3 8B'nin Türkçe kalite/gecikme/tool-calling go/no-go ölçümü; 20-30 soruluk golden set kalıcı eval'e dönüşür (implementasyon planı Task 0).

---

## 1. Amaç ve Kapsam

Ramis ERP içinde çalışan, tamamen yerel (self-hosted) bir yapay zeka asistanı. 
Yalnızca proje veritabanındaki verilerle çalışır, dış API'ye çıkışı yoktur.

**Kullanıcı Tipleri:**
- **Müşteri:** Menü, alerjen, fiyat, restoran bilgisi sorguları; sınırlı aksiyon (sepet, sipariş, hesap)
- **Çalışan/Yönetici:** Stok, satış, reçete, vardiya sorgulamaları; operasyonel rehberlik

**Aksiyon Modu:** Toggle ile açılıp kapatılabilir. Kapalıyken yalnızca bilgi/sorgulama yapılır.

**Opsiyonellik:** Tüm AI Assistant bir Django app olarak `INSTALLED_APPS`'den eklenip çıkarılabilir. 
Frontend'de feature flag ile kontrol edilir. Mevcut projeye hiçbir bağımlılık eklemez.

**Kimlik ve erişim (v4):** Tüm endpoint'ler `IsAuthenticated` gerektirir; ilk faz yalnızca **oturum açmış** kullanıcılar içindir. "Müşteri" rolü, sisteme kayıtlı ve giriş yapmış müşteri hesaplarını ifade eder. Anonim müşteri erişimi (örn. QR menüden hesapsız sohbet) bu fazda **yoktur** — masa-token bazlı kimlik gibi bir çözüm gerektirir ve ileri faza ait açık bir tasarım sorusudur. Rol tespiti `is_staff` ile değil, projenin RBAC rolleri (`User.roles`) üzerinden yapılır.

---

## 2. Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                         │
│  ┌──────────────────────────────┐                           │
│  │  ChatPanel.tsx              │  ← dynamic import          │
│  │  SSE streaming/JSON yanıt   │    (tree-shake edilebilir) │
│  └──────────┬───────────────────┘                           │
└─────────────┼───────────────────────────────────────────────┘
              │ POST /api/v1/ai/chat/
              │ Authorization: Bearer <JWT>
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Django)                                           │
│  ┌──────────────────────────────────────────┐               │
│  │  apps/ai_assistant/                      │ ← opsiyonel  │
│  │                                          │   app         │
│  │  ┌──────────┐  ┌──────────────┐         │               │
│  │  │ RAG      │  │ LLM Client   │         │               │
│  │  │ Engine   │◄─┤ (Ollama)     │         │               │
│  │  └────┬─────┘  └──────────────┘         │               │
│  │       │                                  │               │
│  │  ┌────▼─────┐  ┌──────────────┐         │               │
│  │  │pgvector  │  │ Actions     │         │               │
│  │  │PostgreSQL│  │ Executor    │         │               │
│  │  └──────────┘  └──────────────┘         │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  ┌──────────────────────────────────────────┐               │
│  │  Mevcut Django App'ler (menu, orders...) │               │
│  │  → Hiçbir değişiklik yok                │               │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
              │ http://localhost:11434
              ▼
┌─────────────────────────────────────────────────────────────┐
│  Ollama Servisi (systemd)                                   │
│  ┌──────────────────────────────────────────┐               │
│  │  Qwen3 8B (Q4_K_M)                       │               │
│  │  ~6-8 GB RAM                              │               │
│  │  REST API :11434                          │               │
│  └──────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Bileşen Detayları

### 3.1 Backend — `apps/ai_assistant/`

| Dosya | Görev |
|---|---|
| `models.py` | `ChatSession`, `AIMessage` (opsiyonel log) |
| `services/embeddings.py` | Ollama `/api/embed` (bge-m3) ile metin → vector, pgvector araması |
| `services/rag_engine.py` | pgvector sorgulama, context hazırlama |
| `services/llm_client.py` | Ollama REST API çağrısı, streaming |
| `services/actions.py` | Function calling aksiyon tanımları + executor |
| `services/action_registry.py` | Kayıtlı aksiyonların listesi (query/mutation ayrımı) ve toggle kontrolü |
| `services/query_tools.py` | Salt-okunur sorgu tool'ları (stok/satış özetleri) — toggle ve onaydan bağımsız, RBAC/şube filtreli |
| `services/embedding_sync.py` | Veritabanı değişikliklerinde embedding güncelleme (Celery + post_save, pasif kayıt temizliği) |
| `services/feedback.py` | Feedback kaydetme, istatistik, admin inceleme |
| `services/training.py` | Few-shot prompt'a benzerlik tabanlı örnek ekleme |
| `services/tts.py` | Piper TTS ile metin → ses dönüşümü |
| `views.py` | `/api/v1/ai/chat/`, `/api/v1/ai/tts/`, `/api/v1/ai/feedback/`, `/api/v1/ai/admin/...` endpoint'leri |
| `management/commands/` | `sync_embeddings`, `check_model` komutları (v4: `build_sss_cache` ileri faza taşındı) |
| `admin.py` | Action toggle, feedback inceleme, training example yönetimi |
| `apps.py` | App config |

### 3.2 Frontend — `features/ai-assistant/`

| Dosya | Görev |
|---|---|
| `ChatPanel.tsx` | Ana sohbet arayüzü (mesaj kutusu, geçmiş, streaming) |
| `api.ts` | AI endpoint çağrıları |
| `types.ts` | Mesaj, intent, aksiyon tipleri |
| `index.ts` | Public API (dynamic import noktası) |

### 3.3 Altyapı

| Bileşen | Detay |
|---|---|
| **Ollama** | systemd servisi, `ollama.service` |
| **Model** | Qwen3 8B (`qwen3:8b`, Q4_K_M), ~6-8 GB RAM. Qwen 2.5 7B yerine seçildi: daha güvenilir tool-calling, güçlü çok dilli destek (TR dahil). Thinking modu backend'de kapalı (`think: false`). |
| **pgvector** | PostgreSQL extension, mevcut DB'ye eklenir |
| **Embedding modeli** | `bge-m3` (Türkçe + çok dilli, 1024 boyut) — **Ollama `/api/embed` üzerinden** servis edilir (v4). sentence-transformers kullanılmaz: her gunicorn worker'ında ~2 GB ayrı model kopyası yüklerdi; Ollama'da tek kopya bellekte kalır ve torch bağımlılığı ortadan kalkar |
| **Piper TTS** | Hafif lokal TTS motoru, ~100MB, CPU'da çalışır |

### 3.4 Eşzamanlılık ve Kaynak Bütçesi (v4)

- **`num_ctx` açıkça set edilir** (varsayılan 8192, `AI_LLM_NUM_CTX`). Ollama'nın varsayılan context penceresi küçüktür; 10 RAG sonucu + few-shot + geçmişle prompt **sessizce baştan kırpılır** ve sistem promptu kaybolur. Prompt bütçesi (context'e alınan kayıt/geçmiş sayısı) bu pencereye göre yönetilir.
- **Timeout 120 sn** (`AI_LLM_TIMEOUT`): CPU'da 8B model için ilk-token + üretim süresi 30 sn'yi rahat aşar.
- **Senkron LLM çağrısı bir Django worker'ını yanıt boyunca kilitler.** `OLLAMA_NUM_PARALLEL=1` iken ikinci istek Ollama kuyruğunda bekler. İlk fazda kabul edilen model: senkron view + düşük throttle. Kullanıcı sayısı arttığında Celery task + WebSocket/poll'a geçiş (proje altyapısı hazır) ileri faz seçeneğidir.
- **Throttle: chat 10/dk, TTS 20/dk** — tek Ollama slotu varken daha yüksek limit anlamsızdır ve tek kullanıcının servisi doyurmasına izin verir.
- **Ollama yalnızca loopback dinler** (`OLLAMA_HOST=127.0.0.1`): Ollama'da kimlik doğrulama yoktur, ağa açılması modelin herkese açılması demektir.

---

## 4. RAG Veri Akışı

```
Kullanıcı Sorusu
  │
  ▼
1. Soru tipi ayrımı (v4 — ayrı bir intent-classification LLM çağrısı YOKTUR;
   karar LLM'in tool_calls çıktısına göre verilir):
   ├── Statik bilgi (menü, alerjen, fiyat...) → RAG context (2-6 adımları)
   ├── Operasyonel/anlık veri (stok, satış, vardiya) → read-only QUERY TOOL
   │     toggle'dan bağımsız, onaysız çalışır; RBAC + şube filtresi içinde
   │     (vektör RAG bu sorulara uygun değildir: aggregate + her zaman bayat)
   └── Mutasyon talebi (sipariş, garson çağır) → toggle ON ise tool önerilir,
         kullanıcı onayı olmadan ASLA çalıştırılmaz (§6, §7)
  │
  ▼
2. Embedding (Ollama /api/embed, bge-m3)
   │
   ▼
3. pgvector similarity search (cosine, top-K=10)
   + distance eşiği (v4): eşiği aşan alakasız sonuçlar elenir —
     alakasız context halüsinasyonu besler
   │
   ▼
4. Context hazırlama (en alakalı kayıtlar + metadata)
   │
   ▼
5. Few-shot örnek ekleme (v4 — benzerlik tabanlı):
   TrainingExample'lar da embed edilir; soruya pgvector ile en yakın
   ≤3 düzeltilmiş örnek seçilir (rastgele değil — alakasız örnek
   prompt'u şişirir, fayda vermez)
   │
   ▼
6. LLM Prompt oluşturma:
   system: Rollü talimat (müşteri/çalışan) + kullanıcının dili (§8)
   few_shot: Benzer düzeltilmiş örnekler (varsa)
   context: İlgili veritabanı kayıtları
   history: Son N mesaj
   tools: query tools (her zaman) + mutasyon tools (toggle ON ise)
   user: Kullanıcı sorusu
   │
   ▼
7a. [Bilgi] LLM → text response (JSON) → frontend
    ↓
    Kullanıcı 👍/👎 → MessageFeedback tablosuna kaydedilir
    👎 ise → admin paneline düşer → admin düzeltir → TrainingExample olur
    ↓
    Bir sonraki benzer soruda → few-shot olarak prompt'a eklenir (.5 adımı)

7b. [Query tool] LLM → tool_call (kind=query) → backend RBAC içinde hemen
    çalıştırır → sonuç tool mesajı olarak eklenir → ikinci LLM çağrısı
    nihai cevabı üretir (onay adımı yok — salt-okunur)

7c. [Mutasyon] LLM → JSON function call → pending_action olarak saklanır →
    kullanıcı onayı → backend yeniden validate eder → execute → response
```

---

## 5. Veritabanı Değişiklikleri

### pgvector extension (mevcut PostgreSQL'e ek)
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### Yeni Tablolar (ai_assistant içinde)

```python
class ChatSession(BaseModel):
    user = ForeignKey(User)
    role = CharField("musteri|calisan")
    is_active = BooleanField(default=True)

class AIMessage(BaseModel):
    session = ForeignKey(ChatSession)
    role = CharField("user|assistant|system")
    content = TextField()
    metadata = JSONField(null=True)  # token count, intent, action, model_name

class MessageFeedback(BaseModel):
    """Kullanıcı geri bildirimi — her mesajın altındaki 👍/👎"""
    message = ForeignKey(AIMessage, related_name="feedback")
    rating = CharField("positive|negative")
    comment = TextField(null=True, blank=True)
    reviewed_by = ForeignKey(User, null=True)  # admin inceledi mi?

class TrainingExample(BaseModel):
    """Admin tarafından düzeltilmiş soru-cevap çifti — few-shot prompt'a eklenir"""
    question = TextField()
    incorrect_answer = TextField(null=True, blank=True)  # AI'nın verdiği hatalı yanıt
    correct_answer = TextField()
    source_message = ForeignKey(AIMessage, null=True, on_delete=SET_NULL)
    is_active = BooleanField(default=True)
    usage_count = IntegerField(default=0)  # kaç kere few-shot olarak kullanıldı
    created_by = ForeignKey(User)

class EmbeddingCache(models.Model):
    """İndekslenmiş embedding'ler — gerçek pgvector VectorField (pgvector-python paketi)."""
    table_name = CharField(db_index=True)
    row_id = UUIDField()
    content = TextField()
    embedding = VectorField(dimensions=1024)  # bge-m3 = 1024; seçilen modele göre ayarlanır
    branch_id = CharField(null=True, blank=True, db_index=True)  # şube bazlı kaynaklar için; şubesiz kaynaklarda null
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        indexes = [HnswIndex(name="embedding_hnsw_idx", fields=["embedding"], m=16, ef_construction=64, opclasses=["vector_cosine_ops"])]
```

**Önemli — ilk taslaktaki hata:** İlk versiyonda bu model `JSONField` olarak tanımlanmış ve benzerlik araması Python'da tüm tabloyu tarayarak (brute-force cosine similarity) yapılıyordu. Bu, "pgvector" adını taşımasına rağmen pgvector'ı hiç kullanmayan, ölçeklenmeyen bir yaklaşımdı. Doğru yaklaşım: `pgvector` pip paketi + `pgvector.django.VectorField` + HNSW/IVFFlat index + SQL seviyesinde `CosineDistance` sorgusu (bkz. implementasyon planı Task 2).

**Retrieval'da erişim kontrolü:** Her `table_name` için hangi rollerin (`musteri`/`calisan`) ve hangi alanların embed edilebileceğini tanımlayan statik bir kaynak konfigürasyonu (`EMBEDDING_SOURCE_CONFIG`) zorunludur. Örn. `inventory_stockitem` sadece `calisan` rolüne açık, `menu_product` embed edilirken maliyet/kâr marjı gibi alanlar asla içeriğe dahil edilmez (yalnızca açık alan listesi/allowlist ile serialize edilir — "tüm alanları dök" yaklaşımı yasak). `branch_id` doluysa arama, kullanıcının erişebildiği şubelerle (`core.branch_scope.accessible_branch_id_strings` deseni) sınırlanır.

**Kaynak kaydı zorunludur (v4):** Embedding kaynakları (`menu_product` vb.) `AiAssistantConfig.ready()` içinde `EmbeddingSync.register_source(...)` ile açıkça kayıt edilir. Kayıt edilmemiş kaynak ne senkronize edilir ne de aramada görünür (fail-closed). İlk taslakta bu kayıt adımı hiçbir yerde yoktu — `sync_embeddings` boş çalışır, RAG context'i hep boş kalırdı.

**Bayat kayıt temizliği (v4):** Senkronizasyon yalnızca ekleme/güncelleme yapmaz; kaynakta artık bulunmayan veya `is_active=False` olmuş kayıtların embedding'leri **silinir**. Aksi halde menüden kaldırılan ürün `EmbeddingCache`'te kalır ve AI var olmayan ürünü önermeye devam eder (projenin soft-delete kuralı burada özellikle kritiktir).

**Tazelik (v4 — faz 1):** Kayıtlı kaynak modellerinde `post_save`/`post_delete` sinyali debounce'lu bir Celery task'ını tetikler; menü fiyatı değiştiğinde embedding dakikalar içinde güncellenir. Manuel `sync_embeddings` komutu yalnızca ilk yükleme/onarım içindir.

**Distance eşiği (v4):** `search()` sonuçları `AI_MAX_DISTANCE` (varsayılan ~0.55, golden set ile ayarlanır) üzerindeki kayıtları eler — top-K her koşulda dolu dönmez; alakasız context LLM halüsinasyonunu besler.

### Var Olan Tablolara Değişiklik — HİÇBİRİ

---

## 6. API Tasarımı

### Ana Endpoint

```
POST /api/v1/ai/chat/
Authorization: Bearer <JWT>

Request:
{
  "session_id": "uuid | null (yeni)",    ← opsiyonel
  "message": "Bugün kebab var mı?",
  "mode": "auto"                          ← "auto" (toggle'a uyar) | "readonly" (toggle override ile aksiyonları kapat)
}

Response (JSON):
{
  "session_id": "uuid",
  "message_id": "uuid",                   ← asistan mesajının gerçek ID'si; feedback/action confirm bunu referans alır
  "reply": "Evet, bugün Adana kebap ve Urfa kebap mevcut...",
  "intent": "query",
  "action": null
}
```

Token sayıları response'a konmaz; `AIMessage.metadata` içinde saklanır ve admin status ekranında raporlanır (v4 — plan ile tutarlılık).

**İlk faz kapsamı:** Bu fazda yanıt yalnızca JSON'dur (streaming yok). SSE (token-token streaming), bölüm 14 Non-Goals'ta belirtildiği gibi ileri faza ertelenmiştir — ilk taslakta mimarinin merkezi bir parçası gibi sunulması, plandaki hiçbir görevde gerçekten implemente edilmediği için kaldırıldı.

`action` alanı `null` değilse, LLM bir fonksiyon çağırmak istemiştir ancak **otomatik çalıştırılmaz** (bkz. §7 iki aşamalı onay). Bu durumda:
```
{
  "action": {
    "message_id": "uuid",        ← aynı mesaj ID'si, confirm endpoint'ine gönderilir
    "name": "order_item",
    "parameters": { "product_name": "Adana kebap", "quantity": 2 }
  }
}
```

### Aksiyon Onay Endpoint'i

```
POST /api/v1/ai/action/confirm/
{
  "message_id": "uuid",     ← chat yanıtındaki action.message_id
  "confirm": true
}
```

Ek bir `PendingAction` modeline gerek yoktur: bekleyen aksiyon, ilgili asistan `AIMessage.metadata.pending_action` alanında saklanır. Onaylanırsa `ActionExecutor` çalıştırılır ve sonucu yeni bir `AIMessage(role="system")` olarak kaydedilir; reddedilirse `pending_action` iptal olarak işaretlenir. Bu sayede aksiyon hiçbir zaman LLM'in tek başına ürettiği metinle sessizce çalıştırılmaz.

### Geri Bildirim Endpointleri

```
POST /api/v1/ai/feedback/
{
  "message_id": "uuid",
  "rating": "positive|negative",
  "comment": "opsiyonel"
}

GET  /api/v1/ai/feedback/history/       → kullanıcının kendi feedback geçmişi
```

### Yönetim Endpointleri

```
GET  /api/v1/ai/admin/actions/                     → tüm kayıtlı aksiyonlar
PATCH /api/v1/ai/admin/actions/<id>/               → toggle ON/OFF
GET  /api/v1/ai/admin/status/                      → model, token, embedding durumu
POST /api/v1/ai/admin/embeddings/sync              → embedding'leri manuel güncelle

GET  /api/v1/ai/admin/feedback/                    → olumsuz feedback'ler (admin inceler)
GET  /api/v1/ai/admin/feedback/<id>/               → tek feedback detayı

GET  /api/v1/ai/admin/training-examples/           → düzeltilmiş örnekler
POST /api/v1/ai/admin/training-examples/           → yeni düzeltme ekle (admin eliyle)
      {
        "question": "Acılı Adana var mı?",
        "incorrect_answer": "Evet var",
        "correct_answer": "Hayır, Acılı Adana menümüzde yok"
      }
PATCH /api/v1/ai/admin/training-examples/<id>/     → düzeltmeyi güncelle/devre dışı bırak
```

---

## 7. Güvenlik ve RBAC

- Her endpoint `IsAuthenticated` korumasında
- Müşteri kullanıcıları yalnızca menü, rezervasyon, alerjen gibi müşteri verilerine erişebilir
- **Bu kısıtlama sadece sistem promptunda bir talimat değildir — `EmbeddingService.search()` retrieval katmanında zorunlu olarak uygulanır.** Sorgu, kullanıcının rolüne göre izin verilen `table_name` listesiyle (`EMBEDDING_SOURCE_CONFIG`) ve şube erişimiyle (`branch_id` filtresi) daraltılır. RAG context'e asla erişim izni olmayan bir kaynaktan veri girmez (SearchService'teki modül bazlı `required_permissions` + `branch_filter_qs` deseninin RAG'a uyarlanmış hali — bkz. §5)
- Embedding'e alınacak her kaynak için içerik, modelin tüm alanlarının otomatik dökümü değil, elle tanımlanmış bir **alan allowlist'i** ile üretilir (maliyet, kâr marjı, tedarikçi gibi çalışana özel alanlar müşteri görebileceği kaynaklara asla dahil edilmez)
- **Mutasyon aksiyonları** iki aşamalı: LLM tool-call üretir → backend parametreleri validate eder → kullanıcı onayı (zorunlu, `mode` ne olursa olsun) → `ActionExecutor` çalıştırır. LLM'in ürettiği hiçbir mutasyon fonksiyon çağrısı onay adımı olmadan çalıştırılmaz
- **Read-only query tool'lar** (v4) onay gerektirmez ve toggle'a tabi değildir; ancak her handler kendi içinde RBAC + şube filtresi uygular (salt-okunur oldukları kod incelemesiyle garanti edilir — hiçbir query tool yazma yapamaz)
- **Onay anında yeniden doğrulama (v4):** `/action/confirm/` çalıştırmadan önce (a) toggle'ın hâlâ açık olduğunu, (b) kullanıcının rolünün hâlâ izinli olduğunu, (c) parametrelerin şemaya uyduğunu yeniden kontrol eder. Bekleyen aksiyonun **10 dakikalık TTL'i** vardır — saatler sonra gelen "onayla" isteği reddedilir
- **Feedback sahipliği (v4):** `/feedback/` yalnızca kullanıcının kendi oturumundaki mesajlara feedback kabul eder (`session__user=request.user`); mesaj başına **tek** feedback tutulur (👍→👎 değişikliği kaydı günceller, ikinci satır oluşturmaz)
- Feature toggle: DB'de `ActionToggle` modeli, her aksiyon için `is_enabled=True/False`
- `/api/v1/ai/chat/` ve `/api/v1/ai/tts/` endpoint'lerinde DRF throttle sınıfı zorunludur — chat **10/dk**, TTS **20/dk** (v4: CPU'da tek Ollama slotu varken daha yüksek limit tek kullanıcının servisi doyurmasına izin verir)
- **LLM hataları normal cevap gibi kaydedilmez (v4):** bağlantı/timeout hatasında `LLMClient` exception fırlatır, view 503 döner; hata metni `AIMessage` olarak saklanıp feedback/TrainingExample'a sızmaz

```python
class ActionToggle(BaseModel):
    key = CharField(unique=True)  # "order_create", "reservation_add"
    label = CharField()
    is_enabled = BooleanField(default=False)
    # v4: rol izinleri DB'de değil, ActionRegistry kod tanımındadır
    # (allowed_roles alanı kaldırıldı — implementasyon planı ile tutarlılık)
```

---

## 8. Çoklu Dil Desteği

### 8.1 Mevcut Durum

Proje halihazırda **7 dil** destekliyor: TR, EN, AR, DE, RU, BG, SQ.
AI Assistant da aynı dilleri desteklemelidir.

### 8.2 Nasıl Çalışır

Seçilen tüm model ve kütüphaneler zaten çok dilli olduğu için ek bir maliyet yoktur:

| Bileşen | Çoklu Dil |
|---|---|
| **bge-m3** embedding modeli | 100+ dil (Türkçe, Arapça, Almanca, Rusça dahil) |
| **Qwen3 8B** LLM | Türkçe, İngilizce, Arapça, Almanca, Rusça ve 100+ dil (Turkic ailesi dahil) |
| **Ollama `/api/embed`** | Dil bağımsız — metin ne dildeyse o dilde embedding üretir (bge-m3) |

### 8.3 Veri Akışı

```
Frontend (next-intl ile tespit edilen dil)
  │
  ▼
POST /api/v1/ai/chat/
  "Accept-Language": "en"       ← mevcut HTTP header zaten var
  {
    "message": "Do you have kebab?",
    "language": "en"             ← opsiyonel override
  }
  │
  ▼
LLM Prompt'u:
  system: "You are a restaurant assistant. The user's language is English.
           Always respond in the user's language.
           The menu items may be in Turkish — translate naturally."
  │
  ▼
LLM → "Yes, we have Adana kebab and Urfa kebab available today."
```

**Dil çözüm sırası (v4):** `request.data.language` (varsa) → `Accept-Language` header → `User.preferred_language` (modelde zaten mevcut) → `tr`. Çözülen dil `RAGEngine.answer()`'a parametre olarak geçirilir ve sistem promptuna eklenir — önceki taslakta bu bağlantı tanımlanmamıştı, dil bilgisi prompt'a hiç ulaşmıyordu.

Böylece **Türkçe soru → Türkçe cevap**, **İngilizce soru → İngilizce cevap**.
Menü isimleri orijinal dilinde kalır, LLM gerekiyorsa açıklama ekler.

### 8.4 Embedding'lerde Dil Farkı

Menü verileri Türkçe olsa da embedding model (bge-m3) **çok dilli** olduğu için:
- İngilizce "kebab" ile Türkçe "kebap" aynı vektör uzayında yakın konumlanır
- Kullanıcı İngilizce sorduğunda doğru Türkçe kayıtlar bulunur

---

## 9. Sesli İletişim

### 9.1 Aktif: Sadece Sesli Cevap (TTS — Text-to-Speech)

Bu fazda **aktif** olan özellik: Kullanıcı yazıyla sorar, AI metin cevabını sese çevirip oynatır.

| Bileşen | Model | RAM | CPU Süresi |
|---|---|---|---|
| **Yazı → Ses (TTS)** | Piper TTS (~100MB) | +0.5 GB | ~1-3 sn / yanıt |

**Nasıl çalışır:**

```
Frontend'de AI yanıtı gelir → [🔊 Hoparlör Butonu] belirir
  ↓
Kullanıcı butona tıklar → backend'e POST /api/v1/ai/tts/
  ↓
Piper TTS metni sese çevirir → WAV dosyası döner
  ↓
Frontend'de otomatik oynatılır
```

**API (v4 — POST):**

```python
POST /api/v1/ai/tts/
{ "text": "Evet, Adana kebap mevcut.", "lang": "tr" }
→ Content-Type: audio/wav
→ (binary ses dosyası)
```

**v4 düzeltmeleri:**
- GET → POST: metin query string'de taşınmaz (access log'lara sızar, URL uzunluk limiti var).
- Piper `--output-raw` **ham 16-bit PCM** üretir — tarayıcıdaki `new Audio()` bunu oynatamaz. Backend, PCM'i `wave` modülüyle **WAV header'ına sararak** döner (örnek hız: medium ses modeli için 22050 Hz).
- Piper ses modeli, `.onnx` dosyasının yanında zorunlu `.onnx.json` konfigürasyonunu da gerektirir (kurulum scripti ikisini de indirir).

**Frontend'de:**

```typescript
// AI yanıtı geldiğinde otomatik hoparlör butonu
<ChatMessage message={reply}>
  <SpeakerButton 
    onClick={() => playTTS(reply.content, currentLang)}
  />
  <FeedbackButtons />  {/* 👍/👎 */}
</ChatMessage>

// İsteğe bağlı: otomatik oynat
if (prefs.autoPlayTTS) {
  playTTS(reply.content, currentLang)
}
```

### 9.2 Pasif: Tam Sesli Diyalog (STT + TTS — İleri Faz)

Kullanıcının **konuşarak soru sorduğu** tam sesli mod. Bu fazda **pasif**, ileride eklenmek üzere tasarımı hazır.

| Bileşen | Model | RAM | CPU Süresi |
|---|---|---|---|
| **Ses → Yazı (STT)** | Whisper small (~500MB) | +1 GB | ~3-5 sn / ses kaydı |
| **Yazı → Ses (TTS)** | Piper TTS (~100MB) | +0.5 GB | ~1-3 sn / yanıt |

**Veri Akışı (Gelecek):**

```
Frontend'de mikrofon butonu
  │
  ▼
Kayıt → WAV/MP3 → POST /api/v1/ai/voice/ (multipart)
  │
  ▼
Whisper STT → "Acılı Adana var mı?"
  │
  ▼
Mevcut RAG Pipeline (hiç değişmez)
  │
  ▼
LLM Yanıtı → "Evet mevcut..."
  │
  ▼
Piper TTS → Ses → Frontend'de oynat
```

**API Tasarımı (Gelecek İçin Rezerve):**

```python
POST /api/v1/ai/voice/
Content-Type: multipart/form-data
Authorization: Bearer <JWT>

# Request:
audio: <WAV/MP3 dosyası>
language: "tr"  # opsiyonel

# Response:
{
  "text": "...",           # STT çıktısı
  "reply": "...",          # LLM yanıtı (text)
  "reply_audio_url": "...", # TTS çıktısı (geçici URL)
  "intent": "query"
}
```

### 9.3 Neden Tam Sesli Diyalog Pasif?

| Etken | Detay |
|---|---|
| **RAM** | 16 GB'ın ~7-9 GB'ı LLM + embedding'lere gider (Qwen3 8B ~6-8 GB + bge-m3 ~1 GB). STT eklenince 12+ GB olur, diğer servislere az kalır. |
| **Gecikme** | Ses→Yazı→LLM→Ses döngüsü: 10-15 sn. Metin tabanlı: 2-6 sn (CPU, kısa yanıtlar). |
| **Donanım** | GPU olmadan STT CPU'da ağırdır, POS performansını etkileyebilir. |

**TTS (sesli cevap) ise çok hafif olduğu için bu fazda aktif.**

---

## 10. Feedback Döngüsü ve Sürekli İyileştirme

Sistem kullanıldıkça daha doğru cevaplar verecek şekilde tasarlanmıştır. 
Model **kendi kendine öğrenmez** (statiktir), ancak aşağıdaki mekanizmalar sayesinde zamanla iyileşir.

### 10.1 Kullanıcı Geri Bildirimi (👍/👎)

Her AI yanıtının altında basit bir beğen/beğenme butonu:

```
Kullanıcı: "Adana kebap var mı?"
AI: "Evet, Adana kebap mevcut."
                                    [👍] [👎]
```

- **👍** → `MessageFeedback(rating="positive")` kaydedilir
- **👎** → `MessageFeedback(rating="negative")` kaydedilir, admin panele düşer

### 10.2 Admin Düzeltme Arayüzü

Admin panel (Django Admin veya özel ekran):

```
Admin Panel → AI Assistant → Hatalı Yanıtlar
  ↓
  [Kullanıcı sorusu]    "Acılı Adana var mı?"
  [AI yanıtı]           "Evet, Acılı Adana mevcut."  ← ❌
  [Admin düzeltmesi]    "Hayır, Acılı Adana menümüzde yok. Klasik Adana ve Urfa mevcut."
  [Onayla]
  ↓
TrainingExample tablosuna kaydedilir
→ Bir daha benzer soruda few-shot olarak prompt'a eklenir
```

### 10.3 Few-Shot Learning (Otomatik, benzerlik tabanlı — v4)

TrainingExample kayıtları da embedding kaynağı olarak indekslenir (`ai_trainingexample`, her iki role açık); prompt oluşturulurken kullanıcı sorusuna pgvector ile **en yakın** örnekler seçilir. İlk taslaktaki `order_by('?')` (rastgele seçim) kaldırıldı — rastgele alakasız örnek prompt'u şişirir ve spec'in "benzer soruda düzeltilmiş cevabı kullan" vaadini karşılamaz.

```python
# Prompt oluşturma sırasında (v4):
benzer_ornekler = TrainingService.get_few_shot_examples(
    query=user_message, limit=3,   # pgvector benzerlik + distance eşiği
)

# Prompt'a eklenir:
system_prompt += """
Aşağıda daha önce düzeltilmiş bazı soru-cevap örnekleri var.
Bunlara benzer sorular geldiğinde düzeltilmiş cevabı esas al:

Soru: "Acılı Adana var mı?"
Doğru Cevap: "Hayır, Acılı Adana menümüzde bulunmuyor..."
---
"""
```

### 10.4 Sık Sorulan Sorular (SSS) Önbelleği — İLERİ FAZ (v4)

Bu özellik ilk fazdan **çıkarıldı**. İlk taslaktaki tasarım (`md5(soru)` anahtarı) rol, şube ve dili anahtara dahil etmiyordu — çalışan için üretilmiş bir cevabın müşteriye servis edilmesi (veri sızıntısı) mümkündü. İleri fazda eklenecekse zorunlu koşullar:

```python
# Redis key: ai:sss:{rol}:{branch_scope_hash}:{dil}:{hash(normalize(soru))}
# TTL: 24 saat + kaynak verisi değişince (embedding sync) invalidate
```

### 10.5 İleri Seviye: Lokal Fine-Tuning (Opsiyonel)

Düzeltilmiş örnekler 1000+ seviyesine ulaştığında:

```
Admin butona basar → 
  QLoRA fine-tuning başlatılır (CPU ~1 saat, GPU ~10 dk) →
  Yeni model Ollama'ya yüklenir →
  Eski model arşivlenir →
  Sistem kesintisiz devam eder
```

Bu adım tamamen opsiyoneldir ve ancak istenirse yapılır.

---

## 11. Opsiyonellik (Eklenip Çıkarılabilme)

### Backend — Kaldırma Adımları

1. `settings.py` → `INSTALLED_APPS`'den `'apps.ai_assistant'` satırını sil
2. `urls.py`'den ilgili satırı sil
3. Gerekirse `pip uninstall` ile ai.txt kütüphaneleri kaldır
4. (Opsiyonel) pgvector extension'ı kaldır
5. Migration'lar tersine çevrilir (`migrate ai_assistant zero`)

### Frontend — Kaldırma Adımları

1. `.env.local`'den `NEXT_PUBLIC_ENABLE_AI_ASSISTANT` satırını sil
2. `/features/ai-assistant/` klasörünü sil
3. Build → tree-shake ile AI kodu bundle'a girmez

### Frontend Dynamic Import Deseni

```typescript
// /features/ai-assistant/index.ts
export const AIAssistant = dynamic(
  () => import('@/features/ai-assistant/ChatPanel'),
  { ssr: false, loading: () => null }
)

// Layout'ta kullanım:
const AIAssistant = process.env.NEXT_PUBLIC_ENABLE_AI_ASSISTANT === 'true'
  ? (await import('@/features/ai-assistant')).AIAssistant
  : null

// AI flag yoksa → AIAssistant = null → hiç render olmaz, bundle'a girmez
```

### Sonuç
Projede AI'dan hiçbir import, kod parçası, migration izi kalmaz.  
Mevcut tüm fonksiyonlar aynen çalışmaya devam eder.

---

## 12. Test Stratejisi

| Test Türü | Kapsam |
|---|---|
| Birim test | RAG engine, embedding sync, action executor, feedback pipeline |
| Entegrasyon test | LLM client mock, pgvector sorgulama, few-shot injection |
| API test | Chat endpoint, feedback endpoints, action toggle, RBAC |
| Frontend test | ChatPanel render, 👍/👎 butonları |
| **Golden-set eval (v4)** | 20-30 gerçek soru + beklenen cevap/tool-call çifti (Task 0'da oluşturulur). Mock'lu birim testler cevap **kalitesini** ölçmez; bu set gerçek model üzerinde koşulur ve her prompt/model değişikliğinde tekrarlanır |
| Regression | Mevcut tüm testler hala geçiyor (AI izole olduğu için) |

**CI notu (v4):** `EmbeddingCache` migration'ı pgvector extension'ı gerektirir — CI'daki test PostgreSQL imajında pgvector kurulu olmalıdır (örn. `pgvector/pgvector:pg16`); aksi halde tüm test suite'i migration aşamasında düşer.

---

## 13. Gelecek Ölçekleme

- **Çoklu şube:** Branch scope mevcut, RAG sorgularına branch_id filtresi eklenir
- **Daha büyük model:** Ollama'da model adı değiştirilir (`qwen3:30b-a3b` MoE — 32 GB+ RAM gerekir; veya `qwen3:14b`)
- **GPU hızlandırma:** Ollama otomatik NVIDIA/AMD GPU kullanır
- **Fine-tuning:** Biriken Q&A verisi ile model özelleştirme
- ~~**Batch embedding:** Celery task ile değişen verileri arka planda güncelle~~ → **v4'te faz 1'e alındı** (bkz. §5 Tazelik)
- **Sık sorulan sorular:** Otomatik SSS tespiti ve Redis önbellekleme (v4: cache anahtarı rol+şube+dil içermek zorunda — bkz. §10.4)
- **Asenkron chat:** Celery task + WebSocket/poll — senkron view worker'ı kilitler, kullanıcı sayısı artınca geçilir (bkz. §3.4)

---

## 14. Non-Goals (Bu Fazda Yok)

- ❌ Model fine-tuning (ilk fazda yok — opsiyonel ileri faz)
- ✅ Sesli çıktı (TTS) — Aktif. Piper TTS ile metin→ses.
- ❌ Sesli girdi (STT) — Pasif. İleri faza hazır.
- ❌ SSE / token-token streaming — İlk fazda yok. `/api/v1/ai/chat/` sadece JSON döner. İleri fazda eklenebilir.
- ❌ SSS önbelleği — İleri faza taşındı (v4). Cache anahtarı rol+şube+dil içermeden veri sızıntısı riski taşır (bkz. §10.4).
- ❌ Anonim müşteri erişimi (QR menüden hesapsız sohbet) — İleri faz; masa-token bazlı kimlik tasarımı gerektirir (bkz. §1).
- ❌ Celery task + WebSocket ile asenkron chat — İlk fazda senkron view + düşük throttle (bkz. §3.4); kullanıcı sayısı artınca geçilir.
- ❌ 3. parti AI servis entegrasyonu (tamamen lokal)
- ❌ Görüntülü girdi (fotoğraftan yemek tanıma vb.)
- ❌ Yüksek kullanıcı sayısı için yatay ölçekleme

---

*Taslak — kullanıcı onayı bekliyor*
