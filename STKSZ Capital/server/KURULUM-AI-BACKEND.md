# STKSZ AI Backend — Kurulum (5 dakika, ücretsiz)

Gemini API anahtarı **asla uygulamaya gömülmez**. Bu sunucu anahtarı yalnız
kendi ortam değişkeninde tutar; uygulama sunucuya, sunucu Gemini'ye bağlanır.

```
STKSZ App  →  STKSZ AI Backend (bu klasör)  →  Google Gemini API
                    ↑ GEMINI_API_KEY yalnız burada (environment secret)
```

## 1) Anahtar al (ücretsiz)
https://aistudio.google.com/apikey → "Create API key". Kredi kartı istemez.
Anahtarı KİMSEYLE ve hiçbir sohbetle paylaşma; yalnız aşağıdaki panele gir.

## 2) Render.com'a yükle (önerilen, ücretsiz plan yeterli)
1. https://render.com → GitHub ile giriş → "New +" → "Web Service".
2. STKSZ deposunu seç (stksz-github-repo.zip'i yüklediğin repo).
3. Ayarlar:
   - Runtime: **Node**
   - Build Command: *(boş)*
   - Start Command: `node server/stksz-ai-server.js`
4. "Environment" sekmesi → **Add Environment Variable**:
   - Key: `GEMINI_API_KEY`  ·  Value: *(1. adımdaki anahtar)*
   (İstersen `GEMINI_MODEL` = `gemini-2.0-flash`)
5. Deploy → sana `https://stksz-ai-XXXX.onrender.com` gibi bir adres verir.

Railway/Fly.io da aynı mantıkla çalışır (start komutu + env secret).

## 3) Uygulamaya bağla
STKSZ → Menü → API YönETİMİ → 🤖 STKSZ AI → **AI Backend URL** alanına
Render adresini yapıştır → 🧪 TEST ET.

Test "Backend bağlı · model: gemini-2.0-flash · araçlar: 6" derse hazırsın.
Bu moddayken cihazda HİÇBİR AI anahtarı tutulmaz.

## Güvenlik garantileri (kodda uygulanmıştır)
- Anahtar yalnız `process.env.GEMINI_API_KEY`'den okunur; koda/git'e yazılmaz.
- Gemini'ye `x-goog-api-key` başlığıyla gider (URL'de asla — access log sızmaz).
- Tüm loglar ve yanıt gövdeleri `redactSecrets` süzgecinden geçer
  (anahtar değeri, `AIza...` deseni, `?key=` kalıntısı maskelenir).
- `/api/ai/health` anahtarın yalnız VAR/YOK bilgisini döner.
- AI hiçbir işlemi kendisi YAPAMAZ: yalnız 6 kontrollü fonksiyondan önerir
  (`getPortfolio`, `getPosition`, `getTransactionHistory` = salt-okunur;
  `createVirtualTransaction`, `updateCashBalance`, `updatePortfolio` =
  KULLANICI ONAYI zorunlu). Veritabanı erişimi yapısal olarak yoktur.
- AI'ya yalnız anahtarsız, doğrulanmış özet veri gönderilir.

## Uç noktalar
- `GET  /api/ai/health` → durum + araç listesi
- `POST /api/ai/ask`    → `{question, context?, history?, toolResults?}`
- `POST /api/ai/vision` → `{imageBase64, mimeType}` → yapılandırılmış işlem çıkarımı

## Senkron (iOS ↔ Android) — v101 ile aynı sunucuda
Bu sunucu artık cihazlar arası senkronu da taşır (ek kurulum gerekmez):
- `POST /api/sync/register` → hesap + eşleştirme kodu üretir
- `POST /api/sync/push` / `pull` → koleksiyon senkronu (Bearer userId.token)
- Veriler `SYNC_DATA_DIR` (varsayılan `server/data/`) altında kullanıcı başına
  JSON dosyası olarak tutulur. Render'da kalıcılık için bir "Disk" ekleyip
  mount yolunu `SYNC_DATA_DIR` env değişkeniyle gösterin (örn. /data).
- Token'lar SHA-256 hash ile saklanır; ENR ve API anahtarları istemci
  tarafından hiç gönderilmez.

Uygulamada: Menü → VERİ YÖNETİMİ → "CİHAZLAR ARASI SENKRON"
1) 1. cihazda "YENİ SENKRON HESABI OLUŞTUR" → eşleştirme kodunu not al.
2) 2. cihazda kodu "BU CİHAZI EŞLEŞTİR" alanına gir.
3) Senkron otomatik (3 dk'da bir + çevrimiçi olunca); "ŞİMDİ SENKRONLA" ile elle.
