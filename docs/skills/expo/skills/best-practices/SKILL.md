Expo Best Practices — Kapsamlı Rehber

İçindekiler
Proje Mimarisi
Package.json Gereksinimleri
Dosya ve Klasör Yapısı
UI/UX Tasarım Prensipleri
Stil ve Görsel Tasarım
Navigasyon Kalıpları
Data Fetching ve State Management
API Routes
Deployment ve CI/CD
SDK Yükseltme
Yaygın Hatalar ve Çözümler
Proje Mimarisi
Temel İlkeler
project/
├── app/                   # Sadece route dosyaları
│   ├── _layout.tsx        # Root layout (NativeTabs)
│   ├── (tabs)/            # Tab grupları
│   │   ├── _layout.tsx    # Stack layout
│   │   ├── index.tsx      # Ana sayfa
│   │   └── settings.tsx   # Ayarlar
│   ├── [id].tsx           # Dinamik route
│   └── modal.tsx          # Modal route
├── src/                   # Uygulama kodu
│   ├── components/        # Yeniden kullanılabilir bileşenler
│   ├── hooks/             # Custom hooks
│   ├── context/           # React context providers
│   ├── services/          # API servisleri
│   ├── types/             # TypeScript tipleri
│   └── utils/             # Yardımcı fonksiyonlar
├── assets/                # Görseller, fontlar, videolar
├── .env                   # Ortam değişkenleri
├── app.json               # Expo konfigürasyonu
├── eas.json               # EAS Build konfigürasyonu
├── tsconfig.json          # TypeScript konfigürasyonu
└── package.json
Not: Bu proje yapısı Expo ekibi tarafından AI agent’lar için uygun görünse de, kurumsal hayatta src/features bazlı yaklaşımı öneriyorum.

Kritik Kurallar
Route dosyaları SADECE app/ klasöründe olmalı
Asla component, type veya utility dosyalarını app/ klasörüne koyma
Her uygulama, “/” path’ine karşılık gelen bir route içermeli
Dosya isimleri kebab-case formatında olmalı: comment-card.tsx
Not: Bu konuda ben de kararsızım. Özellikle aşina olduğumuz hook’lar dahil olmak üzere use-theme.tsx şeklinde kebab-case yazılsın isteniyor.

Önerilen Layout Yapısı
// app/_layout.tsx - NativeTabs ile root layout
import { NativeTabs } from 'expo-router/native-tabs';

export default function RootLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Screen name="(index,search)" />
      <NativeTabs.Screen name="settings" />
    </NativeTabs>
  );
}
// app/(index,search)/_layout.tsx - Stack layout
import { Stack } from 'expo-router/stack';

export default function TabLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Ana Sayfa' }} />
      <Stack.Screen name="search" options={{ title: 'Arama' }} />
    </Stack>
  );
}
Not: Özellikle NativeTabs çok kullanışlı. Android tarafında olmadığı için bir if atarak android için ayrı bir tab yapmak gerekiyor.

Package.json Gereksinimleri
Temel Bağımlılıklar
{
  "dependencies": {
    "expo": "~54.0.0",
    "expo-router": "~6.0.21",
    "expo-status-bar": "~3.0.9",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-reanimated": "~4.1.1",
    "react-native-gesture-handler": "~2.28.0"
  }
}
Modern Paket Tercihleri
Press enter or click to view image in full size

Not: token tutacaksanız expo-secure-store. Theme, language gibi senstive olmayan işler için expo-sqlite/localStorage kullanın

Data Fetching için
{
  "dependencies": {
    "@tanstack/react-query": "^5.0.0"
  }
}
Tailwind CSS v4 için (Opsiyonel)
{
  "dependencies": {
    "nativewind": "5.0.0-preview.2",
    "react-native-css": "0.0.0-nightly",
    "tailwindcss": "^4.0.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "resolutions": {
    "lightningcss": "1.30.1"
  }
}
Kaçınılması Gereken Paketler
Not: Bu paketler ilgili detaylı inceleme için bu yazıma bakabilirsiniz: https://medium.com/p/33048aed5d71

// KULLANMA:
{
  "expo-permissions": "❌ Deprecated - Her paketin kendi permission API'si var",
  "@react-native-community/async-storage": "❌ expo-secure-store veya expo-sqlite/localStorage kullan",
  "@react-native-picker/picker": "❌ Deprecated",
  "react-native-webview": "❌ expo-web-browser veya DOM components kullan"
}
Dosya ve Klasör Yapısı
Dosya İsimlendirme
✅ Doğru:
src/components/comment-card.tsx
src/hooks/use-auth.ts
src/services/api-client.ts

❌ Yanlış:
src/components/CommentCard.tsx
src/hooks/useAuth.ts
src/services/apiClient.ts
Not: Halihazırda Yanlış taraftaki kısımları yapıyor olabilirsiniz. Şu an için bence sorun teşkil etmiyor ancak geleceğe yönelik yeni projelerde kebab-case’e geçiş yapılmalı

Import Yapısı
// tsconfig.json path alias kullan
import { Button } from '@/components/button';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/services/api';

// Asla relative path kullanma (uzak dosyalar için)
// ❌ import { Button } from '../../../components/button';
Not: Path alias gerçekten kullanışlı ve import satırlarını okunabilir hale getiriyor.

tsconfig.json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
UI/UX Tasarım Prensipleri
Apple Human Interface Guidelines
Expo, Apple HIG’i temel alır. Temel prensipler:

Clarity — Metin okunabilir, ikonlar anlaşılır
Deference — İçerik ön planda, UI arka planda
Depth — Katmanlar ve hiyerarşi
Responsive Tasarım
// ✅ Her zaman ScrollView ile sar
import { ScrollView } from 'react-native';

export default function Screen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 16 }}
    >
      {/* İçerik */}
    </ScrollView>
  );
}
// ✅ useWindowDimensions kullan
import { useWindowDimensions } from 'react-native';

function ResponsiveComponent() {
  const { width, height } = useWindowDimensions();
  // ...
}

// ❌ Dimensions.get() kullanma
Not: Scrollview contentInsetAdjustmentBehavior özelliği iOS alt çentiğe üst üstde değmemesini sağlıyor. Güzel özellik.

Haptic Feedback (iOS)
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

function handlePress() {
  if (Platform.OS === 'ios') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  // Action...
}
Not: haptics fazlası rahatsız edici olabilir. İdareli kullanın

Text Özellikleri
// Kopyalanabilir veriler için
<Text selectable>user@email.com</Text>

// Sayılar için tabular-nums
<Text style={{ fontVariant: ['tabular-nums'] }}>1,234,567</Text>

// Büyük sayıları formatla
<Text>1.4M followers</Text>
<Text>38k likes</Text>
Not: tabular-nums özellikle sayaç yapıyorsanız çok kullanışlı ve UI’ın kaymamasını sağlıyor

Stil ve Görsel Tasarım
Temel Kurallar
// ✅ Inline styles tercih et
<View style={{ flex: 1, padding: 16, gap: 12 }}>
  <Text style={{ fontSize: 18, fontWeight: '600' }}>Title</Text>
</View>

// ✅ Flex gap kullan (margin yerine)
<View style={{ gap: 16 }}>
  <Child />
  <Child />
</View>

// ✅ Padding kullan (margin yerine mümkünse)
<View style={{ padding: 16 }}>
  <Content />
</View>
Not: Tailwind tarzı inline-styles öneriliyor (bence de en mantıklı yöntem).

Border Radius
// ✅ Continuous border curve (iOS)
<View style={{
  borderRadius: 12,
  borderCurve: 'continuous'
}}>
  {/* Kapsül şekiller hariç */}
</View>
Not: iOS tarafında continuous border çok tatlı duruyor tavsiye ederim. Meraklısına: https://medium.com/fueled-engineering/continuous-rounded-corners-with-uikit-b575d50ab232

Shadow (Box Shadow)
// ✅ CSS boxShadow kullan
<View style={{
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
}} />

<View style={{
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'
}} />

// Inset shadow
<View style={{
  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.06)'
}} />

// ❌ Legacy shadow props kullanma
// shadowColor, shadowOffset, shadowOpacity, shadowRadius
// elevation (Android)
Not: boxShadow özelliği 2024 ekim’den beri var. Tavsiye ederim.

Safe Area Yönetimi
// Stack header varsa otomatik yönetilir
// Tab bar varsa otomatik yönetilir
// Yoksa ScrollView ile yönet:

<ScrollView contentInsetAdjustmentBehavior="automatic">
  {/* Bottom ve top safe area otomatik */}
</ScrollView>
Animasyonlar
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight
} from 'react-native-reanimated';

// State değişikliklerinde entering/exiting animasyonları ekle
<Animated.View
  entering={FadeIn.duration(200)}
  exiting={FadeOut.duration(150)}
>
  {isVisible && <Content />}
</Animated.View>
Not: Sert UI geçişleri yerine animasyonlar, uygulamayı her zaman zenginleştiriyor.

Glass Effect (iOS 26+)
import { GlassView } from 'expo-glass-effect';

<GlassView style={{ padding: 16, borderRadius: 12 }}>
  <Text>Liquid glass background</Text>
</GlassView>
Navigasyon Kalıpları
Link Kullanımı
import { Link } from 'expo-router';

// Basit link
<Link href="/profile">Profile</Link>

// Custom component ile
<Link href="/profile" asChild>
  <Pressable>
    <Text>Go to Profile</Text>
  </Pressable>
</Link>

// Link Preview (iOS - önerilir)
<Link href="/profile">
  <Link.Preview>
    <ProfilePreviewCard />
  </Link.Preview>
  <Text>Profile</Text>
</Link>
Not: Linke uzun basıldığında çıkan ekran için yapılabilir. Çok kullanılıyor mu emin değilim.

Stack Navigation
// app/(tabs)/_layout.tsx
import { Stack } from 'expo-router/stack';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: 'Home' }}
      />
      <Stack.Screen
        name="details"
        options={{ title: 'Details' }}
      />
    </Stack>
  );
}
Modal Presentation
<Stack.Screen
  name="modal"
  options={{
    presentation: 'modal',
    headerShown: true
  }}
/>
Sheet (Bottom Sheet)
<Stack.Screen
  name="sheet"
  options={{
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 1.0],
    contentStyle: { backgroundColor: 'transparent' } // Glass effect için
  }}
/>
Not: Glass effect’li bottomsheet çok güzel. Kesinlikle deneyin. Diğer yandan çok fazla detaya ihtiyacınız yoksa gorhom/bottom-sheet e ihtiyacınız yok diyebilirim.

Context Menu
<Link href="/item/123">
  <Link.Menu>
    <Link.MenuAction title="Share" systemIcon="square.and.arrow.up" />
    <Link.MenuAction title="Edit" systemIcon="pencil" />
    <Link.MenuAction
      title="Delete"
      systemIcon="trash"
      destructive
    />
  </Link.Menu>
  <ItemCard />
</Link>
Not: Metne uzun basınca çıkan dropdown gibi düşünebiliriz. Çok ihtiyacımız olduğunu sanmıyorum.

Search Bar
<Stack.Screen
  name="search"
  options={{
    headerSearchBarOptions: {
      placeholder: 'Search...',
      onChangeText: (event) => setQuery(event.nativeEvent.text),
    }
  }}
/>
Not: Ekranda en alta glassview bir searchbar eklenmesini sağlıyor. Deneyin kesinlikle.

Data Fetching ve State Management
React Query Setup
// src/providers/query-provider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 dakika
      retry: 2,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
useQuery Kullanımı
import { useQuery } from '@tanstack/react-query';

function UserProfile({ userId }: { userId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;

  return <ProfileCard user={data} />;
}
Not: Kullanım ai için bu şekilde verilse de, gerçek projelerde ilgili query için useUserProfile() gibi bir custom hook yazmanızı tavsiye ederim.

useMutation Kullanımı
import { useMutation, useQueryClient } from '@tanstack/react-query';

function CreatePost() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  return (
    <Button
      onPress={() => mutation.mutate({ title: 'New Post' })}
      disabled={mutation.isPending}
    >
      Create Post
    </Button>
  );
}
Error Handling
class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchWithError<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(
      error.message || 'Request failed',
      response.status,
      error.code
    );
  }

  return response.json();
}
Retry Logic (Exponential Backoff)
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
Not: Bu da güzel bir özellik. Özellikle hata olduğunda her saniye tekrar sunucuya gitmek yerine exponential olarak sürey iayarlıyor.

Token Management
import * as SecureStore from 'expo-secure-store';

// ✅ Secure Store kullan
async function saveToken(token: string) {
  await SecureStore.setItemAsync('auth_token', token);
}

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

// ❌ AsyncStorage kullanma (güvenli değil)
Offline Support
import NetInfo from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';

// React Query ile entegre et
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});
Environment Variables
# .env
EXPO_PUBLIC_API_URL=https://api.example.com  # Client'ta görünür
API_SECRET_KEY=secret123                      # Sadece server-side

// Client-side
const apiUrl = process.env.EXPO_PUBLIC_API_URL;

// Server-side (API routes)
const secretKey = process.env.API_SECRET_KEY;
API Routes
Ne Zaman Kullanılmalı?
✅ Kullan:

Server-side secrets (API keys, DB credentials)
Database işlemleri
Third-party API proxy
Data validation
Webhook alma
Rate limiting
CPU-intensive işlemler
❌ Kullanma:

Public data
Sensitive data içermeyen işlemler
Real-time (WebSocket) ihtiyacı
Firebase/Supabase gibi managed backend varsa
Direct file upload (S3, Cloudinary)
Auth providers (Clerk, Auth0)
Dosya Yapısı
app/
├── api/
│   ├── hello+api.ts        → /api/hello
│   ├── users/
│   │   ├── index+api.ts    → /api/users
│   │   └── [id]+api.ts     → /api/users/:id
│   └── webhook+api.ts      → /api/webhook
Temel Implementasyon
// app/api/users+api.ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = url.searchParams.get('page') || '1';

  const users = await db.users.findMany({
    skip: (parseInt(page) - 1) * 10,
    take: 10,
  });

  return Response.json({ users, page });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validation
    if (!body.email || !body.name) {
      return Response.json(
        { error: 'Email and name required' },
        { status: 400 }
      );
    }

    const user = await db.users.create({ data: body });
    return Response.json(user, { status: 201 });

  } catch (error) {
    console.error('Create user error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
EAS Hosting Kısıtlamaları
Node.js filesystem yok (fs modülü çalışmaz)
30 saniye CPU timeout
Web APIs kullan (crypto.subtle vs crypto)
Cloud database önerilir: Cloudflare D1, Turso, PlanetScale, Supabase, Neon
Güvenlik
// ❌ ASLA client kodunda secret koyma
const apiKey = 'sk-123...'; // YANLIŞ

// ✅ API route'ta kullan
// app/api/openai+api.ts
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY; // .env'de
  // ...
}
Deployment ve CI/CD
EAS Setup
npm install -g eas-cli
eas login
npx eas-cli@latest init
eas.json Konfigürasyonu
{
  "cli": {
    "version": ">= 15.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "production": {
      "autoIncrement": true,
      "ios": {
        "resourceClass": "m1-medium"
      },
      "android": {
        "buildType": "apk"
      }
    },
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "1234567890"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "internal"
      }
    }
  }
}
Build Komutları
# Production build
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest build -p android --profile production

# Build + Submit
npx eas-cli@latest build -p ios --profile production --submit

# Hızlı TestFlight
npx testflight

# Development client
eas build -p ios --profile development
Web Deployment
# Export
npx expo export -p web

# Deploy
npx eas-cli@latest deploy --prod  # Production
npx eas-cli@latest deploy         # Preview URL
CI/CD Workflow
# .eas/workflows/release.yml
name: Release

on:
  push:
    branches: [main]

jobs:
  build-ios:
    type: build
    params:
      platform: ios
      profile: production

  build-android:
    type: build
    params:
      platform: android
      profile: production

  submit-ios:
    needs: [build-ios]
    type: submit
    params:
      platform: ios
      profile: production

  submit-android:
    needs: [build-android]
    type: submit
    params:
      platform: android
      profile: production
SDK Yükseltme
Adım Adım Yükseltme
# 1. Expo'yu güncelle
npx expo install expo@latest

# 2. Bağımlılıkları düzelt
npx expo install --fix

# 3. Diagnostics çalıştır
npx expo-doctor

# 4. Cache temizle
rm -rf node_modules .expo
watchman watch-del-all
npm install
SDK 54+ Güncellemeler
// app.json - React Compiler etkinleştir
{
  "expo": {
    "experiments": {
      "reactCompiler": true
    }
  }
}
Native Projeleri Güncelleme
# ios ve android klasörlerini yeniden oluştur
# ⚠️ Bare workflow değilse kullan
npx expo prebuild --clean

# iOS için
cd ios && pod install && cd ..

# Android için
cd android && ./gradlew clean && cd ..
Deprecated Paket Migrasyonları
EskiYeniexpo-av (audio)expo-audioexpo-av (video)expo-videoexpo-permissionsHer paketin kendi API'si@expo/vector-iconsexpo-symbols

Temizlik
# Gereksiz config dosyalarını sil
rm babel.config.js  # Sadece default preset varsa
rm metro.config.js  # Sadece default export varsa

# postcss.config.mjs kullan
# postcss.config.js → postcss.config.mjs
Yaygın Hatalar ve Çözümler
❌ Yanlış Kullanımlar
// ❌ Dimensions.get() kullanma
const { width } = Dimensions.get('window');

// ✅ useWindowDimensions kullan
const { width } = useWindowDimensions();
// ❌ Legacy shadow props
<View style={{ shadowColor: '#000', shadowOffset: {...} }} />

// ✅ boxShadow kullan
<View style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
// ❌ SafeAreaView (React Native)
import { SafeAreaView } from 'react-native';

// ✅ Safe area context
import { SafeAreaView } from 'react-native-safe-area-context';
// ❌ AsyncStorage
import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ SecureStore (hassas veriler için)
import * as SecureStore from 'expo-secure-store';
// ❌ Platform.OS
import { Platform } from 'react-native';
if (Platform.OS === 'ios') { ... }

// ✅ EXPO_OS
if (process.env.EXPO_OS === 'ios') { ... }
// ❌ Component'leri app/ klasörüne koyma
app/
  components/
    Button.tsx  // YANLIŞ

// ✅ src/ klasörüne koy
src/
  components/
    button.tsx  // DOĞRU
Expo Go vs Development Client
Expo Go önce dene!

npx expo start → Expo Go ile test et

Development Client sadece şunlar için gerekli:
- Local Expo modules (custom native code)
- Apple targets (widgets, app clips)
- Third-party native modules (Expo Go'da olmayan)
- Custom native configurations
Özet Checklist
Yeni Proje Başlatırken
[ ] npx create-expo-app ile başla
[ ] tsconfig.json'da path alias ekle
[ ] src/ klasör yapısını oluştur
[ ] React Query setup yap
[ ] .env dosyası oluştur
[ ] eas.json konfigüre et
Kod Yazarken
[ ] Dosya isimleri kebab-case
[ ] Route’lar sadece app/ içinde
[ ] Component’ler src/components/ içinde
[ ] ScrollView ile responsive tasarım
[ ] boxShadow kullan (legacy shadow değil)
[ ] useWindowDimensions kullan (Dimensions değil)
[ ] SecureStore kullan (AsyncStorage değil)
[ ] Animasyonlar ekle (entering/exiting)
Deploy Öncesi
[ ] npx expo-doctor çalıştır
[ ] Environment variables kontrol et
[ ] eas.json profiles kontrol et
[ ] App Store/Play Store metadata hazırla
