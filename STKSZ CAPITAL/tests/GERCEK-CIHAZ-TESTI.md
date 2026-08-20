# ADIM 17 · Gerçek Cihaz Kabul Testi — Kullanıcı Rehberi (iPhone + Nubia ZTE)

Sandbox'ta donanım olmadığı için bu bölüm SENİN cihazlarında koşulur.
Sıra: zip → GitHub → Actions (APK + IPA) → kur → aşağıdaki listeyi işaretle.

## Hazırlık
1. stksz-github-repo.zip içeriğini repo köküne yükle (push).
2. Actions → "Build STKSZ Android APK" ve "Build STKSZ unsigned IPA" çalıştır.
3. Backend: Render'da GEMINI_API_KEY secret + kalıcı disk (server/DEPLOYMENT.md).
4. Uygulamada: Menü → API Yönetimi → STKSZ AI → AI Backend URL'yi gir → 🧪 TEST ET
   ("Backend bağlı · model … · araçlar: …" görmelisin).

## A) iPhone (her madde için ☐ işaretle)
☐ Açılış <3sn, beyaz ekran/çökme yok
☐ Ana sayfa: TOPLAM VARLIK hero + kartlar taşma/kesilme yok
☐ Üst header + sayfa rozeti; alt navigation 6 sekme; çentik/safe-area temiz
☐ Klavye: arama + AI composer'da açıl/kapan; alan klavyenin altında kalmıyor
☐ Portföy: nakit kırılımı TL/USD/EUR + OCR alanı
☐ Sanal cüzdan: kur → AL → SAT → temettü → geçmiş; SANAL/GERÇEK sekme ayrımı
☐ Hisse detay: grafik ÜSTTE, SANAL AL/SAT butonları
☐ Grafik: zoom(iki parmak)/kaydır/eksen sürükle/çift dokun/10 araç/tam ekran — sayfa scroll'u ile çakışmıyor
☐ STKSZ AI: bağlantı rozeti yeşil, 6 hazır kart, soru→gerçek veri yanıtı
☐ + GÖRSEL: kamera VE galeri seçenekleri; Midas ekran görüntüsü → çıkarım kartı → SANAL PORTFÖYE EKLE → onay ekranı → işlem
☐ Onaysız hiçbir işlem oluşmadığını geçmişten doğrula
☐ Bildirim ayarları, tema (koyu/açık), profil, favoriler, arama
☐ Uçak modu: uygulama açılıyor, sanal cüzdan çalışıyor, kartlar dürüst durum
☐ Uçak modu kapat: senkron toparlanıyor

## B) Nubia ZTE Android — aynı liste + ek
☐ Geri tuşu/gesture: modal açıkken modalı kapatır, uygulamadan atmaz
☐ Navigation bar safe-area (alt nav çakışmıyor)
☐ Yatay mod: grafik tam ekran düzgün
☐ Midas'a Git / Enpara butonları gerçek uygulamaları açıyor

## C) iOS ↔ Android Senkron
1. iPhone: Veri Yönetimi → YENİ SENKRON HESABI OLUŞTUR → kodu not al
2. Android: kodu gir → BU CİHAZI EŞLEŞTİR
3. iPhone: sanal TCELL 3 lot AL → Android: ŞİMDİ SENKRONLA → aynı bakiye/lot/K-Z/geçmiş ☐
4. Ters yön: Android'de SAT → iPhone'da doğrula ☐
5. İkisinde AYNI ANDA farklı işlem → senkron → iki işlem de var, duplicate yok ☐
6. Senkron sırasında interneti kes → geri aç → toparlanma ☐

## D) Kapat-Aç Recovery
☐ AI açıkken öldür-aç ☐ görsel analizi sonrası ☐ onay ekranındayken
☐ işlem sonrası ☐ senkron sırasında ☐ offline'dayken — veri kaybı yok

## E) PWA/Cache (web sürümü kullanılıyorsa)
☐ Yeni sürüm yayınında sayfa yenile → build no değişti (Menü→Hakkında)
☐ Eski görünüm/karışık stil YOK

Herhangi bir madde FAIL ise: ekran görüntüsü + hangi madde olduğunu bildir;
kök neden analizi ve minimal düzeltme sonraki turda yapılır.
