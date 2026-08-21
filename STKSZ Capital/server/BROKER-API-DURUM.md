# Gerçek Aracı Kurum Entegrasyonu — Durum Raporu (18.08.2026)

## Araştırma sonucu (canlı doğrulama)

| Kurum | Resmî API | Emir | Portföy/Bakiye | Durum |
|---|---|---|---|---|
| **Midas** | ❌ Public/bireysel API yok (`getmidas.com/api` → 404, developer portalı yok) | — | — | Entegrasyon bugün MÜMKÜN DEĞİL |
| **Deniz Yatırım · AlgoLab** | ⚰️ VARDI — **31.12.2025 itibarıyla kullanıma KAPATILDI** (resmî duyuru + topluluk repo doğrulaması) | vardı | vardı | Kapalı |
| Osmanlı/Matriks/TradingView entegrasyonları | Kurumun KENDİ platformları arası emir iletimi; üçüncü taraf uygulamalara açık geliştirici API'si DEĞİL | — | — | STKSZ'ye uygun değil |

## Karar
- Bugün Türkiye'de bireysel yatırımcıya açık, üçüncü taraf uygulamadan
  emir iletimini resmî olarak destekleyen bir aracı kurum API'si
  TESPİT EDİLEMEDİ.
- **Scraping, ekran otomasyonu veya kullanıcı şifresini taklit eden
  hiçbir yöntem KULLANILMAYACAK** (güvensiz + kullanım şartlarına ve
  mevzuata aykırı).
- Gerçek para işlemleri için ayrıca doğrulanması gerekenler:
  kurumla API hizmet sözleşmesi, SPK mevzuatına uygunluk (emir iletimine
  aracılık), kullanıcı yetkilendirme (kurum tarafında OAuth/imzalı oturum),
  rate limit ve güvenlik gereksinimleri.

## Yeni adapter değerlendirme kontrol listesi
Bir kurum resmî API açtığında MidasAdapter/FutureBrokerAdapter doldurulmadan
önce şu 9 başlık doğrulanmalı ve `capabilities.requirementsMet` işaretlenmeli:
1) Resmî API desteği (dokümante, sözleşmeli)
2) Emir gönderme desteği (place)
3) Portföy sorgulama
4) Bakiye sorgulama
5) Emir durumu / iptal
6) Authentication (anahtar backend secret'ında; OAuth/SMS akışı)
7) Rate limit (istek/sn sınırına uyum katmanı)
8) Kullanıcı yetkilendirmesi (hesap sahibi onayı, kurum tarafında)
9) Güvenlik gereksinimleri (imzalama, IP kısıtı, audit)

## Bugünkü çalışma modu
- SANAL CÜZDAN → MockBrokerAdapter (aktif, tam işlevsel)
- GERÇEK HESAP → UI'da ayrı bölüm; durum: "BAĞLI DEĞİL — resmî API bekleniyor"
- İki sistemin bakiyeleri hiçbir hesaplamada birleştirilmez.
- Resmî API çıktığı gün: adapter doldur → kontrol listesi → BROKER_LIVE_ENABLED=true
  → ADIM 10 intent+onay+audit zinciri zaten hazır.
