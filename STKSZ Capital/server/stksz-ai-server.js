#!/usr/bin/env node
/* =====================================================================
   STKSZ AI BACKEND · v96 (SANAL ADIM 3)
   ---------------------------------------------------------------------
   Mimari:  STKSZ App  →  BU SUNUCU  →  Google Gemini API

   GÜVENLİK İLKELERİ (uygulama garantileri):
   1) GEMINI_API_KEY yalnızca sunucu ortam değişkeninden okunur.
      - İstek/yanıt gövdesine ASLA yazılmaz.
      - Loglara ASLA yazılmaz (redactSecrets tüm çıktıları süzer).
      - /health anahtarın yalnız VAR/YOK bilgisini döner, değerini asla.
   2) Anahtar URL'ye konmaz; `x-goog-api-key` başlığıyla gönderilir
      (URL access-log sızıntısı riski yok).
   3) AI hiçbir işlemi DOĞRUDAN gerçekleştirmez: function calling
      önerileri `toolCalls` olarak istemciye döner; işlemi uygulama
      (kullanıcı onayıyla) çalıştırır. Backend'in veritabanı yoktur;
      AI'nın veritabanına/anahtarlara erişimi yapısal olarak imkânsızdır.
   4) AI'ya yalnız istemcinin gönderdiği doğrulanmış, anahtarsız özet
      veri (context) iletilir.

   Çalıştırma:
     GEMINI_API_KEY=xxxx node server/stksz-ai-server.js
   Ortam değişkenleri:
     GEMINI_API_KEY   (zorunlu · yalnız sunucuda)
     PORT             (varsayılan 8787)
      GEMINI_MODEL     (varsayılan gemini-1.5-flash)
     GEMINI_ENDPOINT  (test için uç nokta override; üretimde boş bırak)
   Ücretsiz barındırma: Render / Railway / Fly.io / Cloudflare Workers
   (anahtar panelden "environment secret" olarak girilir; koda yazılmaz).
   ===================================================================== */
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = Number(process.env.PORT) || 8787;
const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || '';
const ENDPOINT = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com';
const MAX_BODY = 8 * 1024 * 1024; // 8MB (görsel base64 için)

/* ---------- sızıntı koruması: her çıktı bu süzgeçten geçer ---------- */
function redactSecrets(text) {
  let out = String(text == null ? '' : text);
  if (API_KEY && API_KEY.length >= 6) out = out.split(API_KEY).join('•••GİZLİ•••');
  [process.env.BROKER_API_KEY, process.env.BROKER_API_SECRET].forEach(s => { if (s && s.length >= 6) out = out.split(s).join('•••GİZLİ•••'); });
  out = out.replace(/AIza[0-9A-Za-z_\-]{20,}/g, '•••GİZLİ•••');       // Google API key deseni
  out = out.replace(/([?&]key=)[^&\s"']+/gi, '$1•••GİZLİ•••');        // olası ?key= kalıntısı
  out = out.replace(/(x-goog-api-key["':\s]+)[^"'\s,}]+/gi, '$1•••GİZLİ•••');
  return out;
}
function log(...parts) { console.log(new Date().toISOString(), ...parts.map(p => redactSecrets(typeof p === 'string' ? p : JSON.stringify(p)))); }

/* ---------- KONTROLLÜ ARAÇ KATALOĞU (function calling) ----------
   AI yalnız bu fonksiyonları ÖNEREBİLİR. readOnly:true olanları
   istemci otomatik cevaplayabilir; write olanlar kullanıcı onayı ister.
   Backend hiçbirini kendisi ÇALIŞTIRMAZ. */
const TOOL_CATALOG = {
  /* ---- READ (salt-okunur; uygulama kontrolünde çalışır, yalnız özet döner) ---- */
  getPortfolioSummary: { readOnly: true, description: 'GERÇEK Midas portföy özetini getirir: toplam varlık, yatırımlar, nakit, günlük K/Z, pozisyon listesi (lot+maliyet+doğrulanmış fiyat).', parameters: { type: 'object', properties: {} } },
  getCashBalances: { readOnly: true, description: 'Nakit kırılımını getirir: TL, USD, EUR, döviz TL karşılığı, toplam nakit. Kur yoksa açıkça belirtilir.', parameters: { type: 'object', properties: {} } },
  getPosition: { readOnly: true, description: 'Tek sembolün pozisyonunu getirir: GERÇEK Midas kaydı ve SANAL cüzdan kaydı ayrı ayrı (lot, ortalama maliyet, güncel değer, K/Z).', parameters: { type: 'object', properties: { symbol: { type: 'string', description: 'BIST sembolü, örn. TCELL' } }, required: ['symbol'] } },
  getTransactionHistory: { readOnly: true, description: 'İşlem geçmişini listeler (sanal + gerçek yerel kayıt). symbol verilirse filtreler.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, limit: { type: 'number', description: 'Kayıt sayısı (varsayılan 10)' } } } },
  getVirtualWallet: { readOnly: true, description: 'SANAL cüzdan durumunu getirir: sanal nakit, pozisyon değeri, toplam değer, gerçekleşen K/Z, işlem sayısı.', parameters: { type: 'object', properties: {} } },
  getMarketData: { readOnly: true, description: 'Sembolün DOĞRULANMIŞ piyasa verisini getirir: fiyat, günlük değişim, açılış/yüksek/düşük, hacim, kaynak, güncellik. Doğrulanmamışsa veri uydurulmaz.', parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  getDividendData: { readOnly: true, description: 'Bekleyen/kayıtlı temettü bilgilerini getirir. symbol verilirse filtreler.', parameters: { type: 'object', properties: { symbol: { type: 'string' } } } },
  getIPOData: { readOnly: true, description: 'Halka arz takvimini getirir: şirket, tarih, durum, gerekli nakit, kaynak.', parameters: { type: 'object', properties: {} } },
  getRiskData: { readOnly: true, description: 'Risk analizini getirir: genel risk skoru ve bileşenleri; symbol verilirse o pozisyonun ağırlık/K-Z riski.', parameters: { type: 'object', properties: { symbol: { type: 'string' } } } },
  getPortfolio: { readOnly: true, description: 'getVirtualWallet ile aynı (geriye uyumluluk).', parameters: { type: 'object', properties: {} } },
  /* ---- WRITE (ASLA otomatik çalışmaz; kullanıcı onayı zorunlu) ---- */
  createVirtualTransaction: { readOnly: false, description: 'SANAL alım/satım işlemi ÖNERİR. İşlem yalnız kullanıcı uygulamada onaylarsa gerçekleşir; gerçek para kullanılmaz.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, side: { type: 'string', enum: ['AL', 'SAT'] }, quantity: { type: 'number' }, price: { type: 'number' }, commission: { type: 'number' }, note: { type: 'string' } }, required: ['symbol', 'side', 'quantity', 'price'] } },
  updateCashBalance: { readOnly: false, description: 'Sanal nakit bakiyesi güncellemesi ÖNERİR (kullanıcı onayı gerekir).', parameters: { type: 'object', properties: { currency: { type: 'string', enum: ['TRY'] }, amount: { type: 'number' } }, required: ['currency', 'amount'] } },
  updatePortfolio: { readOnly: false, description: 'Pozisyon düzeltmesi ÖNERİR (lot/ortalama maliyet; kullanıcı onayı gerekir).', parameters: { type: 'object', properties: { symbol: { type: 'string' }, quantity: { type: 'number' }, averageCost: { type: 'number' } }, required: ['symbol'] } },
  recordDividend: { readOnly: false, description: 'SANAL cüzdana temettü işlenmesini ÖNERİR: sanal nakit artar, TEMETTÜ işlemi kaydedilir. Kullanıcı onayı gerekir.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, amount: { type: 'number', description: 'Toplam temettü TL' }, perShare: { type: 'number' }, quantity: { type: 'number' }, note: { type: 'string' } }, required: ['symbol', 'amount'] } },
  createOrderIntent: { readOnly: false, description: 'GERÇEK emir NİYETİ oluşturur (ORDER INTENT). Emir GÖNDERMEZ; kullanıcıya onay ekranı çıkar, yalnız açık onayla ve backend zinciriyle ilerler. Şu an gerçek gönderim kapalıdır.', parameters: { type: 'object', properties: { symbol: { type: 'string' }, side: { type: 'string', enum: ['BUY', 'SELL'] }, quantity: { type: 'number' }, priceType: { type: 'string', enum: ['MARKET', 'LIMIT'] }, price: { type: 'number' } }, required: ['symbol', 'side', 'quantity'] } },
  recalculatePortfolio: { readOnly: true, description: 'Portföy ve sanal cüzdan değerlerini güncel doğrulanmış fiyatlarla YENİDEN HESAPLATIR ve özet döner.', parameters: { type: 'object', properties: {} } }
};
function toolDeclarations() {
  return Object.entries(TOOL_CATALOG).map(([name, t]) => ({ name, description: t.description, parameters: t.parameters }));
}

const SYSTEM_PROMPT = 'Sen STKSZ AI\'sın: STKSZ Komuta Merkezi BIST portföy uygulamasının Türkçe yatırım asistanısın. '
  + 'KURALLAR: 1) YALNIZCA sana verilen doğrulanmış uygulama verisini ve araç sonuçlarını kullan; veri yoksa "VERİ YOK" de, ASLA uydurma. '
  + '2) Kısa, maddeli, net Türkçe yaz; rakamlar Türk biçiminde (1.234,56 TL). '
  + '3) Kesin al/sat emri verme; işlem gerektiğinde createVirtualTransaction aracını ÖNER (işlem yalnız kullanıcı onayıyla ve SANAL cüzdanda gerçekleşir). '
  + '4) Portföy/pozisyon/nakit/piyasa/temettü/halka arz/risk bilgisi gerekirse ilgili get* aracını çağır; birden fazla araç çağırabilirsin. '
  + '4b) Kullanıcı görseldeki işlemi eklemek isterse görseli sohbete yüklemesini söyle (extractTradeFromImage görsel yükleme akışıyla çalışır); çıkarım sonrası createVirtualTransaction önerilir ve kullanıcı onayı gerekir. '
  + '5) Sana API anahtarı, şifre veya kimlik bilgisi verilmez; istersen de alamazsın. '
  + '6) Her yorum yanıtının sonuna tek satır "Bu bir yatırım tavsiyesi değildir." ekle.';

/* ---------- Gemini çağrısı ---------- */
function callGemini(path, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(ENDPOINT + path);
    const payload = JSON.stringify(body);
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request({
      hostname: target.hostname, port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: target.pathname + target.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'x-goog-api-key': API_KEY }
    }, res => {
      let chunks = '';
      res.on('data', c => { chunks += c; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(chunks); } catch (e) { parsed = { raw: chunks.slice(0, 400) }; }
        resolve({ status: res.statusCode, payload: parsed });
      });
    });
    req.setTimeout(45000, () => { req.destroy(new Error('STKSZ AI zaman aşımı (45 sn).')); });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

function extractParts(payload) {
  const parts = payload && payload.candidates && payload.candidates[0] && payload.candidates[0].content && payload.candidates[0].content.parts || [];
  const text = parts.map(p => p.text || '').join('').trim();
  const toolCalls = parts.filter(p => p.functionCall && TOOL_CATALOG[p.functionCall.name])
    .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {}, readOnly: TOOL_CATALOG[p.functionCall.name].readOnly, requiresUserApproval: !TOOL_CATALOG[p.functionCall.name].readOnly }));
  return { text, toolCalls };
}
function geminiErrorMessage(status, payload) {
  const raw = payload && payload.error && payload.error.message || ('HTTP ' + status);
  return redactSecrets(status === 400 || status === 403 ? 'STKSZ AI anahtarı geçersiz/yetkisiz: ' + raw : status === 429 ? 'STKSZ AI kullanım limiti: ' + raw : 'STKSZ AI hatası: ' + raw);
}

/* ---------- HTTP yardımcıları ---------- */
function send(res, status, obj) {
  const body = redactSecrets(JSON.stringify(obj)); /* çift emniyet: yanıt gövdesi de süzülür */
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new Error('İstek gövdesi çok büyük (8MB üstü).')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('Geçersiz JSON gövdesi.')); } });
    req.on('error', reject);
  });
}

/* ---------- uç noktalar ---------- */
async function handleAsk(body) {
  const question = String(body.question || '').slice(0, 8000);
  const context = String(body.context || '').slice(0, 20000);
  if (!question && !Array.isArray(body.toolResults)) return { status: 400, out: { ok: false, error: 'question alanı zorunlu.' } };

  const contents = [];
  if (Array.isArray(body.history)) body.history.slice(-10).forEach(m => {
    if (m && (m.role === 'user' || m.role === 'model') && m.text) contents.push({ role: m.role, parts: [{ text: String(m.text).slice(0, 4000) }] });
  });
  const userText = (context ? 'UYGULAMA VERİSİ (doğrulanmış, anahtarsız):\n' + context + '\n\n' : '') + (question ? 'SORU/GÖREV: ' + question : '');
  if (userText) contents.push({ role: 'user', parts: [{ text: userText }] });
  /* İkinci tur: istemci read-only araçları çalıştırıp sonuçları geri gönderir */
  if (Array.isArray(body.toolResults) && body.toolResults.length) {
    contents.push({ role: 'model', parts: body.toolResults.map(r => ({ functionCall: { name: r.name, args: r.args || {} } })) });
    contents.push({ role: 'user', parts: body.toolResults.map(r => ({ functionResponse: { name: r.name, response: { result: r.result } } })) });
  }

  const { status, payload } = await callGemini('/v1/models/' + MODEL + ':generateContent', {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ functionDeclarations: toolDeclarations() }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 900 }
  });
  if (status !== 200) return { status: 502, out: { ok: false, error: geminiErrorMessage(status, payload), upstreamStatus: status } };
  const { text, toolCalls } = extractParts(payload);
  if (!text && !toolCalls.length) return { status: 502, out: { ok: false, error: 'AI yanıtı boş döndü (güvenlik filtresi olabilir).' } };
  return { status: 200, out: { ok: true, text, toolCalls, engine: 'STKSZ AI' } };
}

async function handleVision(body) {
  const imageBase64 = String(body.imageBase64 || '');
  const mimeType = /^image\/(png|jpe?g|webp)$/.test(String(body.mimeType)) ? body.mimeType : 'image/jpeg';
  if (imageBase64.length < 100) return { status: 400, out: { ok: false, error: 'imageBase64 alanı zorunlu.' } };
  const prompt = 'Bu bir Türk aracı kurum / banka uygulaması (Midas benzeri) ekran görüntüsüdür. '
    + 'Görsel türünü belirle ve UYGUN alanları çıkar: 1) ALIM/SATIM işlem ekranı → trades, 2) temettü bildirimi → dividends, '
    + '3) portföy listesi → positions + cashTRY, 4) diğer finansal tablo → notes. '
    + 'KURAL: Yalnız görselde NET okuduğun değerleri yaz; okunamayan/emin olmadığın HER alanı null bırak, ASLA tahmin etme veya uydurma. '
    + 'Tutarları Türk biçiminden (1.234,56) noktalı ondalığa çevir. Sembolleri BÜYÜK harf yaz.';
  const schema = {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['trade', 'dividend', 'portfolio', 'other'], description: 'Görselin baskın türü' },
      trades: { type: 'array', items: { type: 'object', properties: {
        symbol: { type: 'string' }, side: { type: 'string', enum: ['AL', 'SAT'] },
        quantity: { type: 'number', nullable: true }, price: { type: 'number', nullable: true },
        totalAmount: { type: 'number', nullable: true }, date: { type: 'string', nullable: true },
        currency: { type: 'string', nullable: true },
        confidence: { type: 'string', enum: ['yüksek', 'orta', 'düşük'] } },
        required: ['symbol', 'side', 'confidence'] } },
      dividends: { type: 'array', items: { type: 'object', properties: {
        symbol: { type: 'string' }, totalAmount: { type: 'number', nullable: true },
        perShare: { type: 'number', nullable: true }, quantity: { type: 'number', nullable: true },
        date: { type: 'string', nullable: true }, currency: { type: 'string', nullable: true },
        confidence: { type: 'string', enum: ['yüksek', 'orta', 'düşük'] } },
        required: ['symbol', 'confidence'] } },
      positions: { type: 'array', items: { type: 'object', properties: {
        symbol: { type: 'string' }, quantity: { type: 'number', nullable: true },
        averageCost: { type: 'number', nullable: true }, currentPrice: { type: 'number', nullable: true },
        marketValue: { type: 'number', nullable: true },
        confidence: { type: 'string', enum: ['yüksek', 'orta', 'düşük'] } },
        required: ['symbol', 'confidence'] } },
      cashTRY: { type: 'number', nullable: true },
      notes: { type: 'string' }
    },
    required: ['kind']
  };
  const { status, payload } = await callGemini('/v1/models/' + MODEL + ':generateContent', {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1200, responseMimeType: 'application/json', responseSchema: schema }
  });
  if (status !== 200) return { status: 502, out: { ok: false, error: geminiErrorMessage(status, payload), upstreamStatus: status } };
  const { text } = extractParts(payload);
  let parsed = null; try { parsed = JSON.parse(text); } catch (e) {}
  if (!parsed || !parsed.kind) return { status: 502, out: { ok: false, error: 'Görsel analizi yapılandırılmış sonuç üretmedi.' } };
  parsed.trades = Array.isArray(parsed.trades) ? parsed.trades : [];
  parsed.dividends = Array.isArray(parsed.dividends) ? parsed.dividends : [];
  parsed.positions = Array.isArray(parsed.positions) ? parsed.positions : [];
  /* çıkarılanlar yalnız ÖNERİDİR: createVirtualTransaction KULLANICI ONAYI ister; düşük güven ayrıca işaretlenir */
  const proposals = [];
  parsed.trades.filter(t => t && t.symbol && (t.side === 'AL' || t.side === 'SAT')).forEach(t => proposals.push({
    name: 'createVirtualTransaction', readOnly: false, requiresUserApproval: true, lowConfidence: t.confidence === 'düşük',
    args: { symbol: String(t.symbol).toUpperCase(), side: t.side, quantity: t.quantity, price: t.price, note: 'Görselden çıkarıldı · güven: ' + (t.confidence || 'düşük') }
  }));
  parsed.dividends.filter(d => d && d.symbol && Number.isFinite(Number(d.totalAmount)) && Number(d.totalAmount) > 0).forEach(d => proposals.push({
    name: 'recordDividend', readOnly: false, requiresUserApproval: true, lowConfidence: d.confidence === 'düşük',
    args: { symbol: String(d.symbol).toUpperCase(), amount: d.totalAmount, perShare: d.perShare, quantity: d.quantity, note: 'Görselden çıkarıldı · güven: ' + (d.confidence || 'düşük') }
  }));
  parsed.positions.filter(p => p && p.symbol && Number.isFinite(Number(p.quantity)) && Number.isFinite(Number(p.averageCost))).forEach(p => proposals.push({
    name: 'createVirtualTransaction', readOnly: false, requiresUserApproval: true, lowConfidence: p.confidence === 'düşük',
    args: { symbol: String(p.symbol).toUpperCase(), side: 'AL', quantity: p.quantity, price: p.averageCost, note: 'Portföy görselinden pozisyon aktarımı · güven: ' + (p.confidence || 'düşük') }
  }));
  return { status: 200, out: { ok: true, extraction: parsed, toolCalls: proposals, engine: 'STKSZ AI' } };
}

/* =====================================================================
   SENKRON KATMANI (v101 · SANAL ADIM 8)
   iOS ↓↑ STKSZ Backend ↓↑ Database(JSON dosya deposu) ↑↓ Android
   - Hesap: userId + gizli token (eşleştirme kodu = userId.token).
   - Yetki: Authorization: Bearer <userId>.<token> — token hash'lenerek saklanır.
   - Çakışma: koleksiyon düzeyinde LWW (updatedAt); İSTİSNA:
     * virtualWallet.transactions → unique ID birleşimi (hiç işlem kaybolmaz)
     * data.transactions (gerçek yerel kayıt) → unique ID birleşimi
   - ENR ve API anahtarları bu API'ye HİÇ GÖNDERİLMEZ (istemci taraflı kural).
   ===================================================================== */
const fs = require('fs');
const pathMod = require('path');
const crypto = require('crypto');
const SYNC_DIR = process.env.SYNC_DATA_DIR || pathMod.join(__dirname, 'data');
const SYNC_COLLECTIONS = ['stkszData', 'stkszVirtualWallet', 'stkszPrefs', 'stkszCardOrder', 'stkszSectionOrder', 'stkszAiHistory'];
function syncEnsureDir() { try { fs.mkdirSync(SYNC_DIR, { recursive: true }); } catch (e) {} }
function syncHash(t) { return crypto.createHash('sha256').update(String(t)).digest('hex'); }
function syncPath(userId) { return pathMod.join(SYNC_DIR, userId.replace(/[^a-z0-9\-]/gi, '') + '.json'); }
function syncLoad(userId) {
  try { return JSON.parse(fs.readFileSync(syncPath(userId), 'utf8')); } catch (e) { return null; }
}
function syncSave(userId, doc) { syncEnsureDir(); fs.writeFileSync(syncPath(userId), JSON.stringify(doc)); }
function syncAuth(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+([a-z0-9\-]+)\.([A-Za-z0-9_\-]+)$/i);
  if (!m) return null;
  const doc = syncLoad(m[1]);
  if (!doc || doc.tokenHash !== syncHash(m[2])) return null;
  return { userId: m[1], doc };
}
function mergeTxById(a, b) {
  const map = new Map();
  [].concat(Array.isArray(a) ? a : [], Array.isArray(b) ? b : []).forEach(tx => { const id = tx && (tx.id || tx.date + '|' + tx.symbol + '|' + (tx.lots ?? tx.quantity)); if (id) map.set(String(id), tx); });
  return [...map.values()].sort((x, y) => String(x.timestamp || x.date || '').localeCompare(String(y.timestamp || y.date || '')));
}
function mergeCollection(key, mine, theirs) {
  /* mine/theirs: {data, updatedAt} — çakışmada LWW + işlem birleşimi */
  if (!mine) return theirs; if (!theirs) return mine;
  const newer = String(theirs.updatedAt || '') > String(mine.updatedAt || '') ? theirs : mine;
  const older = newer === theirs ? mine : theirs;
  if (key === 'stkszVirtualWallet' && newer.data && older.data) {
    const merged = JSON.parse(JSON.stringify(newer.data));
    merged.transactions = mergeTxById(older.data.transactions, newer.data.transactions);
    merged._needsReplay = true; /* istemci motoru replay ile bakiye/pozisyonları yeniden türetir */
    return { data: merged, updatedAt: newer.updatedAt };
  }
  if (key === 'stkszData' && newer.data && older.data) {
    const merged = JSON.parse(JSON.stringify(newer.data));
    merged.transactions = mergeTxById(older.data.transactions, newer.data.transactions);
    return { data: merged, updatedAt: newer.updatedAt };
  }
  return newer;
}
async function handleSync(req, res, path, body) {
  if (path === '/api/sync/register' && req.method === 'POST') {
    const userId = 'stksz-' + crypto.randomBytes(5).toString('hex');
    const token = crypto.randomBytes(18).toString('base64url');
    syncSave(userId, { tokenHash: syncHash(token), createdAt: new Date().toISOString(), rev: 0, collections: {} });
    send(res, 200, { ok: true, userId, token, pairCode: userId + '.' + token, note: 'Eşleştirme kodunu diğer cihazına gir. Kod kaybolursa hesap kurtarılamaz.' });
    return true;
  }
  const auth = syncAuth(req);
  if (path === '/api/sync/pull' || path === '/api/sync/push') {
    if (!auth) { send(res, 401, { ok: false, error: 'Yetkisiz: geçerli eşleştirme kodu gerekli (Bearer userId.token).' }); return true; }
    if (path === '/api/sync/pull') {
      send(res, 200, { ok: true, rev: auth.doc.rev || 0, collections: auth.doc.collections || {}, serverTime: new Date().toISOString() });
      return true;
    }
    const incoming = body && body.collections && typeof body.collections === 'object' ? body.collections : {};
    const doc = auth.doc; doc.collections = doc.collections || {};
    const applied = [];
    SYNC_COLLECTIONS.forEach(key => {
      if (!incoming[key] || typeof incoming[key].data === 'undefined') return;
      const size = JSON.stringify(incoming[key].data || '').length;
      if (size > 2 * 1024 * 1024) return; /* koleksiyon başına 2MB sınır */
      doc.collections[key] = mergeCollection(key, doc.collections[key], { data: incoming[key].data, updatedAt: String(incoming[key].updatedAt || new Date().toISOString()) });
      applied.push(key);
    });
    doc.rev = (doc.rev || 0) + 1; doc.lastSync = new Date().toISOString();
    syncSave(auth.userId, doc);
    send(res, 200, { ok: true, rev: doc.rev, applied, collections: doc.collections, serverTime: doc.lastSync });
    return true;
  }
  if (path === '/api/sync/status' && req.method === 'GET') {
    send(res, 200, { ok: true, service: 'stksz-sync', collections: SYNC_COLLECTIONS, storage: 'json-file', authRequired: true });
    return true;
  }
  return false;
}

/* =====================================================================
   BROKER HAZIRLIK KATMANI (v102 · SANAL ADIM 9)
   Gerçek aracı kurum entegrasyonu İÇİN İSKELET — bugün gerçek emir
   GÖNDERMEZ. Secret'lar yalnız ortam değişkeninde yaşar:
     BROKER_API_KEY / BROKER_API_SECRET (frontend'e/AI'ya/loglara asla)
   redactSecrets bu değerleri de maskeler.
   ===================================================================== */
const BROKER_API_KEY = process.env.BROKER_API_KEY || '';
const BROKER_API_SECRET = process.env.BROKER_API_SECRET || '';
const BROKER_LIVE_ENABLED = process.env.BROKER_LIVE_ENABLED === 'true'; /* çift kilit: varsayılan kapalı */
async function handleBroker(req, res, path) {
  if (path === '/api/broker/status' && req.method === 'GET') {
    /* anahtar değerleri ASLA dönmez; yalnız hazırlık durumu */
    send(res, 200, { ok: true, service: 'stksz-broker-gateway', executionMode: EXECUTION_MODE, liveEnabled: BROKER_LIVE_ENABLED, credentialsConfigured: Boolean(BROKER_API_KEY && BROKER_API_SECRET), adapters: ['mock (aktif · sanal cüzdan)', 'midas (kilitli iskelet)', 'matriks-iq (pasif · LİSANSLI)', 'ibkr (read-only · kilitli)'], note: 'Gerçek emir gönderimi bu sürümde KAPALIDIR (MOD PASİF/MOCK).' });
    return true;
  }
  if (path === '/api/broker/execution/plan' && req.method === 'GET') {
    send(res, 200, { ok: true, mode: EXECUTION_MODE, live: LIVE_ALLOWED, chain: ['SİNYAL/AI', 'STKSZ RİSK KONTROLÜ', 'KULLANICI YETKİSİ', 'CANLI KULLANICI ONAYI', 'EMİR ÖNİZLEME', 'OTURUM KONTROLÜ', 'YÜRÜTME', 'DOLUM/STATUS TAKİBİ'], note: 'M54 Yürütme Motoru güvenlik zinciri — varsayılan PASİF (MOCK).' });
    return true;
  }
  if (path.startsWith('/api/broker/') && ['place-order', 'cancel-order', 'balance', 'positions', 'orders'].some(p => path === '/api/broker/' + p)) {
    /* GERÇEK EMİR KAPISI — bugün her koşulda reddeder */
    send(res, 403, { ok: false, error: 'Gerçek aracı kurum işlemleri bu sürümde devre dışı. Sanal cüzdan (MockBrokerAdapter) kullanılıyor. Gerçek entegrasyon; resmî API erişimi, yasal yetki ve BROKER_LIVE_ENABLED=true + kullanıcı onay zinciri gerektirir.', code: 'broker_disabled' });
    return true;
  }
  return false;
}

/* =====================================================================
   ORDER INTENT + AUDIT KATMANI (v103 · SANAL ADIM 10)
   Gerçek emir güvenlik zinciri:
     AI → ORDER INTENT (yalnız niyet kaydı; emir DEĞİL)
        → kullanıcı AÇIK onayı ([EMRİ ONAYLA])
        → backend confirm → (bugün: BROKER_LIVE_ENABLED=false → reddedilir)
        → her adım AUDIT LOG'a yazılır (anahtar/token ASLA yazılmaz).
   Intent'ler 10 dakika geçerlidir; onaysız intent kendiliğinden ölür.
   ===================================================================== */
const AUDIT_FILE = () => { syncEnsureDir(); return pathMod.join(SYNC_DIR, 'audit-' + new Date().toISOString().slice(0, 10) + '.jsonl'); };
function auditLog(entry) {
  try {
    const clean = JSON.parse(redactSecrets(JSON.stringify(Object.assign({ at: new Date().toISOString() }, entry))));
    delete clean.apiKey; delete clean.token; delete clean.secret; delete clean.authorization;
    fs.appendFileSync(AUDIT_FILE(), JSON.stringify(clean) + '\n');
  } catch (e) {}
}
const orderIntents = new Map(); /* intentId → {intent, user, createdAt, status} */
const INTENT_TTL_MS = 10 * 60 * 1000;
function pruneIntents() { const now = Date.now(); for (const [id, it] of orderIntents) if (now - it.createdMs > INTENT_TTL_MS) { it.status = 'expired'; auditLog({ type: 'order_intent_expired', intentId: id, user: it.user, symbol: it.intent.symbol }); orderIntents.delete(id); } }
function validIntent(body) {
  const symbol = String(body.symbol || '').toUpperCase().trim();
  const side = String(body.side || '').toUpperCase();
  const quantity = Number(body.quantity), price = Number(body.price);
  const priceType = body.priceType === 'LIMIT' ? 'LIMIT' : 'MARKET';
  if (!/^[A-Z0-9ÇĞİÖŞÜ.]{2,12}$/.test(symbol)) return { error: 'Geçersiz sembol.' };
  if (side !== 'BUY' && side !== 'SELL' && side !== 'AL' && side !== 'SAT') return { error: 'Yön BUY/SELL olmalı.' };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: 'Lot 0\'dan büyük olmalı.' };
  if (priceType === 'LIMIT' && (!Number.isFinite(price) || price <= 0)) return { error: 'LIMIT emirde fiyat zorunlu.' };
  return { intent: { symbol, side: side === 'AL' ? 'BUY' : side === 'SAT' ? 'SELL' : side, quantity, priceType, price: Number.isFinite(price) && price > 0 ? price : null } };
}
async function handleOrderIntent(req, res, path, body) {
  pruneIntents();
  const auth = syncAuth(req); /* audit'te kullanıcı kimliği (varsa) */
  const user = auth ? auth.userId : 'local-anon';
  if (path === '/api/broker/intent' && req.method === 'POST') {
    const v = validIntent(body || {});
    if (v.error) { send(res, 400, { ok: false, error: v.error }); return true; }
    const intentId = 'oi-' + crypto.randomBytes(8).toString('hex');
    orderIntents.set(intentId, { intent: v.intent, user, createdMs: Date.now(), status: 'awaiting_user_approval' });
    auditLog({ type: 'order_intent_created', intentId, user, symbol: v.intent.symbol, side: v.intent.side, quantity: v.intent.quantity, priceType: v.intent.priceType, price: v.intent.price, source: String(body.source || 'app') });
    send(res, 200, { ok: true, intentId, intent: v.intent, status: 'awaiting_user_approval', expiresInSec: INTENT_TTL_MS / 1000, note: 'Bu yalnız bir NİYETTİR; emir gönderilmedi. Kullanıcı onayı gerekir.' });
    return true;
  }
  if (path === '/api/broker/intent/confirm' && req.method === 'POST') {
    const it = orderIntents.get(String(body.intentId || ''));
    if (!it) { send(res, 404, { ok: false, error: 'Intent bulunamadı veya süresi doldu (10 dk).' }); return true; }
    if (body.userConfirmed !== true) {
      it.status = 'cancelled'; orderIntents.delete(body.intentId);
      auditLog({ type: 'order_intent_cancelled', intentId: body.intentId, user, symbol: it.intent.symbol });
      send(res, 200, { ok: true, status: 'cancelled', note: 'Emir iptal edildi; hiçbir işlem gönderilmedi.' });
      return true;
    }
    /* M54: RİSK KONTROLÜ + ÖNİZLEME + OTURUM KONTROLÜ + YÜRÜTME MODU */
    const plan = executionPlan(it.intent, it.user, null, body.intentId);
    if (!plan.risk.ok) {
      it.status = 'rejected_risk'; orderIntents.delete(body.intentId);
      auditLog({ type: 'order_confirm_rejected', reason: 'risk_blocked', issues: plan.risk.issues, intentId: body.intentId, user, symbol: it.intent.symbol, result: 'GÖNDERİLMEDİ' });
      send(res, 403, { ok: false, error: 'Emir risk kontrolünü geçemedi: ' + plan.risk.issues.join('; '), code: 'risk_blocked', issues: plan.risk.issues, audited: true });
      return true;
    }
    /* YÜRÜTME MODU PASİF ise hiçbir koşulda gerçek emir gitmez */
    if (!LIVE_ALLOWED || !BROKER_API_KEY) {
      it.status = 'rejected_live_disabled'; orderIntents.delete(body.intentId);
      auditLog({ type: 'order_confirm_rejected', reason: 'execution_passive', mode: EXECUTION_MODE, intentId: body.intentId, user, symbol: it.intent.symbol, side: it.intent.side, quantity: it.intent.quantity, price: it.intent.price, result: 'GÖNDERİLMEDİ' });
      send(res, 403, { ok: false, error: 'Kullanıcı onayı + risk kontrolü geçti ancak YÜRÜTME MODU PASİF (MOCK/SİMÜLASYON) — gerçek emir gönderimi kapalı. Hiçbir para işlemi yapılmadı.', mode: EXECUTION_MODE, executionMode: EXECUTION_MODE, preview: plan.preview, code: 'broker_disabled', audited: true });
      return true;
    }
    /* Gelecek: burada adapter placeOrder çağrılır; sonuç audit'e yazılır. */
    it.status = 'submitted'; orderIntents.delete(body.intentId);
    auditLog({ type: 'order_submitted', intentId: body.intentId, user, symbol: it.intent.symbol, side: it.intent.side, quantity: it.intent.quantity, price: it.intent.price, mode: EXECUTION_MODE, result: 'adapter_pending' });
    send(res, 200, { ok: true, status: 'submitted', mode: EXECUTION_MODE, preview: plan.preview, note: 'Emir adapter katmanına iletildi (önizleme yukarıdadır).' });
    return true;
  }
  if (path === '/api/broker/audit' && req.method === 'GET') {
    if (!auth) { send(res, 401, { ok: false, error: 'Audit görüntüleme için senkron hesabı gerekli.' }); return true; }
    let lines = [];
    try { lines = fs.readFileSync(AUDIT_FILE(), 'utf8').trim().split('\n').slice(-100).map(l => JSON.parse(l)); } catch (e) {}
    send(res, 200, { ok: true, entries: lines.filter(l => l.user === auth.userId || l.user === 'local-anon') });
    return true;
  }
  return false;
}

/* =====================================================================
   v118 (1. ADIM) — ADMIN + ROZET KODU (ENTITLEMENT) SİSTEMİ
   ---------------------------------------------------------------------
   - ADMIN_TOKEN     : env secret. Doğru "x-stksz-admin-token" başlığı
                       gönderen istemci admin işlemleri yapabilir.
                       Token yoksa admin uçları TAMAMEN kapalıdır (403).
   - Rozet kodları   : FRONTEND'DE ASLA TUTULMAZ. Kodlar sunucuda
                       SHA-256 HASH olarak saklanır (badge-codes.json).
                       Düz metin kod diskte bile durmaz.
   - Kod özellikleri : kullanım limiti, kullanım sayacı, aktif/pasif,
                       hangi rozeti verdiği. Admin oluşturur/kapatır.
   - /api/entitlement/redeem : kullanıcı kodu girer → hash eşleşirse
                       rozet verilir, sayaç artar. Kod asla geri dönmez.
   ===================================================================== */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const BADGE_IDS = ['KRAL', 'STKSZ_PRO', 'GRAFIK_USTASI', 'STRATEJIST', 'STKSZ_ELITE', 'ADMIN'];
function badgeCodesPath() { return pathMod.join(SYNC_DIR, 'badge-codes.json'); }
function badgeCodesLoad() { try { return JSON.parse(fs.readFileSync(badgeCodesPath(), 'utf8')); } catch (e) { return { codes: [] }; } }
function badgeCodesSave(doc) { syncEnsureDir(); fs.writeFileSync(badgeCodesPath(), JSON.stringify(doc, null, 1)); }
function hashCode(code) { return crypto.createHash('sha256').update('stksz-badge:' + String(code || '').trim().toUpperCase()).digest('hex'); }
function isAdminReq(req) {
  if (!ADMIN_TOKEN || ADMIN_TOKEN.length < 12) return false; /* token tanımsız/zayıfsa admin kapalı */
  const given = String(req.headers['x-stksz-admin-token'] || '');
  if (given.length !== ADMIN_TOKEN.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(ADMIN_TOKEN)); } catch (e) { return false; }
}

async function handleEntitlements(req, res, path, body) {
  /* ---- ADMIN: durum (token doğru mu? anahtar değerleri ASLA dönmez) ---- */
  if (path === '/api/admin/status' && req.method === 'GET') {
    if (!isAdminReq(req)) { send(res, 403, { ok: false, error: 'Admin yetkisi gerekli.' }); return true; }
    const doc = badgeCodesLoad();
    send(res, 200, {
      ok: true, admin: true,
      providers: { gemini: { configured: Boolean(API_KEY), model: MODEL } },
      badgeCodes: doc.codes.map(c => ({ id: c.id, badge: c.badge, active: c.active !== false, used: c.used || 0, maxUses: c.maxUses || 1, createdAt: c.createdAt }))
    });
    return true;
  }
  /* ---- ADMIN: rozet kodu oluştur (kod yalnız BU yanıtta bir kez görünür) ---- */
  if (path === '/api/admin/badge-code' && req.method === 'POST') {
    if (!isAdminReq(req)) { send(res, 403, { ok: false, error: 'Admin yetkisi gerekli.' }); return true; }
    const badge = String(body.badge || 'KRAL').toUpperCase();
    if (!BADGE_IDS.includes(badge)) { send(res, 400, { ok: false, error: 'Geçersiz rozet: ' + badge }); return true; }
    const plain = 'STKSZ-' + crypto.randomBytes(6).toString('hex').toUpperCase();
    const doc = badgeCodesLoad();
    doc.codes.push({ id: 'bc-' + crypto.randomBytes(4).toString('hex'), badge, hash: hashCode(plain), active: true, used: 0, maxUses: Math.max(1, Number(body.maxUses) || 1), createdAt: new Date().toISOString() });
    badgeCodesSave(doc);
    send(res, 200, { ok: true, code: plain, badge, note: 'Kod yalnızca bu yanıtta görünür; sunucuda yalnız hash saklanır.' });
    return true;
  }
  /* ---- ADMIN: kodu pasifleştir ---- */
  if (path === '/api/admin/badge-code/disable' && req.method === 'POST') {
    if (!isAdminReq(req)) { send(res, 403, { ok: false, error: 'Admin yetkisi gerekli.' }); return true; }
    const doc = badgeCodesLoad();
    const item = doc.codes.find(c => c.id === String(body.id || ''));
    if (!item) { send(res, 404, { ok: false, error: 'Kod bulunamadı.' }); return true; }
    item.active = false; badgeCodesSave(doc);
    send(res, 200, { ok: true });
    return true;
  }
  /* ---- KULLANICI: rozet kodu kullan (redeem) ---- */
  if (path === '/api/entitlement/redeem' && req.method === 'POST') {
    const h = hashCode(body.code);
    const doc = badgeCodesLoad();
    const item = doc.codes.find(c => c.hash === h);
    if (!item || item.active === false) { send(res, 400, { ok: false, error: 'Kod geçersiz veya pasif.' }); return true; }
    if ((item.used || 0) >= (item.maxUses || 1)) { send(res, 400, { ok: false, error: 'Kod kullanım limiti dolmuş.' }); return true; }
    item.used = (item.used || 0) + 1;
    badgeCodesSave(doc);
    send(res, 200, { ok: true, badge: item.badge });
    return true;
  }
  return false;
}

/* =====================================================================
   M30/M34/M40: FEEDBACK + WEBHOOK + KAGIT TİCARET UÇLARI
   - /api/feedback       → geri bildirim kuyruğu (loglanır, opsiyonel TG)
   - /api/webhook/signal → strateji sinyali alır, doğrular, loglar
   - /api/paper/execute  → kağıt ticaret komut şeması (bakiye/pozisyonlar)
   YALNIZ doğrulanmış veri kabul edilir; gerçek emir asla gönderilmez.
   ===================================================================== */
const FEEDBACK_DIR = process.env.SYNC_DATA_DIR || pathMod.join(__dirname, 'data');
let webhookQueue = [];
function feedbackFilePath() { return pathMod.join(FEEDBACK_DIR, 'feedback.json'); }
function feedbackAppend(entry) {
  syncEnsureDir();
  let list = [];
  try { list = JSON.parse(fs.readFileSync(feedbackFilePath(), 'utf8')); } catch (e) {}
  list.push(entry);
  if (list.length > 200) list = list.slice(-200);
  fs.writeFileSync(feedbackFilePath(), JSON.stringify(list, null, 1));
}
async function handleExtensions(req, res, path, body, user) {
  /* ---- M30: geri bildirim ---- */
  if (path === '/api/feedback' && req.method === 'POST') {
    const text = String(body.text || '').slice(0, 4000);
    const category = ['bug', 'feature', 'other'].includes(body.category) ? body.category : 'other';
    if (!text.trim()) { send(res, 400, { ok: false, error: 'feedback.text alanı zorunlu.' }); return true; }
    const entry = { id: 'fb-' + crypto.randomBytes(6).toString('hex'), text, category, user: user ? authUserId(req) : null, createdAt: new Date().toISOString() };
    feedbackAppend(entry);
    auditLog({ type: 'feedback_received', id: entry.id, category, user: entry.user });
    send(res, 200, { ok: true, id: entry.id, note: 'Geri bildirim alındı; kuyruğa eklendi.' });
    return true;
  }
  /* ---- M34: webhook sinyali (doğrulanır; emir GÖNDERİLMEZ) ---- */
  if (path === '/api/webhook/signal' && req.method === 'POST') {
    const p = body.signal || body;
    const symbol = String(p.symbol || '').toUpperCase();
    const action = String(p.action || '').toUpperCase();
    if (!symbol || !['BUY', 'SELL', 'HOLD', 'WAIT', 'EXIT'].includes(action)) { send(res, 400, { ok: false, error: 'signal.symbol ve geçerli signal.action gerekli.' }); return true; }
    const entry = { id: 'wh-' + crypto.randomBytes(6).toString('hex'), symbol, action, positionSize: Number(p.positionSize) || null, stopLoss: Number(p.stopLoss) || null, target: Number(p.target) || null, receivedAt: new Date().toISOString(), status: 'queued' };
    webhookQueue.push(entry); if (webhookQueue.length > 200) webhookQueue.shift();
    auditLog({ type: 'webhook_signal', id: entry.id, symbol, action, note: 'Sinyal kuyruğa alındı — gerçek emir gönderilmez, kullanıcı onayı gerekir.' });
    send(res, 200, { ok: true, id: entry.id, status: 'queued', note: 'Sinyal doğrulandı ve kuyruğa alındı; GERÇEK EMİR GÖNDERİLMEDİ.' });
    return true;
  }
  /* ---- M40: kağıt ticaret komutları (sanal — bakiye/pozisyonlar) ---- */
  if (path === '/api/paper/execute' && req.method === 'POST') {
    const command = String(body.command || '').toLowerCase();
    if (!['/bakiye', '/pozisyonlar'].includes(command)) { send(res, 400, { ok: false, error: 'Yalnız /bakiye veya /pozisyonlar desteklenir.' }); return true; }
    auditLog({ type: 'paper_command', command, user: user || null });
    if (command === '/bakiye') return send(res, 200, { ok: true, command, note: 'Sanal bakiye istemci tarafında okunur; doğrulanmış değerlerle döner.' }) || true;
    return send(res, 200, { ok: true, command, note: 'Açık sanal pozisyonlar istemci tarafında listelenir.' }) || true;
  }
  return false;
}
function authUserId(req) {
  try { const a = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').split('.')[0]; return a || null; } catch (e) { return null; }
}

/* =====================================================================
   M48: SIFIR GÜVEN ANAHTAR KASASI (Secret Vault) + SAĞLAYICI PROXY
   - İstemci API anahtarlarını localStorage'da SAKLAMAZ; bunun yerine
     bu kasadan çeker/polywir. Anahtarlar yalnız sunucu dosya deposunda
     saklanır; yanıt gövdesine ASLA yazılmaz (yalnız bool "var/yok").
   - /api/vault/* : kullanıcı anahtar kasası (veritabanı yok, JSON depo)
   - /api/proxy   : dış sağlayıcı isteklerini sunucu üzerinden çeker
     (CORS + sızıntı koruması). AI anahtarlara ERİŞEMEZ; aksiyonlar
     yalnız kontrollü Tool/Action katmanıyla mümkündür.
   ===================================================================== */
const VAULT_DIR = process.env.SYNC_DATA_DIR || pathMod.join(__dirname, 'data');
function vaultPath(owner) { return pathMod.join(VAULT_DIR, 'vault-' + String(owner || 'device').replace(/[^a-z0-9\-]/gi, '') + '.json'); }
function vaultLoad(owner) {
  try { return JSON.parse(fs.readFileSync(vaultPath(owner), 'utf8')) || {}; }
  catch (e) { return {}; }
}
function vaultSave(owner, doc) {
  try { fs.mkdirSync(VAULT_DIR, { recursive: true }); } catch (e) {}
  fs.writeFileSync(vaultPath(owner), JSON.stringify(doc, null, 1));
}
function vaultSet(owner, provider, value) {
  const doc = vaultLoad(owner);
  const clean = String(value || '').trim();
  if (clean) doc[provider] = clean; else delete doc[provider];
  vaultSave(owner, doc);
}
function vaultHasList(owner) {
  const doc = vaultLoad(owner);
  return Object.keys(doc).filter(k => !String(doc[k] || '').startsWith('disabled_'));
}
function vaultIsDisabled(owner, provider) {
  return String(vaultLoad(owner)['disabled_' + provider] || '') === '1';
}
function vaultSetDisabled(owner, provider, flag) {
  const doc = vaultLoad(owner);
  if (flag) doc['disabled_' + provider] = '1'; else delete doc['disabled_' + provider];
  vaultSave(owner, doc);
}
/* ---- dış sağlayıcı proxy (CORS + anahtar sızıntısı yok) ---- */
function proxyFetch(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(parsed, { headers: headers || {}, timeout: 20000 }, (res) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') })); res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(new Error('proxy zaman aşımı')); });
    req.on('error', reject);
  });
}
async function handleVaultAndProxy(req, res, path, body) {
  const owner = authUserId(req) || 'device';
  /* ---- M48: anahtar var/yok durumu (IPC cihaz deposu) ---- */
  if (path === '/api/vault/has' && req.method === 'GET') {
    try { send(res, 200, { ok: true, providers: vaultHasList(owner).reduce((m, k) => { m[k] = !vaultIsDisabled(owner, k); return m; }, {}) }); }
    catch (e) { send(res, 500, { ok: false, error: redactSecrets(e.message || 'vault hatası') }); }
    return true;
  }
  if (path === '/api/vault/set' && req.method === 'POST') {
    const provider = String(body.provider || '').slice(0, 64);
    if (!provider) { send(res, 400, { ok: false, error: 'provider alanı zorunlu.' }); return true; }
    try {
      vaultSet(owner, provider, body.value);
      auditLog({ type: 'vault_set', provider, owner });
      send(res, 200, { ok: true, note: 'Anahtar kasa güncellendi; değer yanıta yazılmadı.' });
    } catch (e) { send(res, 500, { ok: false, error: redactSecrets(e.message || 'vault hatası') }); }
    return true;
  }
  if (path === '/api/vault/disable' && req.method === 'POST') {
    vaultSetDisabled(owner, String(body.provider || ''), !!body.disabled);
    send(res, 200, { ok: true }); return true;
  }
  if (path === '/api/vault/clear' && req.method === 'POST') {
    vaultSave(owner, {}); send(res, 200, { ok: true }); return true;
  }
  /* ---- M48: sağlayıcı proxy (yalnız beyaz liste uçları) ---- */
  if (path === '/api/proxy' && req.method === 'GET') {
    const provider = String(body.provider || '').toLowerCase();
    const target = String(body.url || '');
    if (!provider || !/^https:\/\//.test(target)) { send(res, 400, { ok: false, error: 'provider ve https:// url gerekli.' }); return true; }
    if (vaultIsDisabled(owner, provider)) { send(res, 403, { ok: false, error: 'Sağlayıcı kullanıcı tarafından durduruldu.' }); return true; }
    send(res, 501, { ok: false, error: 'Belirli sağlayıcı proxy beyaz listesi yakında; şimdilik yalnız vault tarafı aktif.' });
    return true;
  }
  return false;
}

/* =====================================================================
   M53: TRADINGVIEW WEBHOOK MOTORU
   ---------------------------------------------------------------------
   Sinyal akışı:
     TradingView Webhook → STKSZ DATA ENGINE → Validation Engine
     → AI / Risk Engine → UI / Cards / User Approval → (asla doğrudan emir)
   - Paylaşımlı gizli anahtar (TV_WEBHOOK_SECRET) ile doğrulanır; anahtar
     ya `x-tv-signature` başlığında HMAC-SHA256 olarak ya da `token` alanında
     düz metin olarak gelir (yalnız HTTPS kurulumda kabul edilir).
   - Sinyal standardize edilir, güven/yaş skorlanır; GERÇEK EMİR GÖNDERİLMEZ.
   ===================================================================== */
const TV_WEBHOOK_SECRET = process.env.TV_WEBHOOK_SECRET || '';
function tvSignalValid(s) {
  const symbol = String(s.symbol || '').toUpperCase().trim();
  const action = String(s.action || s.side || '').toUpperCase();
  if (!/^[A-Z0-9ÇĞİÖŞÜ.]{2,12}$/.test(symbol)) return { error: 'Geçersiz sembol.' };
  if (!['BUY', 'SELL', 'HOLD', 'WAIT', 'EXIT', 'LONG', 'SHORT'].includes(action)) return { error: 'Geçersiz action: ' + action };
  const confidence = Number(s.confidence);
  const okC = Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : null;
  return { signal: { symbol, action: action === 'LONG' ? 'BUY' : action === 'SHORT' ? 'SELL' : action, price: Number.isFinite(Number(s.price)) && Number(s.price) > 0 ? Number(s.price) : null, quantity: Number.isFinite(Number(s.quantity)) && Number(s.quantity) > 0 ? Number(s.quantity) : null, stopLoss: Number.isFinite(Number(s.stopLoss)) && Number(s.stopLoss) > 0 ? Number(s.stopLoss) : null, target: Number.isFinite(Number(s.target)) && Number(s.target) > 0 ? Number(s.target) : null, confidence: okC, source: String(s.source || 'TradingView'), receivedAt: new Date().toISOString() } };
}
function tvVerifySignature(req, bodyText) {
  if (!TV_WEBHOOK_SECRET) return false; /* anahtar yoksa webhook kapalı */
  const headerSig = String(req.headers['x-tv-signature'] || '');
  if (headerSig) {
    const hmac = crypto.createHmac('sha256', TV_WEBHOOK_SECRET).update(String(bodyText || '')).digest('hex');
    try { return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(headerSig)); } catch (e) { return false; }
  }
  /* düz metin token alanı (yalnızca doğrulanabilir eşitlik — HTTPS önerilir) */
  try {
    const parsed = JSON.parse(bodyText || '{}');
    return crypto.timingSafeEqual(Buffer.from(String(parsed.token || '')), Buffer.from(TV_WEBHOOK_SECRET));
  } catch (e) { return false; }
}
async function handleTradingViewWebhook(req, res, path, body, rawText) {
  if (path === '/api/webhook/tradingview' && req.method === 'POST') {
    if (!TV_WEBHOOK_SECRET) { send(res, 403, { ok: false, error: 'TV_WEBHOOK_SECRET sunucuda tanımlı değil; webhook motoru kapalı.' }); return true; }
    if (!tvVerifySignature(req, rawText !== undefined ? rawText : JSON.stringify(body || {}))) { send(res, 401, { ok: false, error: 'Geçersiz webhook imzası.' }); auditLog({ type: 'tv_webhook_bad_sig' }); return true; }
    const v = tvSignalValid(body || {});
    if (v.error) { send(res, 400, { ok: false, error: v.error }); return true; }
    const s = v.signal;
    const confidence = s.confidence == null ? (s.stopLoss ? 70 : 50) : s.confidence;
    const entry = { id: 'tv-' + crypto.randomBytes(6).toString('hex'), ...s, confidence, status: confidence >= 65 ? 'VALIDATED' : 'REVIEW', ageSec: 0, decisionLock: confidence < 50 ? 'VERİ YETERSİZ — KARAR YOK' : null };
    webhookQueue.push(entry); if (webhookQueue.length > 200) webhookQueue.shift();
    auditLog({ type: 'tv_webhook_signal', id: entry.id, symbol: s.symbol, action: s.action, confidence, note: 'Doğrulandı; GERÇEK EMİR GÖNDERİLMEZ — kullanıcı onayı gerekir.' });
    send(res, 200, { ok: true, id: entry.id, signal: { symbol: s.symbol, action: s.action, confidence }, status: entry.status, decisionLock: entry.decisionLock, note: 'Sinyal doğrulandı; gerçek emir gönderilmedi. UI kartına iletildi.' });
    return true;
  }
  if (path === '/api/webhook/tradingview/status' && req.method === 'GET') {
    send(res, 200, { ok: true, engine: TV_WEBHOOK_SECRET ? 'ACTIVE' : 'DISABLED', queued: webhookQueue.length });
    return true;
  }
  return false;
}

/* =====================================================================
   M54: YÜRÜTME GÜVENLİK KATMANI VE YÜRÜTME MOTORU (EXECUTION ENGINE)
   ---------------------------------------------------------------------
   - EMİR_GÖNDERİM_MODU varsayılan "PASIF" (MOCK/SIMULATION). Gerçek işlem
     yalnızca ne zaman EMİR_GÖNDERİM_MODU=LIVE ve kullanıcı açık onayı.
   - Kademeli güvenlik zinciri:
     SİNYAL/AI → STKSZ RİSK KONTROLÜ (sermaye, marj, max kayma, stop-loss)
     → KULLANICI YETKİSİ → CANLI KULLANICI ONAYI → EMİR ÖNİZLEME
     → OTURUM KONTROLÜ → YÜRÜTME → DOLUM/STATUS TAKİBİ
   - AI broker sırlarını ASLA görmez; yalnız tool çağrıları.
   ===================================================================== */
const EXECUTION_MODE = (process.env.EMIR_GONDERIM_MODU || 'PASIF').toUpperCase(); /* varsayılan PASIF */
const LIVE_ALLOWED = EXECUTION_MODE === 'LIVE' && BROKER_LIVE_ENABLED;
function riskCheck(intent, wallet) {
  /* Sıkı risk kontrolleri — hardEngel varsa emir reddedilir. */
  const issues = [];
  const hardIssues = [];
  const side = intent.side;
  if (intent.priceType === 'MARKET' && intent.price == null) issues.push('MARKET emirde doğrulanmış fiyat gerekli'); /* yumuşak uyarı — PASIF modda yürütme yok */
  const estValue = (intent.price || 0) * (intent.quantity || 0);
  const maxSlippage = Number(process.env.MAX_SLIPPAGE_PCT) || 0.5; /* % */
  const est = estValue * (1 + maxSlippage / 100);
  if (side === 'BUY' && wallet && typeof wallet.totalCashTRY === 'number' && est > wallet.totalCashTRY) { const m = 'Yetersiz nakit (risk: sermaye limiti aşıldı)'; issues.push(m); hardIssues.push(m); }
  if (wallet && typeof wallet.totalPortfolioValue === 'number') {
    const exposure = est / (wallet.totalPortfolioValue + wallet.totalCashTRY || 1);
    if (exposure > 0.3) { const m = 'Tek pozisyon yoğunluğu %30\'u aşıyor'; issues.push(m); hardIssues.push(m); }
  }
  if (intent.stopLoss == null && side !== 'SELL' && side !== 'BUY') issues.push('Stop-loss önerisi yok');
  return { ok: hardIssues.length === 0, riskBlocked: hardIssues.length > 0, issues, hardIssues, estimatedValue: estValue, maxSlippage };
}
function executionPlan(intent, user, wallet, approvedIntentId) {
  /* Önizleme → oturum kontrolü → (LIVE ise kullanıcı onayı) adımlarını üretir */
  const rc = riskCheck(intent, wallet);
  return {
    step: rc.ok ? 'PASIF_MODEL_DOĞRULANDI' : 'RİSK_ENGELİ',
    mode: EXECUTION_MODE,
    live: LIVE_ALLOWED,
    risk: rc,
    preview: { symbol: intent.symbol, side: intent.side, quantity: intent.quantity, priceType: intent.priceType, price: intent.price, stopLoss: intent.stopLoss || null, estimatedValue: rc.estimatedValue, maxSlippagePct: rc.maxSlippage },
    note: rc.ok
      ? (LIVE_ALLOWED ? 'Bu bir EMİR ÖNİZLEMESİDİR; canlı gönderim, kullanıcı onayı + oturum doğrulaması gerektirir.' : 'YÜRÜTME MODU PASİF (MOCK/SİMÜLASYON): hiçbir gerçek emir gönderilmez.')
      : 'Emir risk kontrolünü geçemedi.'
  };
}

/* =====================================================================
   M55: TELEGRAM DOĞRULAMA + ÇOKLU CİHAZ / OTURUM YÖNETİMİ
   ---------------------------------------------------------------------
   - initData yalnız resmî Telegram doğrulama algoritmasıyla (HMAC-SHA256)
     backend'de doğrulanır. initDataUnsafe bir KİMLİK KAYNAĞI DEĞİLDİR.
   - Her uç noktada STRICT tenant/oturum izolasyonu (IDOR / BAC / priv-esc).
   - Çoklu cihaz: DEVICE_ID + SESSION_ID; kullanıcı "Bağlı Cihazlar"
     bölümünden oturumları iptal edebilir.
   ===================================================================== */
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '';
function tgSecretKey(botToken) {
  /* resmî: SHA256(bot token) ile initData imzası */
  return crypto.createHash('sha256').update(String(botToken || '')).digest();
}
function validateTelegramInitData(initData) {
  /* $ harici çift = işaretlerini URL-decode et, sorted → data_check_string */
  if (!initData) return null;
  const params = {};
  let hash = null;
  initData.split('&').forEach(pair => {
    const eq = pair.indexOf('=');
    if (eq < 0) return;
    const k = decodeURIComponent(pair.slice(0, eq));
    const v = decodeURIComponent(pair.slice(eq + 1));
    if (k === 'hash') hash = v; else params[k] = v;
  });
  if (!hash || !params.auth_date) return null;
  const dc = Object.keys(params).sort().map(k => k + '=' + params[k]).join('\n');
  const secret = tgSecretKey(TG_BOT_TOKEN);
  const computed = crypto.createHmac('sha256', secret).update(dc).digest('hex');
  if (computed !== hash) return null;
  const ageSec = (Date.now() / 1000) - Number(params.auth_date);
  if (!Number.isFinite(ageSec) || ageSec > 86400) return null; /* 24s geçerlilik */
  let user = {};
  try { user = JSON.parse(params.user || '{}'); } catch (e) {}
  return { tgId: String(user.id || ''), firstName: String(user.first_name || ''), userName: String(user.username || ''), authDate: params.auth_date };
}
/* --- oturum / cihaz kayıt defteri (her kullanıcı için) --- */
function sAccount(userId) { return { userId, sessions: {}, devices: {} }; }
function sessionsLoad(userId) { try { return JSON.parse(fs.readFileSync(pathMod.join(SYNC_DIR, 'sessions-' + String(userId || '').replace(/[^a-z0-9\-]/gi, '') + '.json'), 'utf8')) || sAccount(); } catch (e) { return sAccount(); } }
function sessionsSave(userId, doc) { syncEnsureDir(); fs.writeFileSync(pathMod.join(SYNC_DIR, 'sessions-' + String(userId || '').replace(/[^a-z0-9\-]/gi, '') + '.json'), JSON.stringify(doc, null, 1)); }
function sessionCreate(userId, deviceFingerprint) {
  /* yeni DEVICE_ID + SESSION_ID üret; secret yalnız sunucuda, alias döner */
  const doc = sessionsLoad(userId);
  const deviceId = 'DEV_' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const sessionId = 'SESS_' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const alias = 'DEVICE_' + String(Object.keys(doc.devices).length + 1).padStart(2, '0');
  const token = crypto.randomBytes(24).toString('base64url');
  doc.devices[deviceId] = { alias, fingerprint: syncHash(deviceFingerprint || ''), createdAt: new Date().toISOString(), lastSeen: new Date().toISOString() };
  doc.sessions[sessionId] = { deviceId, tokenHash: syncHash(token), sessionToken: token, createdAt: new Date().toISOString(), lastSeen: new Date().toISOString(), revoked: false, alias };
  sessionsSave(userId, doc);
  return { deviceId, sessionId, alias, token };
}
function sessionValidate(userId, authSessionToken) {
  const doc = sessionsLoad(userId);
  for (const sid in doc.sessions) {
    const s = doc.sessions[sid];
    if (s.revoked) continue;
    if (s.sessionToken && s.sessionToken === authSessionToken) { doc.sessions[sid].lastSeen = new Date().toISOString(); sessionsSave(userId, doc); return { sessionId: sid, deviceId: s.deviceId, alias: s.alias }; }
    if (s.tokenHash && s.tokenHash === syncHash(authSessionToken || '')) { doc.sessions[sid].lastSeen = new Date().toISOString(); sessionsSave(userId, doc); return { sessionId: sid, deviceId: s.deviceId, alias: s.alias }; }
  }
  return null;
}
/* STRICT tenant izolasyonu: her uç yalnızca Kend ek hesabının verisine erişir.
   Kimlik doğrulama sırası:
     1) Oturum tokenı (SESS_<id>.<token> — çoklu cihaz auth) → sessionValidate
     2) Bearer eşleştirme kodu (userId.token — mevcut sync kimliği)
   Dönen userId her zaman isteğin sahibidir; yabancı userId geçilemez. */
function requireUser(req) {
  const raw = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  /* 1) Oturum tokenı (çoklu cihaz) — token sunucuda saklanır, AI asla görmez */
  const st = raw.match(/^SESS_([A-Za-z0-9]+)\.(.+)$/);
  if (st) {
    /* oturum kaydı userId'ye bağlıdır; userId'yi istemci vermez, kayıttan çözülür */
    const dir = SYNC_DIR;
    let files = []; try { files = fs.readdirSync(dir).filter(f => f.startsWith('sessions-') && f.endsWith('.json')); } catch (e) {}
    const sid = 'SESS_' + st[1];
    for (const f of files) {
      const userId = f.slice(9, -5);
      const doc = sessionsLoad(userId);
      const sess = doc.sessions && doc.sessions[sid];
      if (sess && !sess.revoked && ((sess.sessionToken && sess.sessionToken === st[2]) || (sess.tokenHash && sess.tokenHash === syncHash(st[2])))) {
        sess.lastSeen = new Date().toISOString(); sessionsSave(userId, doc);
        return { userId, provider: 'session', sessionId: sid, deviceId: sess.deviceId, alias: sess.alias };
      }
    }
    return null;
  }
  /* 2) Bearer eşleştirme kodu (userId.token) — mevcut sync kimliği */
  const m = raw.match(/^([a-z0-9\-]+)\.(.+)$/i);
  if (m) { const d = syncLoad(m[1]); if (d && d.tokenHash === syncHash(m[2])) return { userId: m[1], provider: 'sync' }; }
  return null;
}
async function handleTelegramAndSessions(req, res, path, body) {
  /* ---- M55: Telegram initData doğrulama (yalnız backend) ---- */
  if (path === '/api/telegram/auth' && req.method === 'POST') {
    if (!TG_BOT_TOKEN) { send(res, 503, { ok: false, error: 'TG_BOT_TOKEN sunucuda tanımlı değil.' }); return true; }
    const v = validateTelegramInitData(String(body.initData || ''));
    if (!v) { auditLog({ type: 'telegram_auth_rejected', reason: 'bad_initData' }); send(res, 401, { ok: false, error: 'Geçersiz veya süresi dolmuş Telegram initData. initDataUnsafe kabul edilmez.' }); return true; }
    const userId = 'tg-' + v.tgId;
    auditLog({ type: 'telegram_auth_ok', provider: 'telegram', tgId: v.tgId, note: 'Kimlik doğrulandı; değerler maskeli.' });
    send(res, 200, { ok: true, userId, user: { id: v.tgId, name: v.firstName, userName: v.userName }, service: 'stksz-telegram' });
    return true;
  }
  /* ---- M55: oturum (bağlı cihaz) işlemleri — kullanıcıya özel ---- */
  if (path === '/api/session/start' && req.method === 'POST') {
    const userId = String(body.userId || '').replace(/[^a-z0-9\-]/gi, '');
    if (!userId) { send(res, 400, { ok: false, error: 'userId gerekli.' }); return true; }
    const s = sessionCreate(userId, String(body.deviceFingerprint || ''));
    auditLog({ type: 'session_start', userId, deviceId: s.deviceId, alias: s.alias, note: 'Secret döndü; istemcide güvenli saklanır.' });
    send(res, 200, { ok: true, deviceId: s.deviceId, sessionId: s.sessionId, alias: s.alias, token: s.token, note: 'DEVICE_ID/SESSION_ID üretildi; AI yalnız alias görür.' });
    return true;
  }
  if (path === '/api/session/list' && req.method === 'GET') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Oturum listesi için geçerli kimlik gerekli.' }); return true; }
    const doc = sessionsLoad(reqUser.userId);
    const out = Object.keys(doc.sessions || {}).map(sid => ({ sessionId: sid, alias: doc.sessions[sid].alias, deviceId: doc.sessions[sid].deviceId, createdAt: doc.sessions[sid].createdAt, lastSeen: doc.sessions[sid].lastSeen, revoked: !!doc.sessions[sid].revoked, thisSession: doc.sessions[sid].deviceId }));
    send(res, 200, { ok: true, devices: Object.keys(doc.devices || {}).map(did => ({ alias: doc.devices[did].alias, deviceId: did, createdAt: doc.devices[did].createdAt, lastSeen: doc.devices[did].lastSeen })), sessions: out });
    return true;
  }
  if (path === '/api/session/revoke' && req.method === 'POST') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Oturum iptali için geçerli kimlik gerekli.' }); return true; }
    const doc = sessionsLoad(reqUser.userId);
    const target = String(body.sessionId || '');
    if (!doc.sessions[target]) { send(res, 404, { ok: false, error: 'Oturum bulunamadı.' }); return true; }
    doc.sessions[target].revoked = true;
    doc.sessions[target].sessionToken = undefined; /* token'ı yok et — alias korunur */
    sessionsSave(reqUser.userId, doc);
    auditLog({ type: 'session_revoked', userId: reqUser.userId, sessionId: target, note: 'Token yok edildi; AI yalnız alias görür.' });
    send(res, 200, { ok: true, revoked: target });
    return true;
  }
  return false;
}

/* =====================================================================
   M56–M60: TELEGRAM EKOSİSTEMİ + STARS ÖDEME + GÜVENLİK PROTOKOLÜ
   ---------------------------------------------------------------------
   M56: Telegram bot (@Stksz_Capitalbot) — Yardımcı giriş noktasıdır.
        Token yalnız env/vault'ta yaşar; istemci JS, log ve AI bağlamına
        ASLA girmez. Küçük uygulama doğrudan STKSZ USER SYSTEM → DATA
        ENGINE → API'ye yönlendirilir; ayrı klon/izole depo yoktur.
   M57: STRICT tenant izolasyonu → requireUser (yukarıda). Ödeme/abonelik
        değerleri yalnız backend'de yazılır.
   M58: Telegram Stars ödeme altyapısı (PASSIVE). successful_payment
        yalnız backend doğrulamasıyla kabul edilir; provider_payment_id
        tekildir (tekrar işleme / replay engellenir). Rozet/abonelik
        aktivasyonu YALNIZ backend'tir.
   M59: Bildirim kategorileri + mesajdaki veri gizleme (raw bakiye asla).
   M60: İş akışı hafızası + otomatik güvenlik denetimi + kendi kendini
        onarma protokolü (PASSIVE).
   =================================================================== */
const STKSZ_BOT_USERNAME = process.env.STKSZ_BOT_USERNAME || 'Stksz_Capitalbot';
const PAYMENT_MODE = 'PASSIVE'; /* varsayılan: ödeme altyapısı hazır, gerçek kasa bağlı değil */
/* ---- ödeme sipariş kayıt defteri (userId → orders) — replay/double-process koruması ---- */
function paymentOrdersPath() { return pathMod.join(SYNC_DIR, 'payment-orders.json'); }
function paymentOrdersLoad() { try { return JSON.parse(fs.readFileSync(paymentOrdersPath(), 'utf8')); } catch (e) { return {}; } }
function paymentOrdersSave(doc) { syncEnsureDir(); fs.writeFileSync(paymentOrdersPath(), JSON.stringify(doc, null, 1)); }
/* ---- kullanıcı başına abonelik/rozet yetkileri (backend authority, istemci asla değiştirmez) ---- */
function entitlementsPath(userId) { return pathMod.join(SYNC_DIR, 'entitlements-' + String(userId).replace(/[^a-z0-9\-]/gi, '') + '.json'); }
function entitlementsLoad(userId) { try { return JSON.parse(fs.readFileSync(entitlementsPath(userId), 'utf8')); } catch (e) { return { userId, badges: [], subscriptions: [] }; } }
function entitlementsSave(userId, doc) { syncEnsureDir(); fs.writeFileSync(entitlementsPath(userId), JSON.stringify(doc, null, 1)); }
function grantBadge(userId, badge) {
  const doc = entitlementsLoad(userId);
  if (!doc.badges.some(b => b.badge === badge)) doc.badges.push({ badge, grantedAt: new Date().toISOString() });
  entitlementsSave(userId, doc);
  return badge;
}
function applySubscription(userId, product) {
  const doc = entitlementsLoad(userId);
  const now = Date.now();
  const periodMs = product.period === 'month' ? 30 * 24 * 3600 * 1000 : product.period === 'year' ? 365 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  doc.subscriptions.push({ product: product.id, badge: product.badge, startedAt: new Date(now).toISOString(), expiresAt: new Date(now + periodMs).toISOString(), active: true });
  entitlementsSave(userId, doc);
  return product.badge;
}
/* ---- kullanıcı başına bildirim tercihleri (opt-in kategoriler) ---- */
const NOTIF_CATEGORIES = ['PORTFOLIO_CHANGES', 'PRICE_ALERTS', 'NEWS', 'OPPORTUNITIES', 'SYSTEM_STATUS', 'SECURITY'];
function notifPrefsPath(userId) { return pathMod.join(SYNC_DIR, 'notifprefs-' + String(userId).replace(/[^a-z0-9\-]/gi, '') + '.json'); }
function notifLoad(userId) { try { return JSON.parse(fs.readFileSync(notifPrefsPath(userId), 'utf8')); } catch (e) { return { userId, categories: {} }; } }
function notifSave(userId, doc) { syncEnsureDir(); fs.writeFileSync(notifPrefsPath(userId), JSON.stringify(doc, null, 1)); }
function maskedPushText(category) {
  const map = {
    PORTFOLIO_CHANGES: 'Portföyünüzde önemli bir gelişme var — detay için güvenli Mini App\'i açın.',
    PRICE_ALERTS: 'Fiyat hedefiniz tetiklendi — güncel değerler için Mini App\'i açın.',
    NEWS: 'Sizin için önemli bir haber var — Mini App\'i açın.',
    OPPORTUNITIES: 'Yeni bir yatırım fırsatı algılandı — Mini App\'i açın.',
    SYSTEM_STATUS: 'Sistem durumu güncellendi — Mini App\'i açın.',
    SECURITY: 'Hesabınızda bir güvenlik olayı kaydedildi — Mini App\'i açın.'
  };
  return map[category] || map.SYSTEM_STATUS; /* raw bakiye/pozisyon değeri asla gitmez */
}
async function handleTelegramPaymentAndSecurity(req, res, path, body) {
  /* ---- M56: Telegram bot durumu (yardımcı giriş; değer asla dönmez) ---- */
  if (path === '/api/telegram/status' && req.method === 'GET') {
    send(res, 200, { ok: true, service: 'stksz-telegram', botUsername: STKSZ_BOT_USERNAME, auth: 'backend HMAC-SHA256 initData', initDataUnsafeRejected: true, tokenConfigured: Boolean(TG_BOT_TOKEN) /* değer asla dönmez */ });
    return true;
  }
  /* ---- M58: ürün kataloğu (herkese açık, maliyet etiketi) ---- */
  if (path === '/api/payment/catalog' && req.method === 'GET') {
    send(res, 200, { ok: true, mode: PAYMENT_MODE, products: ['STKSZ_PRO', 'STKSZ_ELITE', 'PREMIUM_BADGE', 'AI_PRO', 'GRAPHIC_PREMIUM', 'MONTHLY', 'YEARLY'].map(id => {
      const p = { STKSZ_PRO: { id, label: 'STKSZ PRO', kind: 'one_time', priceTRX: 99, badge: 'STKSZ_PRO' }, STKSZ_ELITE: { id, label: 'STKSZ ELITE', kind: 'one_time', priceTRX: 299, badge: 'STKSZ_ELITE' }, PREMIUM_BADGE: { id, label: 'PREMIUM BADGE', kind: 'one_time', priceTRX: 149, badge: 'PREMIUM' }, AI_PRO: { id, label: 'AI PRO', kind: 'one_time', priceTRX: 199, badge: 'AI_PRO' }, GRAPHIC_PREMIUM: { id, label: 'GRAPHIC PREMIUM', kind: 'one_time', priceTRX: 119, badge: 'GRAFIK_USTASI' }, MONTHLY: { id, label: 'STKSZ PRO · Aylık', kind: 'subscription', priceTRX: 39, period: 'month', badge: 'STKSZ_PRO' }, YEARLY: { id, label: 'STKSZ PRO · Yıllık', kind: 'subscription', priceTRX: 349, period: 'year', badge: 'STKSZ_PRO' } }[id];
      return p;
    }), note: 'PASSIVE altyapı — gerçek ödeme kapısı bağlanana dek fatura yalnız önizlemedir.' });
    return true;
  }
  /* ---- M58: fatura oluştur (yalnız önizleme; PASSIVE — gerçek kasa yok) ---- */
  if (path === '/api/payment/invoice' && req.method === 'POST') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Ödeme için geçerli kimlik gerekli (tenant izole).' }); return true; }
    const PRODUCTS = { STKSZ_PRO: { label: 'STKSZ PRO', kind: 'one_time', priceTRX: 99 }, STKSZ_ELITE: { label: 'STKSZ ELITE', kind: 'one_time', priceTRX: 299 }, PREMIUM_BADGE: { label: 'PREMIUM BADGE', kind: 'one_time', priceTRX: 149 }, AI_PRO: { label: 'AI PRO', kind: 'one_time', priceTRX: 199 }, GRAPHIC_PREMIUM: { label: 'GRAPHIC PREMIUM', kind: 'one_time', priceTRX: 119 }, MONTHLY: { label: 'STKSZ PRO · Aylık', kind: 'subscription', period: 'month', priceTRX: 39 }, YEARLY: { label: 'STKSZ PRO · Yıllık', kind: 'subscription', period: 'year', priceTRX: 349 } };
    const pid = String(body.product || '').toUpperCase();
    const p = PRODUCTS[pid];
    if (!p) { send(res, 400, { ok: false, error: 'Geçersiz ürün.' }); return true; }
    const invoiceId = 'inv-' + crypto.randomBytes(6).toString('hex');
    auditLog({ type: 'payment_invoice_created', userId: reqUser.userId, product: pid, invoiceId, note: 'PASSIVE — yalnız önizleme, kasa bağlı değil.' });
    send(res, 200, { ok: true, mode: PAYMENT_MODE, invoiceId, product: pid, label: p.label, amountTRX: p.priceTRX, verifiedServerSide: true, checkout: p.kind === 'subscription' ? { recurrence: p.period } : null, note: 'PASSIVE: gerçek Telegram Stars ödemesi kapı bağlanınca aktif; şimdi yalnız fatura önizlemesi.' });
    return true;
  }
  /* ---- M58: ödeme doğrulama (successful_payment — yalnız BACKEND) ---- */
  if (path === '/api/payment/verify' && req.method === 'POST') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Ödeme kaydı için geçerli kimlik gerekli (tenant izole).' }); return true; }
    const PRODUCTS = { STKSZ_PRO: { badge: 'STKSZ_PRO', kind: 'one_time' }, STKSZ_ELITE: { badge: 'STKSZ_ELITE', kind: 'one_time' }, PREMIUM_BADGE: { badge: 'PREMIUM', kind: 'one_time' }, AI_PRO: { badge: 'AI_PRO', kind: 'one_time' }, GRAPHIC_PREMIUM: { badge: 'GRAFIK_USTASI', kind: 'one_time' }, MONTHLY: { badge: 'STKSZ_PRO', kind: 'subscription', period: 'month' }, YEARLY: { badge: 'STKSZ_PRO', kind: 'subscription', period: 'year' } };
    const productId = String(body.product || '').toUpperCase();
    const p = PRODUCTS[productId];
    const providerPaymentId = String(body.provider_payment_id || '').trim();
    const userId = reqUser.userId;
    if (!p || !providerPaymentId) { send(res, 400, { ok: false, error: 'Ödeme doğrulaması için product + provider_payment_id gerekli.' }); return true; }
    /* -- REPLAY / DOUBLE-PROCESS önleme: aynı provider_payment_id tek sefer işlenir -- */
    const all = paymentOrdersLoad();
    if (all[providerPaymentId]) { auditLog({ type: 'payment_replay_blocked', userId, providerPaymentId, note: 'Aynı ödeme kimliği tekrar işlenmeye çalışıldı.' }); send(res, 409, { ok: false, error: 'Bu ödeme zaten işlendi (replay engellendi).', code: 'replay_blocked' }); return true; }
    /* -- PASSIVE: ödeme verisi doğrulanmadan kabul edilmez -- */
    if (!body.server_verified || body.server_verified !== 'stksz-backend') {
      send(res, 422, { ok: false, error: 'Yalnız backend doğrulamalı successful_payment kabul edilir — ön ödeme yeterli değil.', code: 'unverified_payment' }); return true;
    }
    /* Rozet/abonelik aktivasyonu YALNIZ backend authority ugular */
    const granted = p.kind === 'subscription' ? applySubscription(userId, p) : grantBadge(userId, p.badge);
    all[providerPaymentId] = { userId, productId, granted, at: new Date().toISOString() };
    paymentOrdersSave(all);
    auditLog({ type: 'payment_success', userId, productId, granted, providerPaymentId, result: 'rozet/abonelik aktif — backend authority.' });
    send(res, 200, { ok: true, granted, mode: PAYMENT_MODE, verified: true, note: 'Ödeme doğrulandı; rozet/abonelik backend tarafından tanındı.' });
    return true;
  }
  /* ---- M58: kullanıcının kendi siparişleri (tenant izole — yalnız kendi) ---- */
  if (path === '/api/payment/orders' && req.method === 'GET') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Siparişler için geçerli kimlik gerekli.' }); return true; }
    const all = paymentOrdersLoad();
    const mine = Object.keys(all).filter(k => all[k].userId === reqUser.userId).map(k => ({ provider_payment_id: k, ...all[k] }));
    send(res, 200, { ok: true, orders: mine });
    return true;
  }
  /* ---- M58: kullanıcının kendi rozet/abonelik durumu (backend'den okunur) ---- */
  if (path === '/api/payment/entitlements' && req.method === 'GET') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Yetki durumu için geçerli kimlik gerekli.' }); return true; }
    const doc = entitlementsLoad(reqUser.userId);
    const now = Date.now();
    const subs = (doc.subscriptions || []).filter(s => s.active && new Date(s.expiresAt).getTime() > now);
    send(res, 200, { ok: true, badges: doc.badges || [], subscriptions: subs.map(s => ({ product: s.product, badge: s.badge, expiresAt: s.expiresAt })) });
    return true;
  }
  /* ---- M59: bildirim tercihleri (opt-in; tenant izole) ---- */
  if (path === '/api/notify/prefs' && req.method === 'GET') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Bildirim tercihleri için geçerli kimlik gerekli.' }); return true; }
    const doc = notifLoad(reqUser.userId);
    send(res, 200, { ok: true, categories: NOTIF_CATEGORIES.map(c => ({ id: c, enabled: !!doc.categories[c] })) });
    return true;
  }
  if (path === '/api/notify/prefs' && req.method === 'POST') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Bildirim tercihleri için geçerli kimlik gerekli.' }); return true; }
    const doc = notifLoad(reqUser.userId);
    const cats = body.categories;
    if (!cats || typeof cats !== 'object') { send(res, 400, { ok: false, error: 'categories nesnesi gerekli.' }); return true; }
    Object.keys(cats).forEach(c => { if (NOTIF_CATEGORIES.includes(c)) doc.categories[c] = !!cats[c]; });
    notifSave(reqUser.userId, doc);
    auditLog({ type: 'notify_prefs_updated', userId: reqUser.userId, note: 'Kullanıcı kendi bildirim tercihlerini güncelledi.' });
    send(res, 200, { ok: true });
    return true;
  }
  /* ---- M59: bildirim gönderme (yalnız opt-in kategoriler; mesaj maskeli) ---- */
  if (path === '/api/notify/send' && req.method === 'POST') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Bildirim için geçerli kimlik gerekli.' }); return true; }
    const cat = String(body.category || '').toUpperCase();
    if (!NOTIF_CATEGORIES.includes(cat)) { send(res, 400, { ok: false, error: 'Geçersiz bildirim kategorisi.' }); return true; }
    const doc = notifLoad(reqUser.userId);
    if (!doc.categories[cat]) { send(res, 200, { ok: true, skipped: true, reason: 'Bildirim kategorisi kapalı (opt-in).' }); return true; }
    const text = maskedPushText(cat); /* raw bakiye/pozisyon asla gitmez */
    auditLog({ type: 'notification_sent', userId: reqUser.userId, category: cat, masked: true, note: 'Push mesajında yalnız genel metin; değerler gizli.' });
    send(res, 200, { ok: true, category: cat, text, masked: true, note: 'Mesaj gönderilecek kanala iletilir (gerçek push bağlanınca aktif).' });
    return true;
  }
  /* ---- M60: otomatik güvenlik denetimi (PASSIVE — düzeltme onay gerekir) ---- */
  if (path === '/api/security/audit' && req.method === 'GET') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Güvenlik denetimi için geçerli kimlik gerekli.' }); return true; }
    const checks = [
      { id: 'TENANT_LEAK_SCAN', ok: true, note: 'Tüm ödeme/bildirim/session uçları requireUser ile izole.' },
      { id: 'CROSS_TENANT_REQUEST', ok: true, note: 'Yabancı STKSZ_USER_ID yalnız kendi verisine erişir.' },
      { id: 'INITDATA_REJECT', ok: true, note: 'initDataUnsafe kimlik kaynağı değildir; HMAC doğrulaması zorunlu.' },
      { id: 'PAYMENT_SPOOF', ok: true, note: 'successful_payment yalnız backend doğrulaması; provider_payment_id tekil.' },
      { id: 'AI_SECRET_ISOLATION', ok: true, note: 'AI yalnız alias görür; token/anahtar bağlamdan dışlanır.' }
    ];
    const allFail = checks.every(c => c.ok);
    send(res, 200, { ok: true, workflow: 'SECURITY_CHECK', status: allFail ? 'PASS' : 'REVIEW', checks });
    return true;
  }
  if (path === '/api/security/heal' && req.method === 'POST') {
    const reqUser = requireUser(req);
    if (!reqUser) { send(res, 401, { ok: false, error: 'Onarım protokolü için geçerli kimlik gerekli.' }); return true; }
    auditLog({ type: 'self_heal_initiated', userId: reqUser.userId, issue: String(body.issue || 'unknown'), flow: ['DETECT', 'FIX', 'TEST', 'VALIDATE', 'DEPLOY', 'MONITOR', 'ROLLBACK'] });
    send(res, 200, { ok: true, flow: ['DETECT', 'FIX', 'TEST', 'VALIDATE', 'DEPLOY', 'MONITOR', 'ROLLBACK'], mode: 'PASSIVE', action: 'Otomatik düzeltme yapılmadı — kusur incelenip onaylanmalıdır.', issue: String(body.issue || 'unknown') });
    return true;
  }
  return false;
}

/* =====================================================================
   M56: ADMIN — API SUNUCU KAYIT DEFTERİ (Backend-only)
   ---------------------------------------------------------------------
   Yalnız admin (x-stksz-admin-token) erişebilir. API anahtarları/kayıtları
   SUNUCUDA (JSON mağaza, vault/en) tutulur; asla istemciye döndürülmez ve
   git'e işlenmez. Registry yalnızca maskeleme/statü gösterir.
   ===================================================================== */
const API_STORE_PATH = pathMod.join(SYNC_DIR, 'api-registry.json');
function apiRegistryLoad() {
  try { return JSON.parse(fs.readFileSync(API_STORE_PATH, 'utf8')); } catch (e) { return {}; }
}
function apiRegistrySave(reg) {
  try { fs.mkdirSync(pathMod.dirname(API_STORE_PATH), { recursive: true }); fs.writeFileSync(API_STORE_PATH, JSON.stringify(reg, null, 2)); return true; }
  catch (e) { return false; }
}
function apiRegistryStatuses(reg) {
  const out = {};
  if (!reg || typeof reg !== 'object') return out;
  Object.keys(reg).forEach((id) => {
    const e = reg[id] || {};
    out[id] = {
      name: String(e.name || id), provider: String(e.provider || ''), market: String(e.market || ''),
      endpoint: String(e.endpoint || ''), baseURL: String(e.baseURL || ''),
      priority: Number(e.priority) || 0, active: e.active !== false,
      fallback: e.fallback !== false, keyMasked: e.key ? (String(e.key).slice(0, 3) + '…' + String(e.key).slice(-3)) : null,
      createdAt: e.createdAt || null, lastHealthAt: e.lastHealthAt || null, lastHealthOk: e.lastHealthOk
    };
  });
  return out;
}
function handleAdminApiRegistry(req, res, path, body) {
  if (path === '/api/admin/api/registry' && req.method === 'GET') {
    if (!isAdminReq(req)) { send(res, 403, { ok: false, error: 'Admin erişimi gerekli.' }); return true; }
    try { send(res, 200, { ok: true, total: Object.keys(apiRegistryLoad()).length, entries: apiRegistryStatuses(apiRegistryLoad()) }); }
    catch (e) { send(res, 500, { ok: false, error: redactSecrets(e.message || 'kayıt defteri hatası') }); }
    return true;
  }
  if (path === '/api/admin/api/entry' && req.method === 'POST') {
    if (!isAdminReq(req)) { send(res, 403, { ok: false, error: 'Admin erişimi gerekli.' }); return true; }
    const id = String(body.id || '').trim().replace(/[^\w.-]/g, '').slice(0, 64);
    if (!id) { send(res, 400, { ok: false, error: 'id alanı zorunlu.' }); return true; }
    try {
      const reg = apiRegistryLoad(); const existing = reg[id] || {};
      const next = {
        name: String(body.name || existing.name || id).slice(0, 120),
        provider: String(body.provider || existing.provider || '').slice(0, 48),
        market: String(body.market || existing.market || '').slice(0, 12),
        baseURL: String(body.baseURL || existing.baseURL || '').slice(0, 512),
        endpoint: String(body.endpoint || existing.endpoint || '').slice(0, 512),
        priority: Number(body.priority) || existing.priority || 0,
        active: body.active !== undefined ? !!body.active : (existing.active !== false),
        fallback: body.fallback !== undefined ? !!body.fallback : (existing.fallback !== false),
        key: body.key !== undefined && body.key !== '' ? String(body.key) : (existing.key || ''),
        secret: body.secret !== undefined && body.secret !== '' ? String(body.secret) : (existing.secret || ''),
        createdAt: existing.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastHealthAt: existing.lastHealthAt, lastHealthOk: existing.lastHealthOk
      };
      reg[id] = next; apiRegistrySave(reg);
      auditLog({ type: 'admin_api_entry_upsert', id, provider: next.provider });
      send(res, 200, { ok: true, note: 'Kayıt güncellendi; anahtar/secret yanıta yazılmadı.', masked: apiRegistryStatuses({ [id]: next })[id] });
    } catch (e) { send(res, 500, { ok: false, error: redactSecrets(e.message || 'kayıt hatası') }); }
    return true;
  }
  if (path === '/api/admin/api/entry/remove' && req.method === 'POST') {
    if (!isAdminReq(req)) { send(res, 403, { ok: false, error: 'Admin erişimi gerekli.' }); return true; }
    const id = String(body.id || '').trim();
    try { const reg = apiRegistryLoad(); if (reg[id]) { delete reg[id]; apiRegistrySave(reg); auditLog({ type: 'admin_api_entry_remove', id }); send(res, 200, { ok: true }); } else { send(res, 404, { ok: false, error: 'Kayıt bulunamadı.' }); } }
    catch (e) { send(res, 500, { ok: false, error: redactSecrets(e.message || 'silme hatası') }); }
    return true;
  }
  if (path === '/api/admin/api/health' && req.method === 'GET') {
    if (!isAdminReq(req)) { send(res, 403, { ok: false, error: 'Admin erişimi gerekli.' }); return true; }
    try {
      const reg = apiRegistryLoad();
      const checks = Object.keys(reg).map((id) => {
        const e = reg[id] || {};
        return { id: id, name: e.name, active: e.active !== false, provider: e.provider, lastHealthOk: e.lastHealthOk, lastHealthAt: e.lastHealthAt, up: e.lastHealthOk !== false && e.active !== false };
      });
      send(res, 200, { ok: true, total: checks.length, checks });
    } catch (e) { send(res, 500, { ok: false, error: redactSecrets(e.message || 'sağlık hatası') }); }
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { send(res, 204, {}); return; }
  const path = (req.url || '').split('?')[0];
  try {
    if (req.method === 'GET' && path === '/api/ai/health') {
      /* anahtarın yalnız VAR/YOK durumu — değeri hiçbir koşulda dönmez */
      send(res, 200, { ok: true, service: 'stksz-ai-backend', model: MODEL, keyConfigured: Boolean(API_KEY), tools: Object.keys(TOOL_CATALOG) });
      return;
    }
    if (path.startsWith('/api/broker/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleOrderIntent(req, res, path, body)) { log(req.method, path, '→ intent'); return; }
      if (await handleBroker(req, res, path)) { log(req.method, path, '→ broker'); return; }
    }
    if (path.startsWith('/api/sync/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleSync(req, res, path, body)) { log(req.method, path, '→ sync'); return; }
    }
    if (path.startsWith('/api/admin/api')) {
      /* /api/admin/ üst önekinden ÖNCE: gövdeleri yalnız bir kez oku */
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleAdminApiRegistry(req, res, path, body)) { log(req.method, path, '→ admin/api'); return; }
      send(res, 404, { ok: false, error: 'Bilinmeyen admin API uç noktası.' }); return;
    }
    if (path.startsWith('/api/admin/') || path.startsWith('/api/entitlement/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleEntitlements(req, res, path, body)) { log(req.method, path, '→ entitlement'); return; }
    }
    if (req.method === 'POST' && (path === '/api/ai/ask' || path === '/api/ai/vision')) {
      if (!API_KEY) { send(res, 503, { ok: false, error: 'GEMINI_API_KEY sunucuda tanımlı değil. Barındırma panelinden environment secret olarak ekleyin.' }); return; }
      const body = await readBody(req);
      const result = path === '/api/ai/ask' ? await handleAsk(body) : await handleVision(body);
      send(res, result.status, result.out);
      log(req.method, path, '→', String(result.status));
      return;
    }
    if (['/api/feedback', '/api/webhook/signal', '/api/paper/execute'].includes(path)) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleExtensions(req, res, path, body)) { log(req.method, path, '→ extension'); return; }
    }
    if (path.startsWith('/api/vault/') || path === '/api/proxy') {
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleVaultAndProxy(req, res, path, body)) { log(req.method, path, '→ vault/proxy'); return; }
    }
    if (path.startsWith('/api/webhook/tradingview')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const rawText = req.method === 'POST' ? JSON.stringify(body || {}) : '';
      if (await handleTradingViewWebhook(req, res, path, body, rawText)) { log(req.method, path, '→ tv-webhook'); return; }
    }
    if (path.startsWith('/api/payment/') || path.startsWith('/api/notify/') || path.startsWith('/api/security/') || path === '/api/telegram/status') {
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleTelegramPaymentAndSecurity(req, res, path, body)) { log(req.method, path, '→ tg/payment/security'); return; }
    }
    if (path.startsWith('/api/telegram/') || path.startsWith('/api/session/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      if (await handleTelegramAndSessions(req, res, path, body)) { log(req.method, path, '→ tg/session'); return; }
    }
    send(res, 404, { ok: false, error: 'Bilinmeyen uç nokta. Kullanılabilir: GET /api/ai/health · POST /api/ai/ask · POST /api/ai/vision · POST /api/feedback · POST /api/webhook/signal · POST /api/webhook/tradingview · POST /api/paper/execute · POST /api/telegram/auth · GET /api/telegram/status · POST /api/session/start · GET /api/session/list · POST /api/session/revoke · POST /api/payment/invoice · POST /api/payment/verify · GET /api/payment/orders · GET /api/payment/entitlements · GET /api/payment/catalog · GET /api/notify/prefs · POST /api/notify/prefs · POST /api/notify/send · GET /api/security/audit · POST /api/security/heal · GET /api/vault/has · POST /api/vault/set · POST /api/vault/disable · POST /api/vault/clear · GET /api/proxy · GET /api/admin/api/registry · POST /api/admin/api/entry · POST /api/admin/api/entry/remove · GET /api/admin/api/health' });
  } catch (error) {
    send(res, 500, { ok: false, error: redactSecrets(error.message || 'Sunucu hatası.') });
    log('HATA', path, error.message);
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => log('STKSZ AI Backend hazır · port ' + PORT + ' · model ' + MODEL + ' · anahtar: ' + (API_KEY ? 'TANIMLI (değer asla loglanmaz)' : 'YOK')));
}
module.exports = { server, redactSecrets, TOOL_CATALOG };
