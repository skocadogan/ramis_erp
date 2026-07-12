# AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ramis ERP içinde tamamen yerel çalışan, RAG tabanlı bir AI asistanı inşa etmek.

**Architecture:** Django app (`apps/ai_assistant`) + pgvector + Ollama (Qwen3 8B) + Piper TTS. Frontend'de dynamic import ile opsiyonel. Mevcut projeye hiçbir bağımlılık eklemez, `INSTALLED_APPS`'den kaldırılabilir.

**Tech Stack:** Django 6, DRF, PostgreSQL 16 + pgvector (gerçek `VectorField`, `pgvector` pip paketi), Ollama (Qwen3 8B Q4_K_M `qwen3:8b` + `bge-m3` embedding — v4: sentence-transformers/torch kaldırıldı), Piper TTS, Celery (embedding tazeliği), Next.js 16

## Revizyon Log (v2 — inceleme sonrası düzeltmeler)

İlk taslak, spec ile karşılaştırmalı incelemede aşağıdaki kritik sorunları içeriyordu. Bu versiyon bunları düzeltir:

| # | Sorun | Düzeltme |
|---|---|---|
| 1 | `EmbeddingCache` aslında `JSONField` kullanıyordu, "pgvector" adı altında Python'da brute-force cosine similarity ile tüm tablo taranıyordu | Gerçek `pgvector.django.VectorField` + HNSW index + SQL seviyesinde `CosineDistance` sorgusu (Task 2) |
| 2 | `LLMClient.chat` Ollama'nın `tool_calls` alanını hiç okumuyordu; `ActionExecutor` hiçbir yerden çağrılmıyordu; `/action/confirm/` endpoint'i spec'te vardı ama planda yoktu | `LLMClient.chat` tool_calls'ı parse eder; `RAGEngine` bekleyen aksiyonu `AIMessage.metadata`'da saklar; yeni `ActionConfirmView` eklendi (Task 4, Task 8) |
| 3 | Chat response'da asistan mesajının gerçek `AIMessage.id`'si hiç dönmüyordu; frontend `feedback` için `Date.now()` tabanlı sahte ID kullanıyordu — feedback sistemi çalışmıyordu | `RAGEngine.answer` ve `ChatResponseSerializer`'a `message_id` eklendi; frontend gerçek ID'yi kullanacak şekilde güncellendi (Task 4, 8, 9) |
| 4 | `EmbeddingService.search()` rol/şube filtresi uygulamıyordu; `_serialize_object` modelin tüm alanlarını (maliyet, kâr marjı dahil) otomatik embed ediyordu → veri sızıntısı riski | `EMBEDDING_SOURCE_CONFIG` ile kaynak başına izinli rol + alan allowlist'i + `branch_id` filtresi zorunlu hale getirildi (Task 2, 4) |
| 5 | `training.py` içinde `models.F(...)` kullanılıyor ama `django.db.models` import edilmemişti — kod çalışmazdı | Import eklendi (Task 4) |
| 6 | `actions.py`, projede var olmayan servisleri (`apps.orders.services.OrderService`, `apps.branches.services.WaiterCallService`) import ediyordu | Gerçek entegrasyon noktasına bağlanana kadar açıkça "stub" olarak işaretlendi, sahte import kaldırıldı (Task 5) |
| 7 | pgvector `CREATE EXTENSION` çağrısı migration yerine her istekte runtime'da çalıştırılıyordu | Migration'a taşındı (Task 1) |
| 8 | Spec, SSE streaming'i merkezi özellik gibi sunuyordu ama hiçbir task'ta implemente edilmemişti | İlk fazda kaldırıldı, ileri faza not edildi (spec §6, §14) |
| 9 | `/api/v1/ai/chat/` gibi pahalı endpoint'lerde rate limiting yoktu | DRF throttle sınıfları eklendi (Task 8) |
| 10 | PostgreSQL sürümü "17" olarak yazılmıştı, proje **16** kullanıyor | Düzeltildi |
| 11 | Varsayılan LLM `Qwen 2.5 7B` — 7B sınıfında zayıf tool-calling, Qwen3 ile aynı RAM bütçesinde daha iyi | `qwen3:8b` varsayılan; `think: false` zorunlu (Task 3); infra script güncellendi (Task 10) |

## Revizyon Log (v4 — geliştirici incelemesi sonrası düzeltmeler)

| # | Sorun | Düzeltme |
|---|---|---|
| 12 | `EmbeddingSync.register_source()` planın hiçbir task'ında çağrılmıyordu — `REGISTERED_SOURCES` boş kalır, `sync_embeddings` hiçbir şey yapmaz, RAG context'i hep boş olurdu | Kaynak kaydı `AiAssistantConfig.ready()` içinde yapılır; Task 2'ye `source_registration.py` adımı eklendi |
| 13 | `_detect_role` `is_staff`/`is_superuser`'a bakıyordu; projede roller `User.roles` (rbac.Role, RBACUserMixin) üzerinden — garson/aşçı `is_staff` olmadığı için tüm çalışanlar "müşteri" sınıflanırdı | Rol tespiti RBAC rollerine bağlandı (Task 4); müşteri kimliği açık sorusu spec §1'e işlendi |
| 14 | Çalışan senaryosu ("bugün kaç satış oldu?") vektör RAG ile çözülemez — aggregate/anlık sorgular embedding'lerde yoktur ve her zaman bayattır | Read-only **query tools** katmanı eklendi: toggle/onaydan bağımsız, RBAC/şube filtreli salt-okunur tool'lar (Task 4, 5) |
| 15 | sentence-transformers her gunicorn worker'ında ~2 GB bge-m3 kopyası yükler — 4 worker'da 8 GB, 16 GB bütçe patlar | Embedding, Ollama `/api/embed` üzerinden (tek kopya bellekte); torch/sentence-transformers bağımlılığı kaldırıldı (Task 1, 2) |
| 16 | Sync sadece `is_active=True` kayıtları günceller; menüden kaldırılan ürünün embedding'i kalır → AI var olmayan ürünü önerir | `sync_table` bayat kayıtları siler; `post_save` sinyali + Celery task ile tazelik faz 1'e alındı (Task 2) |
| 17 | Ollama `num_ctx` set edilmiyordu — varsayılan pencere küçük, prompt sessizce baştan kırpılır ve sistem promptu kaybolur | `options.num_ctx` (`AI_LLM_NUM_CTX`, varsayılan 8192) eklendi; timeout 30→120 sn (Task 3) |
| 18 | LLM hataları kullanıcı-dostu string olarak dönüyordu — hata metni `AIMessage` olarak kaydedilir, feedback/TrainingExample'a sızardı | `LLMClient` artık `LLMUnavailableError` fırlatır; `ChatView` 503 döner (Task 3, 8) |
| 19 | `submit_feedback` mesaj sahipliği kontrol etmiyordu (herhangi bir `message_id`'ye feedback bırakılabilirdi); `unique_together=('message','rating')` aynı mesaja hem 👍 hem 👎 satırı oluştururdu | Sahiplik kontrolü (`session__user`) + mesaj başına tek feedback (Task 1, 6) |
| 20 | `ActionConfirmView` onay anında toggle/rol/parametre yeniden doğrulamıyordu; bekleyen aksiyonun süresi yoktu | Onay anında yeniden doğrulama + 10 dk TTL (Task 8) |
| 21 | SSS önbelleği anahtarı `md5(soru)` — rol/şube/dil yok, çalışan cevabı müşteriye servis edilebilirdi; üstelik `get_cached` RAGEngine'den hiç çağrılmıyordu (ölü kod) | İlk fazdan çıkarıldı (spec §10.4, §14) |
| 22 | Few-shot `order_by('?')` ile rastgele seçiliyordu — spec'in "benzer soruda" vaadiyle çelişir, alakasız örnek prompt'u şişirir; `increment_usage` soru metniyle eşleştirmesi kırılgandı | Benzerlik tabanlı seçim (TrainingExample'lar da embed edilir) + ID ile usage takibi (Task 4) |
| 23 | `search()` alakasız olsa da top_k döndürüyordu — alakasız context halüsinasyonu besler | `AI_MAX_DISTANCE` cosine distance eşiği eklendi (Task 2) |
| 24 | Dil hiç bağlanmamıştı — spec §8 dili prompt'a geçirmeyi anlatıyor ama RAGEngine'de dil parametresi yoktu; `User.preferred_language` alanı da kullanılmıyordu | `language` parametresi + çözüm sırası (request > Accept-Language > preferred_language) (Task 4, 8) |
| 25 | Piper `--output-raw` ham PCM üretir — `audio/wav` diye dönülüyordu, tarayıcı `new Audio()` oynatamaz; TTS GET ile metni query string'e koyuyordu (access log sızıntısı); setup script `.onnx.json`'ı indirmiyor ve sudo'suz sistem dizinlerine yazıyordu | WAV header sarma (`wave` modülü), GET→POST, script düzeltmeleri (Task 7, 8, 10) |
| 26 | `ollama.service` `OLLAMA_HOST=0.0.0.0` — Ollama auth'suzdur, model ağa açılırdı | `127.0.0.1` (Task 10) |
| 27 | Embedding testi yanlış hedefi patch'liyordu (`SentenceTransformer` modül seviyesinde import edilmiyor) — test gerçek modeli indirmeye çalışırdı | Testler Ollama HTTP mock'una geçirildi (Task 2) |
| 28 | Kalite/gecikme hiç ölçülmeden 10 task'lık inşaata giriliyordu; hiçbir test cevap kalitesini ölçmüyordu | **Task 0: spike + golden set** eklendi — go/no-go kriterli; golden set kalıcı eval olur |
| 29 | Frontend'de hardcoded Türkçe metinler (`next-intl` kuralına aykırı); `dynamic(..., {ssr:false})` server component olan layout'ta çalışmaz | i18n mesaj anahtarları + client wrapper (`AIAssistantMount.tsx`) (Task 9) |
| 30 | Throttle 30/dk — `OLLAMA_NUM_PARALLEL=1` iken tek kullanıcı servisi doyurur | chat 10/dk (Task 8) |

---

## Global Constraints

- Tüm yeni kod `backend/apps/ai_assistant/` altında olmalıdır
- Mevcut Django app'lerine (`menu`, `orders`, `inventory`...) hiçbir import eklenmemelidir
- Tüm API endpoint'leri `/api/v1/ai/` prefix'i altında olmalıdır
- Tüm endpoint'ler `IsAuthenticated` korumasında olmalıdır
- Branch scope + RBAC, SearchService'teki desenle aynı şekilde uygulanmalıdır
- Frontend AI kodu dynamic import ile yüklenmeli, `NEXT_PUBLIC_ENABLE_AI_ASSISTANT=false` iken bundle'a girmez
- Tüm service katmanları birim test edilebilir olmalıdır (LLM client mock ile)
- Aksiyon toggle'ı kapalıyken function'lar LLM prompt'una eklenmez
- Model asla fine-tune edilmez (bu fazda) — yanıtlar RAG + few-shot ile iyileşir
- LLM'in ürettiği hiçbir function call, kullanıcı onayı olmadan çalıştırılmaz (iki aşamalı: öner → onayla → çalıştır)
- `EmbeddingService.search()` her zaman çağıran kullanıcının rolüne ve şube erişimine göre filtrelenir; retrieval katmanında rol/şube kontrolü yalnızca prompt talimatına bırakılamaz
- Embedding'e alınan her veri kaynağı için içerik, elle tanımlanmış alan allowlist'i ile üretilir — bir modelin tüm alanlarının otomatik dökümü yasaktır
- Chat response'u her zaman asistan mesajının gerçek `message_id`'sini döner (feedback/aksiyon onayı bu ID'yi referans alır)
- `/api/v1/ai/chat/` ve `/api/v1/ai/tts/` endpoint'leri DRF throttle sınıfıyla korunur (chat 10/dk, TTS 20/dk)
- Varsayılan LLM: `qwen3:8b` (`settings.AI_LLM_MODEL`). Qwen3 thinking modu kapalı gönderilir (`think: false`) — açık bırakılırsa gecikme ciddi artar
- **(v4)** Embedding üretimi Ollama `/api/embed` (`bge-m3`) üzerinden yapılır — sentence-transformers/torch worker başına ~2 GB RAM yükler, yasaktır
- **(v4)** Her LLM isteğinde `options.num_ctx` açıkça set edilir (`AI_LLM_NUM_CTX`); prompt bütçesi bu pencereye göre yönetilir
- **(v4)** Embedding kaynakları `AiAssistantConfig.ready()` içinde kayıt edilir; kayıtsız kaynak sync/aramada görünmez (fail-closed). Sync, kaynakta artık bulunmayan/pasif kayıtların embedding'lerini siler
- **(v4)** Rol tespiti `is_staff` ile değil projenin RBAC rolleri (`User.roles`) ile yapılır
- **(v4)** Read-only query tool'lar toggle/onaydan bağımsızdır ama hiçbir yazma işlemi yapamaz ve kendi içinde RBAC + şube filtresi uygular; mutasyon aksiyonları onay anında yeniden doğrulanır (toggle + rol + parametre) ve 10 dk TTL taşır
- **(v4)** Feedback yalnızca kullanıcının kendi oturumundaki mesajlara kabul edilir; mesaj başına tek feedback tutulur
- **(v4)** LLM bağlantı/timeout hataları exception olarak yükselir (503) — hata metni asla `AIMessage` olarak kaydedilmez
- **(v4)** Frontend'de kullanıcıya görünen tüm metinler `next-intl` mesaj dosyalarından gelir (hardcoded Türkçe yasak)
- **(v4)** Task 0 (spike + golden set) tamamlanıp go kararı verilmeden Task 2+ implementasyonuna başlanmaz

## Branch Stratejisi

- Tüm AI Assistant geliştirmesi **`feat/ai-assistant`** branch'inde yapılacaktır
- `main` (veya `develop`) branch'inden `feat/ai-assistant` branch'i açılır
- Her task kendi commit'ini alır, asla büyük tek commit yapılmaz
- Tüm task'lar tamamlanıp testler yeşil olduğunda, `feat/ai-assistant` branch'i `main`'e merge edilir
- Merge öncesi son kontroller:
  - Mevcut tüm proje testleri geçiyor mu? (`pytest`, `npm run test`)
  - `main` branch'inde hiçbir AI kodu çalışıyor mu? (toggle kapalıyken etkisiz)
  - AI kodu `INSTALLED_APPS`'den çıkınca proje sorunsuz çalışıyor mu?
- Branch izolasyonu sayesinde AI çalışmaları diğer ekiplerin kodlarını **asla etkilemez**
- Her commit sonrası `git push origin feat/ai-assistant` yapılması önerilir (yedekleme + ekip senkronizasyonu)

---

## File Structure

### Backend (Create — `backend/apps/ai_assistant/`)

```
apps/ai_assistant/
├── __init__.py
├── apps.py                    # AppConfig
├── models.py                  # ChatSession, AIMessage, MessageFeedback,
│                              #   TrainingExample, EmbeddingCache, ActionToggle
├── admin.py                   # Admin kayıtları
├── views.py                   # ChatView, FeedbackView, AdminViews, TTSView
├── urls.py                    # URL routing
├── serializers.py             # DRF serializers
├── services/
│   ├── __init__.py
│   ├── embedding_sources.py   # Kaynak başına rol/şube erişim config'i (fail-closed)
│   ├── source_registration.py # (v4) Kaynak kayıtları + post_save sinyalleri — apps.py ready()'den çağrılır
│   ├── embeddings.py          # Ollama /api/embed + pgvector (gerçek VectorField araması, distance eşiği)
│   ├── llm_client.py          # Ollama HTTP client + tool_call parsing (num_ctx, LLMUnavailableError)
│   ├── rag_engine.py          # RAG pipeline (dil, RBAC rol tespiti, query-tool loop)
│   ├── actions.py             # Mutasyon aksiyonları executor (onay sonrası)
│   ├── query_tools.py         # (v4) Read-only sorgu tool'ları (stok/satış özetleri) — onaysız, RBAC'lı
│   ├── action_registry.py     # Tool tanımları (kind: query|mutation) + toggle
│   ├── embedding_sync.py      # Embedding güncelleme (alan allowlist, bayat kayıt temizliği, batch)
│   ├── feedback.py            # Feedback işleme (sahiplik kontrolü)
│   ├── training.py            # Benzerlik tabanlı few-shot
│   └── tts.py                 # Piper TTS wrapper (PCM → WAV)
├── tasks.py                   # (v4) Celery: debounce'lu embedding sync
├── management/
│   ├── __init__.py
│   └── commands/
│       ├── __init__.py
│       ├── sync_embeddings.py
│       └── check_model.py
├── migrations/
│   └── __init__.py
└── tests/
    ├── __init__.py
    ├── conftest.py            # Test fixtures
    ├── test_embeddings.py
    ├── test_rag_engine.py
    ├── test_views.py
    ├── test_actions.py
    └── test_feedback.py
```

### Backend (Modify)

| File | Change |
|---|---|
| `backend/config/settings.py` | `INSTALLED_APPS` + `'apps.ai_assistant'` |
| `backend/config/urls.py` | `path('api/v1/ai/', include('apps.ai_assistant.urls'))` |
| `backend/requirements/ai.txt` | Yeni dosya (AI bağımlılıkları) |

### Frontend (Create — `frontend/src/features/ai-assistant/`)

```
features/ai-assistant/
├── index.ts                   # Public API + dynamic import
├── types.ts                   # Message, Feedback, TTS types
├── api.ts                     # AI Assistant API calls
├── ChatPanel.tsx              # Ana sohbet container
├── ChatMessage.tsx            # Tek mesaj bubble
├── FeedbackButtons.tsx        # 👍/👎 butonları
├── SpeakerButton.tsx          # 🔊 TTS butonu
└── ChatInput.tsx              # Mesaj yazma alanı
```

### Infrastructure (Create)

```
infra/
├── ollama.service             # systemd unit
├── ollama.setup.sh            # Kurulum + model çekme
└── piper.setup.sh             # Piper TTS kurulum
```

---

## Task Breakdown

---

### Task 0: Spike — Model Kalite/Gecikme Ölçümü + Golden Set (v4)

**Amaç:** En büyük risk kod değil, "CPU'da Qwen3 8B Türkçe'de yeterince iyi ve hızlı mı?" sorusudur. 10 task'lık inşaata girmeden önce yarım günlük bir deneyle **go/no-go** kararı verilir. Bu task'ta hiçbir Django kodu yazılmaz.

**Files:**
- Create: `docs/superpowers/eval/ai-assistant-golden-set.jsonl`
- Create: `docs/superpowers/eval/run_eval.py` (bağımsız script, Django'suz)

- [ ] **Step 1: Ollama'yı kur ve modelleri çek** (Task 10'daki scriptler kullanılabilir)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3:8b
ollama pull bge-m3
```

- [ ] **Step 2: Golden set oluştur** — Gerçek menü/stok verisinden derlenmiş **20-30 soru**; her satırda: soru (7 dilden en az TR+EN+DE örnekleri), rol (`musteri`/`calisan`), beklenen cevap özü veya beklenen tool-call, soru tipi (`rag` / `query_tool` / `mutation`). Bu dosya kalıcıdır — her prompt/model değişikliğinde yeniden koşulur.

- [ ] **Step 3: Eval scriptini yaz ve koş** — `run_eval.py`: her golden-set sorusunu temsili bir sistem promptu + elle hazırlanmış context ile `qwen3:8b`'ye (think:false, num_ctx set edilmiş) gönderir; ölçer:
  - İlk yanıt süresi ve toplam süre (hedef: kısa cevapta p50 < 8 sn, p95 < 20 sn — CPU)
  - Türkçe cevap kalitesi (elle skorlama: doğru/kısmen/yanlış)
  - Tool-calling güvenilirliği: mutasyon/sorgu sorularında doğru fonksiyon + doğru parametre oranı (hedef: > %80)
  - Dil takibi: İngilizce soruya İngilizce cevap oranı

- [ ] **Step 4: Go/No-Go kararı** — Hedefler tutmuyorsa alternatifler değerlendirilir (küçük model + streaming'in öne çekilmesi, `qwen3:14b` + RAM planı, GPU): sonuç ne olursa olsun bu doküman güncellenir. **Go kararı olmadan Task 2+ başlamaz.**

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/eval/
git commit -m "feat(ai): add golden-set eval and spike results"
```

---

### Task 1: Foundation — App Scaffolding, Models, Admin

**Files:**
- Create: `backend/apps/ai_assistant/__init__.py`
- Create: `backend/apps/ai_assistant/apps.py`
- Create: `backend/apps/ai_assistant/models.py`
- Create: `backend/apps/ai_assistant/admin.py`
- Create: `backend/apps/ai_assistant/migrations/__init__.py`
- Create: `backend/apps/ai_assistant/services/__init__.py`
- Create: `backend/apps/ai_assistant/management/__init__.py`
- Create: `backend/apps/ai_assistant/management/commands/__init__.py`
- Create: `backend/apps/ai_assistant/tests/__init__.py`
- Create: `backend/apps/ai_assistant/tests/conftest.py`
- Create: `backend/requirements/ai.txt`
- Modify: `backend/config/settings.py`
- Modify: `backend/config/urls.py`

**Interfaces:**
- Consumes: `BaseModel` from `core.models`, Django admin, DRF
- Produces: Database models used by all subsequent tasks

- [ ] **Step 0: Branch oluştur ve hazırlık**

```bash
# Ana branch'ten yeni branch aç
git checkout main
git pull origin main
git checkout -b feat/ai-assistant

# AI requirements dosyasını oluştur
touch backend/requirements/ai.txt
```

- [ ] **Step 1: Create app structure**

```bash
mkdir -p backend/apps/ai_assistant/services
mkdir -p backend/apps/ai_assistant/management/commands
mkdir -p backend/apps/ai_assistant/migrations
mkdir -p backend/apps/ai_assistant/tests
touch backend/apps/ai_assistant/__init__.py
touch backend/apps/ai_assistant/services/__init__.py
touch backend/apps/ai_assistant/management/__init__.py
touch backend/apps/ai_assistant/management/commands/__init__.py
touch backend/apps/ai_assistant/migrations/__init__.py
touch backend/apps/ai_assistant/tests/__init__.py
```

- [ ] **Step 2: Write apps.py**

```python
# backend/apps/ai_assistant/apps.py
from django.apps import AppConfig


class AiAssistantConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.ai_assistant'
    verbose_name = 'AI Asistan'

    def ready(self):
        # v4: Embedding kaynak kayıtları + post_save sinyalleri burada bağlanır.
        # Bu import olmadan REGISTERED_SOURCES boş kalır, sync_embeddings hiçbir
        # şey yapmaz ve RAG context'i hep boş döner (bkz. Task 2 Step 6b).
        from .services import source_registration  # noqa: F401
```

**Not:** `source_registration.py` Task 2'de yazılacağı için, Task 1 aşamasında bu import geçici olarak try/except'e alınabilir veya dosya boş oluşturulur — Task 2 sonunda gerçek içerik gelir.

- [ ] **Step 3: Write models.py**

```python
# backend/apps/ai_assistant/models.py
import uuid
from django.db import models
from django.conf import settings
from core.models import BaseModel


class ChatSession(BaseModel):
    """Bir kullanıcının AI ile yaptığı sohbet oturumu."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='ai_sessions'
    )
    role = models.CharField(
        max_length=20, choices=[('musteri', 'Müşteri'), ('calisan', 'Çalışan')],
        default='calisan'
    )
    title = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        verbose_name = 'Sohbet Oturumu'
        verbose_name_plural = 'Sohbet Oturumları'
        ordering = ['-created_at']


class AIMessage(BaseModel):
    """Sohbet içindeki bir mesaj."""
    session = models.ForeignKey(
        ChatSession, on_delete=models.CASCADE,
        related_name='messages'
    )
    role = models.CharField(
        max_length=20,
        choices=[('user', 'Kullanıcı'), ('assistant', 'Asistan'), ('system', 'Sistem')]
    )
    content = models.TextField()
    metadata = models.JSONField(null=True, blank=True, default=dict)

    class Meta:
        verbose_name = 'AI Mesajı'
        verbose_name_plural = 'AI Mesajları'
        ordering = ['created_at']


class MessageFeedback(BaseModel):
    """Kullanıcı geri bildirimi — her mesajın altındaki 👍/👎."""
    message = models.ForeignKey(
        AIMessage, on_delete=models.CASCADE,
        related_name='feedback'
    )
    rating = models.CharField(
        max_length=10, choices=[('positive', 'Beğenildi'), ('negative', 'Beğenilmedi')]
    )
    comment = models.TextField(blank=True, default='')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reviewed_feedback'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Mesaj Geri Bildirimi'
        verbose_name_plural = 'Mesaj Geri Bildirimleri'
        # v4: mesaj başına TEK feedback. Önceki ('message', 'rating') tanımı aynı
        # mesaja hem 👍 hem 👎 satırı oluşturuyordu; fikir değişikliği artık
        # mevcut kaydı günceller (bkz. Task 6 update_or_create).
        unique_together = [('message',)]


class TrainingExample(BaseModel):
    """Admin tarafından düzeltilmiş soru-cevap çifti — few-shot için."""
    question = models.TextField()
    incorrect_answer = models.TextField(blank=True, default='')
    correct_answer = models.TextField()
    source_message = models.ForeignKey(
        AIMessage, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='training_examples'
    )
    usage_count = models.IntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='created_training_examples'
    )

    class Meta:
        verbose_name = 'Eğitim Örneği'
        verbose_name_plural = 'Eğitim Örnekleri'
        ordering = ['-usage_count', '-created_at']

    def __str__(self):
        return self.question[:80]


class ActionToggle(BaseModel):
    """Aksiyon toggle'ı — hangi aksiyonların açık olduğunu kontrol eder."""
    key = models.CharField(max_length=100, unique=True)
    label = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    is_enabled = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Aksiyon Toggle'
        verbose_name_plural = 'Aksiyon Toggleları'
        ordering = ['key']

    def __str__(self):
        return f"{self.label} ({'Açık' if self.is_enabled else 'Kapalı'})"


class EmbeddingCache(BaseModel):
    """Veritabanı nesnelerinin vektör embedding'leri — gerçek pgvector VectorField.

    NOT: İlk taslakta bu alan yanlışlıkla JSONField olarak tanımlanmış ve
    benzerlik araması Python'da tüm tabloyu tarayarak yapılıyordu. Bu,
    pgvector'ı fiilen kullanmayan, ölçeklenmeyen bir yaklaşımdı. Doğru
    kurulum: `pip install pgvector`, `from pgvector.django import VectorField, HnswIndex`.
    """
    table_name = models.CharField(max_length=100, db_index=True)
    row_id = models.UUIDField()
    content = models.TextField()
    embedding = VectorField(dimensions=1024, null=True, blank=True)  # bge-m3 = 1024
    branch_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    content_hash = models.CharField(max_length=64, db_index=True)

    class Meta:
        verbose_name = 'Embedding Önbelleği'
        verbose_name_plural = 'Embedding Önbelleği'
        unique_together = [('table_name', 'row_id')]
        indexes = [
            models.Index(fields=['table_name', 'content_hash']),
            models.Index(fields=['table_name', 'branch_id']),
            HnswIndex(
                name='embedding_hnsw_idx',
                fields=['embedding'],
                m=16,
                ef_construction=64,
                opclasses=['vector_cosine_ops'],
            ),
        ]
```

**Import eklenmeli:** `models.py` başına `from pgvector.django import VectorField, HnswIndex` eklenir.

**pgvector extension migration'da oluşturulmalı, runtime'da değil.** İlk taslakta `_ensure_pgvector()` her arama isteğinde `CREATE EXTENSION IF NOT EXISTS vector` çalıştırıyordu — çoğu managed PostgreSQL ortamında uygulama kullanıcısının bu yetkisi olmaz ve DDL'in istek yolunda çalıştırılması anti-pattern'dir. Bunun yerine ilk migration'a eklenir:

```python
# backend/apps/ai_assistant/migrations/0001_initial.py — migrations.RunSQL veya
# django.contrib.postgres yerine pgvector'ın kendi migration operation'ı:
from pgvector.django import VectorExtension

class Migration(migrations.Migration):
    operations = [
        VectorExtension(),
        # ... model create operation'ları
    ]
```

- [ ] **Step 4: Write admin.py**

```python
# backend/apps/ai_assistant/admin.py
from django.contrib import admin

from .models import (
    ChatSession, AIMessage, MessageFeedback,
    TrainingExample, ActionToggle, EmbeddingCache
)


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'role', 'title', 'created_at', 'is_active']
    list_filter = ['role', 'is_active', 'created_at']
    search_fields = ['user__email', 'title']


@admin.register(AIMessage)
class AIMessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'session', 'role', 'created_at', 'content_preview']
    list_filter = ['role', 'created_at']
    search_fields = ['content']

    def content_preview(self, obj):
        return obj.content[:80] + '...' if len(obj.content) > 80 else obj.content
    content_preview.short_description = 'İçerik'


@admin.register(MessageFeedback)
class MessageFeedbackAdmin(admin.ModelAdmin):
    list_display = ['message', 'rating', 'reviewed_by', 'reviewed_at', 'created_at']
    list_filter = ['rating', 'reviewed_at']
    actions = ['mark_reviewed']

    def mark_reviewed(self, request, queryset):
        from django.utils import timezone
        queryset.update(reviewed_by=request.user, reviewed_at=timezone.now())
    mark_reviewed.short_description = "Seçili feedback'leri incelendi olarak işaretle"


@admin.register(TrainingExample)
class TrainingExampleAdmin(admin.ModelAdmin):
    list_display = ['question', 'correct_answer', 'usage_count', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['question', 'correct_answer']
    actions = ['reset_usage_count']

    def reset_usage_count(self, request, queryset):
        queryset.update(usage_count=0)
    reset_usage_count.short_description = "Kullanım sayılarını sıfırla"


@admin.register(ActionToggle)
class ActionToggleAdmin(admin.ModelAdmin):
    list_display = ['key', 'label', 'is_enabled', 'created_at']
    list_filter = ['is_enabled']
    search_fields = ['key', 'label']
    list_editable = ['is_enabled']


@admin.register(EmbeddingCache)
class EmbeddingCacheAdmin(admin.ModelAdmin):
    list_display = ['table_name', 'row_id', 'content_hash', 'updated_at']
    list_filter = ['table_name']
```

- [ ] **Step 5: Write conftest.py for tests**

```python
# backend/apps/ai_assistant/tests/conftest.py
import pytest
from django.contrib.auth import get_user_model


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient
    return APIClient()


@pytest.fixture
def user(db):
    return get_user_model().objects.create_user(
        email='test@example.com',
        password='testpass123'
    )


@pytest.fixture
def admin_user(db):
    return get_user_model().objects.create_superuser(
        email='admin@example.com',
        password='admin123'
    )


@pytest.fixture
def chat_session(user):
    from apps.ai_assistant.models import ChatSession
    return ChatSession.objects.create(user=user, role='calisan')
```

- [ ] **Step 6: Add to settings.py**

```python
# backend/config/settings.py — INSTALLED_APPS bölümüne ekle:
    'apps.ai_assistant',
# (opsiyonel, yorum satırı olarak da eklenebilir — toggle için)
```

- [ ] **Step 7: Create requirements file**

```
# backend/requirements/ai.txt
# AI Assistant bağımlılıkları — sadece bu özellik aktifken yüklenir
# v4: sentence-transformers/torch KALDIRILDI — embedding Ollama /api/embed
# üzerinden yapılır (bge-m3, tek kopya bellekte; worker başına ~2 GB tasarruf)
pgvector>=0.3.0  # VectorField ve HnswIndex için — psycopg2-binary zaten ana requirements'ta var
httpx>=0.27.0  # Ollama API çağrıları için (chat + embed)
```

**Not (v4):** Piper TTS, pip paketi yerine standalone binary olarak kurulur (Task 10) — `piper-tts` pip bağımlılığı da kaldırıldı; backend onu `subprocess` ile çağırır.

- [ ] **Step 8: Run initial migration**

```bash
source backend/venv/bin/activate
cd backend
python manage.py makemigrations ai_assistant
python manage.py migrate ai_assistant
```

**CI notu (v4):** `EmbeddingCache` migration'ı pgvector extension'ı gerektirir. CI'daki test PostgreSQL imajı pgvector içermelidir (örn. `pgvector/pgvector:pg16`); aksi halde **tüm** test suite'i migration aşamasında düşer. CI konfigürasyonu bu task kapsamında güncellenir.

- [ ] **Step 9: Commit**

```bash
git add backend/apps/ai_assistant/
git add backend/config/settings.py
git add backend/requirements/ai.txt
git commit -m "feat(ai): add AI Assistant app scaffold with models and admin"
```

---

### Task 2: Embedding Service + pgvector Setup

**Files:**
- Create: `backend/apps/ai_assistant/services/embedding_sources.py`
- Create: `backend/apps/ai_assistant/services/embeddings.py`
- Create: `backend/apps/ai_assistant/services/embedding_sync.py`
- Create: `backend/apps/ai_assistant/services/source_registration.py` (v4 — kaynak kayıtları + sinyaller)
- Create: `backend/apps/ai_assistant/tasks.py` (v4 — Celery sync task)
- Create: `backend/apps/ai_assistant/management/commands/sync_embeddings.py`
- Modify: `backend/apps/ai_assistant/admin.py` (embedding sync action)

**Interfaces:**
- Consumes: `EmbeddingCache` model (Task 1), Ollama `/api/embed` (bge-m3), `pgvector.django`
- Produces: `EmbeddingService.get_embedding(text) -> list[float]`, `EmbeddingService.get_embeddings(texts) -> list[list[float]]` (batch), `EmbeddingService.search(query, role, branch_ids, table_name, top_k) -> list[dict]`

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/ai_assistant/tests/test_embeddings.py
import pytest
from unittest.mock import patch, MagicMock


class TestEmbeddingService:
    # v4: Önceki test 'apps...embeddings.SentenceTransformer'ı patch'liyordu ama
    # o isim modül seviyesinde import edilmiyordu (lazy import) — patch etkisizdi
    # ve test gerçek modeli indirmeye çalışırdı. Embedding artık Ollama /api/embed
    # olduğu için httpx mock'lanır.
    def test_get_embedding_returns_float_list(self):
        """get_embedding bir float listesi döndürmelidir (Ollama /api/embed mock)."""
        from apps.ai_assistant.services.embeddings import EmbeddingService

        mock_response = MagicMock()
        mock_response.json.return_value = {'embeddings': [[0.1, 0.2, 0.3]]}

        with patch('httpx.Client') as mock_client:
            mock_instance = MagicMock()
            mock_instance.post.return_value = mock_response
            mock_client.return_value.__enter__.return_value = mock_instance

            result = EmbeddingService.get_embedding("test metin")
            assert isinstance(result, list)
            assert len(result) > 0
            assert all(isinstance(x, float) for x in result)

    def test_search_requires_min_query_length(self, db):
        """Çok kısa sorgular boş sonuç döndürmelidir."""
        from apps.ai_assistant.services.embeddings import EmbeddingService
        
        result = EmbeddingService.search("a", role="musteri", branch_ids=None, top_k=5)
        assert result == []

    def test_search_returns_empty_for_unknown_role(self, db):
        """Config'te tanımlı olmayan/erişimi olmayan bir rol için hiçbir kaynak dönmemelidir (fail-closed)."""
        from apps.ai_assistant.services.embeddings import EmbeddingService

        result = EmbeddingService.search("acılı adana var mı", role="misafir", branch_ids=None, top_k=5)
        assert result == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python -m pytest apps/ai_assistant/tests/test_embeddings.py -v
```

Expected: ImportError / NameError (henüz EmbeddingService yok)

- [ ] **Step 3: Write embedding_sources.py — kaynak erişim konfigürasyonu**

RAG retrieval'ının rol/şube filtresini merkezi bir yerden uygulayabilmesi için, her veri kaynağının hangi rollere açık olduğunu ve şube bazlı olup olmadığını tanımlayan statik bir config gerekir. Bu config `EmbeddingSync.register_source` tarafından da kullanılacaktır (Step 6).

```python
# backend/apps/ai_assistant/services/embedding_sources.py
"""
Her embedding kaynağının rol/şube erişim kuralları.
Yeni bir kaynak eklerken buraya bir kayıt eklemek zorunludur —
aksi halde EmbeddingService.search() o kaynağı hiçbir role göstermez (fail-closed).
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class SourceAccessRule:
    allowed_roles: tuple[str, ...]   # ('musteri', 'calisan') — bu kaynağı görebilecek roller
    branch_scoped: bool = False      # True ise EmbeddingCache.branch_id ile şube filtresi uygulanır


EMBEDDING_SOURCE_CONFIG: dict[str, SourceAccessRule] = {
    'menu_product': SourceAccessRule(allowed_roles=('musteri', 'calisan'), branch_scoped=True),
    'menu_category': SourceAccessRule(allowed_roles=('musteri', 'calisan'), branch_scoped=False),
    # Çalışana özel kaynaklar — musteri rolüne asla açılmaz
    'inventory_stockitem': SourceAccessRule(allowed_roles=('calisan',), branch_scoped=True),
    # v4: benzerlik tabanlı few-shot için — RAG context'ine değil, yalnızca
    # TrainingService'in daraltılmış aramasına hizmet eder (bkz. Task 4)
    'ai_trainingexample': SourceAccessRule(allowed_roles=('musteri', 'calisan'), branch_scoped=False),
}


def allowed_table_names(role: str) -> list[str]:
    """Verilen rolün erişebileceği table_name listesini döndürür (fail-closed)."""
    return [
        name for name, rule in EMBEDDING_SOURCE_CONFIG.items()
        if role in rule.allowed_roles
    ]


def is_branch_scoped(table_name: str) -> bool:
    rule = EMBEDDING_SOURCE_CONFIG.get(table_name)
    return bool(rule and rule.branch_scoped)
```

- [ ] **Step 4: Write embeddings.py**

```python
# backend/apps/ai_assistant/services/embeddings.py
"""
Embedding servisi — Ollama /api/embed (bge-m3) ile metin→vektör dönüşümü
ve pgvector üzerinde SQL seviyesinde benzerlik araması.

v4 değişikliği: sentence-transformers kaldırıldı. Her gunicorn worker'ında
~2 GB'lık ayrı bir bge-m3 kopyası yüklemek RAM bütçesini patlatıyordu;
Ollama zaten çalıştığı için embedding tek kopya olarak orada servis edilir
(torch bağımlılığı da ortadan kalkar).

Not: pgvector extension'ı migration'da oluşturulur (bkz. Task 1), burada
runtime'da DDL çalıştırılmaz.
"""
import logging
from typing import Any

import httpx
from django.conf import settings
from pgvector.django import CosineDistance

from apps.ai_assistant.services.embedding_sources import allowed_table_names, is_branch_scoped

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Metin embedding ve vektör arama işlemleri."""

    MIN_QUERY_LENGTH = 2

    @staticmethod
    def get_embeddings(texts: list[str]) -> list[list[float]]:
        """Birden çok metnin embedding'lerini TEK istekte hesapla (batch — sync için)."""
        texts = [t for t in texts if t and t.strip()]
        if not texts:
            return []
        base_url = getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')
        model = getattr(settings, 'AI_EMBEDDING_MODEL', 'bge-m3')
        with httpx.Client(timeout=60) as client:
            response = client.post(
                f"{base_url}/api/embed",
                json={'model': model, 'input': texts},
            )
            response.raise_for_status()
            return response.json()['embeddings']

    @staticmethod
    def get_embedding(text: str) -> list[float]:
        """Bir metnin embedding vektörünü hesapla."""
        result = EmbeddingService.get_embeddings([text])
        return result[0] if result else []

    @staticmethod
    def search(
        query: str,
        role: str,
        branch_ids: set[str] | None,
        table_name: str | None = None,
        top_k: int = 10,
    ) -> list[dict[str, Any]]:
        """
        pgvector üzerinde SQL seviyesinde cosine distance araması yap.

        Args:
            query: Arama sorgusu
            role: "musteri" | "calisan" — sadece bu role izinli kaynaklarda arama yapılır (fail-closed)
            branch_ids: Kullanıcının erişebildiği şube ID'leri (superuser için None = sınırsız)
            table_name: Sadece belirli bir tabloda ara (opsiyonel, allowed listesiyle kesişir)
            top_k: Döndürülecek maksimum sonuç sayısı

        Returns:
            [{"row_id": str, "content": str, "table_name": str, "distance": float}]
        """
        if len(query.strip()) < EmbeddingService.MIN_QUERY_LENGTH:
            return []

        allowed = set(allowed_table_names(role))
        if table_name:
            allowed &= {table_name}
        if not allowed:
            return []

        query_vector = EmbeddingService.get_embedding(query)
        if not query_vector:
            return []

        from apps.ai_assistant.models import EmbeddingCache
        from django.db.models import Q

        qs = EmbeddingCache.objects.filter(is_active=True, table_name__in=allowed)

        if branch_ids is not None:
            branch_scoped_tables = {t for t in allowed if is_branch_scoped(t)}
            # Şube bazlı kaynaklarda: kullanıcının şubesi VEYA şubesiz (global) kayıt
            # Şube bazlı olmayan kaynaklarda: filtre uygulanmaz
            qs = qs.filter(
                Q(table_name__in=allowed - branch_scoped_tables)
                | Q(table_name__in=branch_scoped_tables, branch_id__in=branch_ids)
                | Q(table_name__in=branch_scoped_tables, branch_id__isnull=True)
            )

        # v4: distance eşiği — alakasız sonuçlar context'e girmez (halüsinasyonu besler).
        # Eşik değeri golden set (Task 0) ile kalibre edilir.
        max_distance = getattr(settings, 'AI_MAX_DISTANCE', 0.55)
        qs = (
            qs.annotate(distance=CosineDistance('embedding', query_vector))
            .filter(distance__lt=max_distance)
            .order_by('distance')[:top_k]
        )

        return [
            {
                'row_id': str(record.row_id),
                'content': record.content,
                'table_name': record.table_name,
                'distance': round(record.distance, 4),
            }
            for record in qs
        ]
```

**Önceki hata:** İlk taslakta `search()` hiçbir `role`/`branch_ids` parametresi almıyordu ve `EmbeddingCache.objects.filter(is_active=True)` ile **tüm** tabloyu Python'a çekip cosine similarity'yi elle hesaplıyordu (O(n) tam tarama, pgvector index'i hiç kullanılmıyordu). Yeni versiyon hem gerçek SQL-seviyesi ANN aramasını kullanır hem de rol/şube filtresini zorunlu kılar.

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && python -m pytest apps/ai_assistant/tests/test_embeddings.py -v
```

Expected: PASS

- [ ] **Step 6: Write embedding_sync.py**

**Önceki hata:** İlk taslakta `_serialize_object`, bir modelin **tüm alanlarını** otomatik olarak metne dökün embed ediyordu — bu, maliyet/kâr marjı gibi çalışana özel alanların da içeriğe (ve dolayısıyla potansiyel olarak müşteri RAG context'ine) sızmasına yol açardı. Yeni versiyon her kaynak için elle tanımlanmış bir alan allowlist'i (`fields`) zorunlu kılar; `branch_field` verilirse kaydın `branch_id`'si de o alandan doldurulur.

```python
# backend/apps/ai_assistant/services/embedding_sync.py
"""
Embedding senkronizasyon servisi — veritabanındaki değişiklikleri
pgvector embedding'lerine yansıtır.
"""
import hashlib
import logging
from dataclasses import dataclass, field as dc_field
from typing import Any

from apps.ai_assistant.models import EmbeddingCache
from apps.ai_assistant.services.embeddings import EmbeddingService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SourceDefinition:
    app_label: str
    model_name: str
    fields: tuple[str, ...]           # embed edilecek alanların allowlist'i — zorunlu
    branch_field: str | None = None   # kaydın branch_id'sini dolduracak alan adı (opsiyonel)


class EmbeddingSync:
    """
    Belirli tablolardaki kayıtları tarar ve embedding'lerini günceller.
    Hangi tabloların hangi rollere görünür olduğu `embedding_sources.EMBEDDING_SOURCE_CONFIG`'te
    tanımlanır — burası sadece içerik üretimi ve senkronizasyondan sorumludur.
    """

    REGISTERED_SOURCES: dict[str, SourceDefinition] = {}

    @classmethod
    def register_source(cls, table_name: str, app_label: str, model_name: str,
                         fields: tuple[str, ...], branch_field: str | None = None):
        """
        Yeni bir veri kaynağını embedding sistemine kaydeder.
        `fields` zorunludur — sadece bu alanlar içeriğe dahil edilir.

        Örnek:
            EmbeddingSync.register_source(
                'menu_product', 'apps.menu', 'Product',
                fields=('name', 'description', 'price', 'allergens'),
                branch_field='branch_id',
            )
        """
        cls.REGISTERED_SOURCES[table_name] = SourceDefinition(
            app_label=app_label, model_name=model_name, fields=fields, branch_field=branch_field,
        )

    @classmethod
    def sync_all(cls) -> dict[str, int]:
        """Tüm kayıtlı kaynakları tara ve embedding'leri güncelle."""
        stats = {}
        for table_name in cls.REGISTERED_SOURCES:
            count = cls.sync_table(table_name)
            stats[table_name] = count
            logger.info("Embedding sync: %s → %d kayıt", table_name, count)
        return stats

    @classmethod
    def sync_table(cls, table_name: str) -> int:
        """Tek bir tabloyu senkronize et."""
        source = cls.REGISTERED_SOURCES.get(table_name)
        if not source:
            logger.warning("Bilinmeyen kaynak: %s", table_name)
            return 0

        try:
            import importlib
            module = importlib.import_module(f'{source.app_label}.models')
            model = getattr(module, source.model_name)
        except (ImportError, AttributeError) as e:
            logger.error("Model yüklenemedi: %s (%s)", table_name, e)
            return 0

        qs = model.objects.filter(is_active=True)

        # v4 — BAYAT KAYIT TEMİZLİĞİ: kaynakta artık bulunmayan veya pasifleşen
        # (soft-delete: is_active=False) kayıtların embedding'leri silinir.
        # Bu olmadan menüden kaldırılan ürün EmbeddingCache'te kalır ve AI
        # var olmayan ürünü önermeye devam eder.
        live_ids = set(qs.values_list('pk', flat=True))
        stale = EmbeddingCache.objects.filter(table_name=table_name).exclude(row_id__in=live_ids)
        deleted_count, _ = stale.delete()
        if deleted_count:
            logger.info("Embedding sync: %s → %d bayat kayıt silindi", table_name, deleted_count)

        # Değişen kayıtları topla (hash karşılaştırması)...
        existing_hashes = dict(
            EmbeddingCache.objects.filter(table_name=table_name)
            .values_list('row_id', 'content_hash')
        )
        pending = []  # (obj, content, content_hash, branch_id)
        for obj in qs:
            content = cls._serialize_object(obj, source.fields)
            if not content:
                continue
            content_hash = hashlib.sha256(content.encode('utf-8')).hexdigest()
            if existing_hashes.get(obj.pk) == content_hash:
                continue  # Değişiklik yok, atla
            branch_id = str(getattr(obj, source.branch_field)) if source.branch_field and getattr(obj, source.branch_field, None) else None
            pending.append((obj, content, content_hash, branch_id))

        # ...sonra v4 — BATCH embedding: satır başına HTTP çağrısı yerine
        # 64'lük gruplar halinde tek istek (Ollama /api/embed çoklu input destekler)
        count = 0
        BATCH = 64
        for i in range(0, len(pending), BATCH):
            chunk = pending[i:i + BATCH]
            embeddings = EmbeddingService.get_embeddings([c[1] for c in chunk])
            for (obj, content, content_hash, branch_id), embedding in zip(chunk, embeddings):
                EmbeddingCache.objects.update_or_create(
                    table_name=table_name,
                    row_id=obj.pk,
                    defaults={
                        'content': content,
                        'embedding': embedding,
                        'content_hash': content_hash,
                        'branch_id': branch_id,
                    }
                )
                count += 1

        return count

    @staticmethod
    def _serialize_object(obj: Any, fields: tuple[str, ...]) -> str:
        """Bir Django model nesnesini, yalnızca izin verilen alanları kullanarak metne dönüştürür."""
        parts = []
        for field_name in fields:
            value = getattr(obj, field_name, None)
            if value is not None and value != '':
                parts.append(str(value))
        return ' | '.join(parts)
```

- [ ] **Step 6b (v4): Write source_registration.py + tasks.py — kaynak kayıtları, sinyaller, Celery**

**Kritik boşluk düzeltmesi:** Önceki taslakta `register_source` hiçbir yerden çağrılmıyordu — `REGISTERED_SOURCES` boş kalır, sync hiçbir şey yapmaz, RAG context'i hep boş olurdu. Kayıtlar `AiAssistantConfig.ready()`'den import edilen bu modülde yapılır. Alan adları implementasyon sırasında ilgili modellerden (`apps/menu/models.py` vb.) **doğrulanmalıdır** — burada temsili yazılmıştır.

```python
# backend/apps/ai_assistant/services/source_registration.py
"""
Embedding kaynak kayıtları + değişiklik sinyalleri.
AiAssistantConfig.ready() tarafından import edilir.
"""
from django.apps import apps as django_apps
from django.db.models.signals import post_save, post_delete

from apps.ai_assistant.services.embedding_sync import EmbeddingSync

# --- Kaynak kayıtları (alan allowlist'leri gerçek modellerden doğrulanmalı) ---
EmbeddingSync.register_source(
    'menu_product', 'apps.menu', 'Product',
    fields=('name', 'description', 'price', 'allergens'),   # maliyet/kâr marjı ASLA
    branch_field='branch_id',
)
EmbeddingSync.register_source(
    'menu_category', 'apps.menu', 'Category',
    fields=('name', 'description'),
)
# v4: TrainingExample'lar da embed edilir — benzerlik tabanlı few-shot için (Task 4)
EmbeddingSync.register_source(
    'ai_trainingexample', 'apps.ai_assistant', 'TrainingExample',
    fields=('question',),
)

# --- Tazelik: post_save/post_delete → debounce'lu Celery task ---
def _schedule_sync(sender, **kwargs):
    from apps.ai_assistant.tasks import sync_table_task
    table_name = _TABLE_BY_MODEL.get(sender)
    if table_name:
        # countdown ile debounce: art arda kayıtlarda görev üst üste yığılmaz
        sync_table_task.apply_async(args=[table_name], countdown=60)

_TABLE_BY_MODEL = {}
for table_name, source in EmbeddingSync.REGISTERED_SOURCES.items():
    model = django_apps.get_model(source.app_label.split('.')[-1], source.model_name)
    _TABLE_BY_MODEL[model] = table_name
    post_save.connect(_schedule_sync, sender=model, weak=False)
    post_delete.connect(_schedule_sync, sender=model, weak=False)
```

```python
# backend/apps/ai_assistant/tasks.py
from celery import shared_task


@shared_task(ignore_result=True)
def sync_table_task(table_name: str):
    """Tek tablonun embedding'lerini güncelle (hash sayesinde idempotent)."""
    from apps.ai_assistant.services.embedding_sync import EmbeddingSync
    EmbeddingSync.sync_table(table_name)
```

**Not:** `EMBEDDING_SOURCE_CONFIG`'e (Step 3) `'ai_trainingexample': SourceAccessRule(allowed_roles=('musteri', 'calisan'))` kaydı da eklenir — ancak bu kaynak RAG context'ine değil, yalnızca `TrainingService`'in few-shot aramasına hizmet eder (Task 4'te `table_name='ai_trainingexample'` ile daraltılmış arama).

- [ ] **Step 7: Write sync_embeddings management command**

```python
# backend/apps/ai_assistant/management/commands/sync_embeddings.py
from django.core.management.base import BaseCommand

from apps.ai_assistant.services.embedding_sync import EmbeddingSync


class Command(BaseCommand):
    help = 'Tüm kayıtlı veri kaynaklarının embeddinglerini günceller'

    def add_arguments(self, parser):
        parser.add_argument(
            '--table',
            type=str,
            help='Sadece belirli bir tabloyu güncelle (opsiyonel)',
        )

    def handle(self, *args, **options):
        table = options.get('table')
        if table:
            count = EmbeddingSync.sync_table(table)
            self.stdout.write(
                self.style.SUCCESS(f'{table}: {count} kayıt güncellendi')
            )
        else:
            stats = EmbeddingSync.sync_all()
            for table_name, count in stats.items():
                self.stdout.write(f'  {table_name}: {count} kayıt')
            self.stdout.write(
                self.style.SUCCESS(f'Toplam {sum(stats.values())} kayıt güncellendi')
            )
```

- [ ] **Step 8: Commit**

```bash
git add backend/apps/ai_assistant/services/embeddings.py
git add backend/apps/ai_assistant/services/embedding_sources.py
git add backend/apps/ai_assistant/services/embedding_sync.py
git add backend/apps/ai_assistant/services/source_registration.py
git add backend/apps/ai_assistant/tasks.py
git add backend/apps/ai_assistant/management/commands/sync_embeddings.py
git add backend/apps/ai_assistant/tests/test_embeddings.py
git commit -m "feat(ai): add embedding service with Ollama embed, pgvector search, source registration and Celery sync"
```

---

### Task 3: LLM Client Service

**Files:**
- Create: `backend/apps/ai_assistant/services/llm_client.py`
- Create: `backend/apps/ai_assistant/management/commands/check_model.py`

**Interfaces:**
- Consumes: Ollama REST API (http://localhost:11434)
- Produces: `LLMClient.chat(messages, stream) -> str | Iterator[str]` (tool'suz basit sohbet), `LLMClient.chat_with_tools(messages, tools) -> dict` (function-calling farkında, `RAGEngine` bunu kullanır)

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/ai_assistant/tests/test_rag_engine.py (bölüm 1)
import pytest
from unittest.mock import patch, MagicMock


class TestLLMClient:
    def test_chat_sends_messages_to_ollama(self):
        """chat metodu Ollama'ya doğru mesajları göndermeli."""
        from apps.ai_assistant.services.llm_client import LLMClient
        
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'message': {'content': 'Merhaba, nasıl yardımcı olabilirim?'}
        }
        
        with patch('httpx.Client') as mock_client:
            mock_instance = MagicMock()
            mock_instance.post.return_value = mock_response
            mock_client.return_value.__enter__.return_value = mock_instance
            
            result = LLMClient.chat(
                messages=[{'role': 'user', 'content': 'Merhaba'}]
            )
            
            assert result == 'Merhaba, nasıl yardımcı olabilirim?'
            mock_instance.post.assert_called_once()
            call_args = mock_instance.post.call_args[1]
            assert 'messages' in call_args['json']
    
    def test_chat_raises_on_connection_error(self):
        """v4: Ollama bağlantı hatasında exception yükselmeli — hata metni asla
        normal cevap gibi dönmemeli (aksi halde AIMessage olarak kaydedilir,
        feedback/TrainingExample'a sızar)."""
        import httpx
        from apps.ai_assistant.services.llm_client import LLMClient, LLMUnavailableError

        with patch('httpx.Client') as mock_client:
            mock_instance = MagicMock()
            mock_instance.post.side_effect = httpx.ConnectError(
                "Ollama servisine bağlanılamadı"
            )
            mock_client.return_value.__enter__.return_value = mock_instance

            with pytest.raises(LLMUnavailableError):
                LLMClient.chat(messages=[{'role': 'user', 'content': 'test'}])

    def test_chat_sends_num_ctx(self):
        """v4: her istekte num_ctx açıkça gönderilmeli — Ollama'nın varsayılan
        context penceresi küçüktür, prompt sessizce baştan kırpılır."""
        from apps.ai_assistant.services.llm_client import LLMClient

        mock_response = MagicMock()
        mock_response.json.return_value = {'message': {'content': 'ok'}}

        with patch('httpx.Client') as mock_client:
            mock_instance = MagicMock()
            mock_instance.post.return_value = mock_response
            mock_client.return_value.__enter__.return_value = mock_instance

            LLMClient.chat(messages=[{'role': 'user', 'content': 'test'}])
            options = mock_instance.post.call_args[1]['json']['options']
            assert options['num_ctx'] >= 4096

    def test_chat_with_tools_returns_tool_calls(self):
        """chat_with_tools, Ollama'nın döndürdüğü tool_calls'ı ayrıştırmalı."""
        from apps.ai_assistant.services.llm_client import LLMClient

        mock_response = MagicMock()
        mock_response.json.return_value = {
            'message': {
                'content': '',
                'tool_calls': [
                    {'function': {'name': 'order_item', 'arguments': {'product_name': 'Adana kebap', 'quantity': 2}}}
                ],
            }
        }

        with patch('httpx.Client') as mock_client:
            mock_instance = MagicMock()
            mock_instance.post.return_value = mock_response
            mock_client.return_value.__enter__.return_value = mock_instance

            result = LLMClient.chat_with_tools(
                messages=[{'role': 'user', 'content': '2 adet Adana kebap istiyorum'}],
                tools=[{'type': 'function', 'function': {'name': 'order_item'}}],
            )

            assert result['tool_calls'][0]['function']['name'] == 'order_item'
            assert result['content'] == ''

    def test_chat_with_tools_no_tool_call_returns_plain_content(self):
        """Model fonksiyon çağırmadıysa tool_calls None/boş olmalı, content dolu olmalı."""
        from apps.ai_assistant.services.llm_client import LLMClient

        mock_response = MagicMock()
        mock_response.json.return_value = {'message': {'content': 'Evet, mevcut.'}}

        with patch('httpx.Client') as mock_client:
            mock_instance = MagicMock()
            mock_instance.post.return_value = mock_response
            mock_client.return_value.__enter__.return_value = mock_instance

            result = LLMClient.chat_with_tools(
                messages=[{'role': 'user', 'content': 'Adana kebap var mı?'}],
                tools=[{'type': 'function', 'function': {'name': 'order_item'}}],
            )

            assert not result['tool_calls']
            assert result['content'] == 'Evet, mevcut.'
```

- [ ] **Step 2: Write llm_client.py**

```python
# backend/apps/ai_assistant/services/llm_client.py
"""
LLM Client — Ollama REST API ile iletişim.
"""
import json
import logging
from typing import Iterator

import httpx

from django.conf import settings

logger = logging.getLogger(__name__)


class LLMUnavailableError(Exception):
    """v4: LLM'e ulaşılamadı / zaman aşımı — view katmanı 503 döner.

    Önceki hata: bağlantı hatasında kullanıcı-dostu bir string normal cevap
    gibi dönüyordu; bu string AIMessage olarak kaydediliyor, feedback
    alabiliyor ve TrainingExample'a sızabiliyordu.
    """


class LLMClient:
    """Ollama üzerinden Qwen3 8B ile iletişim.

    v4 not: ayarlar sınıf gövdesinde değil çağrı anında okunur — sınıf
    gövdesindeki `getattr(settings, ...)` import anında donar ve testlerdeki
    `override_settings` etkisiz kalır.
    """

    MIN_NUM_CTX = 4096

    @classmethod
    def _config(cls):
        return {
            'base_url': getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434'),
            'model': getattr(settings, 'AI_LLM_MODEL', 'qwen3:8b'),
            # v4: CPU'da 8B model için ilk-token + üretim 30 sn'yi rahat aşar
            'timeout': getattr(settings, 'AI_LLM_TIMEOUT', 120),
            # Qwen3 varsayılan olarak "thinking" modunu açar; sohbette gecikmeyi
            # ciddi artırır. Her istekte kapalı gönderilir (Ollama API: think=false).
            'think': getattr(settings, 'AI_LLM_THINK', False),
            # v4: Ollama'nın varsayılan context penceresi küçüktür — açıkça set
            # edilmezse uzun prompt sessizce baştan kırpılır (sistem promptu kaybolur)
            'num_ctx': max(getattr(settings, 'AI_LLM_NUM_CTX', 8192), cls.MIN_NUM_CTX),
        }

    @classmethod
    def chat(
        cls,
        messages: list[dict],
        stream: bool = False,
        tools: list[dict] | None = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
    ) -> str | Iterator[str]:
        """
        Ollama'ya sohbet isteği gönder.
        
        Args:
            messages: [{"role": "user", "content": "..."}]
            stream: Streaming yanıt istiyorsa True
            tools: Function calling tool tanımları (opsiyonel)
            temperature: 0-1 arası (0 = deterministik)
            max_tokens: Maksimum yanıt token sayısı
        
        Returns:
            stream=False → str (tam metin)
            stream=True  → Iterator[str] (token token)

        Raises:
            LLMUnavailableError: bağlantı/timeout hatasında (v4 — string dönmez)
        """
        cfg = cls._config()
        url = f"{cfg['base_url']}/api/chat"

        payload = {
            "model": cfg['model'],
            "messages": messages,
            "stream": stream,
            "think": cfg['think'],
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": cfg['num_ctx'],
            },
        }

        if tools:
            payload["tools"] = tools

        try:
            with httpx.Client(timeout=cfg['timeout']) as client:
                if stream:
                    return cls._stream_chat(client, url, payload)
                response = client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                return data.get('message', {}).get('content', '')

        except (httpx.ConnectError, httpx.TimeoutException) as e:
            logger.error("Ollama erişilemez: %s", e)
            raise LLMUnavailableError(str(e)) from e
        except Exception as e:
            logger.exception("LLM çağrısı başarısız: %s", e)
            raise LLMUnavailableError(str(e)) from e

    @classmethod
    def chat_with_tools(
        cls,
        messages: list[dict],
        tools: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 1024,
    ) -> dict:
        """
        Function-calling farkında sohbet çağrısı. `RAGEngine` aksiyon akışında bunu kullanır.

        Önceki hatanın düzeltmesi: ilk taslakta `chat()` Ollama'nın döndürdüğü
        `message.tool_calls` alanını hiç okumuyordu, bu yüzden LLM bir fonksiyon
        çağırmak istese bile bu bilgi kayboluyor ve `ActionExecutor` asla tetiklenmiyordu.

        Returns:
            {"content": str, "tool_calls": list[dict] | None}

        Raises:
            LLMUnavailableError: bağlantı/timeout hatasında (v4)
        """
        cfg = cls._config()
        url = f"{cfg['base_url']}/api/chat"
        payload = {
            "model": cfg['model'],
            "messages": messages,
            "stream": False,
            "think": cfg['think'],
            "tools": tools,
            "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": cfg['num_ctx']},
        }
        try:
            with httpx.Client(timeout=cfg['timeout']) as client:
                response = client.post(url, json=payload)
                response.raise_for_status()
                message = response.json().get('message', {})
                return {
                    'content': message.get('content', ''),
                    'tool_calls': message.get('tool_calls') or None,
                }
        except Exception as e:
            logger.exception("LLM tool-call çağrısı başarısız: %s", e)
            raise LLMUnavailableError(str(e)) from e

    @classmethod
    def _stream_chat(cls, client, url: str, payload: dict) -> Iterator[str]:
        """Streaming yanıt için generator."""
        with client.stream("POST", url, json=payload) as response:
            response.raise_for_status()
            for line in response.iter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    content = data.get('message', {}).get('content', '')
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue

    @classmethod
    def get_model_info(cls) -> dict:
        """Ollama'da yüklü model bilgisini döndür."""
        cfg = cls._config()
        try:
            with httpx.Client(timeout=10) as client:
                response = client.get(f"{cfg['base_url']}/api/tags")
                response.raise_for_status()
                models = response.json().get('models', [])
                for m in models:
                    if cfg['model'] in m.get('name', ''):
                        return m
                return {'name': cfg['model'], 'status': 'not_found'}
        except Exception as e:
            return {'name': cfg['model'], 'status': 'error', 'detail': str(e)}
```

- [ ] **Step 3: Write check_model management command**

```python
# backend/apps/ai_assistant/management/commands/check_model.py
from django.core.management.base import BaseCommand
from apps.ai_assistant.services.llm_client import LLMClient


class Command(BaseCommand):
    help = 'Ollama model durumunu kontrol eder'

    def handle(self, *args, **options):
        info = LLMClient.get_model_info()
        model_name = info.get('name', '?')
        status = info.get('status', 'unknown')
        if status == 'not_found':
            self.stdout.write(
                self.style.WARNING(
                    f"Model {model_name} Ollama'da bulunamadı.\n"
                    f"Çalıştır: ollama pull {model_name}"
                )
            )
        elif status == 'error':
            self.stdout.write(
                self.style.ERROR(
                    f"Ollama bağlantı hatası: {info.get('detail', 'bilinmiyor')}"
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(f"Model {model_name} hazır.")
            )
```

- [ ] **Step 4: Run tests**

```bash
cd backend && python -m pytest apps/ai_assistant/tests/test_rag_engine.py::TestLLMClient -v
```

Expected: PASS

- [ ] **Step 5: Add LLM settings to `settings.py`**

```python
# backend/config/settings.py — AI Assistant (app aktifken)
AI_LLM_MODEL = os.environ.get('AI_LLM_MODEL', 'qwen3:8b')
# v4: CPU'da 8B model için 30 sn yetmez (ilk-token + üretim)
AI_LLM_TIMEOUT = int(os.environ.get('AI_LLM_TIMEOUT', '120'))
# v4: Ollama varsayılan context penceresi küçük — açıkça set edilmezse prompt sessizce kırpılır
AI_LLM_NUM_CTX = int(os.environ.get('AI_LLM_NUM_CTX', '8192'))
# Qwen3 thinking modu — varsayılan kapalı; true yapılırsa yanıt gecikmesi ciddi artar
AI_LLM_THINK = os.environ.get('AI_LLM_THINK', 'false').lower() in ('true', '1', 'yes')
OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
# v4: Ollama'daki embedding modeli (sentence-transformers değil)
AI_EMBEDDING_MODEL = os.environ.get('AI_EMBEDDING_MODEL', 'bge-m3')
# v4: cosine distance eşiği — golden set ile kalibre edilir
AI_MAX_DISTANCE = float(os.environ.get('AI_MAX_DISTANCE', '0.55'))
# v4: 'calisan' sayılan RBAC rol adları — implementasyon sırasında rbac.Role
# tablosundaki GERÇEK rol adlarıyla doğrulanmalı (bkz. docs/wiki/RBAC.md)
AI_CALISAN_ROLES = tuple(
    os.environ.get('AI_CALISAN_ROLES', 'admin,manager,waiter,cook,cashier').split(',')
)
```

- [ ] **Step 6: Commit**

```bash
git add backend/apps/ai_assistant/services/llm_client.py
git add backend/apps/ai_assistant/management/commands/check_model.py
git add backend/apps/ai_assistant/tests/test_rag_engine.py
git add backend/config/settings.py
git commit -m "feat(ai): add LLM client for Ollama (Qwen3 8B, think disabled)"
```
---

### Task 4: RAG Engine

**Files:**
- Create: `backend/apps/ai_assistant/services/rag_engine.py`
- Create: `backend/apps/ai_assistant/services/training.py`

**Interfaces:**
- Consumes: `EmbeddingService.search()`, `LLMClient.chat()`/`chat_with_tools()`, `TrainingExample` model, `core.branch_scope.accessible_branch_id_strings`
- Produces: `RAGEngine.answer(session_id, user_message, user, request, mode) -> dict` (artık `message_id` de içerir)

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/ai_assistant/tests/test_rag_engine.py — test_rag_engine.py will grow
import pytest
from unittest.mock import patch, MagicMock


class TestRAGEngine:
    # v4 not: user olarak MagicMock kullanılamaz — ChatSession/AIMessage FK'sı
    # gerçek bir User kaydı ister ve _detect_role artık user.roles (RBAC M2M)
    # okur. conftest'teki `user` fixture'ı kullanılır (rolsüz user → 'musteri').

    def test_answer_returns_standard_response(self, user):
        """answer metodu standart response dict döndürmeli, message_id gerçek AIMessage.id olmalı."""
        from apps.ai_assistant.services.rag_engine import RAGEngine
        from apps.ai_assistant.models import AIMessage

        with patch.multiple(
            'apps.ai_assistant.services.rag_engine',
            EmbeddingService=MagicMock(),
            LLMClient=MagicMock(),
        ):
            from apps.ai_assistant.services.rag_engine import EmbeddingService, LLMClient
            EmbeddingService.search.return_value = [
                {'content': 'Adana kebap: 150 TL', 'table_name': 'menu_product',
                 'distance': 0.08, 'row_id': 'uuid-1'}
            ]
            LLMClient.chat.return_value = "Evet, Adana kebap mevcut."

            result = RAGEngine.answer(
                session_id=None, user_message="Adana kebap var mı?",
                user=user, request=MagicMock(), mode="auto"
            )
            assert 'reply' in result
            assert 'session_id' in result
            assert 'message_id' in result
            assert AIMessage.objects.filter(id=result['message_id']).exists()

    def test_readonly_mode_disables_mutation_tools(self, user):
        """readonly modunda mutasyon tool'ları kullanılmamalı (musteri rolünde
        query tool da yok → tool'suz chat() çağrılır)."""
        from apps.ai_assistant.services.rag_engine import RAGEngine

        with patch.multiple(
            'apps.ai_assistant.services.rag_engine',
            EmbeddingService=MagicMock(),
            LLMClient=MagicMock(),
        ):
            from apps.ai_assistant.services.rag_engine import LLMClient
            LLMClient.chat.return_value = "test"

            RAGEngine.answer(
                session_id=None, user_message="test",
                user=user, request=MagicMock(), mode="readonly"
            )
            LLMClient.chat_with_tools.assert_not_called()
            LLMClient.chat.assert_called_once()

    def test_action_intent_only_set_when_llm_actually_calls_tool(self, user):
        """intent='action', sadece LLM gerçekten bir MUTASYON tool_call döndürdüğünde set edilmeli."""
        from apps.ai_assistant.services.rag_engine import RAGEngine
        from apps.ai_assistant.models import ActionToggle

        ActionToggle.objects.create(key='musteri_actions', label='Müşteri Aksiyonları', is_enabled=True)

        with patch.multiple(
            'apps.ai_assistant.services.rag_engine',
            EmbeddingService=MagicMock(),
            LLMClient=MagicMock(),
        ):
            from apps.ai_assistant.services.rag_engine import LLMClient
            LLMClient.chat_with_tools.return_value = {
                'content': '', 'tool_calls': [
                    {'function': {'name': 'order_item', 'arguments': {'product_name': 'Adana kebap', 'quantity': 2}}}
                ],
            }

            result = RAGEngine.answer(
                session_id=None, user_message="2 Adana kebap istiyorum",
                user=user, request=MagicMock(), mode="auto"
            )
            assert result['intent'] == 'action'
            assert result['action']['name'] == 'order_item'
            assert result['action']['message_id'] == result['message_id']

    def test_query_tool_executes_without_confirmation(self, user):
        """v4: kind='query' tool onaysız çalışır, pending_action OLUŞMAZ,
        sonuç ikinci LLM çağrısıyla cevaba dönüşür."""
        from apps.ai_assistant.services.rag_engine import RAGEngine

        # user'a çalışan rolü ver (rbac.Role) — implementasyonda gerçek rol adı kullanılır
        from rbac.models import Role
        role, _ = Role.objects.get_or_create(name='waiter')
        user.roles.add(role)

        with patch.multiple(
            'apps.ai_assistant.services.rag_engine',
            EmbeddingService=MagicMock(),
            LLMClient=MagicMock(),
            QueryToolExecutor=MagicMock(),
        ):
            from apps.ai_assistant.services.rag_engine import LLMClient, QueryToolExecutor
            LLMClient.chat_with_tools.return_value = {
                'content': '', 'tool_calls': [
                    {'function': {'name': 'get_stock_level', 'arguments': {'item_name': 'kıyma'}}}
                ],
            }
            QueryToolExecutor.execute.return_value = {'item': 'kıyma', 'quantity_kg': 12.5}
            LLMClient.chat.return_value = "Stokta 12.5 kg kıyma var."

            result = RAGEngine.answer(
                session_id=None, user_message="stokta ne kadar kıyma var?",
                user=user, request=MagicMock(), mode="auto"
            )
            QueryToolExecutor.execute.assert_called_once()
            assert result['intent'] == 'query'
            assert result['action'] is None
            assert 'kıyma' in result['reply']
```

- [ ] **Step 2: Write rag_engine.py**

**Önceki hatalar ve düzeltmeleri:**
1. `EmbeddingService.search` artık `role`/`branch_ids` almadan çağrılamaz — RBAC/branch filtresi burada zorunlu kılınır.
2. LLM'in gerçekten bir fonksiyon çağırıp çağırmadığı artık `LLMClient.chat_with_tools()`'un döndürdüğü `tool_calls` alanına bakılarak belirlenir (önceden sadece "tools gönderildi mi" kontrol ediliyordu — LLM tool çağırmasa bile `intent='action'` dönüyordu).
3. Bir mutasyon tool_call geldiğinde **otomatik çalıştırılmaz** — `pending_action` olarak asistan mesajının `metadata`'sına yazılır, kullanıcı `/api/v1/ai/action/confirm/` ile onaylamadan `ActionExecutor` tetiklenmez.
4. Dönüş değeri artık gerçek `message_id` (asistan `AIMessage.id`) içerir — feedback ve aksiyon onayı bunu referans alır.

**v4 düzeltmeleri:**
5. **Rol tespiti RBAC'a bağlandı:** `is_staff`/`is_superuser` yerine `User.roles` (rbac.Role) okunur — garson/aşçı `is_staff` olmadığı için eski yaklaşım tüm çalışanları "müşteri" sınıflar, stok/satış erişimini tamamen kapatırdı. Çalışan sayılan gerçek rol adları implementasyon sırasında `rbac.Role` tablosundan doğrulanıp `AI_CALISAN_ROLES` ayarına yazılır.
6. **Read-only query tool döngüsü:** operasyonel/anlık sorular ("stokta kaç kg kıyma var?") vektör RAG ile cevaplanamaz. LLM `kind='query'` bir tool çağırırsa backend bunu **onaysız** ama RBAC/şube filtresi içinde hemen çalıştırır, sonucu `role='tool'` mesajı olarak ekler ve nihai cevap için ikinci LLM çağrısı yapar. Yalnızca `kind='mutation'` tool'lar onay akışına girer.
7. **Dil parametresi:** `answer()` artık `language` alır ve sistem promptuna ekler (view katmanı: `request.data.language` → `Accept-Language` → `user.preferred_language` → `tr`).
8. **Benzerlik tabanlı few-shot:** `TrainingService` artık `order_by('?')` (rastgele) yerine pgvector benzerliğiyle en yakın örnekleri seçer; usage takibi kırılgan soru-metni eşleştirmesi yerine ID ile yapılır. SSS önbelleği ilk fazdan çıkarıldı (rol/şube/dil içermeyen cache anahtarı veri sızıntısı riskiydi ve kod zaten hiç çağrılmıyordu).

```python
# backend/apps/ai_assistant/services/rag_engine.py
import logging
from typing import Any
from django.conf import settings
from apps.ai_assistant.models import ChatSession, AIMessage, ActionToggle
from apps.ai_assistant.services.embeddings import EmbeddingService
from apps.ai_assistant.services.llm_client import LLMClient
from apps.ai_assistant.services.training import TrainingService
from apps.ai_assistant.services.action_registry import ActionRegistry
from apps.ai_assistant.services.query_tools import QueryToolExecutor
from core.branch_scope import accessible_branch_id_strings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_MUSTERI = """Sen bir restoran AI asistanısın. Görevin menü, fiyat, alerjen, stok durumu hakkında bilgi vermek. Kısa, net ve dostane yanıtlar ver. Kesin olmadığın konularda "Emin değilim" de. Sadece verilen context içindeki bilgileri kullan."""

SYSTEM_PROMPT_CALISAN = """Sen bir restoran iç yönetim AI asistanısın. Görevin stok, satış, vardiya, reçete sorgularında çalışanlara yardımcı olmak. Kısa ve profesyonel yanıtlar ver. Sadece verilen context içindeki bilgileri ve tool sonuçlarını kullan."""


class RAGEngine:
    @staticmethod
    def answer(session_id: str | None, user_message: str, user: Any,
               request: Any, mode: str = "auto", language: str = "tr") -> dict:
        session = RAGEngine._get_or_create_session(session_id, user)
        role = RAGEngine._detect_role(user)
        system_prompt = SYSTEM_PROMPT_MUSTERI if role == 'musteri' else SYSTEM_PROMPT_CALISAN
        # v4: dil, sistem promptuna açıkça yazılır (spec §8) — önceden hiç bağlanmamıştı
        system_prompt += f"\nKullanıcının dili: {language}. Her zaman bu dilde yanıt ver."

        # RBAC + branch scope: superuser için None (sınırsız), diğerleri için erişilebilir şube ID seti
        branch_ids = accessible_branch_id_strings(user)

        context_results = EmbeddingService.search(
            query=user_message, role=role, branch_ids=branch_ids, top_k=10,
        )
        # ai_trainingexample kayıtları yalnızca few-shot içindir — genel RAG
        # context'ine karışmaz (aynı EmbeddingCache tablosunu paylaşırlar)
        context_results = [r for r in context_results if r['table_name'] != 'ai_trainingexample']
        context_text = "\n".join(
            f"- [{r['table_name']}] {r['content']}" for r in context_results[:5]
        ) if context_results else ""

        # v4: benzerlik tabanlı few-shot (rastgele değil)
        few_shot = TrainingService.get_few_shot_examples(user_message, limit=3)

        # v4: query tool'lar her zaman açık (salt-okunur, kendi içinde RBAC'lı);
        # mutasyon tool'ları toggle + mode'a tabi
        mutations_enabled = RAGEngine._are_actions_enabled(mode, role)
        tools = RAGEngine._get_available_tools(role, include_mutations=mutations_enabled)

        history = list(session.messages.filter(role__in=['user', 'assistant'])
                        .order_by('-created_at')[:5].values('role', 'content'))
        history.reverse()

        messages = [{'role': 'system', 'content': system_prompt}]
        if context_text:
            messages.append({'role': 'system', 'content': f"Güncel veriler:\n{context_text}"})
        for ex in few_shot:
            messages.append({'role': 'user', 'content': ex['question']})
            messages.append({'role': 'assistant', 'content': ex['correct_answer']})
        messages.extend(history)
        messages.append({'role': 'user', 'content': user_message})

        tool_calls = None
        if tools:
            result = LLMClient.chat_with_tools(messages=messages, tools=tools)
            reply, tool_calls = result['content'], result['tool_calls']
        else:
            reply = LLMClient.chat(messages=messages)

        AIMessage.objects.create(session=session, role='user', content=user_message)

        pending_action = None
        action_response = None
        if tool_calls:
            call = tool_calls[0]['function']
            kind = ActionRegistry.get_kind(call['name'])
            if kind == 'query':
                # v4: READ-ONLY QUERY TOOL — onaysız, RBAC/şube filtresi handler
                # içinde. Sonuç tool mesajı olarak eklenir, nihai cevap için
                # ikinci LLM çağrısı yapılır (vektör RAG anlık/aggregate veriyi bilemez).
                tool_result = QueryToolExecutor.execute(
                    call['name'], call.get('arguments', {}),
                    user=user, branch_ids=branch_ids,
                )
                messages.append({'role': 'assistant', 'content': '', 'tool_calls': tool_calls})
                messages.append({'role': 'tool', 'content': str(tool_result)})
                reply = LLMClient.chat(messages=messages)
            else:
                # Mutasyon: pending_action olarak sakla — onay olmadan ASLA çalıştırma
                pending_action = {'name': call['name'], 'parameters': call.get('arguments', {})}
                if not reply:
                    reply = f"'{call['name']}' işlemini onaylıyor musunuz?"

        assistant_msg = AIMessage.objects.create(
            session=session, role='assistant', content=reply,
            metadata={'pending_action': pending_action} if pending_action else {},
        )
        TrainingService.increment_usage(few_shot)

        if pending_action:
            action_response = {
                'message_id': str(assistant_msg.id),
                'name': pending_action['name'],
                'parameters': pending_action['parameters'],
            }

        return {
            'session_id': str(session.id),
            'message_id': str(assistant_msg.id),
            'reply': reply,
            'intent': 'action' if pending_action else 'query',
            'action': action_response,
        }

    @staticmethod
    def _get_or_create_session(session_id, user):
        if session_id:
            try: return ChatSession.objects.get(id=session_id, user=user, is_active=True)
            except ChatSession.DoesNotExist: pass
        return ChatSession.objects.create(user=user, role=RAGEngine._detect_role(user))

    @staticmethod
    def _detect_role(user):
        """v4: rol tespiti projenin RBAC'ı üzerinden.

        Önceki hata: is_staff/is_superuser kontrolü — garson/aşçı is_staff
        olmadığı için TÜM çalışanlar 'musteri' sınıflanır, stok/satış
        kaynaklarına hiç erişemezdi. Çalışan sayılan rol adları
        settings.AI_CALISAN_ROLES'ta tutulur ve implementasyon sırasında
        rbac.Role tablosundaki gerçek adlarla doğrulanır.
        """
        if getattr(user, 'is_superuser', False):
            return 'calisan'
        calisan_roles = set(getattr(settings, 'AI_CALISAN_ROLES',
                                    ('admin', 'manager', 'waiter', 'cook', 'cashier')))
        if hasattr(user, 'roles'):
            user_roles = set(user.roles.values_list('name', flat=True))
            if user_roles & calisan_roles:
                return 'calisan'
        return 'musteri'

    @staticmethod
    def _are_actions_enabled(mode, role):
        """Yalnızca MUTASYON tool'ları için — query tool'lar buna tabi değildir."""
        if mode == 'readonly': return False
        if role == 'musteri':
            return ActionToggle.objects.filter(key='musteri_actions', is_enabled=True).exists()
        return True

    @staticmethod
    def _get_available_tools(role, include_mutations: bool):
        enabled = set(ActionToggle.objects.filter(is_enabled=True).values_list('key', flat=True))
        return ActionRegistry.get_tools_for_role(
            role, enabled, include_mutations=include_mutations,
        )
```

- [ ] **Step 3: Write training.py**

**Önceki hatalar:** (1) `models.F(...)` kullanılıyordu ama `django.db.models` import edilmemişti — kod `NameError` ile patlardı. (2) **v4:** Few-shot `order_by('?')` ile rastgele seçiliyordu — spec'in "benzer soruda düzeltilmiş cevabı kullan" vaadiyle çelişir; alakasız örnek prompt'u şişirir. Artık `ai_trainingexample` embedding kaynağı (Task 2 Step 6b) üzerinden pgvector benzerliğiyle seçilir. (3) **v4:** `increment_usage` soru metniyle eşleştiriyordu (kırılgan) — ID kullanılır. (4) **v4:** SSS önbelleği (`get_cached`/`set_cached`) kaldırıldı — RAGEngine'den hiç çağrılmıyordu (ölü kod) ve `md5(soru)` anahtarı rol/şube/dil içermediği için çalışan cevabının müşteriye servis edilmesi riskini taşıyordu (ileri faz, bkz. spec §10.4).

```python
# backend/apps/ai_assistant/services/training.py
import logging
from django.db import models
from apps.ai_assistant.models import TrainingExample
from apps.ai_assistant.services.embeddings import EmbeddingService
logger = logging.getLogger(__name__)

class TrainingService:
    @staticmethod
    def get_few_shot_examples(query: str, limit: int = 3) -> list[dict]:
        """v4: pgvector benzerliğiyle soruya en yakın düzeltilmiş örnekleri getir."""
        hits = EmbeddingService.search(
            query=query, role='calisan',  # ai_trainingexample her iki role açık; distance eşiği uygulanır
            branch_ids=None, table_name='ai_trainingexample', top_k=limit,
        )
        row_ids = [h['row_id'] for h in hits]
        examples = TrainingExample.objects.filter(id__in=row_ids, is_active=True)
        return [
            {'id': str(e.id), 'question': e.question, 'correct_answer': e.correct_answer}
            for e in examples
        ]

    @staticmethod
    def increment_usage(examples: list[dict]):
        if not examples: return
        TrainingExample.objects.filter(
            id__in=[e['id'] for e in examples],
        ).update(usage_count=models.F('usage_count') + 1)
```

- [ ] **Step 4: Run tests & commit**

```bash
cd backend && python -m pytest apps/ai_assistant/tests/test_rag_engine.py -v
git add apps/ai_assistant/services/rag_engine.py apps/ai_assistant/services/training.py
git commit -m "feat(ai): add RAG engine with RBAC/branch-aware retrieval and two-phase action flow"
```

---

### Task 5: Action System (Registry + Executor + Query Tools + Toggle)

**Files:**
- Create: `backend/apps/ai_assistant/services/action_registry.py`
- Create: `backend/apps/ai_assistant/services/actions.py`
- Create: `backend/apps/ai_assistant/services/query_tools.py` (v4)

**v4 — `kind` ayrımı:** Her tool `kind='query'` (salt-okunur, onaysız, toggle'dan bağımsız) veya `kind='mutation'` (toggle + iki aşamalı onay) olarak işaretlenir. Query tool'lar çalışan senaryosunun asıl değeridir: "stokta ne kadar kıyma var?", "bugünkü satış özeti" gibi anlık/aggregate sorular vektör RAG ile cevaplanamaz.

- [ ] **Step 1: Write action_registry.py**

```python
# backend/apps/ai_assistant/services/action_registry.py
from typing import Any


class ActionRegistry:
    """Kayıtlı tool tanımları (query/mutation) ve rol bazlı filtreleme."""
    
    _tools: dict[str, dict] = {}
    
    @classmethod
    def register(cls, key: str, definition: dict):
        """Bir tool'u kaydet. definition['kind'] zorunludur: 'query' | 'mutation'."""
        assert definition.get('kind') in ('query', 'mutation')
        cls._tools[key] = definition

    @classmethod
    def get_kind(cls, function_name: str) -> str | None:
        """Fonksiyon adına göre tool türünü döndür (RAGEngine tool-call yönlendirmesi için)."""
        for definition in cls._tools.values():
            if definition['schema']['function']['name'] == function_name:
                return definition['kind']
        return None

    @classmethod
    def get_tools_for_role(cls, role: str, enabled_keys: set[str],
                           include_mutations: bool = True) -> list[dict] | None:
        """Role, toggle durumuna ve kind'a göre kullanılabilir tool'ları döndür.

        v4: query tool'lar toggle'a tabi DEĞİLDİR (her zaman dahil edilir);
        mutation tool'lar hem toggle'da açık olmalı hem include_mutations=True olmalıdır.
        """
        tools = []
        for key, definition in cls._tools.items():
            allowed_roles = definition.get('allowed_roles', ['calisan'])
            if role not in allowed_roles:
                continue
            if definition['kind'] == 'mutation':
                if not include_mutations or key not in enabled_keys:
                    continue
            tools.append(definition['schema'])
        return tools if tools else None
    
    @classmethod
    def get_all_definitions(cls) -> dict:
        """Tüm kayıtlı tool'ları döndür (admin panel için)."""
        return dict(cls._tools)

# --- v4: Read-only query tools (çalışan) — toggle/onay yok, handler RBAC'lı ---
ActionRegistry.register('get_stock_level', {
    'kind': 'query',
    'allowed_roles': ['calisan'],
    'schema': {
        'type': 'function',
        'function': {
            'name': 'get_stock_level',
            'description': 'Bir stok kaleminin güncel miktarını sorgula',
            'parameters': {'type': 'object', 'properties': {
                'item_name': {'type': 'string', 'description': 'Stok kalemi adı'},
            }, 'required': ['item_name']},
        },
    },
})

ActionRegistry.register('get_sales_summary', {
    'kind': 'query',
    'allowed_roles': ['calisan'],
    'schema': {
        'type': 'function',
        'function': {
            'name': 'get_sales_summary',
            'description': 'Belirli bir gün için satış özetini getir',
            'parameters': {'type': 'object', 'properties': {
                'date': {'type': 'string', 'description': 'YYYY-MM-DD (varsayılan: bugün)'},
            }},
        },
    },
})

# --- Mutasyon aksiyonları — ilk fazda sınırlı ---
ActionRegistry.register('musteri_actions', {
    'kind': 'mutation',
    'allowed_roles': ['musteri'],
    'schema': {
        'type': 'function',
        'function': {
            'name': 'order_item',
            'description': 'Sepete ürün ekle veya sipariş oluştur',
            'parameters': {
                'type': 'object',
                'properties': {
                    'product_name': {'type': 'string', 'description': 'Ürün adı'},
                    'quantity': {'type': 'integer', 'description': 'Adet'},
                    'table_id': {'type': 'string', 'description': 'Masa numarası'},
                },
                'required': ['product_name', 'quantity'],
            },
        },
    },
})

ActionRegistry.register('call_waiter', {
    'kind': 'mutation',
    'allowed_roles': ['musteri'],
    'schema': {
        'type': 'function',
        'function': {
            'name': 'call_waiter',
            'description': 'Garson çağır',
            'parameters': {'type': 'object', 'properties': {
                'table_id': {'type': 'string', 'description': 'Masa numarası'},
                'reason': {'type': 'string', 'description': 'Çağrı sebebi'},
            }, 'required': ['table_id']},
        },
    },
})

ActionRegistry.register('ask_bill', {
    'kind': 'mutation',
    'allowed_roles': ['musteri'],
    'schema': {
        'type': 'function',
        'function': {
            'name': 'ask_bill',
            'description': 'Hesap iste',
            'parameters': {'type': 'object', 'properties': {
                'table_id': {'type': 'string'},
            }, 'required': ['table_id']},
        },
    },
})
```

- [ ] **Step 2: Write actions.py**

**Önceki hata:** İlk taslak, projede var olmayan servisleri import ediyordu (`apps.orders.services.OrderService`, `apps.branches.services.WaiterCallService`). Keşif ajanına göre `orders` app'i tek bir `OrderService` sınıfı değil, `services/` klasörü altında birden çok dosya (`order_core_service.py`, `item_service.py`, ...) kullanıyor; `branches` app'inde de böyle bir `WaiterCallService` yok. Bu importlar module load anında `ImportError` fırlatırdı. Gerçek entegrasyon, ilgili app'lerin gerçek servis arayüzleri incelenip Task 5 uygulanırken yazılmalı — bu görev kapsamında handler'lar **açıkça stub** olarak işaretlenir, `NotImplementedError` yerine kullanıcıya nazik bir "henüz aktif değil" mesajı döner ve sahte import içermez:

```python
# backend/apps/ai_assistant/services/actions.py
import logging
from typing import Any

logger = logging.getLogger(__name__)


class ActionExecutor:
    """
    LLM'den gelen, kullanıcı tarafından onaylanmış function call'ları çalıştırır.
    Bu executor yalnızca `/api/v1/ai/action/confirm/` üzerinden, kullanıcı onayı
    sonrası çağrılır — LLM çıktısı asla doğrudan buraya akmaz (bkz. RAGEngine).
    """

    @staticmethod
    def execute(action_name: str, parameters: dict, user: Any, request: Any) -> dict:
        """
        Bir aksiyonu çalıştır.
        
        Returns:
            {"success": bool, "message": str, "data": dict | None}
        """
        handler = ActionExecutor._get_handler(action_name)
        if not handler:
            return {"success": False, "message": f"Bilinmeyen aksiyon: {action_name}"}
        
        try:
            result = handler(parameters, user, request)
            return {"success": True, "message": result.get('message', ''), "data": result}
        except Exception as e:
            logger.exception("Aksiyon hatası: %s", action_name)
            return {"success": False, "message": f"Aksiyon çalıştırılamadı: {str(e)}"}
    
    @staticmethod
    def _get_handler(name: str):
        handlers = {
            'order_item': ActionExecutor._handle_order_item,
            'call_waiter': ActionExecutor._handle_call_waiter,
            'ask_bill': ActionExecutor._handle_ask_bill,
        }
        return handlers.get(name)

    @staticmethod
    def _handle_order_item(params, user, request):
        # TODO(entegrasyon): apps/orders/services/ altındaki gerçek sipariş oluşturma
        # akışıyla (order_core_service.py vb.) bağlanmalı. Gerçek servis arayüzü
        # incelenmeden burada var olmayan bir import eklenmemelidir.
        logger.info("order_item aksiyonu tetiklendi (stub): %s", params)
        return {"message": (
            f"Sipariş talebiniz alındı: {params.get('product_name')} x {params.get('quantity')}. "
            "(Bu özellik şu an demo modundadır, gerçek sipariş sistemine henüz bağlı değil.)"
        )}

    @staticmethod
    def _handle_call_waiter(params, user, request):
        # TODO(entegrasyon): Gerçek garson çağırma/bildirim akışıyla bağlanmalı.
        logger.info("call_waiter aksiyonu tetiklendi (stub): %s", params)
        return {"message": f"Garson çağrı talebiniz iletildi (masa: {params.get('table_id')})."}

    @staticmethod
    def _handle_ask_bill(params, user, request):
        # TODO(entegrasyon): Gerçek hesap isteme akışıyla bağlanmalı.
        logger.info("ask_bill aksiyonu tetiklendi (stub): %s", params)
        return {"message": "Hesap talebiniz iletildi."}
```

- [ ] **Step 3 (v4): Write query_tools.py**

Read-only sorgu tool'ları — RAGEngine bunları **onaysız** çalıştırır (bkz. Task 4). Bu yüzden iki katı kural geçerlidir: (1) hiçbir handler yazma işlemi yapamaz (kod incelemesinde doğrulanır), (2) her handler kendi içinde branch scope filtresi uygular. Gerçek entegrasyon (`apps/inventory`, `apps/sales` servisleri) implementasyon sırasında gerçek servis arayüzleri incelenerek bağlanır — mutasyon aksiyonlarındaki stub yaklaşımının aynısı:

```python
# backend/apps/ai_assistant/services/query_tools.py
import logging
from typing import Any

logger = logging.getLogger(__name__)


class QueryToolExecutor:
    """
    Salt-okunur sorgu tool'ları. RAGEngine, LLM'in kind='query' tool-call'unu
    ONAYSIZ ama kullanıcının branch_ids kapsamı içinde buradan çalıştırır.
    Handler'lar asla yazma yapamaz; her handler şube filtresini kendisi uygular.
    """

    @staticmethod
    def execute(name: str, parameters: dict, user: Any,
                branch_ids: frozenset[str] | None) -> dict:
        handler = QueryToolExecutor._get_handler(name)
        if not handler:
            return {"error": f"Bilinmeyen sorgu: {name}"}
        try:
            return handler(parameters, user, branch_ids)
        except Exception:
            logger.exception("Query tool hatası: %s", name)
            return {"error": "Sorgu çalıştırılamadı"}

    @staticmethod
    def _get_handler(name: str):
        return {
            'get_stock_level': QueryToolExecutor._get_stock_level,
            'get_sales_summary': QueryToolExecutor._get_sales_summary,
        }.get(name)

    @staticmethod
    def _get_stock_level(params, user, branch_ids):
        # TODO(entegrasyon): apps/inventory gerçek modelleri/servisleriyle bağlanmalı.
        # Sorgu MUTLAKA branch_ids ile filtrelenir (branch_ids=None yalnızca superuser).
        logger.info("get_stock_level (stub): %s", params)
        return {"info": "Stok sorgusu henüz gerçek envanter sistemine bağlı değil."}

    @staticmethod
    def _get_sales_summary(params, user, branch_ids):
        # TODO(entegrasyon): apps/sales servisleriyle bağlanmalı (branch_ids filtreli).
        logger.info("get_sales_summary (stub): %s", params)
        return {"info": "Satış özeti henüz gerçek satış sistemine bağlı değil."}
```

- [ ] **Step 4: Commit**

```bash
git add apps/ai_assistant/services/action_registry.py apps/ai_assistant/services/actions.py
git add apps/ai_assistant/services/query_tools.py
git commit -m "feat(ai): add action registry with query/mutation split and read-only query tools"
```

---

### Task 6: Feedback Service

**Files:**
- Create: `backend/apps/ai_assistant/services/feedback.py`

- [ ] **Step 1: Write feedback.py**

```python
# backend/apps/ai_assistant/services/feedback.py
import logging
from typing import Any
from apps.ai_assistant.models import MessageFeedback, AIMessage, TrainingExample

logger = logging.getLogger(__name__)


class FeedbackService:
    @staticmethod
    def submit_feedback(message_id: str, user: Any, rating: str, comment: str = "") -> dict:
        """Kullanıcı feedback'ini kaydet. Olumsuzsa admin uyarısı logla.

        v4 düzeltmeleri:
        - Sahiplik: yalnızca kullanıcının KENDİ oturumundaki mesaja feedback
          bırakılabilir (önceden herhangi bir message_id kabul ediliyordu).
        - Tek feedback: update_or_create yalnızca message üzerinden — 👍→👎
          değişikliği mevcut kaydı günceller, ikinci satır oluşturmaz.
        """
        try:
            message = AIMessage.objects.get(
                id=message_id, session__user=user, role='assistant',
            )
        except AIMessage.DoesNotExist:
            return {"success": False, "message": "Mesaj bulunamadı"}
        
        feedback, created = MessageFeedback.objects.update_or_create(
            message=message,
            defaults={'rating': rating, 'comment': comment}
        )
        
        if rating == 'negative':
            logger.warning(
                "Olumsuz feedback #%s - Mesaj: %s... - Kullanıcı: %s",
                feedback.id, message.content[:100], user
            )
        
        return {"success": True, "message": "Geri bildiriminiz kaydedildi"}
    
    @staticmethod
    def create_training_example(feedback_id: str, admin_user: Any,
                                 correct_answer: str) -> dict:
        """Admin, olumsuz feedback'i düzeltip eğitim örneği oluşturur.

        Önceki hata: `feedback.message` her zaman **asistan** mesajıdır (feedback
        asistan cevabına verilir). İlk taslak, bu asistan mesajının içeriğini
        `question` olarak, var olmayan bir `metadata['reply']` alanını da
        `incorrect_answer` olarak kaydediyordu — ikisi de yanlıştı. Doğrusu:
        `question` = bir önceki kullanıcı mesajı, `incorrect_answer` = asistanın
        (feedback.message) kendi içeriği.
        """
        try:
            feedback = MessageFeedback.objects.select_related('message__session').get(id=feedback_id)
        except MessageFeedback.DoesNotExist:
            return {"success": False, "message": "Feedback bulunamadı"}

        assistant_message = feedback.message
        user_message = (
            assistant_message.session.messages
            .filter(role='user', created_at__lt=assistant_message.created_at)
            .order_by('-created_at')
            .first()
        )

        example = TrainingExample.objects.create(
            question=user_message.content if user_message else '',
            incorrect_answer=assistant_message.content,
            correct_answer=correct_answer,
            source_message=assistant_message,
            created_by=admin_user,
        )

        feedback.reviewed_by = admin_user
        feedback.save()

        return {"success": True, "message": "Eğitim örneği oluşturuldu", "id": str(example.id)}
```

- [ ] **Step 2: Write test**

```python
# backend/apps/ai_assistant/tests/test_feedback.py
import pytest
from unittest.mock import patch, MagicMock


class TestFeedbackService:
    def test_submit_positive_feedback(self, chat_session):
        from apps.ai_assistant.models import AIMessage, MessageFeedback
        from apps.ai_assistant.services.feedback import FeedbackService
        
        msg = AIMessage.objects.create(session=chat_session, role='assistant', content='test')
        result = FeedbackService.submit_feedback(str(msg.id), chat_session.user, 'positive')
        
        assert result['success'] is True
        assert MessageFeedback.objects.filter(message=msg, rating='positive').exists()
    
    def test_submit_negative_feedback_logs_warning(self, chat_session):
        from apps.ai_assistant.models import AIMessage, MessageFeedback
        from apps.ai_assistant.services.feedback import FeedbackService
        
        msg = AIMessage.objects.create(session=chat_session, role='assistant', content='hatalı yanıt')
        
        with patch('apps.ai_assistant.services.feedback.logger.warning') as mock_warn:
            result = FeedbackService.submit_feedback(str(msg.id), chat_session.user, 'negative', 'yanlış')
            
            assert result['success'] is True
            mock_warn.assert_called_once()

    def test_cannot_feedback_other_users_message(self, chat_session, admin_user):
        """v4: kullanıcı başkasının oturumundaki mesaja feedback bırakamaz."""
        from apps.ai_assistant.models import AIMessage, MessageFeedback
        from apps.ai_assistant.services.feedback import FeedbackService

        msg = AIMessage.objects.create(session=chat_session, role='assistant', content='test')
        result = FeedbackService.submit_feedback(str(msg.id), admin_user, 'positive')

        assert result['success'] is False
        assert not MessageFeedback.objects.filter(message=msg).exists()

    def test_changing_feedback_updates_existing_row(self, chat_session):
        """v4: 👍→👎 değişikliği ikinci satır oluşturmaz, mevcut kaydı günceller."""
        from apps.ai_assistant.models import AIMessage, MessageFeedback
        from apps.ai_assistant.services.feedback import FeedbackService

        msg = AIMessage.objects.create(session=chat_session, role='assistant', content='test')
        FeedbackService.submit_feedback(str(msg.id), chat_session.user, 'positive')
        FeedbackService.submit_feedback(str(msg.id), chat_session.user, 'negative')

        assert MessageFeedback.objects.filter(message=msg).count() == 1
        assert MessageFeedback.objects.get(message=msg).rating == 'negative'
```

- [ ] **Step 3: Run tests & commit**

```bash
cd backend && python -m pytest apps/ai_assistant/tests/test_feedback.py -v
git add apps/ai_assistant/services/feedback.py apps/ai_assistant/tests/test_feedback.py
git commit -m "feat(ai): add feedback service with training example creation"
```

---

### Task 7: TTS Service

**Files:**
- Create: `backend/apps/ai_assistant/services/tts.py`

- [ ] **Step 1: Write tts.py**

```python
# backend/apps/ai_assistant/services/tts.py
import io
import logging
import wave
from django.conf import settings

logger = logging.getLogger(__name__)

# Piper TTS binary yolu (ayarlanabilir)
PIPER_BINARY = getattr(settings, 'PIPER_BINARY', '/usr/bin/piper')
# v4: piper-voices deposundaki gerçek TR sesi (yanında .onnx.json olmalı — bkz. Task 10)
PIPER_MODEL = getattr(settings, 'PIPER_MODEL', '/usr/share/piper/voices/tr_TR-fahrettin-medium.onnx')
# medium kalite Piper sesleri 22050 Hz, 16-bit mono üretir
PIPER_SAMPLE_RATE = getattr(settings, 'PIPER_SAMPLE_RATE', 22050)


class TTSService:
    """Piper TTS ile metinden ses sentezleme.

    v4 düzeltmesi: Piper'ın `--output-raw` çıktısı HAM 16-bit PCM'dir —
    önceki taslak bunu doğrudan `audio/wav` olarak dönüyordu; tarayıcıdaki
    `new Audio()` header'sız ham PCM'i OYNATAMAZ. PCM, `wave` modülüyle
    WAV header'ına sarılır.
    """
    
    @staticmethod
    def synthesize(text: str, lang: str = 'tr') -> bytes | None:
        """
        Metni sese çevir.
        Returns: WAV binary data (header'lı) veya None (hata durumunda)
        """
        if not text or not text.strip():
            return None
        
        try:
            import subprocess
            result = subprocess.run(
                [PIPER_BINARY, '--model', PIPER_MODEL, '--output-raw'],
                input=text.encode('utf-8'),
                capture_output=True,
                timeout=30,
            )
            if result.returncode != 0:
                logger.error("Piper TTS hatası: %s", result.stderr.decode())
                return None
            return TTSService._pcm_to_wav(result.stdout)
        except FileNotFoundError:
            logger.warning("Piper TTS binary bulunamadı: %s", PIPER_BINARY)
            return None
        except subprocess.TimeoutExpired:
            logger.warning("Piper TTS zaman aşımı")
            return None
        except Exception as e:
            logger.exception("TTS hatası: %s", e)
            return None

    @staticmethod
    def _pcm_to_wav(pcm_data: bytes) -> bytes:
        """Ham 16-bit mono PCM'i WAV container'ına sar."""
        buf = io.BytesIO()
        with wave.open(buf, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(PIPER_SAMPLE_RATE)
            wf.writeframes(pcm_data)
        return buf.getvalue()
    
    @staticmethod
    def is_available() -> bool:
        """Piper TTS'in sistemde kurulu olup olmadığını kontrol et."""
        import shutil
        return shutil.which('piper') is not None
```

- [ ] **Step 2: Write test**

```python
# backend/apps/ai_assistant/tests/test_tts.py
import pytest
from unittest.mock import patch, MagicMock


class TestTTSService:
    def test_synthesize_returns_none_for_empty_text(self):
        from apps.ai_assistant.services.tts import TTSService
        assert TTSService.synthesize("") is None
        assert TTSService.synthesize("   ") is None
    
    def test_synthesize_calls_piper_and_returns_wav(self):
        from apps.ai_assistant.services.tts import TTSService
        
        with patch('subprocess.run') as mock_run:
            mock_run.return_value.returncode = 0
            mock_run.return_value.stdout = b'\x00\x01' * 100  # sahte PCM
            
            result = TTSService.synthesize("Merhaba")
            # v4: çıktı ham PCM değil, WAV container'ı olmalı
            assert result is not None
            assert result[:4] == b'RIFF'
            assert result[8:12] == b'WAVE'
            mock_run.assert_called_once()
```

- [ ] **Step 3: Run tests & commit**

```bash
cd backend && python -m pytest apps/ai_assistant/tests/test_tts.py -v
git add apps/ai_assistant/services/tts.py apps/ai_assistant/tests/test_tts.py
git commit -m "feat(ai): add TTS service with Piper"
```

---

### Task 8: Serializers, Views, URLs

**Files:**
- Create: `backend/apps/ai_assistant/serializers.py`
- Create: `backend/apps/ai_assistant/views.py`
- Create: `backend/apps/ai_assistant/urls.py`

- [ ] **Step 1: Write serializers.py**

```python
# backend/apps/ai_assistant/serializers.py
from rest_framework import serializers
from .models import ChatSession, AIMessage, MessageFeedback, TrainingExample, ActionToggle


class ChatRequestSerializer(serializers.Serializer):
    session_id = serializers.CharField(required=False, allow_null=True)
    message = serializers.CharField(required=True, min_length=1, max_length=2000)
    mode = serializers.ChoiceField(choices=['auto', 'readonly'], default='auto')
    language = serializers.CharField(required=False, allow_blank=True, max_length=5)  # v4: opsiyonel dil override


class ChatResponseSerializer(serializers.Serializer):
    session_id = serializers.CharField()
    message_id = serializers.CharField()  # önceki taslakta yoktu — feedback/action confirm bunu referans alır
    reply = serializers.CharField()
    intent = serializers.CharField()
    action = serializers.DictField(allow_null=True)


class FeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageFeedback
        fields = ['id', 'message', 'rating', 'comment', 'created_at']
        read_only_fields = ['id', 'created_at']


class FeedbackCreateSerializer(serializers.Serializer):
    message_id = serializers.CharField(required=True)
    rating = serializers.ChoiceField(choices=['positive', 'negative'])
    comment = serializers.CharField(required=False, allow_blank=True, max_length=500)


class ActionConfirmSerializer(serializers.Serializer):
    message_id = serializers.CharField(required=True)
    confirm = serializers.BooleanField(required=True)


class TrainingExampleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingExample
        fields = ['id', 'question', 'incorrect_answer', 'correct_answer',
                  'source_message', 'is_active', 'usage_count', 'created_at']
        read_only_fields = ['id', 'usage_count', 'created_at']


class ActionToggleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActionToggle
        fields = ['id', 'key', 'label', 'description', 'is_enabled']


class AIMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIMessage
        fields = ['id', 'session', 'role', 'content', 'metadata', 'created_at']


class ChatSessionSerializer(serializers.ModelSerializer):
    messages = AIMessageSerializer(many=True, read_only=True)
    
    class Meta:
        model = ChatSession
        fields = ['id', 'user', 'role', 'title', 'is_active', 'created_at', 'messages']


class StatusSerializer(serializers.Serializer):
    model_available = serializers.BooleanField()
    model_name = serializers.CharField()
    tts_available = serializers.BooleanField()
    embedding_count = serializers.IntegerField()
    active_sessions = serializers.IntegerField()
```

- [ ] **Step 2: Write views.py**

**Önceki eksikler ve düzeltmeleri:**
- `ChatView`/`TTSView` hiçbir rate limiting'e sahip değildi — LLM/TTS çağrıları pahalı olduğu için `UserRateThrottle` eklendi.
- Spec'in vaat ettiği `/api/v1/ai/action/confirm/` endpoint'i planda hiç yoktu — `ActionConfirmView` eklendi. Bu view, `AIMessage.metadata.pending_action` içindeki bekleyen aksiyonu okur, onaylanırsa `ActionExecutor.execute` çağırır, sonucu yeni bir `AIMessage(role="system")` olarak kaydeder.

**v4 düzeltmeleri:**
- `ChatView` dil çözümü yapar (`request.data.language` → `Accept-Language` → `user.preferred_language`) ve `LLMUnavailableError`'ı 503'e çevirir — hata metni asla normal cevap olarak kaydedilmez.
- `ActionConfirmView` çalıştırmadan önce **yeniden doğrular**: toggle hâlâ açık mı, rol hâlâ izinli mi, zorunlu parametreler mevcut mu; bekleyen aksiyon **10 dakikadan eskiyse** reddedilir (TOCTOU: öneri ile onay arasında toggle kapatılmış olabilir).
- `TTSView` GET → POST: metin query string'de taşınmaz (access log sızıntısı + URL limiti).
- Throttle chat için 30/dk → **10/dk**: `OLLAMA_NUM_PARALLEL=1` iken tek kullanıcı 30/dk ile servisi tamamen doyurur.

```python
# backend/apps/ai_assistant/views.py
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from .models import MessageFeedback, TrainingExample, ActionToggle, ChatSession, AIMessage, EmbeddingCache
from .serializers import (
    ChatRequestSerializer, FeedbackCreateSerializer, ActionConfirmSerializer,
    TrainingExampleSerializer, ActionToggleSerializer, StatusSerializer
)
from .services.rag_engine import RAGEngine
from .services.feedback import FeedbackService
from .services.llm_client import LLMUnavailableError
from .services.tts import TTSService
from .services.actions import ActionExecutor


class AIChatThrottle(UserRateThrottle):
    scope = 'ai_chat'  # settings.py → REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']['ai_chat'] = '10/min'


class AITTSThrottle(UserRateThrottle):
    scope = 'ai_tts'  # '20/min'


def _resolve_language(request) -> str:
    """v4: dil çözüm sırası — request body > Accept-Language > preferred_language > tr."""
    lang = (request.data.get('language') or '').strip()
    if not lang:
        lang = (request.headers.get('Accept-Language') or '').split(',')[0].split('-')[0].strip()
    if not lang:
        lang = getattr(request.user, 'preferred_language', '') or ''
    return lang or 'tr'


class ChatView(APIView):
    """Ana AI sohbet endpoint'i."""
    permission_classes = [IsAuthenticated]
    throttle_classes = [AIChatThrottle]

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            result = RAGEngine.answer(
                session_id=serializer.validated_data.get('session_id'),
                user_message=serializer.validated_data['message'],
                user=request.user,
                request=request,
                mode=serializer.validated_data.get('mode', 'auto'),
                language=_resolve_language(request),
            )
        except LLMUnavailableError:
            # v4: hata metni AIMessage olarak kaydedilmez, 503 döner
            return Response(
                {'error': 'AI servisi şu an kullanılamıyor. Lütfen daha sonra tekrar deneyin.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(result, status=status.HTTP_200_OK)


class FeedbackView(APIView):
    """Kullanıcı geri bildirimi endpoint'i."""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = FeedbackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        result = FeedbackService.submit_feedback(
            message_id=serializer.validated_data['message_id'],
            user=request.user,
            rating=serializer.validated_data['rating'],
            comment=serializer.validated_data.get('comment', ''),
        )
        status_code = status.HTTP_201_CREATED if result['success'] else status.HTTP_400_BAD_REQUEST
        return Response(result, status=status_code)


class ActionConfirmView(APIView):
    """
    Aksiyon onay endpoint'i — LLM'in önerdiği function call'ı kullanıcı
    onayladıktan sonra gerçekten çalıştırır. `RAGEngine` hiçbir zaman bir
    aksiyonu doğrudan çalıştırmaz; bekleyen aksiyon burada, açıkça onay
    alındıktan sonra `ActionExecutor`'a gider.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ActionConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            message = AIMessage.objects.select_related('session').get(
                id=serializer.validated_data['message_id'],
                session__user=request.user,  # başka kullanıcının mesajı onaylanamaz
            )
        except AIMessage.DoesNotExist:
            return Response({'error': 'Mesaj bulunamadı'}, status=status.HTTP_404_NOT_FOUND)

        pending = (message.metadata or {}).get('pending_action')
        if not pending:
            return Response({'error': 'Bekleyen bir aksiyon yok'}, status=status.HTTP_400_BAD_REQUEST)

        if not serializer.validated_data['confirm']:
            message.metadata['pending_action'] = None
            message.save(update_fields=['metadata'])
            return Response({'success': True, 'message': 'Aksiyon iptal edildi'})

        # v4 — ONAY ANINDA YENİDEN DOĞRULAMA (TOCTOU: öneri ile onay arasında
        # toggle kapatılmış / rol değişmiş olabilir; bayat onaylar reddedilir):
        from django.utils import timezone
        from datetime import timedelta
        from .services.rag_engine import RAGEngine
        from .services.action_registry import ActionRegistry
        from .models import ActionToggle as Toggle

        # 1. TTL: bekleyen aksiyon 10 dakikadan eski olamaz
        if message.created_at < timezone.now() - timedelta(minutes=10):
            message.metadata['pending_action'] = None
            message.save(update_fields=['metadata'])
            return Response({'error': 'Aksiyonun süresi doldu, lütfen tekrar isteyin'},
                            status=status.HTTP_400_BAD_REQUEST)

        # 2. Tool hâlâ kayıtlı, mutasyon türünde ve rol hâlâ izinli mi?
        definition = next(
            (d for d in ActionRegistry.get_all_definitions().values()
             if d['schema']['function']['name'] == pending['name']), None,
        )
        role = RAGEngine._detect_role(request.user)
        if (not definition or definition['kind'] != 'mutation'
                or role not in definition.get('allowed_roles', [])):
            return Response({'error': 'Bu aksiyon için yetkiniz yok'},
                            status=status.HTTP_403_FORBIDDEN)

        # 3. Toggle hâlâ açık mı? (kayıt anahtarı üzerinden)
        toggle_key = next(
            (key for key, d in ActionRegistry.get_all_definitions().items()
             if d['schema']['function']['name'] == pending['name']), None,
        )
        if not Toggle.objects.filter(key=toggle_key, is_enabled=True).exists():
            return Response({'error': 'Bu aksiyon şu an kapalı'},
                            status=status.HTTP_400_BAD_REQUEST)

        # 4. Zorunlu parametreler şemaya göre mevcut mu?
        required = definition['schema']['function'].get('parameters', {}).get('required', [])
        missing = [p for p in required if p not in (pending.get('parameters') or {})]
        if missing:
            return Response({'error': f"Eksik parametre: {', '.join(missing)}"},
                            status=status.HTTP_400_BAD_REQUEST)

        result = ActionExecutor.execute(
            action_name=pending['name'], parameters=pending['parameters'],
            user=request.user, request=request,
        )
        message.metadata['pending_action'] = None
        message.save(update_fields=['metadata'])
        AIMessage.objects.create(session=message.session, role='system', content=result['message'])

        return Response(result, status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST)


class TTSView(APIView):
    """Metin → ses dönüşümü endpoint'i.

    v4: GET → POST — metin query string'de taşınmaz (access log'lara sızar,
    URL uzunluk limiti var).
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [AITTSThrottle]

    def post(self, request):
        text = (request.data.get('text') or '').strip()
        lang = request.data.get('lang', 'tr')
        
        if not text or len(text) > 500:
            return Response({'error': 'Geçersiz metin'}, status=status.HTTP_400_BAD_REQUEST)
        
        audio_data = TTSService.synthesize(text, lang)
        if audio_data is None:
            return Response({'error': 'Ses oluşturulamadı'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        from django.http import HttpResponse
        return HttpResponse(audio_data, content_type='audio/wav')


class AdminStatusView(APIView):
    """Admin — AI servis durumu."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if not request.user.is_superuser:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)
        
        from apps.ai_assistant.services.llm_client import LLMClient
        model_info = LLMClient.get_model_info()
        
        data = StatusSerializer({
            'model_available': model_info.get('status') not in ('not_found', 'error'),
            'model_name': model_info.get('name', ''),  # v4: LLMClient.MODEL sınıf attr'ı kaldırıldı
            'tts_available': TTSService.is_available(),
            'embedding_count': EmbeddingCache.objects.filter(is_active=True).count(),
            'active_sessions': ChatSession.objects.filter(is_active=True).count(),
        }).data
        return Response(data)


class AdminActionToggleView(APIView):
    """Admin — aksiyon toggle yönetimi."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if not request.user.is_superuser:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)
        toggles = ActionToggle.objects.all()
        serializer = ActionToggleSerializer(toggles, many=True)
        return Response(serializer.data)
    
    def patch(self, request, toggle_id):
        if not request.user.is_superuser:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)
        try:
            toggle = ActionToggle.objects.get(id=toggle_id)
        except ActionToggle.DoesNotExist:
            return Response({'error': 'Bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = ActionToggleSerializer(toggle, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class AdminFeedbackView(APIView):
    """Admin — feedback inceleme."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if not request.user.is_superuser:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)
        
        rating = request.query_params.get('rating')
        qs = MessageFeedback.objects.select_related('message').all()
        if rating:
            qs = qs.filter(rating=rating)
        
        data = [{
            'id': str(f.id), 'message_id': str(f.message.id),
            'message_preview': f.message.content[:100],
            'rating': f.rating, 'comment': f.comment,
            'reviewed': f.reviewed_by_id is not None,
            'created_at': f.created_at.isoformat(),
        } for f in qs.order_by('-created_at')[:50]]
        return Response(data)


class AdminTrainingExampleView(APIView):
    """Admin — eğitim örnekleri CRUD."""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if not request.user.is_superuser:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)
        examples = TrainingExample.objects.filter(is_active=True).order_by('-usage_count')[:100]
        serializer = TrainingExampleSerializer(examples, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        if not request.user.is_superuser:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)
        
        # Feedback'ten eğitim örneği oluştur veya direkt ekle
        feedback_id = request.data.get('feedback_id')
        correct_answer = request.data.get('correct_answer', '')
        
        if feedback_id:
            result = FeedbackService.create_training_example(feedback_id, request.user, correct_answer)
            if not result['success']:
                return Response(result, status=status.HTTP_400_BAD_REQUEST)
            return Response(result, status=status.HTTP_201_CREATED)
        
        # Direkt ekleme
        serializer = TrainingExampleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
```

- [ ] **Step 3: Write urls.py**

```python
# backend/apps/ai_assistant/urls.py
from django.urls import path
from .views import (
    ChatView, FeedbackView, ActionConfirmView, TTSView,
    AdminStatusView, AdminActionToggleView,
    AdminFeedbackView, AdminTrainingExampleView,
)

urlpatterns = [
    path('chat/', ChatView.as_view(), name='ai-chat'),
    path('feedback/', FeedbackView.as_view(), name='ai-feedback'),
    path('action/confirm/', ActionConfirmView.as_view(), name='ai-action-confirm'),
    path('tts/', TTSView.as_view(), name='ai-tts'),
    
    # Admin
    path('admin/status/', AdminStatusView.as_view(), name='ai-admin-status'),
    path('admin/actions/', AdminActionToggleView.as_view(), name='ai-admin-actions'),
    path('admin/actions/<uuid:toggle_id>/', AdminActionToggleView.as_view(), name='ai-admin-action-toggle'),
    path('admin/feedback/', AdminFeedbackView.as_view(), name='ai-admin-feedback'),
    path('admin/training-examples/', AdminTrainingExampleView.as_view(), name='ai-admin-training'),
]
```

- [ ] **Step 4: Main URL config** — `backend/config/urls.py` dosyasına ekle:

```python
    path('api/v1/ai/', include('apps.ai_assistant.urls')),
```

- [ ] **Step 5: Add throttle rate settings** — `backend/config/settings.py`'deki `REST_FRAMEWORK` dict'ine ekle (yoksa `DEFAULT_THROTTLE_CLASSES`/`DEFAULT_THROTTLE_RATES` anahtarlarını oluştur, mevcut proje geneli throttle ayarlarını bozma):

```python
REST_FRAMEWORK.setdefault('DEFAULT_THROTTLE_RATES', {})
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'].update({
    # v4: 30/min → 10/min — OLLAMA_NUM_PARALLEL=1 iken tek kullanıcı
    # daha yüksek limitle servisi tamamen doyurabilir
    'ai_chat': '10/min',
    'ai_tts': '20/min',
})
```

- [ ] **Step 6: Migration kontrolü + commit**

Bu task'ta `models.py` değişmedi (Task 1'de tanımlandı) — bu yüzden yeni bir migration **beklenmez**. Sadece kontrol amaçlı çalıştır; eğer boşsa commit'e dahil etme:

```bash
cd backend && python manage.py makemigrations ai_assistant --check --dry-run
# "No changes detected" bekleniyor. Eğer değişiklik varsa, models.py'de
# planlanmamış bir fark var demektir — devam etmeden önce araştır.
python manage.py migrate ai_assistant
git add apps/ai_assistant/serializers.py apps/ai_assistant/views.py apps/ai_assistant/urls.py
git add config/urls.py config/settings.py
git commit -m "feat(ai): add API views, serializers, URL config and rate limiting"
```

---

### Task 9: Frontend — Types, API Service, ChatPanel

**Files:**
- Create: `frontend/src/features/ai-assistant/types.ts`
- Create: `frontend/src/features/ai-assistant/api.ts`
- Create: `frontend/src/features/ai-assistant/ChatPanel.tsx`
- Create: `frontend/src/features/ai-assistant/ChatMessage.tsx`
- Create: `frontend/src/features/ai-assistant/ChatInput.tsx`
- Create: `frontend/src/features/ai-assistant/AIAssistantMount.tsx` (v4 — client wrapper)
- Create: `frontend/src/features/ai-assistant/index.ts`
- Modify: `frontend/src/messages/*.json` (v4 — 7 dil için `aiAssistant` mesaj anahtarları)

**v4 kuralları:**
1. **i18n:** Kullanıcıya görünen tüm metinler (`"AI Asistan"`, `"Sorunuzu yazın..."`, `"Onayla"` vb.) hardcoded Türkçe olamaz — proje `next-intl` kullanır (7 dil). Aşağıdaki snippet'lerde `useTranslations('aiAssistant')` kullanılır; tüm anahtarlar 7 dilin mesaj dosyasına eklenir (mevcut dosya yapısı için `docs/wiki/Internationalization.md`'ye bakılır).
2. **Client wrapper:** Next.js App Router'da `dynamic(..., { ssr: false })` server component olan `layout.tsx` içinde **çalışmaz** — dynamic import bir client component'e (`AIAssistantMount.tsx`) taşınır; layout yalnızca env flag kontrolü yapıp bu wrapper'ı render eder.

- [ ] **Step 1: Write types.ts**

```typescript
// frontend/src/features/ai-assistant/types.ts

export interface AIResponse {
  session_id: string;
  message_id: string; // asistan mesajının gerçek ID'si — feedback/action confirm bunu kullanır
  reply: string;
  intent: 'query' | 'action' | 'error';
  action: { message_id: string; name: string; parameters: Record<string, unknown> } | null;
}

export interface ActionConfirmPayload {
  message_id: string;
  confirm: boolean;
}

export interface ChatMessage {
  id: string; // asistan mesajları için backend'in döndürdüğü gerçek message_id; kullanıcı/hata mesajları için yerel geçici id
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  feedback?: 'positive' | 'negative';
  isError?: boolean; // true ise feedback/action UI'ı gösterilmez (gerçek message_id yok)
  pendingAction?: { name: string; parameters: Record<string, unknown> } | null;
}

export interface FeedbackPayload {
  message_id: string;
  rating: 'positive' | 'negative';
  comment?: string;
}

export interface AIChatRequest {
  session_id?: string | null;
  message: string;
  mode: 'auto' | 'readonly';
}

export interface AIStatus {
  model_available: boolean;
  model_name: string;
  tts_available: boolean;
  embedding_count: number;
  active_sessions: number;
}
```

- [ ] **Step 2: Write api.ts**

```typescript
// frontend/src/features/ai-assistant/api.ts
import api from '@/lib/api';
import type { AIResponse, FeedbackPayload, ActionConfirmPayload, AIStatus, AIChatRequest } from './types';

export async function sendChatMessage(
  message: string,
  sessionId?: string | null,
  mode: 'auto' | 'readonly' = 'auto'
): Promise<AIResponse> {
  const payload: AIChatRequest = { message, mode };
  if (sessionId) payload.session_id = sessionId;

  const { data } = await api.post<AIResponse>('/ai/chat/', payload);
  return data;
}

export async function sendFeedback(payload: FeedbackPayload): Promise<{ success: boolean }> {
  const { data } = await api.post('/ai/feedback/', payload);
  return data;
}

export async function confirmAction(payload: ActionConfirmPayload): Promise<{ success: boolean; message: string }> {
  const { data } = await api.post('/ai/action/confirm/', payload);
  return data;
}

export async function getTTSAudio(text: string, lang = 'tr'): Promise<string | null> {
  try {
    // v4: POST — metin query string'de taşınmaz (access log sızıntısı, URL limiti)
    const { data } = await api.post('/ai/tts/', { text, lang }, { responseType: 'blob' });
    return URL.createObjectURL(data);
  } catch {
    return null;
  }
}

export async function getAIStatus(): Promise<AIStatus> {
  const { data } = await api.get<AIStatus>('/ai/admin/status/');
  return data;
}
```

- [ ] **Step 3: Write ChatInput.tsx**

```tsx
// frontend/src/features/ai-assistant/ChatInput.tsx
'use client';

import { useState, useRef, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, isLoading, placeholder }: ChatInputProps) {
  const t = useTranslations('aiAssistant');
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setText('');
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2 border-t p-4">
      <Textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? t('inputPlaceholder')}
        className="min-h-[44px] max-h-[120px] resize-none"
        rows={1}
        disabled={isLoading}
      />
      <Button onClick={handleSend} disabled={isLoading || !text.trim()} size="icon">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Write ChatMessage.tsx**

```tsx
// frontend/src/features/ai-assistant/ChatMessage.tsx
'use client';

import { useTranslations } from 'next-intl';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage as ChatMessageType } from './types';

interface ChatMessageProps {
  message: ChatMessageType;
  showFeedback?: boolean;
  onFeedback?: (rating: 'positive' | 'negative') => void;
  onActionConfirm?: (confirm: boolean) => void;
  speakerButton?: React.ReactNode;
}

export function ChatMessage({ message, showFeedback, onFeedback, onActionConfirm, speakerButton }: ChatMessageProps) {
  const t = useTranslations('aiAssistant');
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3 p-4', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className={cn('max-w-[80%] rounded-lg px-4 py-2', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Bekleyen aksiyon — LLM'in önerdiği fonksiyon çağrısı, kullanıcı onaylamadan çalışmaz */}
        {message.pendingAction && onActionConfirm && (
          <div className="mt-2 flex items-center gap-2 rounded bg-amber-50 p-2 text-xs">
            <span>{t('confirmAction', { name: message.pendingAction.name })}</span>
            <button onClick={() => onActionConfirm(true)} className="rounded bg-green-600 px-2 py-0.5 text-white">{t('confirm')}</button>
            <button onClick={() => onActionConfirm(false)} className="rounded bg-gray-300 px-2 py-0.5">{t('cancel')}</button>
          </div>
        )}

        {!isUser && (
          <div className="mt-2 flex items-center gap-2">
            {speakerButton}
            {showFeedback && onFeedback && (
              <div className="flex gap-1">
                <button
                  onClick={() => onFeedback('positive')}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    message.feedback === 'positive' ? 'bg-green-200 text-green-800' : 'hover:bg-gray-200'
                  )}
                >
                  👍
                </button>
                <button
                  onClick={() => onFeedback('negative')}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded',
                    message.feedback === 'negative' ? 'bg-red-200 text-red-800' : 'hover:bg-gray-200'
                  )}
                >
                  👎
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write ChatPanel.tsx**

```tsx
// frontend/src/features/ai-assistant/ChatPanel.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { SpeakerButton } from './SpeakerButton';
import { sendChatMessage, sendFeedback, confirmAction, getTTSAudio } from './api';
import type { ChatMessage as ChatMessageType } from './types';

interface ChatPanelProps {
  mode?: 'auto' | 'readonly';
  placeholder?: string;
}

export function ChatPanel({ mode = 'auto', placeholder }: ChatPanelProps) {
  const t = useTranslations('aiAssistant');
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text: string) => {
    const userMsg: ChatMessageType = {
      id: `local-user-${Date.now()}`, // sadece React key/geçici görüntüleme için, backend'e gönderilmez
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await sendChatMessage(text, sessionId, mode);
      setSessionId(response.session_id);

      // Önceki hata: burada `ai-${Date.now()}` gibi sahte bir id üretiliyordu ve
      // feedback isteği bu sahte id'yi backend'e gönderiyordu — backend'de hiçbir
      // zaman böyle bir AIMessage bulunamadığı için feedback sistemi çalışmıyordu.
      // Artık backend'in döndürdüğü gerçek `message_id` kullanılıyor.
      const assistantMsg: ChatMessageType = {
        id: response.message_id,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date(),
        pendingAction: response.action,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessageType = {
        id: `local-err-${Date.now()}`,
        role: 'assistant',
        content: t('errorMessage'),
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageId: string, rating: 'positive' | 'negative') => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback: rating } : m))
    );
    try {
      await sendFeedback({ message_id: messageId, rating });
    } catch { /* silent */ }
  };

  const handleActionConfirm = async (messageId: string, confirm: boolean) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pendingAction: null } : m)));
    try {
      const result = await confirmAction({ message_id: messageId, confirm });
      setMessages((prev) => [...prev, {
        id: `local-system-${Date.now()}`,
        role: 'system',
        content: result.message,
        timestamp: new Date(),
      }]);
    } catch { /* silent */ }
  };

  const handlePlayTTS = async (text: string) => {
    const audioUrl = await getTTSAudio(text);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(console.error);
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} className="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg" size="icon">
        <MessageCircle className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-[380px] h-[580px] shadow-xl flex flex-col z-50">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <span className="font-semibold text-sm">{t('title')}</span>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto p-0">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground p-8 text-center">
            {t('welcome')}
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            showFeedback={msg.role === 'assistant' && !msg.isError}
            onFeedback={(rating) => handleFeedback(msg.id, rating)}
            onActionConfirm={(confirm) => handleActionConfirm(msg.id, confirm)}
            speakerButton={
              msg.role === 'assistant' ? (
                <SpeakerButton text={msg.content} onPlay={handlePlayTTS} />
              ) : undefined
            }
          />
        ))}
        <div ref={messagesEndRef} />
      </CardContent>
      <CardFooter className="p-0">
        <ChatInput onSend={handleSend} isLoading={isLoading} placeholder={placeholder} />
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 6: Write SpeakerButton.tsx**

```tsx
// frontend/src/features/ai-assistant/SpeakerButton.tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Volume2, Loader2 } from 'lucide-react';

interface SpeakerButtonProps {
  text: string;
  onPlay: (text: string) => Promise<void>;
}

export function SpeakerButton({ text, onPlay }: SpeakerButtonProps) {
  const t = useTranslations('aiAssistant');
  const [isPlaying, setIsPlaying] = useState(false);

  const handleClick = async () => {
    setIsPlaying(true);
    await onPlay(text);
    setIsPlaying(false);
  };

  return (
    <button onClick={handleClick} disabled={isPlaying} className="text-xs px-2 py-0.5 rounded hover:bg-gray-200" title={t('speak')}>
      {isPlaying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
    </button>
  );
}
```

- [ ] **Step 7: Write index.ts (dynamic import)**

```typescript
// frontend/src/features/ai-assistant/index.ts
// v4: dynamic import client wrapper'da (AIAssistantMount.tsx) — burada yalnızca re-export
export { AIAssistantMount } from './AIAssistantMount';
export type { ChatMessage, AIResponse, AIStatus } from './types';
```

- [ ] **Step 8: Layout integration (v4 — client wrapper)**

**Önceki hata:** `dynamic(..., { ssr: false })` çağrısı server component olan `layout.tsx` içine konmuştu — Next.js App Router'da bu **çalışmaz** (`ssr: false` yalnızca client component'te kullanılabilir). Dynamic import bir client wrapper'a taşınır; layout yalnızca env flag'e bakar:

```tsx
// frontend/src/features/ai-assistant/AIAssistantMount.tsx
'use client';

import dynamic from 'next/dynamic';

const ChatPanel = dynamic(
  () => import('./ChatPanel').then((m) => ({ default: m.ChatPanel })),
  { ssr: false, loading: () => null }
);

export function AIAssistantMount() {
  return <ChatPanel mode="auto" />;
}
```

```tsx
// frontend/src/app/layout.tsx (veya uygun layout dosyası — server component kalır)
import { AIAssistantMount } from '@/features/ai-assistant/AIAssistantMount';

// layout return içinde (env kontrolü server tarafında, build'de tree-shake edilir):
{process.env.NEXT_PUBLIC_ENABLE_AI_ASSISTANT === 'true' && <AIAssistantMount />}
```

- [ ] **Step 8b (v4): i18n mesaj anahtarları** — 7 dilin mesaj dosyasına `aiAssistant` bölümü eklenir (`docs/wiki/Internationalization.md`'deki dosya yapısına göre). Türkçe örnek:

```json
{
  "aiAssistant": {
    "title": "AI Asistan",
    "inputPlaceholder": "Sorunuzu yazın...",
    "welcome": "Merhaba! Size nasıl yardımcı olabilirim?",
    "errorMessage": "Bir hata oluştu. Lütfen tekrar deneyin.",
    "confirmAction": "\"{name}\" işlemini onaylıyor musunuz?",
    "confirm": "Onayla",
    "cancel": "İptal",
    "speak": "Sesli oku"
  }
}
```

Diğer 6 dil (EN, AR, DE, RU, BG, SQ) için çeviriler aynı commit'te eklenir — eksik anahtar bırakılmaz.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/ai-assistant/
git commit -m "feat(ai): add frontend ChatPanel with dynamic import, feedback, and TTS"
```

---

### Task 10: Infrastructure — Ollama + Piper Kurulum Scriptleri

**Files:**
- Create: `infra/ollama.service`
- Create: `infra/ollama.setup.sh`
- Create: `infra/piper.setup.sh`

- [ ] **Step 1: Write ollama.service**

```ini
# infra/ollama.service
[Unit]
Description=Ollama AI Service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ollama
Group=ollama
ExecStart=/usr/bin/ollama serve
Restart=always
RestartSec=10
# v4: Ollama'da kimlik doğrulama YOKTUR — 0.0.0.0 ile ağa açmak modeli
# herkese açmak demektir. Yalnızca backend'in eriştiği loopback'te dinler.
Environment="OLLAMA_HOST=127.0.0.1"
Environment="OLLAMA_KEEP_ALIVE=5m"
Environment="OLLAMA_NUM_PARALLEL=1"

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write ollama.setup.sh**

```bash
# infra/ollama.setup.sh
#!/bin/bash
set -euo pipefail

echo "📦 Ollama kuruluyor..."
curl -fsSL https://ollama.com/install.sh | sh

echo "🔧 Modeller indiriliyor..."
ollama pull qwen3:8b   # LLM (Q4_K_M)
ollama pull bge-m3     # v4: embedding modeli — /api/embed üzerinden kullanılır

echo "✅ Servis başlatılıyor..."
sudo cp infra/ollama.service /etc/systemd/system/ollama.service
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama

echo "🔍 Kontrol ediliyor..."
sleep 3
curl -s http://localhost:11434/api/tags | head -5
echo ""
echo "✅ Ollama hazır!"
```

- [ ] **Step 3: Write piper.setup.sh**

```bash
# infra/piper.setup.sh
#!/bin/bash
# v4 düzeltmeleri:
# - /opt, /usr/bin, /usr/share sistem dizinleridir — yazma işlemleri sudo ile yapılır
#   (önceki script sudo'suz yazıp patlıyordu)
# - Piper, .onnx dosyasının yanında ZORUNLU .onnx.json konfigürasyonunu da arar —
#   önceki script bunu indirmiyordu, sentez ilk çağrıda hata verirdi
set -euo pipefail

echo "📦 Piper TTS kuruluyor..."
wget -O /tmp/piper.tar.gz https://github.com/rhasspy/piper/releases/latest/download/piper_linux_x86_64.tar.gz
sudo mkdir -p /opt/piper
sudo tar -xzf /tmp/piper.tar.gz -C /opt/piper
sudo ln -sf /opt/piper/piper/piper /usr/bin/piper

echo "🔧 Türkçe ses modeli indiriliyor (.onnx + .onnx.json)..."
sudo mkdir -p /usr/share/piper/voices
VOICE_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/fahrettin/medium"
sudo wget -O /usr/share/piper/voices/tr_TR-fahrettin-medium.onnx \
  "${VOICE_BASE}/tr_TR-fahrettin-medium.onnx"
sudo wget -O /usr/share/piper/voices/tr_TR-fahrettin-medium.onnx.json \
  "${VOICE_BASE}/tr_TR-fahrettin-medium.onnx.json"

echo "✅ Piper TTS hazır!"
echo "Not: settings.PIPER_MODEL yolunu indirilen sese göre ayarlayın."
echo "Test: echo 'Merhaba' | piper --model /usr/share/piper/voices/tr_TR-fahrettin-medium.onnx --output-raw | aplay -r 22050 -f S16_LE -t raw"
```

- [ ] **Step 4: Commit**

```bash
git add infra/ollama.service infra/ollama.setup.sh infra/piper.setup.sh
git commit -m "feat(ai): add Ollama and Piper TTS infrastructure scripts"
```

---

## Self-Review Checklist

Bu planı spec ile karşılaştıralım:

### Spec Coverage

| Spec Requirement | Task | Status |
|---|---|---|
| RAG tabanlı AI (Yaklaşım 2) | Task 4 (RAG Engine) | ✅ |
| Tamamen yerel, dış API yok | Task 3 (LLM Client → Ollama) | ✅ |
| Müşteri + Çalışan rolleri | Task 4 (RAG Engine → role detection) | ✅ |
| Aksiyon toggle (aç/kapa) | Task 5 (ActionRegistry + ActionToggle) | ✅ |
| Aksiyon iki aşamalı onay (öner→onayla→çalıştır) | Task 4 (pending_action) + Task 8 (ActionConfirmView) | ✅ (v2'de eklendi — v1'de eksikti) |
| Sadece sesli cevap (TTS) | Task 7 (TTS Service) | ✅ |
| 👍/👎 feedback | Task 6 (Feedback Service) + Task 4 (`message_id`) | ✅ (v2'de `message_id` eklenmeden çalışmıyordu) |
| Admin düzeltme arayüzü | Task 8 (Admin views) + Task 1 (admin.py) | ✅ |
| Few-shot learning | Task 4 (training.py) | ✅ |
| Çoklu dil desteği | Task 4 (RAG Engine → bge-m3 multilingual) | ✅ |
| pgvector arama (gerçek VectorField + SQL) | Task 2 (Embedding Service) | ✅ (v2'de düzeltildi — v1 JSONField + Python brute-force kullanıyordu) |
| RBAC + Branch Scope retrieval'da zorunlu | Task 2 (embedding_sources.py) + Task 4 (RAGEngine) | ✅ (v2'de eklendi — v1'de sadece sistem promptuna güveniliyordu) |
| Opsiyonellik (kaldırılabilir) | Task 1 (INSTALLED_APPS) + Task 9 (dynamic import) | ✅ |
| Frontend dynamic import | Task 9 (index.ts) | ✅ |
| Rate limiting | Task 8 (`AIChatThrottle`, `AITTSThrottle`) | ✅ (v2'de eklendi; v4'te 10/dk) |
| Read-only query tools (spec §4 7b) | Task 4 (query-tool loop) + Task 5 (`query_tools.py`) | ✅ (v4'te eklendi) |
| Embedding kaynak kaydı | Task 1 (`ready()`) + Task 2 Step 6b (`source_registration.py`) | ✅ (v4'te eklendi — v3'te hiç yoktu, RAG boş kalırdı) |
| RBAC rol tespiti (`User.roles`) | Task 4 (`_detect_role` + `AI_CALISAN_ROLES`) | ✅ (v4'te düzeltildi) |
| Embedding tazeliği + bayat kayıt temizliği | Task 2 (Celery task, sinyaller, stale delete) | ✅ (v4'te eklendi) |
| Dil → prompt bağlantısı (spec §8) | Task 4 (`language` param) + Task 8 (`_resolve_language`) | ✅ (v4'te eklendi) |
| Golden-set eval | Task 0 | ✅ (v4'te eklendi) |
| Onay anında yeniden doğrulama + TTL | Task 8 (`ActionConfirmView`) | ✅ (v4'te eklendi) |
| TTS WAV çıktısı + POST | Task 7, 8, 10 | ✅ (v4'te düzeltildi) |

### Placeholder Scan (v2)
- Türkçe dışı embedding modeli seçeneği — bge-m3 zaten çok dilli ✅
- Eksik hata yönetimi — her service'te try/except var ✅
- "TBD"/"TODO" — `actions.py`'deki `TODO(entegrasyon)` yorumları **bilinçli**: gerçek `orders`/`branches` servis arayüzleri bu plan kapsamında incelenmediği için sahte import yerine açık stub bırakıldı; implementasyon sırasında ilgili app'lerin gerçek servisleri incelenip bağlanmalı
- v1'de tespit edilen ve v2'de düzeltilen somut kod hataları: `training.py` eksik `models` import'u, `feedback.py`'de soru/cevap alanlarının ters atanması, `EmbeddingService.search`'ün rol/şube filtresi olmadan tüm tabloyu taraması, `LLMClient.chat`'in `tool_calls`'ı hiç okumaması

### Type Consistency
- `session_id` her yerde `str | None` ✅
- `message_id` chat response, feedback, action confirm arasında tutarlı `str` ✅
- `mode` her yerde `"auto" | "readonly"` ✅
- `rating` her yerde `"positive" | "negative"` ✅
- `tools` parametresi her yerde `list[dict] | None` ✅
- `language` chat request → `RAGEngine.answer` → sistem promptu arasında tutarlı `str` ✅ (v4)
- `kind` her tool tanımında `"query" | "mutation"` ✅ (v4)

---

## Önerilen Uygulama Sırası (v4 — dikey dilim)

Task numaraları korunmuştur ancak **uygulama sırası dikey dilim** ilkesine göre yürütülür: her adımda uçtan uca gösterilebilir bir şey olmalı, entegrasyon hataları erken çıkmalıdır.

1. **Task 0** — Spike + golden set → **go/no-go** (bunsuz devam yok)
2. **Task 1** — Modeller + migration (CI pgvector imajı dahil)
3. **Task 3** — LLM Client → `check_model` ile gerçek Ollama'ya karşı doğrula
4. **Task 8 (kısmi)** — Yalnızca `ChatView` + URL: RAG'sız düz sohbet **uçtan uca çalışır** (ilk gösterilebilir dilim)
5. **Task 2** — Embedding + kaynak kayıtları + sync → RAG context'i dolar
6. **Task 4** — RAG Engine (dil, rol, few-shot, query-tool loop)
7. **Task 8 (kalan)** — Feedback, confirm, TTS, admin view'ları
8. **Task 9** — Frontend
9. **Task 6, 5** — Feedback servisi, aksiyon/query tool detayları
10. **Task 7, 10** — TTS + kalan infra
11. **Golden-set eval'i gerçek sistem üzerinde koş** → sonuçları Task 0 dokümanına işle

## Definition of Done (v4)

Merge öncesi tümü sağlanmalı:

- [ ] Tüm birim/API testleri yeşil (`pytest`), mevcut proje testleri etkilenmemiş
- [ ] Golden-set eval koşuldu: doğru cevap oranı ve tool-call doğruluğu Task 0'daki hedefleri karşılıyor; sonuçlar dokümante edildi
- [ ] Gecikme SLO'su: kısa cevapta p50 < 8 sn, p95 < 20 sn (CPU)
- [ ] `INSTALLED_APPS`'den `apps.ai_assistant` çıkarılınca proje sorunsuz açılıyor ve tüm testler geçiyor
- [ ] `NEXT_PUBLIC_ENABLE_AI_ASSISTANT=false` iken AI kodu bundle'a girmiyor (`npm run build` çıktısıyla doğrulanır)
- [ ] Rol/şube sızıntı testleri: müşteri rolüyle `inventory_stockitem` içeriği hiçbir cevapta görünmüyor; farklı şube kullanıcısı başka şubenin verisini alamıyor
- [ ] Feedback yalnızca kendi mesajına verilebiliyor; onay TTL'i ve toggle re-check'i çalışıyor (API testleriyle)
- [ ] 7 dilin tamamında `aiAssistant` mesaj anahtarları eksiksiz

---

## Branch Yönetimi

```bash
# Başlangıç: main'den yeni branch aç
git checkout main
git pull origin main
git checkout -b feat/ai-assistant

# Her task sonrası commit
git push origin feat/ai-assistant

# Tüm task'lar bitince: main'e merge
git checkout main
git merge feat/ai-assistant
git push origin main

# Branch'i sil (isteğe bağlı)
git branch -d feat/ai-assistant
git push origin --delete feat/ai-assistant
```

Her task'ın kendi commit mesajı vardır. Merge sırasında tüm commit'ler korunur (squash yapılmaz) — böylece ileride bir task geri alınması gerekirse `git revert <commit-hash>` ile kolayca yapılabilir.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-02-ai-assistant-implementation.md`.**

**Önemli:** Geliştirme **`feat/ai-assistant`** branch'inde yapılacak. Her task kendi commit'ine sahip olacak. Mevcut kodlara dokunulmayacak.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Her subagent `feat/ai-assistant` branch'inde çalışır.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Tüm commit'ler `feat/ai-assistant` branch'ine gider.

**Which approach?**
