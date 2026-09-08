# STKSZ CAPITAL — YENİ ANA YAPILACAKLAR LİSTESİ

**Tarih:** 08.09.2026  
**Referans repo:** `suleymantoksoz/stksz-ios-personal` / `main`  
**Denetlenen HEAD:** `3c0f236cdcad785396536dc458175ae2f3163674`  
**Denetlenen APK:** `STKSZ-debug-apk.zip` → `app-debug.apk`  
**Denetlenen görseller:** `drive-download-20260908T083123Z-1-001.zip` içindeki 19 Android ekran görüntüsü  
**Denetlenen mevcut liste:** `STKSZ Capital Yapılacaklar listesi.docx` (3902 paragraf; tablo yok)  

Bu dosya, eski listeleri körlemesine tekrar etmek için değil; mevcut APK + GitHub kaynak kodu + 08.09.2026 ekran görüntüleri + önceki authoritative 64-A–160 kapsamını tersine mühendislikle birleştirerek **OpenCode için gerçek uygulama sırası** oluşturmak için hazırlanmıştır.

---

## A. DEĞİŞMEZ KURALLAR

1. `git reset --hard`, gereksiz revert ve çalışan özellikleri sıfırdan yazma YOK.
2. Yalnız `STKSZ Capital` projesinde çalış; STKSZ Lock'a dokunma.
3. AdMob geri gelmeyecek. Eski 61. AdMob maddesi **İPTAL / UYGULANMAYACAK**.
4. Fake/demo finansal veri üretme. Veri yoksa `VERİ YOK`; yatırım kararı için yetersizse `VERİ YETERSİZ — KARAR YOK`.
5. Skeleton/placeholder fonksiyon veya görünür ama çalışmayan kart “tamamlandı” sayılmaz.
6. Kullanıcıya API key/token/secret girdirtme. Secret yalnız backend/environment/vault.
7. Gerçek broker/ödeme/Telegram/partner entegrasyonu gerçek credential, sözleşme veya izin yoksa **pasif altyapı** olarak kalır; sahte bağlı görünmez.
8. Google/Apple OAuth gerçek credential yoksa sahte başarı yok; kompakt ve dürüst “yapılandırılmadı” durumu.
9. ENR/TP2/Midas yalnız örnek kaynak olabilir; ana veri modeli kurumdan bağımsız olmalı.
10. Tüm ana mobil ekranlar Android ve iOS ortak `www` UI katmanından aynı davranışı üretmeli.
11. Her küçük maddeden sonra build/test/commit/push yapma. Faz içinde toplu geliştir; faz sonunda hedefli kontrol. Finalde tek tam batch validation.
12. OpenCode’un kendi “PASS” raporu kanıt değildir. Dosya, DOM, runtime akışı, APK ve CI çıktısı ile doğrula.

---

## B. DENETİMDE BULUNAN KRİTİK GERÇEK HATALAR

### B1 — P0 DOM / NAVİGASYON KÖK HATASI
APK içindeki `assets/public/index.html` dosyasında `page-portfolio` yaklaşık satır 155'te açılıyor; kişisel hesap/snapshot alanı sonrasında kapanmadan `page-news` yaklaşık satır 550'de başlıyor. Bunun sonucu `page-news`, `page-status`, `page-opportunities`, `page-crypto`, `page-settings` DOM olarak `page-portfolio` altında kalıyor. CSS `.page{display:none}.page.active{display:block}` olduğu için alt sayfaya `active` verilse bile gizli parent yüzünden ekran boş kalıyor. 08.09.2026 ekran görüntülerindeki Haberler/Durum/Fırsatlar/Kripto boş ekranlarının ana kök nedeni budur.

### B2 — GLOBAL UYARI / İÇERİK ÜST ÜSTE BİNME
Global finansal/AI uyarı metni ana içerik üzerine biniyor; Portfolio ve Home kartları ile aynı koordinatlarda görünerek başlıkları, butonları ve kart içeriğini kapatıyor. Uyarı akışı normal document flow içinde kompakt olmalı; sticky/fixed/absolute katman içerik üstüne binmemeli.

### B3 — AUTH EKRANI ÇİFT LOGO VE AŞIRI HACİM
`auth-card` içinde hem `.auth-logo` hem `.auth-hero-logo` aynı logoyu tekrar gösteriyor. İlk ekran gereksiz uzun; ikinci auth seçenek ekranı da ayrı büyük panel olarak tekrar ediyor. Mobilde tek premium logo + kompakt giriş/kayıt/misafir akışı gerekli.

### B4 — PORTFÖY MİDAS'A AŞIRI BAĞLI / GENEL MODELLE ÇELİŞİYOR
APK `index.html` içinde 100'den fazla Midas/MIDAS metinsel referansı var. Nakit kartı, “Midas toplam”, “Midas’a git”, OCR source, günlük K/Z, risk, rapor, cash editor gibi ana yapılar kurum bağımsız olması gerekirken Midas'a sabitlenmiş. Kullanıcının istediği banka/aracı kurum/fon/hisse/kripto/emtia ekran görüntüsü genel modeliyle çelişiyor.

### B5 — İKİ AYRI OCR / IMPORT AKIŞI
Aynı portföy sayfasında:
- “STKSZ AI ile görsel yükle”,
- “Eski OCR alanını aç/kapat”,
- ayrıca “Portföy Import (Görsel/CSV/PDF/Metin)”
aynı işi üç farklı giriş noktasıyla yapıyor. Bu UX karışıklığı ve veri sahipliği çatışması doğuruyor. Tek `PORTFÖY / HESAP İÇE AKTAR` merkezi olmalı.

### B6 — ESKİ NEON YEŞİL KALINTILARI
Copper/Gold hedeflenmiş olmasına rağmen CSS/JS'de aktif `#00df78` ve yeşil glow kullanımları devam ediyor (ör. connected/confidence, crypto positive, breakout, depth bid, lint, import preview, key moments, fear&greed). Finansal pozitif renk gerekliyse muted positive kullanılabilir; neon marka vurgusu kaldırılmalı.

### B7 — STKSZ AI EKRANI NORMAL KULLANICIYA API YÖNETİMİ GÖSTERİYOR
AI overlay “STKSZ AI · BAĞLI DEĞİL”, “API Yönetimi → STKSZ AI kartından Backend URL veya yedek anahtar ekle” gibi teknik konfigürasyon gösteriyor. Bu, backend-only secret kuralıyla ve son production config mimarisiyle çelişiyor. Normal kullanıcı API anahtarı/backend URL görmemeli veya girmemeli; teknik durum yalnız admin/developer panelinde olmalı.

### B8 — ARAMA MODALI MOBİL KLAVYE İLE ÇAKIŞIYOR
Arama paneli klavye açıkken ekranın üstünde büyük boş/dengesiz alan bırakıyor; modal ve sonuç alanı viewport/keyboard yüksekliğine göre adapte olmuyor. Safe-area, `100dvh`, scroll ve keyboard inset davranışı düzeltilmeli.

### B9 — DETAY FİYATI MOBİLDE SATIR KIRIYOR
ASELS detayında `₺386,00` iki satıra bölünüyor. Fiyat alanında `white-space:nowrap`, responsive font clamp ve yeterli grid alanı gerekli.

### B10 — BETİK EDİTÖRÜ HALA NEON/ESKİ TEMADA
STKSZ Editor başlığında parlak yeşil, geniş boş alan, mobilde düzensiz buton satırları ve ayrı tasarım dili var. Copper/Gold tek tasarım sistemine alınmalı; editor fonksiyonları korunmalı.

### B11 — GEREKSİZ / TEKRAR EDEN BOŞ VE “VERİ YOK” KARTLARI
Home, Portfolio, Insights ve diğer panellerde veri yokken büyük kartlar yalnız “VERİ YOK” tekrar ediyor. Empty state tek, anlamlı, kısa aksiyonlu olmalı; aynı bilgiyi 4–6 kartta tekrar etme.

### B12 — PORTFÖYDE ENR ÖZEL KARTI İLE GENEL “HESAPLARIM” KURGUSU ÇAKIŞIYOR
ENR “ayrı kayıt” büyük özel kart olarak kalırken hemen altında genel kişisel varlık takibi açılıyor. ENR/TP2 dahil bütün kurum/varlık snapshot'ları genel `Account / Institution / Asset` modelinden yönetilmeli; hassas veri maskesi korunmalı.

### B13 — MEVCUT DOCX KENDİ İÇİNDE ÇELİŞKİLİ VE EKSİK
- 54 numaralı gerçek AL/SAT bölümü iki kez geçiyor.
- 55 Telegram bölümü birden fazla kez/yeniden yazılmış.
- 61 AdMob maddesi mevcut, fakat proje kararıyla iptal ve yasak.
- İlk bölümlerde kullanıcıya manuel Bot Token/API key girişi isteyen eski yaklaşım, son Zero-Trust/backend-secret yaklaşımıyla çelişiyor.
- Yüklenen 08.09.2026 DOCX 66'da bitiyor; daha önce authoritative hale gelen 67–160 kapsamı bu DOCX'te yok. Bu nedenle bu yeni liste 67–160 kapsamını kaybetmeden yeniden dahil eder.

---

# FAZ 1 — P0 RUNTIME / DOM / BOŞ SAYFALAR / MOBİL KÖK ONARIMI
**12 ana madde — OpenCode'a 1 kez toplu verilecek.**

### 1.1 DOM page hiyerarşisini düzelt
`page-portfolio` kapanışını doğru yere koy; `page-home`, `page-portfolio`, `page-news`, `page-status`, `page-opportunities`, `page-crypto`, `page-settings` ve tüm ana page'ler `#appScroll` altında sibling olsun. Nested `.page` kalmasın.

### 1.2 Page integrity invariant ekle
Runtime/dev doğrulamasında her `.page` için parent `#appScroll` veya tasarlanmış tek shell olmalı. Ana page başka `.page` içinde ise validation FAIL.

### 1.3 showPage akışını sağlamlaştır
`showPage(id)` çağrısında hedef var mı, tek active page var mı, bottom-nav `aria-current`, menu return page ve scroll pozisyonu doğru mu kontrol et. Gizli parent nedeniyle görünmez hedef oluşmasın.

### 1.4 6 ana mobil navigasyon ekranını gerçek içerikle doğrula
Ana Sayfa, Portföy, Haberler, Durum, Fırsatlar, Kripto tıklanınca blank page oluşmamalı. Veri yoksa bile header + empty state + kullanılabilir kontroller görünmeli.

### 1.5 Settings/menu hiyerarşisini düzelt
Hamburger menü aç/kapa ve alt menüler nested hidden page hatasından etkilenmemeli. Menüden geri dönüş önceki aktif sayfaya dönmeli.

### 1.6 Global disclaimer overlay hatasını çöz
Uyarı document flow içine alınsın; header veya page içerikleriyle üst üste binmesin. Mobilde maksimum 2–3 satır özet + “Detay” yapısı kullanılabilir; legal metin kaybolmasın.

### 1.7 Header safe-area ve viewport düzeltmesi
Android status bar/iOS notch altında header düzgün konumlansın. Refresh, bildirim, arama, menü butonları taşmasın; içerik header altında başlamalı.

### 1.8 Bottom nav safe-area ve içerik padding
Bottom nav içerik son kartını kapatmasın. `padding-bottom` gerçek nav yüksekliği + safe-area ile hesaplanmalı.

### 1.9 Search modal keyboard davranışı
`100dvh`, visual viewport/keyboard inset ve scrollable result region kullan; klavye açıkken panel kesilmesin, sonuçlar erişilebilir olsun.

### 1.10 Asset detail responsive fiyat
Büyük fiyat tek satır; `clamp()` font, nowrap ve responsive action column. 320/360/375/390/430 px test et.

### 1.11 Console/runtime error temizliği
İlk açılış + her ana nav + menu + search + asset detail + AI overlay aç/kapa akışında uncaught exception olmamalı.

### 1.12 Faz 1 doğrulaması
DOM sibling assertion, blank-page assertion, navigation smoke, Android responsive snapshot kontrolü. Bu fazda geniş feature testi yapma; sadece P0 kök hataları.

**FAZ 1 ÇIKIŞ KRİTERİ:** 6 bottom-nav ekranının hiçbiri boş değil; içerik/uyarı üst üste binmiyor; search ve asset detail mobilde kırılmıyor.

---

# FAZ 2 — AUTH + BÜTÜN MOBİL UI/UX + TEK COPPER/GOLD TASARIM SİSTEMİ
**14 ana madde — OpenCode'a 1 kez toplu verilecek.**

### 2.1 Auth tek logo
`.auth-logo` / `.auth-hero-logo` çiftliğini tek marka alanına indir. Splash logosu auth kartında tekrar edilmesin.

### 2.2 Auth akışını kompaktlaştır
Giriş / Kayıt / Misafir net ama tek mobil kart mimarisinde; gereksiz ikinci dev seçim sayfası ve boşluklar kaldırılmalı. Google/Apple/yerel giriş mevcut fonksiyonları korunmalı.

### 2.3 OAuth dürüst durum
Google/Apple gerçek client ID yoksa buton sahte login yapmasın. Normal kullanıcıya teknik ENV adı göstermeden kısa “Şu anda yapılandırılmadı” mesajı.

### 2.4 Guest/Free/Pro/Elite/Admin görünüm kuralları
Guest sadece preview; kilitli fonksiyon tetiklenmez. Admin her rolü preview edebilir. Rol rozeti/erişim tek merkezi entitlement kaynağından gelsin.

### 2.5 Marka rengi temizliği
Aktif neon `#00df78`, neon glow ve eski yeşil primary vurguları kaldır. Finansal pozitif için yalnız muted `--positive`; marka CTA/selected state Copper/Gold.

### 2.6 Siyah kutu kalıntılarını cam/panel sisteme taşı
`#0a0d0f` vb. saf siyah kartlar, import tabları, insight kartları ve editor panelleri tema tokenları üzerinden panel/glass yüzeylere dönüştürülsün.

### 2.7 Typography sistemi
320–430 px için başlık, metin, badge, KPI ve button font clamp değerleri; Türkçe uzun kelimelerde kontrollü wrap. Harf harf bölünme yok.

### 2.8 Home hero sadeleştirme
“VERİ YOK / VERİ YETERSİZ” tekrarlarını azalt; Toplam Varlık, yatırım/nakit, risk ve score tek dengeli hero. Score panel dar sütunda kesilmesin.

### 2.9 İzleme listesi başlığını sadeleştir
“Dokunarak grafiğe git” ayrı büyük yarım başlık gibi durmasın; kısa yardımcı metin veya ikonla birleştir.

### 2.10 Empty state standardı
Haberler/Durum/Fırsatlar/Kripto/Portföy/Insights için ortak `empty-state` bileşeni: neden boş + birincil aksiyon + veri kaynağı durumu. Dev boş ekran yasak.

### 2.11 Edit Mode tüm sayfalarda tutarlı
“Sayfayı düzenle” yön okları yalnız edit mode'da; her reorderable section aynı kontrole sahip; saved order bozulmasın.

### 2.12 Header/bottom-nav ikon ve aktif state standardı
Aktif öğe Copper/Gold; icon boyutları, hit area >=44px, text alignment ve STKSZ AI butonu görsel denge.

### 2.13 Light/dark theme token tutarlılığı
Özel hardcoded renkler yerine theme token; dark ve light içinde aynı hiyerarşi. Legal sayfalar dahil.

### 2.14 Faz 2 mobil visual regression
320/360/375/390/430 px + desktop; login, home, portfolio, news, status, opportunities, crypto, search, editor, menu. Horizontal overflow ve text overlap = 0.

---

# FAZ 3 — PORTFÖY / HESAPLAR / OCR-VISION / IMPORT / SNAPSHOT / NAKİT
**13 ana madde — OpenCode'a 1 kez toplu verilecek.**

### 3.1 Kurumdan bağımsız veri modeli
`Account`, `Institution`, `Asset`, `Snapshot`, `CashBalance`, `Position`, `Transaction` temel modelini kullan. Midas/Enpara/Akbank vb. provider metadata olsun, ana model olmasın.

### 3.2 Midas hardcode temizliği
UI'da “Midas Toplam”, “Midas Nakit”, “Midas Portföy Durumu” gibi genel alanları `Seçili Hesap / Toplam Portföy / Nakit` yap. Midas'a özel link sadece Midas hesabı seçiliyse provider action olarak görünür.

### 3.3 Tek “Hesap/Portföy İçe Aktar” merkezi
AI görsel yükleme + eski OCR + multi-source import üçlüsünü tek akışta birleştir. Giriş yöntemleri: Görsel, CSV, PDF, Metin/Doğal Dil.

### 3.4 Legacy OCR kullanıcı UI'ından kaldır
Eski OCR ayrı görünür bölüm olmamalı. Gerekliyse internal fallback parser olarak yaşasın; kullanıcı “eski OCR aç/kapat” görmesin.

### 3.5 Source auto-detection
Görselde kurum adı bulunursa institution tahmini yap; bulunamazsa “Kurum bilinmiyor” de. Kullanıcı onaylamadan veri yazma. Midas/ENR örneklerini genelle.

### 3.6 Vision → OCR fallback
Önce server-side Gemini Vision endpoint; başarısız/erişilemezse yerel Tesseract fallback. Hiçbiri güvenli parse vermezse `VERİ YETERSİZ — KARAR YOK`; mevcut portföyü değiştirme.

### 3.7 Import preview ve kullanıcı onayı
Tespit edilen kurum, hesap, varlık, lot, maliyet, fiyat, nakit, günlük K/Z, toplam K/Z vb. alanlar diff preview'da; confidence düşük alanlar işaretli; save yalnız kullanıcı onayıyla.

### 3.8 Snapshot predecessor mantığı
Her hesap için S1..Sn zinciri; yeni snapshot yalnız aynı account/institution predecessor ile kıyaslanır. NEW/CHANGE/REMOVED ve quantity/value/cash delta doğru.

### 3.9 Cash delta ve K/Z ayrımı
Nakit artışı/azalışı otomatik olarak “kâr/zarar” sanma. İşlem/para yatırma/çekme bilgisi yoksa sadece delta göster; çıkarım etiketli ve güven seviyeli.

### 3.10 ENR/TP2 hassas kayıtları genel sisteme al
ENR/TP2 ayrı asset/account olabilir; hassas maskeleme korunur. Midas score/risk'e karışmama gibi kural kurum adıyla değil `includeInAggregate`/scope policy ile yönetilsin.

### 3.11 Portföy kart özelleştirme + swipe/reorder
Varlık kartları, görünür KPI seçimi, yön okları/swipe, favori, kurum/hesap filtreleri; state persistence.

### 3.12 Orders/Cash/Dividend/History tek Data Engine
Emir geçmişi, nakit hareketleri, temettü takvimi/hesaplayıcı ve snapshot history aynı normalized data kaynağına bağlansın; duplicate local state yok.

### 3.13 Faz 3 doğrulama fixtures
Midas, Enpara ENR+TP2, farklı banka/aracı kurum, kripto, bilinmeyen kaynak, kısmi ekran, boş/bozuk görsel, CSV/PDF/text. “1 lot bile” yanlış merge edilmeyecek şekilde deterministic fixture testleri.

---

# FAZ 4 — HABERLER / DURUM / FIRSATLAR / IPO / KRİPTO / RAPOR / RADAR / EDITOR
**13 ana madde — OpenCode'a 1 kez toplu verilecek.**

### 4.1 Haberler gerçek akış
Blank page onarıldıktan sonra category/asset filtre, refresh, connection state, empty state. API yoksa sahte haber yok. Haber kartı kaynak+tarih+sentiment+ilgili varlık.

### 4.2 Durum sayfası sadeleştirme
Tek hero + strateji + score + işlem planı + risk özeti. Tekrarlanan CORE/Score/Risk açıklamalarını collapsible detaylara taşı.

### 4.3 Fırsatlar tek komuta merkezi
Fırsat kartları çift başlık/tekrar yok; kategori, confidence, kaynak, tetikleyici, risk. Veri yetersizse karar üretme.

### 4.4 IPO komuta merkezi
Takvim, talep tarihleri, risk, nakit planı, status. Gerçek veri yoksa boş state. Halka arz nakdi ile hisse işlem nakdi ayrımı.

### 4.5 Kripto liste ve detay
Blank page düzelt; gerçek/verified fiyat kaynağı, favorites, chart, detail, editor. Fake quote yok.

### 4.6 Asset detail
Fiyat nowrap, chart önce, position/statistics/source bölümleri; favorite + alarm + news + editor bağları.

### 4.7 STKSZ Editor Copper/Gold redesign
Yeşil başlık/old theme kaldır. Mobile code editor, run/save/example/lint/chart attach; network/DOM sandbox güvenliği korunur.

### 4.8 Rapor Merkezi
Klasik raporlar, dönem/kategori, badges, export PNG/JPG/PDF; no-data safety; source/time metadata.

### 4.9 Radar Hub
Portfolio health, scenario, comparison, forecast, correlation, news impact, IPO score, smart alerts; 9 hub mantığını gerçek veriyle bağla.

### 4.10 Market Intelligence / Fear&Greed / Key Moments
Göstergeler verified inputs; neon renk yok; kaynak, timestamp, confidence. Veri yoksa gösterge uydurma.

### 4.11 Backtest/virtual wallet/paper trading
Gerçek emirden kesin ayrım; “SIMÜLASYON” net. Backtest input veri tarihi/source. Execution API yoksa broker action çalışmaz.

### 4.12 Biquote ve provider router gerçeğe göre
DOCX'teki Biquote endpointleri doğrulanmadan “çalışıyor” sayma. Provider router'da configured/verified/freshness/error. Ücretli/izinli servis credential yoksa disabled.

### 4.13 Faz 4 entegrasyon testi
News→asset, opportunity→asset, IPO→cash, crypto→editor, report→export, radar→AI context; navigation loops ve no-data states.

---

# FAZ 5 — STKSZ AI PORTFÖY + MARKET INTELLIGENCE (AUTHORITATIVE 88–116)
**12 ana madde — OpenCode'a 1 kez toplu verilecek.**

### 5.1 AI UI normal kullanıcıdan teknik config'i kaldır
“API Yönetimi”, backend URL, yedek anahtar normal AI sohbetinde görünmez. AI bağlantı hatası kullanıcıya kısa servis durumu; admin ayrıntısı ayrı.

### 5.2 AI portfolio import birleşimi (88–90)
Görsel/OCR, CSV/PDF/image, doğal dil aynı import service; sohbetten “portföyümü analiz et” komutu normalized snapshot üretir/önizler.

### 5.3 Portfolio Insights (91–94)
Yoğunlaşma, performans, risk, scheduled report; verified data only.

### 5.4 Pre-market briefing + Key Moments (95–98)
Piyasa öncesi briefing, önemli anlar, “neden hareket etti”, news matching; kaynak/timestamp/confidence zorunlu.

### 5.5 AI Research Center (99)
Varlık bazlı research workspace: thesis, catalysts, risks, financials, technical, news, sources.

### 5.6 AI + Radar / chart / news entegrasyonu (100–102)
AI çıktısı ayrı veri adası değil; Radar, chart ve news context'i aynı data engine üzerinden kullanır.

### 5.7 AI report notifications (103)
Kullanıcı tercihine bağlı; boş/önemsiz değişiklikte spam yok.

### 5.8 Privacy/security + financial safety (104–105)
Secret/PII minimi, user scope, no guarantee, deterministic risk boundary, safety phrase.

### 5.9 Free/Pro/Elite AI gates (106)
Feature entitlement merkezi; sahte premium unlock yok.

### 5.10 Admin AI/provider/task control (107–109)
Provider router, source reliability, task state, usage; normal kullanıcıdan gizli technical config.

### 5.11 Unified Intelligence Center + mobile AI UX (110–113)
Tek intelligence merkezi; Google/başka UI kopyalama yok; mevcut modules ile gerçek integration.

### 5.12 114–116 batch rule
88–114 bittikten sonra bir batch validation; sonra tek commit/push ve Android/iOS/Pages CI. Faz içinde küçük commit yağmuru yok.

---

# FAZ 6 — MULTI-AGENT FINANCIAL INTELLIGENCE / INVESTOR COPILOT (117–158)
**12 ana madde — OpenCode'a 2 kez verilecek: 6A ve 6B.**

## FAZ 6A
### 6.1 Orchestrator (117–118)
Tek request planı, agent routing, shared context, tool budget, cancellation, retry, provenance.

### 6.2 10 uzman agent (119–130)
Equity Research, Financial Analysis, Portfolio, Risk, Technical, News & Catalyst, Market Movement, Valuation, IPO, Macro & Market, Performance & Reporting kapsamlarını mevcut sayı/isim sözleşmesine göre normalize et; duplicate agent rolü olmasın.

### 6.3 3 ana investor agent (131–134)
Deep Dive, Cross Check, Source & Confidence; bağımsız kanıt ve çelişki çözümü.

### 6.4 Portfolio file import to agents (135–136)
Snapshot/import verisini Portfolio Command Center'a bağla; agent doğrudan OCR raw text'e değil normalized verified data'ya erişsin.

### 6.5 Investment Research Workspace (137)
Araştırma oturumu, symbol, source set, thesis history, notes, outputs.

### 6.6 Morning Intelligence (138)
Scheduled/pre-market data varsa üret; yoksa empty state; background spam yok.

## FAZ 6B
### 6.7 Key Moments / Why Moved / Deep Analysis (139–141)
Tek olay zaman çizgisi; price/news/volume/catalyst source linking.

### 6.8 Research History + What Changed (142–143)
Önceki analysis snapshot ile yeni analysis diff; model/provider değişikliği ayrıca belirtilir.

### 6.9 Excel/PDF Research Report (144)
Kaynak, tarih, score/confidence, data status; export no fake values.

### 6.10 User-specific memory + access tiers (145–147)
Yalnız user-scope preference/history; sensitive secrets yok. Free/Pro/Elite feature flags.

### 6.11 Provider router + cost + fallback + scenario/activity (148–153)
Provider/data source router, cost/usage, final intelligence output, scenario engine, agent activity view, error/fallback. Failure gizlenmez.

### 6.12 Safety + benchmark + one-command copilot + integration (154–158)
Financial safety; Claude/diğer finans ürünlerinden sadece konsept benchmark, UI copy yok; one-command full investor analysis; STKSZ Investor Copilot; existing modules integration.

---

# FAZ 7 — LEGAL / SECURITY / EXTERNAL INTEGRATIONS / FINAL VALIDATION & RELEASE (159–160)
**8 ana madde — OpenCode'a 1 kez toplu verilecek.**

### 7.1 Legal engine'i koru, UI regression düzelt
Privacy/Terms/Support/consent/retention/country policy/legal feature flags/release gate çalışmaya devam etmeli. Legal içerik global overlay olarak UI'ı bozmamalı.

### 7.2 Production config gerçeği
`GEMINI_API_KEY`, `ENV_GOOGLE_CLIENT_ID`, `ENV_APPLE_CLIENT_ID` kullanıcı credential gelene kadar external blocker. Koda fake değer yazma; normal dev build'i bozma.

### 7.3 Telegram/Payment/Broker future infrastructure audit
Gerçek token/provider/license yoksa yalnız disabled adapter. Eski DOCX'teki manuel token girişlerini normal UI'dan kaldır. Auto-trade default OFF; user auth+risk+kill switch zinciri korunur.

### 7.4 AdMob absence hard gate
Dependency, manifest, iOS Pod, source, lockfile, native config; aktif AdMob entegrasyonu 0. Privacy geçmiş/negative mention olabilir.

### 7.5 Final static validation (159)
HTML page nesting, duplicate IDs, undefined onclick, duplicate handlers, syntax, CSS overflow, secrets, legal placeholders, active neon theme tokens, stale hardcoded provider labels.

### 7.6 Final runtime validation (159)
Auth, guest/free/admin, 6 bottom-nav pages, menu, search+keyboard, portfolio import, snapshot, news/status/opportunity/crypto, asset detail, editor, AI disconnected state, reports/radar, legal.

### 7.7 Final Android/iOS bundle validation (160)
`www` → Capacitor sync/copy; APK içinde `assets/public/index.html/style.css/js` hash/marker güncel source ile aynı. iOS bundle strategy doğrula. Stale bundle yok.

### 7.8 Final release (160)
Tek final commit/push. Trigger olan Android/iOS/Pages workflow'larını exact SHA ile doğrula. Android artifact'tan yeni APK al ve P0 ekranlarını tekrar kontrol et. External credentials eksikse “CODE/UI COMPLETE — EXTERNAL CONFIG PENDING”; “production complete” deme.

---

# C. OPENCODE ÇALIŞMA SIRASI VE TESLİM KURALI

1. Önce `git status`, exact HEAD ve mevcut diff. Reset/revert yok.
2. Faz dışına taşma yok; bir fazın kök sorununu çözmeden sonraki faza geçme.
3. Her fazda önce kaynak kodu incele, sonra toplu değişiklik yap, sonra hedefli validation.
4. Faz 1 ve Faz 2 sonrası Android kaynak/runtime davranışı doğrulanmadan AI/feature geliştirmesine geçme.
5. Final hariç gereksiz GitHub push/CI döngüsü yok. Gerekirse local tests.
6. OpenCode raporunda yalnız: değişen dosyalar, yapılan maddeler, test sonucu, kalan gerçek blocker.
7. “Tamamlandı” sadece acceptance criteria geçtiyse kullanılabilir.

---

# D. SAYISAL PLAN

- **Toplam ana madde:** 84
- **Toplam faz:** 7
- **Faz dağılımı:** 12 + 14 + 13 + 13 + 12 + 12 + 8 = 84
- **OpenCode'a toplam aktarım:** 8 kez
  - Faz 1: 1
  - Faz 2: 1
  - Faz 3: 1
  - Faz 4: 1
  - Faz 5: 1
  - Faz 6: 2 (6A + 6B)
  - Faz 7: 1
- **Tahmini aktif çalışma:** OpenCode/model/CI kesintisi yoksa yaklaşık 8–14 saat agent çalışma süresi; pratikte 1 gün, altyapı/502/CI sorunları olursa 1–2 gün.

---

# E. İLK OPENCODE PAKETİ — FAZ 1

OpenCode'a önce sadece FAZ 1 verilecek. FAZ 1 acceptance geçmeden UI/AI/feature fazlarına ilerlenmeyecek. Bunun nedeni mevcut APK'nın ana navigasyon sayfalarının DOM nesting yüzünden fiilen görünmez olmasıdır; önce temel runtime yapısı düzeltilmeden üstüne feature eklemek yeni hataları gizler.
