# STKSZ Test Paketi (v114 temel çizgisi: 319 sandbox testi / 0 hata · premium UI katmanı (referans design system) uygulanmış + GERCEK-CIHAZ-TESTI.md saha listesi)

Çalıştırma: her dosya bağımsızdır → `node tests/<dosya>`
Gereksinim: `npm install jsdom` (testlerin yanında; uygulama runtime'ı jsdom kullanmaz).

| Dosya | Kapsam | Test |
|---|---|---|
| full-system.test.js | ADIM 12'nin 17 maddesi: wallet, sanal AL/SAT, portföy, nakit, K/Z, işlem geçmişi, Android sync, Gemini portföy sorgusu, görsel çıkarım, onay akışı, API key sızıntı (6 yüzey), realMoney kilidi, iOS/Android eşitliği, mevcut özellikler | 35 |
| chart-engine.test.js | Grafik motoru: çizim, 10 araç, trend, zoom, eksen ölçekleme, çift dokunuş | 6 |
| smoke.test.js | Regresyon: calc/nakit/sanal cüzdan/AI görsel/legacy OCR | 10 |
| sync-two-devices.test.js | İki cihaz senkron + çakışma birleşimi + ENR/anahtar dışlama + offline | 29 |
| order-intent-security.test.js | Order intent + onay/iptal + audit + anahtar redaksiyonu | 21 |
| virtual-real-separation.test.js | Sanal/gerçek hesap ayrımı + broker araştırma belgesi + kilitler | 21 |
| stress-full.test.js | ADIM 15 stres: offline/recovery, restart kalıcılığı, eşzamanlı senkron+kesinti, cüzdan zinciri+9 uç değer, Gemini 12 stres modu, 10 görsel senaryosu, AI+portföy 6 soru, fallback bağımsızlığı, çift sayım, performans | 66 |
| ui-v114.test.js | ADIM 19c: rozet kaldırma, bakır ikonlar/kalem, AI çekmece+yatay radar, v1 sürüm gösterimi, giriş/misafir/biyometrik akışı + misafir kısıtları | 22 |
| perf-hardening.test.js | ADIM 18: AI/sayfa/grafik aç-kapa döngüleri (DOM leak yok), interval envanteri, 200 işlem hız+K/Z, geçmiş limiti | 7 |
| acceptance-final.test.js | ADIM 17: production backend yaşam döngüsü (anahtar yokken dürüst 503), PWA sürüm geçişi, veri bütünlüğü çift-sayım matrisi, ZIP güvenlik final taraması, performans/leak göstergeleri | 24 |
| release-check.test.js | ADIM 16 release: runtime bütünlüğü, platform eşliği (md5), SW cache-busting, env/secret disiplini, migration, rollback, ZIP içerik+sızıntı doğrulaması | 36 |
| security-audit.test.js | ADIM 14 güvenlik denetimi: secret tarama, proxy, görsel→onay zinciri, kuruş hassasiyeti, replay/idempotency, sync kesintisi, gerçek para bypass denemeleri, user isolation, XSS/injection, client storage, fallback'ler, log hijyeni | 42 |

Not: Testler mock Gemini + gerçek backend süreci (server/stksz-ai-server.js)
kullanır; dış ağa çıkmaz, gerçek anahtar gerektirmez.
