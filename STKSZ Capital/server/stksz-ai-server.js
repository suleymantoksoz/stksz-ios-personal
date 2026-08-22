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

  const { status, payload } = await callGemini('/v1beta/models/' + MODEL + ':generateContent', {
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
  const { status, payload } = await callGemini('/v1beta/models/' + MODEL + ':generateContent', {
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
    send(res, 200, { ok: true, service: 'stksz-broker-gateway', liveEnabled: BROKER_LIVE_ENABLED, credentialsConfigured: Boolean(BROKER_API_KEY && BROKER_API_SECRET), adapters: ['mock (aktif · sanal cüzdan)', 'midas (kilitli iskelet)'], note: 'Gerçek emir gönderimi bu sürümde KAPALIDIR.' });
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
    /* KULLANICI ONAYLADI → gerçek gönderim kapısı (bugün kapalı) */
    if (!BROKER_LIVE_ENABLED || !BROKER_API_KEY) {
      it.status = 'rejected_live_disabled'; orderIntents.delete(body.intentId);
      auditLog({ type: 'order_confirm_rejected', reason: 'broker_live_disabled', intentId: body.intentId, user, symbol: it.intent.symbol, side: it.intent.side, quantity: it.intent.quantity, price: it.intent.price, result: 'GÖNDERİLMEDİ' });
      send(res, 403, { ok: false, error: 'Kullanıcı onayı kaydedildi ancak GERÇEK EMİR GÖNDERİMİ bu sürümde kapalıdır (BROKER_LIVE_ENABLED=false). Hiçbir para işlemi yapılmadı.', code: 'broker_disabled', audited: true });
      return true;
    }
    /* Gelecek: burada adapter placeOrder çağrılır; sonuç audit'e yazılır. */
    it.status = 'submitted'; orderIntents.delete(body.intentId);
    auditLog({ type: 'order_submitted', intentId: body.intentId, user, symbol: it.intent.symbol, side: it.intent.side, quantity: it.intent.quantity, price: it.intent.price, result: 'adapter_pending' });
    send(res, 200, { ok: true, status: 'submitted', note: 'Emir adapter katmanına iletildi.' });
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
    send(res, 404, { ok: false, error: 'Bilinmeyen uç nokta. Kullanılabilir: GET /api/ai/health · POST /api/ai/ask · POST /api/ai/vision' });
  } catch (error) {
    send(res, 500, { ok: false, error: redactSecrets(error.message || 'Sunucu hatası.') });
    log('HATA', path, error.message);
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => log('STKSZ AI Backend hazır · port ' + PORT + ' · model ' + MODEL + ' · anahtar: ' + (API_KEY ? 'TANIMLI (değer asla loglanmaz)' : 'YOK')));
}
module.exports = { server, redactSecrets, TOOL_CATALOG };
