#!/usr/bin/env bash
set -euo pipefail

# Proje köküne göre yollar
ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
POS_ELECTRON_DIR="$ROOT_DIR/electron_apps/pos"
NEXT_OUTPUT_DIR="$POS_ELECTRON_DIR/src"

echo "🔧 [1/3] Frontend build alınıyor (kod değişmez, sadece derlenir)..."
cd "$FRONTEND_DIR"
npm run build  # → .next/standalone/ oluşur

echo "📦 [2/3] Standalone çıktı kopyalanıyor..."
# Önce eski çıktıyı temizle
rm -rf "$NEXT_OUTPUT_DIR"

# standalone dizinini kopyala
cp -r .next/standalone "$NEXT_OUTPUT_DIR"

# electron-builder'ın node_modules dizinini hariç tutmasını engellemek için adını değiştir
if [ -d "$NEXT_OUTPUT_DIR/node_modules" ]; then
  mv "$NEXT_OUTPUT_DIR/node_modules" "$NEXT_OUTPUT_DIR/node_modules_prod"
fi


# public/ dizinini kopyala (sounds, icons vs.)
mkdir -p "$NEXT_OUTPUT_DIR/public"
if [ -d "public" ]; then
  cp -r public/* "$NEXT_OUTPUT_DIR/public/"
fi

# .next/static dizinini kopyala (client-side chunks)
mkdir -p "$NEXT_OUTPUT_DIR/.next"
if [ -d ".next/static" ]; then
  cp -r .next/static "$NEXT_OUTPUT_DIR/.next/static"
fi

# resources dizinini oluştur ve ses dosyalarını kopyala
mkdir -p "$POS_ELECTRON_DIR/resources/sounds"
if [ -d "public/sounds" ]; then
  cp -r public/sounds/* "$POS_ELECTRON_DIR/resources/sounds/"
fi

echo "✅ [3/3] Build tamamlandı → $NEXT_OUTPUT_DIR"
