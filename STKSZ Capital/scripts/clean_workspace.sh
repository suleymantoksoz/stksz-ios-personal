#!/usr/bin/env bash
# STKSZ GÜVENLİ WORKSPACE TEMİZLİĞİ
# YALNIZCA cache / build / geçici dosyaları siler.
# KAYNAK DOSYALARA (www/ android/ ios/ .github/ package.json vb.) ASLA DOKUNMAZ.
set -euo pipefail
cd "$(dirname "$0")/.."

# Güvenlik kilidi: kaynak klasörler mevcut değilse hiçbir şey silme
for must in www android ios package.json capacitor.config.json; do
  [ -e "$must" ] || { echo "GÜVENLİK: $must bulunamadı — temizlik iptal."; exit 1; }
done

BEFORE=$(du -sm . | cut -f1)

# 1) Ortam / paket önbellekleri (yeniden üretilebilir)
rm -rf .npm .cache .venv .pytest_cache .ruff_cache __pycache__ 2>/dev/null || true

# 2) Derleme çıktıları (CI'da üretilir; kaynakta durmamalı)
rm -rf node_modules build dist out coverage 2>/dev/null || true
rm -rf android/app/build android/build android/.gradle android/captures 2>/dev/null || true
rm -rf ios/App/Pods ios/App/build ios/DerivedData 2>/dev/null || true
rm -rf ios/App/App.xcworkspace/xcuserdata ios/App/App.xcodeproj/xcuserdata 2>/dev/null || true

# 3) Geçici / log / OS çöpleri
find . -type f \( -name "*.log" -o -name "*.tmp" -o -name ".DS_Store" -o -name "Thumbs.db" -o -name "npm-debug.log*" \) ! -path "./.git/*" -delete 2>/dev/null || true

# 4) İşlenmiş kullanıcı yüklemeleri (ekran görüntüleri — OCR sonrası gereksiz)
rm -rf uploads 2>/dev/null || true

# 5) Git deposunu sıkıştır (geçmiş korunur, yalnız paketlenir)
git reflog expire --expire=now --all 2>/dev/null || true
git gc --prune=now --quiet 2>/dev/null || true

AFTER=$(du -sm . | cut -f1)
echo "Temizlik tamam: ${BEFORE}MB → ${AFTER}MB · Kaynak dosyalara dokunulmadı."
