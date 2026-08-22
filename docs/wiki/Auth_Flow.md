# Auth Flow (Kimlik Doğrulama Akışı)

> **Özet:** JWT tabanlı, HTTP-only cookie üzerinden çalışan kimlik doğrulama sistemi. Access token 30 dk, refresh token 3 gün geçerlidir. Frontend'de Zustand ile oturum yönetimi, Axios interceptor ile otomatik token yenileme yapılır.
> **Kütüphaneler:** SimpleJWT, Axios, Zustand
> **Bağlantılar:** [[Users]], [[RBAC]], [[API_Client]], [[State_Management]], [[Django_Settings]], [[Load_Testing]], [[User_Emergency_Admin]], [[Management_Commands]]

---

## Backend Akışı

### Endpoint'ler

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/v1/auth/token/` | POST | Kullanıcı adı + şifre ile login (JWT pair) |
| `/api/v1/auth/check-pin/` | POST | Kullanıcının PIN ile giriş yapıp yapamayacağını sorgula |
| `/api/v1/auth/token/pin/` | POST | Kullanıcı adı + PIN ile login (kasiyer / POS) |
| `/api/v1/auth/token/refresh/` | POST | Access token yenile |
| `/api/v1/auth/me/` | GET | Oturum açmış kullanıcı profili (şube, roller) |

### JWT Ayarları (`config/settings.py`)

```python
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=3),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
}
```

### Cookie Güvenliği
- Production'da `SESSION_COOKIE_SECURE` ve `CSRF_COOKIE_SECURE` HTTPS'e bağlı
- `CookieJWTAuthentication` — DRF'nin varsayılan auth sınıfı

### Throttling

Genel DRF limitleri:

```python
'DEFAULT_THROTTLE_RATES': {
    'anon': '30/minute',
    'user': '500/minute',
    'login': '5/minute',
}
```

#### Login rate limit (`LoginRateThrottle`)

`apps/users/throttling.py` — **5 deneme / dakika / istemci IP** (`scope: login`).

Aşağıdaki endpoint'ler **aynı sayaç** üzerinden throttle edilir:

| Endpoint | Kullanım |
|----------|----------|
| `POST /api/v1/auth/token/` | Şifre ile giriş |
| `POST /api/v1/auth/check-pin/` | PIN kontrolü |
| `POST /api/v1/auth/token/pin/` | PIN ile giriş |

Limit aşıldığında HTTP **429** döner. Tarayıcıda bu durum bazen **CORS hatası** gibi görünür; mobil uygulama kayıtlı token ile etkilenmeyebilir.

**Kurtarma:** `python manage.py clear_login_throttle --all` veya [[User_Emergency_Admin]] → **Login Kilidi** sekmesi. Paylaşılan yardımcı: `apps/users/login_throttle.py` (bkz. [[Management_Commands]]). Load test sonrası senaryo: [[Load_Testing#Login kilidi ve tarayıcıda "CORS hatası"]].

### Kasiyer PIN akışı

Frontend ve POS, kasiyer rolü için iki adımlı giriş kullanır:

1. **`check-pin`** — `{ "username": "..." }` → `{ "has_pin": true|false }`
2. **`has_pin: true`** ise **`token/pin`** — `{ "username", "pin" }` → JWT pair
3. **`has_pin: false`** ise klasik **`token/`** (şifre)

PIN atanmamış kullanıcılar doğrudan şifre ekranına yönlendirilir. Test kapsamı: `apps/users/test_cashier_pin.py`.

## Frontend Akışı

### Auth Store (`src/store/useAuthStore.ts`)

Zustand + persist middleware ile `localStorage`'da saklanan oturum. Access JWT ayrıca `src/lib/tokenCache.ts` bellek önbelleğinde tutulur (POS isteklerinde localStorage okumamak için). `logout()` `clearTokenCache()` çağırır — persist gecikse bile Bearer gönderilmez. Login sonrası `refreshTokenCache()`.

```typescript
interface AuthState {
    user: AuthUser | null;
    token: string | null;
    rememberMe: boolean;
}
```

**"Beni Hatırla" Mekanizması:**
- `rememberMe: false` → `sessionStorage` marker ile kontrol
- Tarayıcı kapanınca oturum sonlanır
- `rememberMe: true` → Kalıcı oturum

### Token Yenileme (Axios Interceptor)

`src/lib/api.ts` içindeki interceptor:

1. 401 alındığında `isRefreshing` flag ile tek bir refresh isteği yapılır
2. Diğer başarısız istekler kuyruğa eklenir (`failedQueue`)
3. Refresh başarılı → kuyruktan tekrar dener
4. Refresh başarısız → `logout()` + `/` yönlendirmesi

**Sonsuz döngü koruması:** Refresh endpoint'i kendisi 401 dönerse direkt logout.

Otomatik success/error **toast** davranışı ortam ve `skipApiToast` ile yönetilir. Catch içinde kullanıcıya gösterilen **bilinçli** API mesajları için [[API_Client]] içindeki `toastApiError` / ilgili istekte `skipInterceptorToast` kullanılır.

### CORS Yapılandırması
- `CORS_ALLOW_CREDENTIALS = True`
- `CORS_ALLOWED_ORIGINS` ile beyaz liste
- Development'ta regex ile özel IP aralıkları
