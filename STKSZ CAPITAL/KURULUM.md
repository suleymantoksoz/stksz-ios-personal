# STKSZ Komuta Merkezi — Tam Proje (Web + Android + iOS)

Tek pakette üç hedef: **Web/PWA** (`www/`), **Android** (`android/`), **iOS** (`ios/`).
appId: `com.stksz.komutamerkezi` · appName: `STKSZ` · Capacitor 7.6.8

```
proje/
├── www/                  → Web uygulaması (PWA + Borsa Portalı)
├── android/              → Android Studio projesi (Gradle, ikonlar, splash hazır)
├── ios/                  → Xcode projesi (Podfile, pbxproj, ikon/splash hazır)
├── capacitor.config.json
├── package.json          → @capacitor/core|cli|ios|android @7
└── KURULUM.md            → bu dosya
```

---

## A) WINDOWS'TA ANDROID DERLEME (sizin ortamınız ✓)

### Gereksinimler
1. **Node.js 20+** → https://nodejs.org
2. **Android Studio** (SDK + emülatör dahil) → https://developer.android.com/studio
   - İlk açılışta SDK kurulumunu tamamlayın (API 34 önerilir)

### Adımlar
```bat
:: 1. Paketi aç ve klasöre gir
tar -xf stksz-app-full.zip
cd stksz-app-full

:: 2. Node bağımlılıkları
npm install

:: 3. Web içeriğini platformlara senkronla
npx cap sync android

:: 4a. Android Studio'da aç (önerilen)
npx cap open android
::  → Studio'da: Run ▶ (emülatör veya USB'deki telefon)

:: 4b. veya komut satırından APK üret
cd android
gradlew.bat assembleDebug
::  → APK: android\app\build\outputs\apk\debug\app-debug.apk
```

APK'yı telefona atıp doğrudan kurabilirsiniz ("Bilinmeyen kaynaklara izin ver").

### Yayın (Play Store) için imzalı derleme
```bat
cd android
gradlew.bat bundleRelease
```
İmza anahtarı oluşturma: Android Studio → Build → Generate Signed Bundle/APK.

---

## B) iOS DERLEME (Mac gerektirir — Windows'tan seçenekler)

iOS derlemesi Apple araç zinciri gerektirir; Windows'ta yerel olarak yapılamaz.
Mac'siz seçenekler:

| Yöntem | Açıklama |
|---|---|
| **Ionic Appflow** | https://ionic.io/appflow — bulutta iOS build (ücretli, en kolay) |
| **Codemagic** | https://codemagic.io — Capacitor destekli bulut CI, ücretsiz kota var |
| **GitHub Actions** | `macos-14` runner ile ücretsiz build (public repo) — `pod install` + `xcodebuild` |
| **Kiralık Mac** | MacinCloud / AWS EC2 Mac |
| **Fiziksel Mac** | `npm install` → `cd ios/App && pod install` → `npx cap open ios` |

> App Store'a yüklemek için her durumda **Apple Developer hesabı** ($99/yıl) gerekir.

---

## C) WEB / PWA (her ortamda çalışır)

`www/` klasörünü herhangi bir statik hosta koyun (Netlify, Vercel, GitHub Pages…)
veya yerelde: `cd www && python -m http.server 8080`
- PWA: tarayıcıdan "Ana ekrana ekle" ile kurulabilir; offline çalışır (service worker)
- Canlı fiyat/haber için: Menü → **API YönETİMİ** → Twelve Data / Marketaux
  anahtarlarınızı girin (localStorage'da kalıcı saklanır)

---

## Web içeriğini güncellediğinde
```bat
npx cap sync
```
(www → android/app/src/main/assets/public ve ios/App/App/public kopyalanır)

## Sık karşılaşılan hatalar
| Hata | Çözüm |
|---|---|
| `JAVA_HOME is not set` | Android Studio kur; Studio kendi JDK'sını kullanır |
| `SDK location not found` | `android/local.properties` → `sdk.dir=C:\\Users\\KULLANICI\\AppData\\Local\\Android\\Sdk` |
| Gradle indirme yavaş | İlk derleme uzundur (Gradle+bağımlılıklar iner); bekleyin |
| `npx cap` Node hatası | Node 20+ kurulu olmalı: `node -v` |
| iOS `pod install` hatası | Mac'te: `sudo gem install cocoapods` |
