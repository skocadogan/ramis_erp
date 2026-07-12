# 🎨 Tasarım Sistemi v2 (Design Tokens & Theming)

Ramis ERP, Tailwind v4 tabanlı dinamik bir tasarım sistemi kullanır. Bu sistem; merkezi token yönetimi, çoklu tema desteği ve kullanıcı tercihine bağlı arayüz yoğunluğu (density) özelliklerini içerir. 

> **Son güncelleme (2026-06-27):** Kurumsal slate-blue renk paleti, tipografi/density standartlaştırması ve 8 temel bileşende polish uygulandı. Tüm UI hardcoded renk sınıflarından arındırıldı; semantik token'lara geçiş %100 tamamlandı.

## 🚀 Temel Özellikler

- **Token-Driven:** Renkler ve ölçüler merkezi `globals.css` CSS değişkenleri üzerinden yönetilir.
- **Çoklu Tema:** Açık, koyu, yüksek kontrast ve dış mekan (outdoor) olmak üzere 4 tema.
- **Dinamik Yoğunluk (Density):** Compact / Comfortable / Spacious olmak üzere 3 yoğunluk modu.
- **Kurumsal Palet (2026-06-27):** Nötr gri-lacivert tonlarından olgun **slate-blue** primary + sıcak stone-tint nötr palete geçildi.
- **Sistem Genelinde Uyum:** Tüm ekranlar %100 semantik renk değişkenlerine geçirildi.
- **Performans Dostu:** CSS variables ve `data-*` nitelikleri ile JS maliyeti minimize edildi.

---

## 🏗️ Mimari Yapı

### 1. Design Tokens (`design-tokens.json`)
Tasarım kararlarının JSON formatında tutulduğu referans dosyasıdır.
- **Konum:** `frontend/src/styles/design-tokens.json`
- **İçerik:** Renk paletleri, radius değerleri ve spacing çarpanları.

### 2. CSS Değişkenleri (`globals.css`)
JSON'daki değerler `globals.css` içinde CSS değişkenlerine (`--primary`, `--background`, `--radius` vb.) dönüştürülür.
- **Theme Seçicileri:** `[data-theme="dark"]`, `[data-theme="high-contrast"]`, `[data-theme="outdoor"]`
- **Density Seçicileri:** `[data-density="compact"]`, `[data-density="comfortable"]`, `[data-density="spacious"]`

### 3. ThemeProvider
React context üzerinden tema ve yoğunluk durumunu yönetir, bu durumları `localStorage`'da saklar ve `document.documentElement`'e uygun sınıfları/nitelikleri uygular.
- **Konum:** `frontend/src/components/shell/ThemeProvider.tsx`

---

## 🎨 Temalar

| Tema | Kullanım Durumu | Açıklama |
| :--- | :--- | :--- |
| **Açık (Light)** | Standart | Varsayılan aydınlık tema. |
| **Koyu (Dark)** | Gece / Düşük Işık | Göz yorgunluğunu azaltan koyu tema. |
| **Yüksek Kontrast** | Erişilebilirlik | Saf siyah/beyaz ve belirgin kenarlıklar. |
| **Dış Mekan (Outdoor)** | Teras / Bahçe | Güneş ışığı altında görünürlüğü artıran yüksek doygunluklu renkler. |

---

## 📏 Arayüz Yoğunluğu (Density)

Density ayarı, tüm `rem` birimlerini etkileyerek arayüzün ne kadar "sıkışık" görüneceğini belirler.

| Mod | Spacing | Font Size | Radius |
| :--- | :--- | :--- | :--- |
| **Compact** | 0.75× | 13px | **4px** (eski: 2px) |
| **Comfortable** | 1.0× | 14px | **8px** (eski: 10px) |
| **Spacious** | 1.25× | 16px | **12px** (eski: 16px) |

> **2026-06-27:** Radius değerleri dengelendi — compact daha az keskin (+2px), spacious daha az abartılı (-4px). `font-size` ve `--spacing-multiplier` değişmedi.

---

## 🎨 Kurumsal Renk Paleti (2026-06-27)

Nötr gri-lacivert tonlarından **slate-blue primary + sıcak stone-tint nötr** palete geçildi:

### Light Theme (`:root`) — Ana Değişiklikler

| Token | Yeni HSL | Görsel Etki |
|---|---|---|
| `--background` | `30 14% 97%` | Hafif sıcak taş tonu |
| `--foreground` | `24 10% 10%` | Yumuşak, hafif sıcak siyah |
| `--primary` | `217 33% 17%` | Derin slate-blue (önceki: `215 35% 28%`) |
| `--secondary` / `--muted` | `30 10% 95%` | Sıcak taş nötrü (primary'den bağımsız) |
| `--accent` | `30 10% 90%` | Sıcak taş (primary hue'dan koparıldı) |
| `--muted-foreground` | `25 5% 45%` | Sıcak gri |
| `--destructive` | `0 65% 48%` | Biraz daha koyu kırmızı |
| `--border` / `--input` | `20 6% 85%` | Sıcak kenarlık |
| `--ring` | `217 33% 17%` | Primary ile aynı |
| `--radius` | **`0.5rem`** | Daha yuvarlak köşeler |
| `--sidebar` | `217 33% 15%` | Daha koyu sidebar |

### Dark Theme — Değişiklikler
Tüm nötr gri tonları (`0 0% X`) → **`217 X% Y`** slate-blue hue kaydırıldı:
- `--background`: `217 15% 7%` (mavi-mor alt tonlu koyu)
- `--card`: `217 12% 9%`, `--secondary/muted`: `217 10% 14%`
- `--accent`: `217 12% 18%`, `--primary`: `217 30% 55%`
- Foreground'lar: `30 10% 92%` (sıcak okunabilirlik)

### High Contrast / Outdoor
- **High Contrast:** `--primary` = `217 40% 20%` (mavi-siyah, önceki saf siyah `0 0% 0%` idi)
- **Outdoor:** Büyük ölçüde korundu, yüksek doygunluklu mavi primary (`220 80% 25%`)

---

## 🛠️ Geliştirici Kullanımı

Yeni bir bileşen oluştururken doğrudan CSS değişkenlerini veya Tailwind sınıflarını kullanın:

```tsx
// Tailwind ile (v4)
<div className="bg-primary text-primary-foreground p-4 rounded-lg">
  Dinamik Bileşen
</div>

// CSS ile
.my-custom-box {
  padding: calc(1rem * var(--spacing-multiplier));
  border-radius: var(--radius);
}
```

Yoğunluk ayarı `html` elementinin `font-size` değerini değiştirdiği için, `rem` kullanan tüm Tailwind sınıfları (`p-4`, `w-64`, `text-lg` vb.) otomatik olarak ölçeklenir.

---

## 🔄 Tema Değiştirme UI
Kullanıcılar temayı iki şekilde değiştirebilir:
1.  **Üst Menü (POS & KDS):** Sağ üstteki tema ikonu üzerinden hızlı seçim (`ThemeMenu` bileşeni).
2.  **POS Ayarları:** "Görünüm" sekmesi altındaki detaylı butonlar.

---

## 🏗️ Tüm Proje Semantik Göçü (GUI Refactoring)

İlk aşamada sadece KDS ve POS ekranlarında uygulanan Design System v2, **tüm projedeki ekranlara yayılmış ve %100 oranında semantik mimariye geçirilmiştir** (Tamamlanma: 2026-05-10):

- **Tam Semantik Renk Göçü:** Tüm hardcoded Tailwind renk sınıfları (`bg-slate-100`, `text-blue-500`, vb.) temizlendi. Tüm UI elemanları artık merkezi tema değişkenlerine (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground` vb.) bağlıdır.
- **Semantik Font Boyutları (Typography):** Hardcoded pikselli fontlar (`text-[10px]`, `text-[13px]`) temizlenmiş ve merkezi `globals.css` üzerinden yönetilen boyutlar (`text-2xs`, `text-sub`, `text-ui-sm`, `text-ui`) projenin tamamına uygulanmıştır.
- **Semantik Font Ağırlıkları:** Standart `font-medium`, `font-bold` sınıfları yerine yine merkezi kontrol sağlayan `font-ui-medium`, `font-ui-semibold`, `font-ui-bold` token'ları tanımlanmış ve projede kullanılmıştır.
- **Tema Uyumluluğu:** Aydınlık, Karanlık, Yüksek Kontrast ve Dış Mekan modları arasında geçiş yapıldığında hiçbir görsel bozulma veya okunurluk sorunu kalmamıştır.

---

## 🧩 Bileşen Polish (2026-06-27)

Kurumsal palet geçişiyle birlikte 8 temel bileşende tutarlılık ve erişilebilirlik iyileştirmeleri:

### Button (`button.tsx`)
- `variant default`: `shadow-sm` eklendi, hover `primary/80→primary/90`
- `variant outline`: `shadow-sm` eklendi, hover `bg-muted→bg-accent`
- `variant ghost`: hover `bg-muted→bg-accent`
- `size sm`: `text-[0.8rem]` eklendi

### Card (`card.tsx`) — Komple yeniden düzenlendi
- Ana container: `ring-1 ring-foreground/5` → `border shadow-sm`
- **CardHeader:** `px-5 pt-5 pb-3` (önceki: `p-4`)
- **CardTitle:** `text-base font-semibold leading-tight tracking-tight`
- **CardContent:** `px-5 pb-5 pt-0`, **CardFooter:** `px-5 py-3`
- `data-[size=sm]` varyantları temizlendi

### Dialog (`dialog.tsx`)
- **DialogTitle:** `text-lg font-semibold` (önceki: `text-base font-ui-medium`)
- **DialogContent:** `p-6` standardizasyonu (önceki: `p-4`)
- Close button: `size="icon-sm"`

### Input (`input.tsx`)
- Height: `h-8→h-9`, Padding: `px-2.5→px-3`, `shadow-sm` eklendi
- Ring: `focus-visible:ring-1` (önceki: `ring-3 ring-ring/50`) — daha sade
- **Dark mode hardcoded stilleri tamamen temizlendi** — sadece CSS variables
- Disabled: sadece `opacity-50 cursor-not-allowed`

### Table (`table.tsx`)
- **TableRow:** hover `bg-muted/50→bg-muted/30`, border `border-border/50`
- **TableHead:** `px-4 font-medium text-muted-foreground` (önceki: `px-2 font-ui-medium text-foreground`)
- **TableCell:** `px-4 py-3` (önceki: `p-2`)

### Tabs (`tabs.tsx`)
- Pasif yazı rengi: `text-foreground/60→text-muted-foreground`
- Active indicator (line variant): `after:bg-foreground→after:bg-primary`
- Focus ring: `ring-1` (sadeleştirildi), dark mode hardcoded temizlendi

### Select (`select.tsx`)
- Height: `h-8→h-9`, Padding: `pl-2.5→pl-3`, `shadow-sm` eklendi
- Ring: `ring-1`, dark mode hardcoded stiller temizlendi

### Badge (`badge.tsx`)
- `variant default`: `shadow-sm`, hover `primary/80→primary/85`
- `variant outline`: `border border-border` eklendi, hover `bg-muted→bg-accent`

### Shell Component Polish
- **AppHeader:** `bg-background/95 backdrop-blur` — yarı saydam blur header
- **AppSidebar aktif state:** `bg-primary/10→bg-primary/15`, font `font-ui-semibold→font-semibold`
- **AppSidebar hover:** `hover:bg-muted→hover:bg-accent`
- **AppSidebar `<hr>`:** `border-border/50` (daha tutarlı)

### `p-6` Padding Standardizasyonu
Dialog ve sayfa içeriklerinde tutarlı `p-6` kullanımı:
- DialogContent: `p-6`, CardHeader: `px-5 pt-5 pb-3`
- CardContent: `px-5 pb-5 pt-0`, CardFooter: `px-5 py-3`
- TableHead/TableCell: `px-4` (önceki: `px-2`/`p-2`)

### Base Layer Değişiklikleri (`8f6de08`)
- `body { font-family }` (önceki: `html`) — daha güvenli rendering
- Font smoothing: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale`
- `.modal-input` focus: `hsl(var(--ring) / 0.2)` (daha temiz)
- `.modal-input` background: `hsl(var(--background))` (önceki: `var(--color-muted)`)

---

> **İlgili Wiki Düğümleri:**
> - [[Frontend_Architecture]]
> - [[UI_Components]]
> - [[POS_Display]]
> - [[Frontend_KDS]]
