# STKSZ Backend — Production Deployment (v108+)

Tek Node dosyası, sıfır npm bağımlılığı: `server/stksz-ai-server.js`
(AI proxy + cihaz senkronu + broker güvenlik kapısı aynı süreçte).

## Environment değişkenleri

| Değişken | Zorunlu | Varsayılan | Açıklama |
|---|---|---|---|
| `GEMINI_API_KEY` | ✅ (AI için) | — | YALNIZ burada yaşar. Koda/git'e/frontend'e asla yazılmaz. Panelden **secret** olarak girilir. |
| `PORT` | – | `8787` | Barındırıcı genelde otomatik verir. |
| `GEMINI_MODEL` | – | `gemini-2.0-flash` | Model adı. |
| `GEMINI_ENDPOINT` | – | `https://generativelanguage.googleapis.com` | YALNIZ test için override; **production'da dokunma**. |
| `SYNC_DATA_DIR` | önerilir | `server/data` | Senkron+audit deposu. Render'da kalıcı Disk mount yolu ver (örn. `/data`), yoksa restart'ta senkron hesapları silinir. |
| `BROKER_API_KEY` / `BROKER_API_SECRET` | – | boş | GELECEK içindir. Bugün girilse bile emir kapısı kapalıdır. |
| `BROKER_LIVE_ENABLED` | – | kapalı | **`true` YAPMA** — gerçek emir kapısı; resmî API + yasal doğrulama olmadan açılmaz. |

## Production kontrol listesi
1. Start command: `node server/stksz-ai-server.js`
2. `GEMINI_API_KEY` → environment secret (asla commit değil).
3. Kalıcı disk → `SYNC_DATA_DIR`.
4. Doğrulama: `GET /api/ai/health` → `{ok:true, keyConfigured:true}`;
   `GET /api/broker/status` → `liveEnabled:false` (güvenli).
5. Uygulamada: API Yönetimi → STKSZ AI → **AI Backend URL** = servis adresi.
   (Aynı URL senkron için de kullanılır; ayrı ayar gerekmez.)

## Dev ↔ Prod ayrımı
- Dev/test: `GEMINI_ENDPOINT` mock'a yönlendirilebilir (test dosyaları böyle çalışır).
- Prod: yalnız `GEMINI_API_KEY` + `SYNC_DATA_DIR` set edilir; endpoint default kalır.
- Loglar `redactSecrets` süzgecinden geçer; secret/token/hassas veri yazılmaz.

## Rollback
- Her sürüm git commit'idir (`git log`); release ZIP'i son stabil sürümdür.
- Sorunda: önceki commit'e dön → ZIP'i yeniden üret → backend'i önceki
  commit'ten redeploy et. Senkron verisi `SYNC_DATA_DIR`'de sürümden bağımsız korunur.
- İstemci tarafı: `stksz-build` meta değişince eski SW cache'leri otomatik silinir
  (reconcileBuildCache) — eski sürüme dönüşte de aynı mekanizma çalışır.
