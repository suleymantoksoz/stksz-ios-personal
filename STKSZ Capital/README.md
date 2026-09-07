# STKSZ Komuta Merkezi

BIST portföyü, piyasa verisi, haber, risk ve fırsat takibi için yerel öncelikli
(local-first) finans komuta merkezi. **Web/PWA + Android + iOS** tek depoda.

![build](https://img.shields.io/badge/Capacitor-6.2-119EFF) ![pwa](https://img.shields.io/badge/PWA-ready-00df78)

## Depo yapısı

```
├── www/                    # Web uygulaması (PWA) — giriş noktası: www/index.html
│   ├── index.html          # Ana uygulama
│   ├── style.css           # Tema (koyu / neon yeşil)
│   ├── api-client.js       # Veri sağlayıcıları (Twelve Data, Yahoo, Bigpara, …)
│   ├── manifest.json       # PWA manifest
│   ├── service-worker.js   # Offline kabuk
│   └── assets/             # İkonlar, splash, görseller
├── android/                # Android Studio projesi (Capacitor)
├── ios/                    # Xcode projesi (Capacitor)
├── .github/workflows/
│   ├── ios-unsigned.yml    # macOS runner ile imzasız IPA derleme
│   ├── android-apk.yml     # ubuntu runner ile debug APK derleme
│   └── deploy-pages.yml    # www/ klasörünü GitHub Pages'e yayınlama
├── capacitor.config.json
└── package.json
```

## Hızlı başlangıç

### Web (her ortam)
```bash
cd www && python -m http.server 8080
# http://localhost:8080
```

### GitHub Pages
Repo → Settings → Pages → Source: **GitHub Actions** seçin.
`deploy-pages.yml` her push'ta `www/` içeriğini yayınlar
(uygulama `www/` alt klasöründe olduğu için Pages'e kök yerine
bu workflow ile deploy edilir).

### Android (Windows)
```bash
npm install
npx cap sync android
npx cap open android   # Android Studio → Run ▶
# veya: cd android && gradlew.bat assembleDebug
```

### iOS (GitHub Actions — Mac gerekmez)
Actions sekmesi → **Build STKSZ unsigned IPA** → Run workflow.
Çıktı: Artifacts → `STKSZ-unsigned-ipa`. İmzasız IPA'yı
AltStore / Sideloadly ile cihaza yükleyebilirsiniz.

## API anahtarları

Uygulama içinden: **Menü → API Yönetimi**. Anahtarlar yalnızca cihazın
localStorage kaydında tutulur; depoya veya sunucuya asla yazılmaz.

| Sağlayıcı | Veri | Gecikme |
|---|---|---|
| Twelve Data (isteğe bağlı anahtar) | BIST | EOD/gecikmeli |
| Yahoo → Bigpara → İş Yatırım | BIST (varsayılan, anahtarsız) | ~15 dk / EOD |
| Marketaux (isteğe bağlı) / Google News RSS | Haber | — |
| Open-Meteo | Hava | Canlı (anahtarsız) |
| open.er-api + gold-api | Döviz/Altın | Günlük / canlıya yakın (anahtarsız) |

AlgoLab (31.12.2025) ve Midas public API yok; gerçek emir kapısı kapalıdır.

## Üretim yapılandırması (Release)

Yayın öncesi dış servisler ve legal değerler için şablon: **`.env.example`**
(kopyalayıp `.env` yapın — `.env` asla commit edilmez, `.gitignore` korur).

| Değişken | Amaç |
|---|---|
| `GEMINI_API_KEY` | Google Gemini AI backend (`server/stksz-ai-server.js`). Yalnız sunucu/barındırma panelinde "environment secret" olarak tanımlanır. |
| `ENV_GOOGLE_CLIENT_ID` | Google Sign-In OAuth Client ID (Web). |
| `ENV_APPLE_CLIENT_ID` | Apple Sign-In Services ID (Web). |

Kontroller:

```bash
npm run check:legal-release         # Legal uygunluk kapısı (her zaman)
npm run check:production-config     # Geliştirme modu — uyarı verir, bloke etmez
PRODUCTION_RELEASE=true npm run check:production-config  # Yayın kapısı — eksikse exit 1
```

AI özellikleri için `server/stksz-ai-server.js` ücretsiz barındırmada
(Render/Railway/Fly.io/Cloudflare Workers) `GEMINI_API_KEY` + `PORT` ile
çalıştırılır. Google/Apple girişi için ilgili geliştirici panellerinden
Client/Services ID alınır; eksik yapılandırma uygulamada açıkça belirtilir.

## Veri ilkesi

Doğrulanmamış veri gösterilmez; kaynak yoksa **VERİ YOK** yazılır, sahte değer
üretilmez. ENR/Enpara kayıtları risk/skor hesaplarından izole tutulur.

## Lisans

Kişisel kullanım içindir. Yatırım tavsiyesi değildir.
