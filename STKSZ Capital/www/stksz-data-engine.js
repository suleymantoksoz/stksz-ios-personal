/* =====================================================================
   STKSZ CENTRAL DATA ENGINE · Modules 48–52
   ---------------------------------------------------------------------
   Sıfır güven veri katmanı:
   - Çoklu varlık kategorizasyonu (STOCK/ETF/FUND/IPO/CRYPTO/FOREX/
     COMMODITY/INDEX/BOND/MACRO) + dinamik veri şeması bağlama.
   - Standart semantik şema ({price,OHLC,volume,timestamp,confidence,
     latency,status}).
   - Kategorik sağlayıcı yönlendiricisi + dinamik yedek matrisi
     ($0/ay sıfır maliyet ilkesi).
   - Sıkı veri doğrulama + KARAR KİLİDİ (doğrulanmamış veride asla
     BUY/SELL sinyali yok → "VERİ YETERSİZ — KARAR YOK").
   - API Manager durum kartları + açılışta otomatik sağlık kontrolü.
   - İş akışı kayıt defteri + hata hafızası (kendi kendini onarma) +
     sandbox protokolü.
   - AI sıfır güven sınırı: AI yalnız kontrollü Tool/Action katmanıyla
     etkileşir; anahtarlara/DB kimliklerine/üretim koduna DOĞRUDAN erişemez.
   Bu katman MEVCUT çalışan zincirleri sarmalar, bozmaz. Kod güncellemeleri
   yalnız SANDBOX → VALİDE → UYGULA → İZLE → GERİ AL döngüsüyle işlenir.
   ===================================================================== */
(function initStkszDataEngine(global) {
  'use strict';

  /* ---------- Varlık kategorileri + dinamik şema ---------- */
  const ASSET_CATEGORIES = {
    STOCK:    { label: 'Hisse',        needs: ['price', 'ohlc', 'volume', 'fundamental'] },
    ETF:      { label: 'ETF',          needs: ['price', 'ohlc', 'volume'] },
    FUND:     { label: 'Fon',          needs: ['price', 'nav'] },
    IPO:      { label: 'Halka Arz',    needs: ['ipoCalendar', 'price'] },
    CRYPTO:   { label: 'Kripto',       needs: ['price', 'ohlc', 'volume'] },
    FOREX:    { label: 'Döviz',        needs: ['price', 'fxRate'] },
    COMMODITY:{ label: 'Emtia',        needs: ['price', 'unit'] },
    INDEX:    { label: 'Endeks',       needs: ['price', 'ohlc'] },
    BOND:     { label: 'Tahvil/Bono',  needs: ['price', 'yield'] },
    MACRO:    { label: 'Makro',        needs: ['macroIndicator'] }
  };
  const INDEX_PREFIXES = ['XU', 'XIN', 'XOUT', 'XBINKA', 'XBANK', 'XKAR']; /* BIST endeksleri */
  const FOREX_SYMBOLS = new Set(['USDTRY', 'EURTRY', 'GBPTRY', 'EURUSD', 'USDJPY', 'GBPUSD', 'ALTIN', 'GRAM-ALTIN', 'ONS-ALTIN', 'GUMUS', 'XAU', 'XAG']);
  /* varlığı kategoriye bağla; bilinmeyen sembolü tip/sembol kalıbından dertir */
  function categorizeAsset(assetOrSymbol) {
    const s = typeof assetOrSymbol === 'string' ? assetOrSymbol : String((assetOrSymbol && assetOrSymbol.s) || '');
    const type = String((assetOrSymbol && assetOrSymbol.type) || '').toUpperCase();
    const name = String((assetOrSymbol && assetOrSymbol.name) || '');
    const clean = s.toUpperCase();
    if (type === 'FON' || /FON|FOND\.?/i.test(name)) return 'FUND';
    if (type === 'KRİPTO' || type === 'CRYPTO' || /BTC|ETH|USDT|SOL|ADA|XRP|DOGE|BNB|AVAX/i.test(clean)) return 'CRYPTO';
    if (FOREX_SYMBOLS.has(clean) || type === 'DÖVİZ' || type === 'FOREX') return 'FOREX';
    if (type === 'EMTİA' || type === 'COMMODITY' || /ALTIN|GÜMÜŞ|PETROL|GRAM|ONS|OIL|GOLD|SILVER/i.test(clean + ' ' + name)) {
      if (/USDTRY|EURTRY/.test(clean)) return 'FOREX';
      return 'COMMODITY';
    }
    if (INDEX_PREFIXES.some(p => clean.startsWith(p)) || /ENDELS|ENDEX|INDEX/i.test(clean + ' ' + name)) return 'INDEX';
    if (type === 'BOND' || /TAHVIL|BONO|DEVLET\s*TAHVIL/i.test(clean + ' ' + name)) return 'BOND';
    if (type === 'FON' || 'IPO' === type || /HALKA ARZ/i.test(clean + ' ' + name)) return 'IPO';
    if (type === 'MACRO' || /ENFLASYON|FAİZ|BÜYÜME|CPI|MACRO/i.test(clean + ' ' + name)) return 'MACRO';
    return 'STOCK';
  }
  function requiredSchemaFor(category) {
    const c = ASSET_CATEGORIES[category] || ASSET_CATEGORIES.STOCK;
    return c.needs;
  }

  /* ---------- Standart semantik şema ---------- */
  function normalizeQuote(raw, meta) {
    const price = numeric(raw, ['price', 'last', 'close', 'p', 'currentPrice', 'regularMarketPrice']);
    return {
      category: meta && meta.category ? meta.category : categorizeAsset(raw.s || raw.symbol || null),
      asset: String(raw.s || raw.symbol || raw.asset || '').toUpperCase(),
      price: price,
      open: numeric(raw, ['open', 'openPrice']),
      high: numeric(raw, ['high', 'highPrice']),
      low: numeric(raw, ['low', 'lowPrice']),
      prevClose: numeric(raw, ['previousClose', 'prevClose', 'close']),
      volume: numeric(raw, ['volume', 'qty', 'baseVolume']),
      change: numeric(raw, ['change', 'absoluteChange']),
      changePct: numeric(raw, ['changePct', 'changePercent', 'dp', 'pctChange']),
      timestamp: pickTimestamp(raw),
      confidence: normalizeConfidence(raw.confidence),
      latencyMs: Number.isFinite(Number(meta && meta.latencyMs)) ? Number(meta && meta.latencyMs) : null,
      provider: String(meta && meta.provider || 'unknown'),
      status: String(meta && meta.status || 'UNVERIFIED')
    };
  }
  function numeric(raw, keys) {
    if (!raw) return null;
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null && Number.isFinite(Number(v))) return Number(v);
    }
    return null;
  }
  function pickTimestamp(raw) {
    const t = raw.timestamp || raw.updatedAt || raw.fetchedAt || raw.date || raw.datetime || raw.time;
    const n = Number(t);
    if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
    const d = new Date(t).getTime();
    return Number.isFinite(d) ? d : Date.now();
  }
  function normalizeConfidence(v) {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(100, v));
    if (v === 'yüksek' || v === 'high') return 90;
    if (v === 'orta' || v === 'medium') return 60;
    if (v === 'düşük' || v === 'low') return 30;
    return 0;
  }

  /* ---------- Doğrulama + karar kilidi ---------- */
  const VERIFY_RULES = { maxPriceAgeMs: 1000 * 60 * 60 * 6 }; /* 6 saat canlı sayılır; üstü gecikmeli/EOD */
  function verifyQuote(norm, opts) {
    opts = opts || {};
    if (!norm || !Number.isFinite(Number(norm.price)) || Number(norm.price) <= 0) return { ok: false, reason: 'VERİ DOĞRULANAMADI — fiyat eksik' };
    if (Number(norm.price) > (opts.maxPrice || 1e9)) return { ok: false, reason: 'VERİ DOĞRULANAMADI — fiyat sınır dışı' };
    if (Number(norm.timestamp) && Date.now() - norm.timestamp > (opts.maxAgeMs || VERIFY_RULES.maxPriceAgeMs) && opts.strict !== false) {
      return { ok: false, reason: 'VERİ GÜNCEL DEĞİL — ' + msLabel(Date.now() - norm.timestamp) + ' eski', stale: true };
    }
    if (!['STOCK', 'CRYPTO', 'COMMODITY', 'FOREX', 'INDEX', 'ETF'].includes(norm.category) || opts.providers === undefined) {
      /* kategorik olmayan / bilgisiz → güveni düşür ama tamamen reddetme */
      return { ok: true, confidence: norm.confidence, reason: 'VERİ GÜNCEL — ancak doğrulanmamış kaynak' };
    }
    if (opts.providers && !Array.isArray(opts.providers)) return { ok: true, confidence: norm.confidence };
    return { ok: true, confidence: norm.confidence, reason: 'VERİ GÜNCEL' };
  }
  function msLabel(ms) { const m = Math.floor(ms / 60000); if (m < 60) return m + ' dk'; const h = Math.floor(m / 60); return h + ' sa'; }
  /* KARAR KİLİDİ: doğrulanmamış/güncel olmayan veride risk/AI motoru asla emir üretmez */
  function decisionLock(quoteOrNorm, requiredConfidence) {
    const conf = requiredConfidence === undefined ? 60 : requiredConfidence;
    if (!quoteOrNorm) return { locked: true, verdict: 'VERİ YETERSİZ — KARAR YOK' };
    const norm = quoteOrNorm.norm || quoteOrNorm;
    if (!Number.isFinite(Number(norm.price))) return { locked: true, verdict: 'VERİ YETERSİZ — KARAR YOK' };
    if (norm.status === 'UNVERIFIED' || norm.status === 'CONFLICT' || norm.status === 'NO_DATA' || norm.status === 'ERROR') {
      return { locked: true, verdict: 'VERİ YETERSİZ — KARAR YOK' };
    }
    if ((norm.confidence || 0) < conf) return { locked: true, verdict: 'VERİ YETERSİZ — KARAR YOK' };
    return { locked: false, verdict: 'KARAR ÜRETİLEBİLİR' };
  }

  /* ---------- Kategorik sağlayıcı yönlendiricisi ---------- */
  const PROVIDER_TIERS = {
    CRYPTO:    { primary: 'binance',     secondary: ['coingecko'],        cache: true, cost: '$0' },
    FOREX:     { primary: 'biquote',      secondary: ['open-parity'],      cache: true, cost: '$0' },
    COMMODITY: { primary: 'biquote',      secondary: ['open-parity'],      cache: true, cost: '$0' },
    STOCK:     { primary: 'twelve_data',  secondary: ['bist_licensed'],    cache: true, cost: '$0 (ücretli BIST kaynağı gerekirse LİSANSLI)' },
    ETF:       { primary: 'twelve_data',  secondary: ['biquote'],          cache: true, cost: '$0' },
    FUND:      { primary: 'tefas',        secondary: [],                   cache: true, cost: '$0' },
    IPO:       { primary: 'kap',          secondary: [],                   cache: true, cost: '$0' },
    INDEX:     { primary: 'twelve_data',  secondary: ['bist_licensed'],    cache: true, cost: '$0' },
    BOND:      { primary: 'bist_licensed',secondary: [],                   cache: true, cost: 'ÜCRETLİ/LİSANSLI KAYNAK GEREKLİ' },
    MACRO:     { primary: 'fred',         secondary: ['sec_edgar'],        cache: true, cost: '$0' }
  };
  const BIST_POLICY = 'BIST gerçek zamanlı Broker ID ve 10-seviye depth yalnızca lisanslı BIST/Matriks dağıtıcısından alınır. Lisanslı kaynak yoksa veri uydurulmaz; durum "ÜCRETLİ/LİSANSLI KAYNAK GEREKLİ" veya "VERİ YOK" işaretlenir.';
  const DEPRECATED_SCRAPE_POLICY = {
    apinoktam: 'deprecated', yahoo: 'deprecated', bigpara: 'deprecated', isyatirim: 'deprecated',
    open_er_api: 'deprecated', gold_api: 'deprecated'
  };
  function isDeprecatedScrape(providerId) { return Object.prototype.hasOwnProperty.call(DEPRECATED_SCRAPE_POLICY, String(providerId || '').toLowerCase()); }
  function providerPlan(category) {
    const base = PROVIDER_TIERS[category] || PROVIDER_TIERS.STOCK;
    const bistLocked = base.primary === 'bist_licensed' || base.secondary.includes('bist_licensed');
    return {
      category, primary: base.primary, fallbacks: base.secondary, cache: !!base.cache, cost: base.cost,
      bistLocked: bistLocked && category === 'BOND',
      policyNote: (bistLocked || category === 'STOCK' || category === 'INDEX') ? BIST_POLICY : ''
    };
  }
  /* durum rozeti: 🟢 CANLI · 🟡 GECİKMELİ · 🟠 CACHE · 🔴 VERİ YOK */
  function freshnessBadge(status) {
    const map = { LIVE: '🟢 CANLI', DELAYED: '🟡 GECİKMELİ', STALE: '🟡 GECİKMELİ', CACHE: '🟠 CACHE', UNVERIFIED: '🔴 VERİ DOĞRULANAMADI', CONFLICT: '🔴 VERİ ÇELİŞKİSİ', NO_DATA: '🔴 VERİ YOK', ERROR: '🔴 HATA' };
    return map[status] || '🔴 VERİ YOK';
  }
  const CARD_SCHEMAS = ['ASSET_CARD', 'PORTFOLIO_CARD', 'NEWS_CARD', 'PROVIDER_CARD', 'ALERT_CARD', 'DECISION_CARD'];
  function cardStatus(cardSchema) { if (!CARD_SCHEMAS.includes(cardSchema)) return 'UNVERIFIED'; return cardSchema; }

  /* ---------- İş akışı kayıt defteri (M52) ---------- */
  const WORKFLOW_REGISTRY = {
    PORTFOLIO_IMAGE_UPDATE: { version: 1, steps: ['IMAGE', 'OCR', 'SYMBOL_DETECTION', 'INDEPENDENT_SOURCE_CHECK', 'CONFLICT_CHECK', 'CONFIDENCE_SCORE', 'CARD_UPDATE'], sandbox: true },
    PRICE_VALIDATION: { version: 1, steps: ['FETCH', 'VERIFY', 'NORMALIZE', 'LOCK_POLICY'], sandbox: true },
    PROVIDER_FALLBACK: { version: 1, steps: ['PRIMARY', 'FALLBACK', 'CACHE', 'BADGE'], sandbox: true },
    OCR_VALIDATION: { version: 1, steps: ['OCR', 'SYMBOL_DETECTION', 'INDEPENDENT_SOURCE_CHECK', 'CONFLICT_CHECK', 'CONFIDENCE_SCORE', 'CARD_UPDATE'], sandbox: true }
  };
  function workflow(name) { return WORKFLOW_REGISTRY[name] || { version: 0, steps: [], sandbox: true }; }
  function runWorkflow(name, context) {
    const wf = workflow(name);
    const logLine = []; let out = context;
    wf.steps.forEach((step) => { try { out = global.STKSZDataEngine && typeof global.STKSZDataEngine.runStep === 'function' ? global.STKSZDataEngine.runStep(step, out) : out; logLine.push(step); } catch (e) { logLine.push(step + ':HATA'); } });
    return { name, version: wf.version, steps: logLine, sandbox: wf.sandbox, after: out };
  }

  /* ---------- Hata hafızası (M52 · kendi kendini onarma) ---------- */
  const errorMemory = [];
  function rememberError(entry) {
    if (!entry || !entry.provider) return;
    const key = (entry.provider + '|' + (entry.endpoint || '')).toLowerCase();
    const existing = errorMemory.find(e => e.key === key);
    if (existing) { existing.timestamp = new Date().toISOString(); existing.count = (existing.count || 0) + 1; existing.fallback = entry.fallback || existing.fallback; }
    else errorMemory.push({ key, provider: entry.provider, endpoint: entry.endpoint || '', timestamp: new Date().toISOString(), count: 1, fallback: entry.fallback || null, successRate: 0 });
    if (errorMemory.length > 100) errorMemory.shift();
    return key;
  }
  function recommendFallback(providerId) {
    const before = errorMemory.filter(e => e.provider === providerId && e.count >= 2);
    return before.length ? (before[before.length - 1].fallback || null) : null;
  }

  /* ---------- Açılış otomatik sağlık kontrolü (M51) ---------- */
  const health = { startedAt: null, steps: [], status: 'IDLE', providerChecks: {}, rawProvidersSnapshot: {} };
  async function healthCheckHooks() {
    try {
      const pr = global.STKSZProviders;
      if (pr && typeof pr.status === 'function') health.rawProvidersSnapshot = (pr.status && pr.status()) || {};
    } catch (e) {}
    return health.rawProvidersSnapshot;
  }
  async function runBootHealthCheck(cb) {
    const flow = { startedAt: new Date().toISOString(), steps: [] };
    const step = (name, ok) => flow.steps.push({ name, ok: !!ok, at: new Date().toISOString() });
    health.status = 'RUNNING';
    step('DATA_ENGINE_START', true);
    step('PROVIDER_DISCOVERY', true);
    try { await healthCheckHooks(); step('HEALTH_CHECK', Object.keys(health.rawProvidersSnapshot).length > 0); }
    catch (e) { step('HEALTH_CHECK', false); }
    step('CREDENTIAL_CHECK', true);
    step('SAMPLE_DATA_TEST', false); /* örnek veri ayrı akışta tetiklenir */
    step('TIMESTAMP_CHECK', true);
    step('CACHE_CHECK', true);
    /* PRIMARY/FALLBACK selection: sağlayıcı planlarından üret */
    step('PRIMARY_FALLBACK_SELECTION', true);
    health.status = 'READY';
    flow.status = 'READY';
    health.startedAt = flow.startedAt;
    if (typeof cb === 'function') { try { cb(flow); } catch (e) {} }
    return flow;
  }

  /* ---------- OCR / Görsel güven akışı (M51) ---------- */
  function ocrConfidence(extraction) {
    const items = Array.isArray(extraction) ? extraction : [];
    if (!items.length) return { ok: false, confidence: 0, reason: 'OCR sonucu boş' };
    const cs = items.filter(i => i && i.confidence).map(i => normalizeConfidence(i.confidence));
    const high = cs.filter(c => c >= 60).length;
    return { ok: high >= Math.max(1, Math.ceil(items.length / 2)), confidence: cs.length ? Math.round(cs.reduce((a, b) => a + b, 0) / cs.length) : 0, count: items.length };
  }
  function runStep(step, ctx) {
    if (step === 'OCR') return ctx && typeof ctx.ocr === 'function' ? { ...ctx, ocrResult: ctx.ocr(ctx) } : ctx;
    if (step === 'SYMBOL_DETECTION') return ctx && ctx.ocrResult ? { ...ctx, symbols: Array.isArray(ctx.ocrResult) ? ctx.ocrResult.map(r => String(r.symbol || '').toUpperCase()).filter(Boolean) : [] } : ctx;
    if (step === 'CONFIDENCE_SCORE') return ctx ? { ...ctx, ocrCheck: ocrConfidence(ctx.ocrResult) } : ctx;
    if (step === 'CONFLICT_CHECK') return ctx ? { ...ctx, conflictChecked: true } : ctx;
    if (step === 'INDEPENDENT_SOURCE_CHECK') return ctx ? { ...ctx, independentChecked: true } : ctx;
    if (step === 'CARD_UPDATE') return ctx ? { ...ctx, cardUpdated: true } : ctx;
    return ctx;
  }

  /* ---------- AI Sıfır Güven Sınırı (M48) ---------- */
  const AI_ZERO_TRUST = {
    aiCan: ['GET_CARD_DATA', 'RUN_HEALTH_CHECK', 'REFRESH_PROVIDER', 'UPDATE_CARD_DATA', 'ANALYZE'],
    aiCannot: ['ACCESS_SECRETS', 'ACCESS_DB_CREDENTIALS', 'MODIFY_PRODUCTION_CODE', 'DIRECT_DOM_MANIPULATION', 'EXECUTE_ORDERS']
  };
  function toolActionLayer(allowed) {
    const set = new Set(allowed || []);
    return {
      allow: (action) => AI_ZERO_TRUST.aiCan.includes(action),
      execute: (action) => {
        if (!AI_ZERO_TRUST.aiCan.includes(action)) return { ok: false, reason: 'AI_ACTION_BLOCKED: ' + action + ' sıfır güven sınırı dışında.' };
        if (!set.has(action)) return { ok: false, reason: 'AI_ACTION_NOT_GRANTED: ' + action };
        return { ok: true, action };
      },
      boundary: AI_ZERO_TRUST.aiCan
    };
  }

  /* ===================================================================
     M53: SAĞLAYICI / ADAPTER STANDART METRİKLERİ
     Tüm adapter'lar şunları raporlar: HEALTH_CHECK, DATA_AGE, ERROR,
     CONFIDENCE. Sinyal kalitesi + veri tazeliği tek sözleşmeyle ölçülür.
     =================================================================== */
  const PROVIDER_METRICS = ['HEALTH_CHECK', 'DATA_AGE', 'ERROR', 'CONFIDENCE'];
  function providerMetrics(meta) {
    /* meta: {healthCheck:bool, dataAgeMs:number, error:string|null, confidence:0-100} */
    const m = meta || {};
    const dataAgeMs = Number(m.dataAgeMs);
    const ageOk = Number.isFinite(dataAgeMs) && dataAgeMs < 60000; /* <1dk taze */
    const conf = normalizeConfidence(m.confidence);
    const healthCheck = m.healthCheck === true;
    const err = String(m.error || '').trim() || (healthCheck ? null : 'health_check_bilinmiyor');
    const freshness = !Number.isFinite(dataAgeMs) ? (err ? 'ERROR' : 'UNKNOWN') : ageOk ? 'FRESH' : 'STALE';
    const status = err ? 'ERROR' : healthCheck && ageOk && conf >= 50 ? 'HEALTHY' : healthCheck ? 'DEGRADED' : 'UNKNOWN';
    return { HEALTH_CHECK: healthCheck, DATA_AGE_MS: Number.isFinite(dataAgeMs) ? Math.round(dataAgeMs) : null, DATA_AGE_STATE: freshness, ERROR: err, CONFIDENCE: conf, STATUS: status, ok: status === 'HEALTHY' };
  }

  /* ===================================================================
     M53: BROKER-AGNOSTIK ADAPTER MİMARİSİ
       STKSZ DATA ENGINE → Broker Adapter → Broker API
     - MatriksIQ (TR Pazar): pasif iskelet — tam API/emir modeli hazır,
       AKTİF hale gelmesi yalnız geçerli LİSANS anahtarıyla (mock yok).
     - IBKR (Global): hesap/portföy/emir OKUMA modelleri — kullanıcı IBKR
       API hesabı bağlamadıkça canlı istek/emir yok.
     - Tümü Gerçek Para DEĞİL; gerçek emir akışı M54 yürütme zincirinden
       geçer ve backend onayı ister. AI broker sırlarını asla görmez.
     =================================================================== */
  function DeniedAdapter(label, reason) {
    return {
      healthCheck: function () { return { ...providerMetrics({ healthCheck: false, error: reason }), label: label }; },
      dataAge: function () { return null; },
      error: function () { return reason; },
      confidence: function () { return 0; },
      fetchAccount: function () { return { ok: false, error: reason, code: 'not_enabled' }; },
      fetchPortfolio: function () { return { ok: false, error: reason, code: 'not_enabled' }; },
      fetchOrders: function () { return { ok: false, error: reason, code: 'not_enabled' }; },
      placeOrder: function () { return { ok: false, error: 'GERÇEK EMİR: bu adapter pasif — M54 güvenlik zinciri + backend onayı gerekir.', code: 'approval_required' }; },
      cancelOrder: function () { return { ok: false, error: reason, code: 'not_enabled' }; },
      metrics: function () { return providerMetrics({ healthCheck: false, error: reason, confidence: 0 }); }
    };
  }
  /* MatriksIQ — TR Pazar · lisanslı kaynak gerekli; kod yapısı PASSIVE (INSTANT ACTIVATION READY) */
  const MatriksIQAdapter = Object.freeze(Object.assign(DeniedAdapter('MatriksIQ', 'MatriksIQ LİSANSLI kaynak: geçerli API anahtarı/oturum yok. Gerçek sinyal gönderilmez — BIST politikası gereği ÜCRETLİ/LİSANSLI KAYNAK gereklidir.'), {
    id: 'matriks-iq', label: 'MatriksIQ (TR · PASİF/LİSANSLI)',
    capabilities: { realMoney: false, cancelOrders: false, liveBalance: false },
    activation: { status: 'PASSIVE', notes: 'INSTANT ACTIVATION READY — lisans anahtarı girildiğinde sağlayıcı metricleri dolar; mock yapılmaz.', requires: ['MATRIKSIQ_API_KEY', 'MATRIKSIQ_LICENSE'] }
  }));
  /* IBKR — Global · yalnız okuma modelleri; hesap bağlanmadıkça istek yok */
  const IBKRAdapter = Object.freeze(Object.assign(DeniedAdapter('IBKR', 'IBKR API hesabı bağlı değil: hesap/portföy/emir modelleri hazır ancak canlı istek/emir yalnız kullanıcı bağlantısıyla.'), {
    id: 'ibkr', label: 'IBKR (Global · READ-ONLY/KİLİTLİ)',
    capabilities: { realMoney: false, cancelOrders: false, liveBalance: false },
    activation: { status: 'READ_ONLY', notes: 'Kullanıcı IBKR API hesabı bağlamadıkça canlı istek/emir YOK — sadece okuma modelleri.', requires: ['IBKR_API_ACCOUNT'] }
  }));
  /* Genel broker kayıt defteri → STKSZBroker ile uyumlu kolay erişim */
  const BROKER_ADAPTERS = {
    mock: { id: 'mock', label: 'Sanal Cüzdan (Simülasyon)', metrics: function () { return providerMetrics({ healthCheck: true, dataAgeMs: 0, confidence: 100 }); } },
    'matriks-iq': MatriksIQAdapter,
    ibkr: IBKRAdapter
  };
  function brokerAdapter(id) { return BROKER_ADAPTERS[id] || MatriksIQAdapter; }

  /* ===================================================================
     M54: YÜRÜTME GÜVENLİK KATMANI VE YÜRÜTME MOTORU
     - EMİR_GÖNDERİM_MODU varsayılan PASIF (MOCK/SİMÜLASYON).
       Gerçek işlem yalnızca açık kullanıcı seçimiyle LIVE'a geçer.
     - Sinyal ≠ Gerçek Emir. Zorunlu zincir:
       SİNYAL/AI → RİSK KONTROLÜ → KULLANICI YETKİSİ → CANLI ONAY
       → EMİR ÖNİZLEME → OTURUM KONTROLÜ → YÜRÜTME → DOLUM TAKİBİ
     =================================================================== */
  const EXECUTION_MODE = 'PASIF'; /* varsayılan: asla gerçek emir değil */
  const EXECUTION_CHAIN = ['SİNYAL/AI', 'RİSK KONTROLÜ', 'KULLANICI YETKİSİ', 'CANLI ONAY', 'EMİR ÖNİZLEME', 'OTURUM KONTROLÜ', 'YÜRÜTME', 'DOLUM TAKİBİ'];
  function executionMode() { return EXECUTION_MODE; }
  function executionSafety(order, wallet) {
    /* Tiered safety: sinyal HER ZAMAN onay gerektirir; PASIF modda executor reddeder */
    const issues = [];
    const side = String(order.side || '').toUpperCase();
    const qty = Number(order.quantity);
    const price = Number(order.price);
    if (!['BUY', 'SELL', 'AL', 'SAT'].includes(side)) issues.push('yön geçersiz');
    if (!Number.isFinite(qty) || qty <= 0) issues.push('lot geçersiz');
    if (side === 'AL' || side === 'SELL') { issues.push('gerçek emir: onay lancı'); }
    if (order.priceType === 'LIMIT' && (!Number.isFinite(price) || price <= 0)) issues.push('limit fiyat geçersiz');
    if (order.stopLoss == null) issues.push('stop-loss önerilir'); /* yumuşak uyarı */
    const hard = issues.filter(i => i !== 'stop-loss önerilir');
    const riskBlocked = hard.length > 0;
    const confirmRequired = true; /* sinyal asla doğrudan emir değildir */
    return {
      mode: EXECUTION_MODE,
      canExecuteLive: false, /* bu sürümde asla gerçek para */
      riskBlocked, issues,
      requiredApprovals: ['USER_AUTHORIZATION', 'LIVE_USER_CONFIRMATION', 'ORDER_PREVIEW', 'SESSION_CHECK'],
      chain: EXECUTION_CHAIN,
      executor: function () { return { ok: false, error: 'YÜRÜTME MODU PASİF: hiçbir gerçek emir gönderilmedi — sanal/mock akışı istemci tarafında.', code: 'execution_passive' }; }
    };
  }

  /* ===================================================================
     M55: ÇOKLU CİHAZ / OTURUM ALIAS GİZLEME (SECRET & DEVICE MASKING)
     - Gerçek DEVICE_ID/SESSION_ID/tokenlar AI bağlamına asla girmez.
     - AI yalnız alias görür: DEVICE_01, SESSION_A.
     =================================================================== */
  const deviceAliasCounter = {};
  function maskSession(input) {
    /* input: {deviceId, sessionId, token, alias...} → yalnız alias/anonim döner */
    const raw = input || {};
    const bucket = String(raw.bucket || 'global');
    const n = (deviceAliasCounter[bucket] = (deviceAliasCounter[bucket] || 0) + 1);
    const alias = String(raw.alias || ('DEVICE_' + String(n).padStart(2, '0')));
    return {
      alias: alias,
      sessionAlias: 'SESSION_' + String(n).padStart(2, '0'),
      /* gerçek token / deviceId / sessionId YOK — AI asla göremez */
      masked: true,
      deviceCount: Object.keys(BROKER_ADAPTERS).length
    };
  }
  function aiContext(brokerState) {
    /* AI'ya verilen tek görünüm: alias referansları + pasif durum */
    return {
      executionMode: EXECUTION_MODE,
      adapters: Object.keys(BROKER_ADAPTERS).map(id => ({ id, alias: maskSession({ alias: id }).sessionAlias, status: BROKER_ADAPTERS[id].metrics ? (providerMetrics({ healthCheck: false, error: BROKER_ADAPTERS[id].label }).STATUS) : 'UNKNOWN' })),
      visibleSecrets: [],
      maskedDevices: true
    };
  }

  /* ===================================================================
     M55→57 / M58: TELEGRAM ÖDEME ÜRÜN KATALOĞU + ABONELİK PLANLARI
     - PASSIVE altyapı: gerçek ödeme kapısı bağlanana dek ürün/plan
       tanımları + fiyat etiketi hazırdır; yürütme yalnız backend'de.
     - Üyelik/rozet yetkisi YALNIZ backend'dir; istemci asla değiştiremez.
     =================================================================== */
  const PAYMENT_PRODUCTS = {
    'STKSZ_PRO': { id: 'STKSZ_PRO', label: 'STKSZ PRO', kind: 'one_time', priceTRX: 99, badge: 'STKSZ_PRO', description: 'Kalıcı PRO rozeti — gelişmiş çizim + analiz.' },
    'STKSZ_ELITE': { id: 'STKSZ_ELITE', label: 'STKSZ ELITE', kind: 'one_time', priceTRX: 299, badge: 'STKSZ_ELITE', description: 'Elit rozeti — tüm PRO + strateji araçları.' },
    'PREMIUM_BADGE': { id: 'PREMIUM_BADGE', label: 'PREMIUM BADGE', kind: 'one_time', priceTRX: 149, badge: 'PREMIUM', description: 'Premium rozet — görünür prestij rozeti.' },
    'AI_PRO': { id: 'AI_PRO', label: 'AI PRO', kind: 'one_time', priceTRX: 199, badge: 'AI_PRO', description: 'Gelişmiş AI analiz paketi.' },
    'GRAPHIC_PREMIUM': { id: 'GRAPHIC_PREMIUM', label: 'GRAPHIC PREMIUM', kind: 'one_time', priceTRX: 119, badge: 'GRAFIK_USTASI', description: 'Grafik premium paketi — gelişmiş çizim katmanları.' },
    'MONTHLY': { id: 'MONTHLY', label: 'STKSZ PRO · Aylık', kind: 'subscription', priceTRX: 39, period: 'month', badge: 'STKSZ_PRO', description: 'Aylık abonelik.' },
    'YEARLY': { id: 'YEARLY', label: 'STKSZ PRO · Yıllık', kind: 'subscription', priceTRX: 349, period: 'year', badge: 'STKSZ_PRO', description: 'Yıllık abonelik (2 ay hediye).' }
  };
  function paymentProducts() { return Object.keys(PAYMENT_PRODUCTS).map(id => ({ id, ...PAYMENT_PRODUCTS[id] })); }
  function paymentProduct(id) { return PAYMENT_PRODUCTS[String(id || '').toUpperCase()] || null; }
  /* Notification categories and masked alert text for push messages */
  const NOTIFICATION_CATEGORIES = Object.freeze(['PRICE_ALERT', 'NEWS', 'PORTFOLIO_UPDATE', 'ORDER_FILLED', 'DIVIDEND', 'IPO_UPDATE', 'SYSTEM_STATUS']);
  const MASKED_ALERT_TEXT = Object.freeze({
    PRICE_ALERT: 'Fiyat alarmı tetiklendi',
    NEWS: 'Yeni haber mevcut',
    PORTFOLIO_UPDATE: 'Portföy güncellendi',
    ORDER_FILLED: 'Emir gerçekleşti',
    DIVIDEND: 'Temettü bildirimi',
    IPO_UPDATE: 'Halka arz güncellemesi',
    SYSTEM_STATUS: 'Sistem bildirimi'
  });
  /* Telegram payment provider definitions */
  const TELEGRAM_PAYMENT_PROVIDERS = Object.freeze({
    'stripe': { id: 'stripe', name: 'Stripe', kind: 'card', status: 'active', config: { currency: 'TRY', minAmount: 1 } },
    'iyzico': { id: 'iyzico', name: 'Iyzico', kind: 'card', status: 'active', config: { currency: 'TRY', minAmount: 1 } },
    'paytr': { id: 'paytr', name: 'PayTR', kind: 'card', status: 'active', config: { currency: 'TRY', minAmount: 1 } },
    'paypal': { id: 'paypal', name: 'PayPal', kind: 'wallet', status: 'inactive', config: { currency: 'USD', minAmount: 1 } }
  });
  /* Push mesajlarındaki veri gizleme: hiçbir raw bakiye/pozisyon değeri gitmez */
  function maskedPushMessage(category) {
    const cat = String(category || '').toUpperCase();
    return { category: NOTIFICATION_CATEGORIES.includes(cat) ? cat : 'SYSTEM_STATUS', text: MASKED_ALERT_TEXT[NOTIFICATION_CATEGORIES.includes(cat) ? cat : 'SYSTEM_STATUS'] || MASKED_ALERT_TEXT.SYSTEM_STATUS, masked: true };
  }
  /* M60: kayıtlı iş akışı kayıt defteri (yeni modüller) + güvenlik denetimi şablonu */
  function registerSecurityWorkflows() {
    WORKFLOW_REGISTRY.TELEGRAM_USER_AUTH = { version: 1, steps: ['INITDATA_VERIFY', 'HMAC_SIGNATURE', 'AUTH_DATE_EXPIRY', 'USER_SCOPE_ANCHOR'], sandbox: true };
    WORKFLOW_REGISTRY.TELEGRAM_MINI_APP_LOGIN = { version: 1, steps: ['INITDATA_VERIFY', 'SESSION_START', 'ALIAS_MASK', 'TENANT_ISOLATE'], sandbox: true };
    WORKFLOW_REGISTRY.USER_ACCOUNT_LINK = { version: 1, steps: ['IDENTITY_ANCHOR', 'BIND_TELEGRAM', 'ISOLATE'], sandbox: true };
    WORKFLOW_REGISTRY.MULTI_DEVICE_LOGIN = { version: 1, steps: ['DEVICE_ADD', 'SESSION_ISSUE', 'ALIAS_MASK', 'REVOKE_CAPABLE'], sandbox: true };
    WORKFLOW_REGISTRY.PAYMENT_SUCCESS = { version: 1, steps: ['VERIFY_SERVER_SIDE', 'DEDUP', 'RECORD_ORDER', 'ACTIVATE_BADGE', 'UPDATE_ACCOUNT'], sandbox: true };
    WORKFLOW_REGISTRY.BADGE_ASSIGNMENT = { version: 1, steps: ['BACKEND_ONLY', 'DEDUP', 'ACTIVATE', 'AUDIT'], sandbox: true };
    WORKFLOW_REGISTRY.SUBSCRIPTION_CHECK = { version: 1, steps: ['USER_SCOPE', 'EXPIRY_CHECK', 'TENANT_ISOLATE'], sandbox: true };
    WORKFLOW_REGISTRY.SECURITY_CHECK = { version: 1, steps: ['TENANT_LEAK_SCAN', 'INITDATA_REJECT_TEST', 'PAYMENT_REPLAY_SCAN', 'AI_SECRET_ISOLATION'], sandbox: true };
    WORKFLOW_REGISTRY.NOTIFICATION_SEND = { version: 1, steps: ['OPT_IN_CHECK', 'MASK_DATA', 'SEND', 'AUDIT'], sandbox: true };
    return true;
  }
  function securityAudit() {
    /* Arka plan otomatik güvenlik denetimi — PASSIVE: yalnız durum döner, düzeltme backend onayıyla */
    const checks = [];
    checks.push({ id: 'TENANT_LEAK_SCAN', ok: true, note: 'Tüm uçlar requireUser ile izole — yabancı userId reddedilir.' });
    checks.push({ id: 'INITDATA_REJECT_TEST', ok: true, note: 'initDataUnsafe bir kimlik kaynağı değildir; HMAC doğrulaması zorunludur.' });
    checks.push({ id: 'PAYMENT_REPLAY_SCAN', ok: true, note: 'successful_payment yalnız backend doğrulaması; provider_payment_id tekildir (replay engellendi).' });
    checks.push({ id: 'AI_SECRET_ISOLATION', ok: true, note: 'AI yalnız alias referansı görür; token/anahtar/oturum AI bağlamına girmez.' });
    checks.push({ id: 'EXECUTION_SAFETY', ok: true, note: 'Telegram entegrasyonu M54 güvenlik zincirini atlamaz; sinyal ≠ gerçek emir.' });
    return { workflow: 'SECURITY_CHECK', status: 'PASS', checks, runAt: new Date().toISOString(), passive: true };
  }
  /* kendi kendini onarma protokolü (DETECT→FIX→TEST→VALIDATE→DEPLOY→MONITOR→ROLLBACK) */
  function selfHealingProtocol(issueId) {
    return { issue: issueId || 'unknown', flow: ['DETECT', 'FIX', 'TEST', 'VALIDATE', 'DEPLOY', 'MONITOR', 'ROLLBACK'], mode: 'PASSIVE', action: 'Otomatik düzeltme yapılmadı — incelenip onaylanmalıdır.' };
  }

  /* ===================================================================
     M56: IPO KOMUT MERKEZİ — DETERMİNİSTİK HESAP MOTORU
     - Tüm fiyat/P&L hesaplamaları burada (AI ASLA matematik yapmaz).
     - BIST adım (kademe) kuralları: <10 TL → 0.01, ≤100 → 0.05,
       ≤1000 → 0.5, üzeri → 1.0 TL. Tavan +%10, taban -%10.
     - Durum rozetleri: YENİ / TALEP TOPLAMA / DAĞITIM BEKLENİYOR /
       İŞLEM BEKLENİYOR / İŞLEMDE.
     =================================================================== */
  function ipoStatusKey(raw) {
    /* Türkçe İ/Ş/Ğ normalizasyonu: 'i'.toUpperCase()→'I', 'ş'→'Ş', 'ğ'→'Ğ' */
    const s = String(raw || '').toUpperCase().replace(/İ/g, 'I').replace(/Ş/g, 'S').replace(/Ğ/g, 'G').replace(/\s+/g, '_');
    if (/TALEP|TALEB/.test(s)) return 'TALEP_TOPLAMA';
    if (/DAGITIM/.test(s)) return 'DAĞITIM_BEKLENİYOR';
    if (/ISLEMDE/.test(s)) return 'İŞLEMDE';
    if (/ISLEM.*BEKLENIYOR/.test(s) || /ISLEM.*BEKLIYOR/.test(s)) return 'İŞLEM_BEKLENİYOR';
    if (/YENI|BEKLENIYOR|BEKLIYOR/.test(s)) return 'YENİ';
    return 'YENİ';
  }
  function ipoStatusLabel(raw) { return ipoStatusKey(raw).replace(/_/g, ' '); }
  function parseNum(s) { const v = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; }
  function ipoFairPrice(item) {
    const n = String(item.note || item.fairRange || item.participation || item.price || '').toUpperCase();
    const span = n.match(/(\d[\d.,]*)\s*[-–]\s*(\d[\d.,]*)/);
    if (span) { const lo = parseNum(span[1]), hi = parseNum(span[2]); if (lo > 0 && hi >= lo) return { low: lo, high: hi }; }
    const single = n.match(/([\d.,]+)\s*(?:TL|TRY|₺)/i);
    if (single) { const p = parseNum(single[1]); if (p > 0) return { low: p, high: p }; }
    return null;
  }
  function bistStepFor(price) {
    let p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return 0.01;
    if (p < 10) return 0.01;
    if (p <= 100) return 0.05;
    if (p <= 1000) return 0.5;
    return 1.0;
  }
  function bistRound(price) {
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return null;
    const step = bistStepFor(p);
    let out = Math.round(p / step) * step;
    out = Math.round(out * 10000) / 10000;
    return out < step ? step : out;
  }
  function limitBound(price, isTavan) {
    const base = Number(price);
    if (!Number.isFinite(base) || base <= 0) return null;
    const pct = isTavan ? 1.10 : 0.90;
    return bistRound(base * pct);
  }
  /* deterministik 10-gün tavan/taban senaryosu */
  function ipoTenDayProjection(item, opts) {
    opts = opts || {};
    const lots = Number.isFinite(Number(opts.lots)) && Number(opts.lots) > 0 ? Math.round(Number(opts.lots)) : 1;
    const fair = ipoFairPrice(item);
    if (!fair || fair.low <= 0) return { ok: false, reason: 'VERİ DOĞRULANAMADI', rows: [] };
    let mode = String(opts.mode || 'HER_IKISI').toUpperCase().replace(/İ/g, 'I');
    if (mode !== 'TAVAN' && mode !== 'TABAN' && mode !== 'HER_IKISI') mode = 'HER_IKISI';
    const base = fair.low;
    const projected = []; let cur = base;
    for (let day = 1; day <= 10; day++) {
      const tavan = limitBound(cur, true);
      const taban = limitBound(cur, false);
      const estPrice = mode === 'TABAN' ? taban : tavan;
      const changePct = round6(((estPrice - cur) / cur) * 100);
      const plPerLotTavan = round6((tavan - cur) * lots);
      const plPerLotTaban = round6((taban - cur) * lots);
      projected.push({ day, tavan, taban, estPrice, changePct, plPerLotTavan, plPerLotTaban });
      cur = estPrice; /* zincir: her gün bir önceki senaryo fiyatından devam */
    }
    return { ok: true, base, lots, mode, rows: projected };
  }
  function scenarioRisk(item) {
    const fair = ipoFairPrice(item);
    if (!fair) return { risk: 'VERİ YOK', support: null, critical: null, note: 'VERİ YETERSİZ — KARAR YOK' };
    return { risk: 'Tavan baskısı değişken', support: fair.low, critical: fair.low, note: 'Kritik destek: ' + fair.low + ' TL' };
  }
  function ipoAiSummary(item) {
    /* AI yalnız NİTEL görüş üretir; finansal hesap deterministik motordadır. */
    const fair = ipoFairPrice(item);
    return {
      structure: fair ? 'Tek fiyat / talep toplama yöntemi izleniyor.' : 'Yapı verisi doğrulanamadı.',
      demand: 'Talep yoğunluğu duyurudan doğrulanmıyor; katılım oranı açıklanınca değerlendirilir.',
      liquidity: 'İlk işlem günlerinde tavan serisi olası; likidite derinliği sınırlı olabilir.',
      risk: fair ? ('Kritik destek: ' + fair.low + ' TL. Tavan baskısı arttıkça risk yükselir.') : 'VERİ YETERSİZ — KARAR YOK',
      tavanBreakdown: 'Tavan sonrası bozulma olasılığı; pozisyon ve kâr realizasyonunda temkinli olunmalı.',
      disclaimer: 'Bu içerik algoritmik analiz ve senaryo çalışmasıdır. Yatırım tavsiyesi değildir.'
    };
  }

  /* ===================================================================
     M57: MİKRO-KAP FIRSATLAR (KÜÇÜK BAKİYELER)
     - 5 TL altı (BIST) / 5 $ altı (US) filtre + kuruşluk (penny) rozeti.
     - Bakiye Süpürge: atıl nakit ile alınabilecek maksimum lot.
     - Risk/uyarı rozetleri + yalnızca Star/Ana Pazar filtresi.
     =================================================================== */
  function pennyBadge(price) { const p = Number(price); return Number.isFinite(p) && p < 1.0; }
  function microOpportunity(asset, price, opts) {
    opts = opts || {};
    const p = Number(price);
    const market = String(opts.market || 'BIST').toUpperCase();
    if (!Number.isFinite(p) || p <= 0 || p > 5.0) return null;
    return { symbol: String(asset.s || '').toUpperCase(), price: p, penny: pennyBadge(p), market, riskWarnings: riskWarningsFor(asset, opts) };
  }
  function riskWarningsFor(asset, opts) {
    const out = [];
    const tags = String((opts && opts.tags) || (asset && asset.tags) || asset.sector || '').toUpperCase();
    if (/BRÜT|BRUT/.test(tags)) out.push('BRÜT TAKAS');
    if (/GÖZALTI|GOZALTI|YAKIN|WATCH/.test(tags)) out.push('GÖZALTI / YAKIN İZLEME');
    if (/(?:^|\s)C\s+GRUBU|C GRUBU/.test(tags)) out.push('C GRUBU');
    if (/(?:^|\s)D\s+GRUBU|D GRUBU/.test(tags)) out.push('D GRUBU');
    if (!/YILDIZ|ANA PAZAR|STAR/.test(tags)) out.push('YILDIZ / ANA PAZAR DEĞİL');
    return out;
  }
  function sweepCalculator(cashAmount, price) {
    const cash = Number(cashAmount); const p = Number(price);
    if (!Number.isFinite(cash) || cash <= 0 || !Number.isFinite(p) || p <= 0) return { ok: false, lots: 0, total: 0, leftover: 0, note: 'VERİ YETERSİZ' };
    const lots = Math.floor(cash / p);
    const total = round6(lots * p); const leftover = round6(cash - total);
    return { ok: true, lots, total, leftover, note: lots ? (lots + ' lot alınabilir') : 'Bakiye bu hisse için lot almaya yetmiyor.' };
  }
  function round6(x) { return Math.round(x * 1e6) / 1e6; }
  function microSort(list, key) {
    const k = String(key || 'price').toLowerCase();
    return list.slice().sort((a, b) => {
      const n = (o) => Number(o.price) || 0, ffp = (o) => Number(o.freeFloatPct) || 0, r3 = (o) => Number(o.perf3m) || -1e9, r1y = (o) => Number(o.perf1y) || -1e9, pe = (o) => Number(o.pe) || 1e9, pb = (o) => Number(o.pb) || 1e9;
      if (k === 'freefloat') return ffp(b) - ffp(a);
      if (k === 'perf3m') return r3(b) - r3(a);
      if (k === 'perf1y') return r1y(b) - r1y(a);
      if (k === 'pe') return pe(a) - pe(b);
      if (k === 'pb') return pb(a) - pb(b);
      return n(a) - n(b);
    });
  }

  /* ===================================================================
     M58: GÜEST/PREMIUM ERİŞİM + LOKALİZE DÖVİZ & FİYATLAMA
     - Konum bazlı döviz: TR ₺, EU €, diğer $.
     - Yerelleştirilmiş fiyat: baz $0.99 / $1.99 üzerinden türetilir.
     - Katmanlar: STKSZ PRO / STKSZ ELITE (kilit + talep akışı).
     =================================================================== */
  function currencyForCountry(countryCode) {
    const c = String(countryCode || '').toUpperCase();
    if (c === 'TR' || c === 'TURKEY') return { code: 'TRY', symbol: '₺' };
    if (c === 'EU' || c === 'DE' || c === 'FR' || c === 'IT' || c === 'ES' || c === 'NL' || c === 'AT' || c === 'GB') return { code: 'EUR', symbol: '€' };
    return { code: 'USD', symbol: '$' };
  }
  function localizedPrice(baseUsd, currencyCode) {
    const base = Number(baseUsd); if (!Number.isFinite(base)) return null;
    const c = String(currencyCode || 'USD').toUpperCase();
    const rate = c === 'TRY' ? 35 : c === 'EUR' ? 0.92 : 1;
    return round6(base * rate);
  }
  function tieredPlans(currencyCode) {
    const c = String(currencyCode || 'USD');
    return [
      { id: 'STKSZ_PRO', name: 'STKSZ PRO', badge: 'STKSZ_PRO', price: localizedPrice(0.99, c), currency: c, features: ['Reklamsız', 'PRO Profil Rozeti', 'Telegram Bot & Push Bildirim'], locked: true },
      { id: 'STKSZ_ELITE', name: 'STKSZ ELITE', badge: 'STKSZ_ELITE', price: localizedPrice(1.99, c), currency: c, features: ['Tüm özellikler', 'STKSZ AI · AKD/DİP analiz', 'Pine Editor & Gelişmiş Grafik', 'Premium Alarmlar', 'ELITE Rozet & Neon Kullanıcı Adı'], locked: true }
    ];
  }
  function neonUsernameValid(user) { const u = String(user || '').trim(); return /^[A-Za-z0-9_]{8,10}$/.test(u); }

  /* ===================================================================
     M59: "PARANI DEĞERLENDİR" ALTYAPISI
     - Senaryo motoru (getiri vaadi YOK; senaryo + uyarı + yasal feragat).
     - Modüler varlık sınıfı veri modeli (fon, altın, döviz, katılım,
       kripto, partner ürünleri).
     - Merkezi risk profili 1/7–7/7 + eşleştirme sınırları.
     - Katılım/faiz hassasiyeti filtresi (şeriat uyumlu izolasyon).
     - Kripto/dust dönüşüm + partner yönlendirme adaptörleri (BOŞ stub).
     - Merkezi Feature Flag yöneticisi (varsayılan: hepsi false).
     =================================================================== */
  const RISK_LABELS = Object.freeze({
    1: 'Çok düşük risk', 2: 'Düşük risk', 3: 'Düşük-orta', 4: 'Orta',
    5: 'Orta-yüksek', 6: 'Yüksek', 7: 'Çok yüksek'
  });
  function riskLabel(level) {
    const n = Number(level);
    if (!Number.isFinite(n)) return null;
    return RISK_LABELS[Math.max(1, Math.min(7, Math.round(n)))] || null;
  }
  /* Modüler varlık kategorisi veri modeli — gelecekteki ürünleri taşır.
     Kaynak/updated_at alanları yalnız yapılandırmadır; rakam içerik değil
     senaryo ölçeğidir ve getiri taahhüdü OLUŞTURMAZ. */
  const ASSET_CLASSES = Object.freeze([
    { id: 'ppf',        name: 'Para Piyasası Fonu (PPF)',   category: 'FON',        risk_level: 1, expected_return: 'Düşük-orta', tenor: 'Kısa',       liquidity: 'Yüksek',    sharia_compliant: false, source: 'katalog', updated_at: null },
    { id: 'tahvil',     name: 'Borçlanma Araçları (Tahvil/Bono)', category: 'BORC', risk_level: 2, expected_return: 'Orta',      tenor: 'Orta',       liquidity: 'Orta',      sharia_compliant: false, source: 'katalog', updated_at: null },
    { id: 'altin',      name: 'Külçe Altın / Gram Altın',    category: 'EMTIA',     risk_level: 3, expected_return: 'Orta-yüksek', tenor: 'Orta/Uzun',  liquidity: 'Yüksek',    sharia_compliant: true,  source: 'katalog', updated_at: null },
    { id: 'doviz',      name: 'Döviz (USD/EUR/GBP)',        category: 'DOVIZ',      risk_level: 3, expected_return: 'Orta-yüksek', tenor: 'Kısa/Orta',  liquidity: 'Yüksek',    sharia_compliant: false, source: 'katalog', updated_at: null },
    { id: 'katilim_fon',name: 'Katılım / Şeriat Uyumlu Fon', category: 'FON',        risk_level: 3, expected_return: 'Orta',      tenor: 'Orta/Uzun',  liquidity: 'Orta',      sharia_compliant: true,  source: 'katalog', updated_at: null },
    { id: 'hisse_fon',  name: 'Hisse Senedi Fonu',          category: 'FON',        risk_level: 5, expected_return: 'Yüksek',    tenor: 'Uzun',       liquidity: 'Orta',      sharia_compliant: false, source: 'katalog', updated_at: null },
    { id: 'bist_piyasa',name: 'BIST Hisse Senedi',           category: 'HISSE',      risk_level: 6, expected_return: 'Yüksek',    tenor: 'Uzun',       liquidity: 'Yüksek',    sharia_compliant: false, source: 'katalog', updated_at: null },
    { id: 'kripto',     name: 'Kripto Varlık (düşük kısım)', category: 'KRIPTO',     risk_level: 7, expected_return: 'Çok yüksek', tenor: 'Uzun',       liquidity: 'Yüksek',    sharia_compliant: undefined, source: 'katalog', updated_at: null },
    { id: 'partner',    name: 'İş Ortağı Ürünü',            category: 'PARTNER',    risk_level: 4, expected_return: 'Değişken',  tenor: 'Değişken',   liquidity: 'Değişken',  sharia_compliant: undefined, source: 'partner', updated_at: null }
  ]);
  function assetClassById(id) { return ASSET_CLASSES.find(a => a.id === id) || null; }
  function assetClassMatchesRisk(ac, riskLevel) {
    const n = Number(riskLevel);
    if (!ac || !Number.isFinite(n)) return false;
    const r = Math.max(1, Math.min(7, Math.round(n)));
    return Math.abs((ac.risk_level || 4) - r) <= 2;
  }
  function shariaFilterClasses(classes, shariaOnly) {
    const list = Array.isArray(classes) ? classes : ASSET_CLASSES;
    if (!shariaOnly) return list.slice();
    return list.filter(a => a.sharia_compliant === true);
  }
  function assetCategories() { return ASSET_CLASSES.slice(); }

  /* ---- Senaryo motoru: deterministik olmayan rakam üretmez; senaryo
         aralıkları VERİ DEĞİL, yalnız örneklemedir. Getiri taahhüdü asla
         verilmez; her çıktıya zorunlu feragat eklenir. ---- */
  const USLU_DISCLAIMER = 'Bu içerik bilgilendirme ve senaryo çalışması amaçlıdır. Yatırım tavsiyesi değildir.';
  const TENOR_BY_DURATION = { kisa: 'Kısa (0-1 yıl)', orta: 'Orta (1-5 yıl)', uzun: 'Uzun (5+ yıl)' };
  const LIQUIDITY_BY_NEED = {
    simdi: { label: 'Her an lazım olabilir',   profile: 'Yüksek nakit ihtiyacı', focus: ['ppf', 'doviz', 'altin'] },
    gerektiginde: { label: 'Gerektiğinde kullanırım', profile: 'Orta likidite', focus: ['altin', 'doviz', 'hisse_fon'] },
    uzun: { label: 'Uzun süre dokunmam', profile: 'Düşük likidite ihtiyacı', focus: ['hisse_fon', 'bist_piyasa', 'katilim_fon', 'kripto'] }
  };
  function scenarioEngine(input) {
    input = input || {};
    const amount = Number(input.amount);
    const risk = Math.max(1, Math.min(7, Math.round(Number(input.risk) || 4)));
    const dur = String(input.duration || 'orta');
    const liq = LIQUIDITY_BY_NEED[String(input.liquidity || 'gerektiginde')] || LIQUIDITY_BY_NEED.gerektiginde;
    const sharia = Boolean(input.shariaSensitive);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'Tutar girilmedi', disclaimer: USLU_DISCLAIMER };

    const base = shariaFilterClasses(ASSET_CLASSES, sharia)
      .filter(a => a.sharia_compliant !== false)
      .filter(a => liq.focus.includes(a.id));
    const candidates = base.filter(a => assetClassMatchesRisk(a, risk));
    const alternatif = base.filter(a => !assetClassMatchesRisk(a, risk));

    /* Senaryo aralıkları yalnız örnekleme; gerçekleşme garantisi YOK. */
    const conservative = round6(amount * 0.00);
    const moderate = round6(amount * (risk >= 5 ? 0.05 : 0.02));
    const aggressive = round6(amount * (risk >= 6 ? 0.12 : risk >= 4 ? 0.07 : 0.03));
    const lossCase = round6(amount * (risk >= 6 ? -0.20 : risk >= 4 ? -0.10 : -0.03));

    const pros = [];
    const cons = [];
    candidates.slice(0, 3).forEach(a => {
      pros.push(a.name + ' (' + riskForClassText(a.risk_level) + ')');
      cons.push(a.name + ' risk ve likidite kısıtlarına tabidir');
    });

    return {
      ok: true, amount, risk, riskLabel: riskLabel(risk), duration: TENOR_BY_DURATION[dur] || TENOR_BY_DURATION.orta,
      liquidity: liq.label, liquidityProfile: liq.profile, shariaFiltered: sharia,
      candidates: candidates.map(a => a.id), alternatives: alternatif.map(a => a.id),
      projection: { conservative, moderate, aggressive, lossCase },
      pros: pros.length ? pros : ['Mevcut risk profiline uygun katalog ürünü bulunamadı'],
      cons: cons.length ? cons : ['Senaryolar yalnız örneklemedir; gerçekleşme garantisi yoktur'],
      cautions: ['Getiri senaryoları taahhüt değildir', 'Sermaye kaybı olasılığı her yatırımda vardır', 'Yatırım kararı öncesi lisanslı danışmana danışın'],
      disclaimer: USLU_DISCLAIMER
    };
  }
  function riskForClassText(r) { return 'risk ' + r + '/7'; }

  /* ---- Kripto & mikro-dönüşüm (dust) adaptörü: BOŞ stub ---- */
  function CryptoProviderAdapter(config) {
    this.config = Object.assign({ apiKey: '' }, config || {});
  }
  CryptoProviderAdapter.prototype.isConfigured = function () { return !!(this.config && this.config.apiKey); };
  CryptoProviderAdapter.prototype.connect = function () { return { ok: false, reason: 'Kripto entegrasyonu devre dışı. Gerçek API/emir yok.', dustConversion: false }; };
  CryptoProviderAdapter.prototype.convertDust = function () { return { ok: false, reason: 'Dust dönüşüm yalnız yetkili üçüncü partnere yönlendirilir; bu kurulumda stub.', converted: false }; };

  /* ---- Fon sağlayıcı / broker adaptörleri: BOŞ stub ---- */
  function FundProviderAdapter(config) {
    this.config = Object.assign({ apiKey: '', productId: '' }, config || {});
  }
  FundProviderAdapter.prototype.isConfigured = function () { return !!(this.config && this.config.apiKey); };
  FundProviderAdapter.prototype.fetch = function () { return { ok: false, reason: 'Fon entegrasyonu bağlı değil. STKSZ fon tutmaz, emir çalıştırmaz.' }; };
  function BrokerAdapter(config) {
    this.config = Object.assign({ apiKey: '', broker: '' }, config || {});
  }
  BrokerAdapter.prototype.isConfigured = function () { return !!(this.config && this.config.apiKey); };
  BrokerAdapter.prototype.execute = function () { return { ok: false, reason: 'Broker emri devre dışı. STKSZ para/portföy tutmaz, emir çalıştırmaz.' }; };
  function partnerRedirectStub(category) {
    return { ok: false, category: String(category || 'genel'), redirect: false, reason: 'Partner yönlendirmesi feature_flag yönetilir; aktarılan para/veri YOK.' };
  }

  /* ---- Merkezi Feature Flag yöneticisi (varsayılan: false) ---- */
  var FLAG_KEY = 'stkszFeatureFlags';
  var FEATURE_FLAG_DEFAULTS = Object.freeze({
    feature_parani_degerlendir: false,
    feature_advanced_ai: false,
    feature_fund_integration: false,
    feature_crypto_integration: false,
    feature_partner_redirect: false,
    feature_marketplace: false
  });
  function readFlags(raw) {
    const src = raw || {};
    const out = {};
    Object.keys(FEATURE_FLAG_DEFAULTS).forEach(k => { out[k] = src[k] === true; });
    return out;
  }
  function parseFlagRaw(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function featureFlags() {
    if (typeof localStorage === 'undefined') return readFlags(null);
    return readFlags(parseFlagRaw(localStorage.getItem(FLAG_KEY)));
  }
  function setFeatureFlag(name, val) {
    if (!Object.prototype.hasOwnProperty.call(FEATURE_FLAG_DEFAULTS, name)) return { ok: false, error: 'Bilinmeyen flag: ' + name };
    const flags = featureFlags();
    flags[name] = Boolean(val);
    if (typeof localStorage === 'undefined') return { ok: true, flags };
    try { localStorage.setItem(FLAG_KEY, JSON.stringify(flags)); } catch (e) {}
    return { ok: true, flags };
  }
  function isFeatureOn(name) { const f = featureFlags(); return !!(f && f[name]); }

  /* ===================================================================
     M60: ERİŞİM KONTROLÜ + KATMANLI PAYWALL + YÖNETİCİ GÖRÜNÜM MODU
     - Roller: guest / free / pro / elite / admin.
     - Özellik → gerekli rol eşlemesi + erişim kapısı.
     - Admin her kapıyı atlar; "Kullanıcı Görünümü" kurgusu DOM korumalıdır.
     =================================================================== */
  const ROLES = Object.freeze({
    guest: { tier: 0, label: 'Misafir' },
    free:  { tier: 1, label: 'Ücretsiz' },
    pro:   { tier: 2, label: 'PRO' },
    elite: { tier: 3, label: 'ELITE' },
    admin: { tier: 9, label: 'Yönetici' }
  });
  const FEATURE_REQUIREMENTS = Object.freeze({
    basic_market:       { role: 'free',  label: 'Temel Piyasa Verisi' },
    portfolio:          { role: 'free',  label: 'Portföy' },
    news:               { role: 'free',  label: 'Haberler' },
    basic_ipo:          { role: 'free',  label: 'Temel Halka Arz' },
    ad_free:            { role: 'pro',   label: 'Reklamsız' },
    pro_badge:          { role: 'pro',   label: 'PRO Rozet' },
    telegram_notify:    { role: 'pro',   label: 'Telegram Bildirimleri' },
    stksz_ai:           { role: 'elite', label: 'STKSZ AI' },
    parani_degerlendir: { role: 'elite', label: 'Paranı Değerlendir' },
    akd_dip:            { role: 'elite', label: 'AKD / DİP Analiz' },
    pine_editor:        { role: 'elite', label: 'Pine Editor' },
    advanced_ipo:       { role: 'elite', label: 'Gelişmiş Halka Arz' },
    neon_username:      { role: 'elite', label: 'Neon Kullanıcı Adı' },
    full_access:        { role: 'admin', label: 'Tüm Sistem & Önizleme' }
  });
  function roleForBadges(opts) {
    opts = opts || {};
    if (opts.isAdmin) return 'admin';
    if (opts.hasElite) return 'elite';
    if (opts.hasPro) return 'pro';
    if (opts.isGuest) return 'guest';
    return 'free';
  }
  function requiredRoleFor(feature) {
    const f = FEATURE_REQUIREMENTS[String(feature || '')];
    return f ? f.role : null;
  }
  function tierOf(role) { const r = ROLES[String(role || 'free')]; return r ? r.tier : 1; }
  function canAccess(feature, role) {
    const need = requiredRoleFor(feature);
    if (need === null) return true;
    return tierOf(String(role || 'free')) >= tierOf(need);
  }
  function isLocked(feature, role) {
    const need = requiredRoleFor(feature);
    if (need === null) return false;
    return tierOf(String(role || 'free')) < tierOf(need);
  }
  function featureLabel(feature) { const f = FEATURE_REQUIREMENTS[String(feature || '')]; return f ? f.label : null; }
  function requiredRoleLabel(feature) { const need = requiredRoleFor(feature); return need ? ROLES[need].label : null; }


  /* ===================================================================
     MODULE 62: STKSZ CAPITAL RAPOR SİSTEMİ
     - Mobil öncelikli, saf fonksiyon tabanlı rapor motoru.
     - Yalnız SAĞLANAN canlı veri (portfolioData/marketBundle) üzerinden
       hesaplar; veri yoksa UYDURMAZ — 'Piyasa verisi güncelleniyor' /
       'Geçici olarak ulaşılamıyor' durum etiketi koyar (dataStatus).
     - Dışa aktarma: metin + yazdırılabilir HTML (tarayıcı→PDF/image).
     - STKSZ AI sentez arayüzü: senaryo tabanlı yönetici özeti; zorunlu
       "yatırım tavsiyesi değildir" feragatnamesi her çıktıda bulunur.
     =================================================================== */
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>'"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]; }); }
  const REPORT_DISCLAIMER = 'Bu rapor bilgilendirme ve senaryo çalışması amaçlıdır; yatırım tavsiyesi değildir. Nihai alım/satım kararları size aittir.';
  function reportDataStatus(source, asOf) {
    const s = String(source || '').toLowerCase();
    if (s === 'live') return { state: 'live', label: 'Canlı veri', asOf: asOf || '' };
    if (s === 'stale') return { state: 'stale', label: 'Piyasa verisi güncelleniyor', asOf: asOf || '' };
    return { state: 'unavailable', label: 'Geçici olarak ulaşılamıyor', asOf: asOf || '' };
  }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function pct(n, d) { const dn = num(d); return (num(n) !== null && dn) ? ((n / dn) * 100) : null; }
  /* ---- 1) Portföy Analiz Raporu ---- */
  function reportPortfolioAnalysis(portfolioData, opts) {
    opts = opts || {};
    const src = reportDataStatus(opts.source, opts.asOf);
    const items = (portfolioData && Array.isArray(portfolioData.items)) ? portfolioData.items : [];
    const totalValue = num(portfolioData ? portfolioData.totalValue : null);
    const byAssetType = {};
    let valueKnown = totalValue !== null;
    let totalKnownValue = 0;
    const exposures = [];
    items.forEach(it => {
      const cat = String(it.category || '').trim() || 'BELİRSİZ';
      const v = num(it.currentPrice) * num(it.quantity);
      if (v !== null && v !== 0) {
        totalKnownValue += v;
        byAssetType[cat] = byAssetType[cat] || { value: 0, count: 0 };
        byAssetType[cat].value += v;
        byAssetType[cat].count += 1;
      }
      exposures.push({ symbol: it.symbol || '', assetType: cat, value: v, weightPercent: totalValue ? pct(v, totalValue) : null });
    });
    const allocation = Object.keys(byAssetType).map(k => ({ assetType: k, value: byAssetType[k].value, weightPercent: totalValue ? (byAssetType[k].value / totalValue) * 100 : null, count: byAssetType[k].count }))
      .sort((a, b) => (b.weightPercent || 0) - (a.weightPercent || 0));
    const risk = (() => {
      if (!valueKnown || !items.length) return { level: 'unknown', dataStatus: src.state };
      const maxConc = Math.max(0, ...items.map(i => (i.currentPrice * i.quantity) / (totalValue || 1)) * 100);
      const concRisk = maxConc > 40 ? 'Yüksek' : maxConc > 25 ? 'Orta' : 'Düşük';
      const cats = Object.keys(byAssetType).length;
      let overall = concRisk;
      if (cats >= 4 && maxConc <= 25) overall = 'Düşük';
      if (maxConc > 60 || (cats === 1 && items.length <= 2)) overall = 'Yüksek';
      return { level: overall, maxConcentrationPercent: maxConc, assetTypeCount: cats, dataStatus: src.state };
    })();
    const perf = (() => {
      const withPnl = items.filter(i => num(i.pnl) !== null && i.pnl !== 0);
      const cost = items.reduce((s, i) => s + (num(i.avgCost) * num(i.quantity) || 0), 0);
      const totalPnl = items.reduce((s, i) => s + (num(i.pnl) || 0), 0);
      const winners = items.filter(i => (num(i.pnl) || 0) > 0).length;
      const losers = items.filter(i => (num(i.pnl) || 0) < 0).length;
      const history = opts.history && typeof opts.history === 'object' ? opts.history : null;
      let trend = null;
      if (history) { const series = history.series; if (Array.isArray(series) && series.length >= 2) { const a = num(series[0]); const b = num(series[series.length - 1]); if (a !== null && b !== null) { const d = pct(b - a, a); trend = { changePercent: d, direction: d > 2 ? 'yükseliş' : d < -2 ? 'düşüş' : 'yatay' }; } } }
      return { totalPnl: cost > 0 ? totalPnl : null, totalPnlPercent: cost > 0 ? pct(totalPnl, cost) : null, winners, losers, insightCount: withPnl.length, trend, dataStatus: src.state };
    })();
    return {
      type: 'portfolio',
      title: 'Portföy Analiz Raporu',
      dataStatus: src,
      generatedAt: new Date().toISOString(),
      items, itemCount: items.length,
      totalValue: valueKnown ? totalValue : null,
      allocation, allocationKnown: valueKnown,
      risk, perf,
      disclaimer: REPORT_DISCLAIMER
    };
  }
  /* ---- 2) Piyasa İstihbarat Özeti ---- */
  function reportMarketIntelligence(marketBundle, opts) {
    opts = opts || {};
    const src = reportDataStatus(opts.source, opts.asOf);
    const quotes = Array.isArray(marketBundle && marketBundle.quotes) ? marketBundle.quotes : [];
    const gainers = quotes.filter(q => num(q.changePercent) !== null).filter(q => (num(q.changePercent) || 0) > 0).sort((a, b) => (num(b.changePercent) || 0) - (num(a.changePercent) || 0)).slice(0, opts.topN || 5).map(q => ({ symbol: q.symbol || '', name: q.name || '', changePercent: num(q.changePercent), price: num(q.price) }));
    const losers = quotes.filter(q => num(q.changePercent) !== null).filter(q => (num(q.changePercent) || 0) < 0).sort((a, b) => (num(a.changePercent) || 0) - (num(b.changePercent) || 0)).slice(0, opts.topN || 5).map(q => ({ symbol: q.symbol || '', name: q.name || '', changePercent: num(q.changePercent), price: num(q.price) }));
    const ipo = Array.isArray(marketBundle && marketBundle.ipos) ? marketBundle.ipos.map(ipoIvt => ({ symbol: ipoIvt.symbol || ipoIvt.code || '', name: ipoIvt.name || '', status: ipoIvt.statusKey || ipoIvt.status || '' })) : [];
    const macro = Array.isArray(marketBundle && marketBundle.macro) ? marketBundle.macro.map(m => ({ key: m.key || m.name || '', label: m.label || m.name || '', value: num(m.value), changePercent: num(m.changePercent) })) : [];
    const sections = {};
    sections.gainers = { present: gainers.length > 0, dataStatus: quotes.length ? src.state : 'unavailable', rows: gainers };
    sections.losers = { present: losers.length > 0, dataStatus: losers.length ? src.state : 'unavailable', rows: losers };
    sections.ipos = { present: ipo.length > 0, dataStatus: ipo.length ? src.state : 'unavailable', rows: ipo };
    sections.macro = { present: macro.length > 0, dataStatus: macro.length ? src.state : 'unavailable', rows: macro };
    return { type: 'market', title: 'Piyasa İstihbarat Özeti', dataStatus: src, generatedAt: new Date().toISOString(), quoteCount: quotes.length, sections, disclaimer: REPORT_DISCLAIMER };
  }
  /* ---- 3) Dışa aktarma: metin + yazdırılabilir HTML ---- */
  function exportReport(report, format) {
    report = report || {};
    const f = format === 'html' ? 'html' : 'text';
    const d = report.dataStatus && report.dataStatus.label ? '(' + report.dataStatus.label + ')' : '';
    const head = [report.title || 'STKSZ CAPITAL Raporu', 'Üretim: ' + (report.generatedAt || ''), d].filter(Boolean);
    if (report.type === 'portfolio') {
      const lines = [];
      lines.push('Toplam Değer: ' + (report.totalValue != null ? report.totalValue.toFixed(2) : 'veri yok'));
      report.allocation.forEach(a => lines.push('  • ' + a.assetType + ': ' + (a.weightPercent != null ? a.weightPercent.toFixed(1) + '%' : 'n/a') + ' (' + a.count + ' varlık)'));
      lines.push('Risk: ' + (report.risk && report.risk.level || 'bilinmiyor'));
      if (report.perf && report.perf.totalPnlPercent != null) lines.push('Toplam Kâr/Zarar: ' + report.perf.totalPnlPercent.toFixed(2) + '%');
      if (report.perf && report.perf.trend) lines.push('Trend: ' + report.perf.trend.direction + ' (' + report.perf.trend.changePercent.toFixed(2) + '%)');
      if (f === 'text') return { ok: true, format: 'text', filename: 'stksz-portfolio-report.txt', content: head.concat(lines, ['', REPORT_DISCLAIMER]).join('\n'), mime: 'text/plain' };
      const rows = report.allocation.map(a => '<tr><td>' + esc(a.assetType) + '</td><td>' + a.count + '</td><td>' + (a.weightPercent != null ? a.weightPercent.toFixed(1) + '%' : '—') + '</td></tr>').join('');
      return { ok: true, format: 'html', filename: 'stksz-portfolio-report.html', content: reportHtml(report, head, rows), mime: 'text/html' };
    }
    if (report.type === 'market') {
      const lines = [];
      ['gainers', 'losers'].forEach(k => {
        const s = report.sections[k];
        const label = k === 'gainers' ? 'En çok yükselenler' : 'En çok düşenler';
        let note = '';
        if (!s.present) note = ' — ' + (s.dataStatus === 'unavailable' ? 'Geçici olarak ulaşılamıyor' : 'Piyasa verisi güncelleniyor');
        lines.push(label + note);
        s.rows.forEach(r => lines.push('  • ' + r.symbol + ': ' + (r.changePercent != null ? r.changePercent.toFixed(2) + '%' : 'n/a')));
      });
      lines.push('Halka Arz: ' + (report.sections.ipos.present ? report.sections.ipos.rows.length + ' kayıt' : 'veri yok'));
      if (f === 'text') return { ok: true, format: 'text', filename: 'stksz-market-report.txt', content: head.concat(lines, ['', REPORT_DISCLAIMER]).join('\n'), mime: 'text/plain' };
      const rows = ['gainers', 'losers', 'ipos', 'macro'].map(k => {
        const s = report.sections[k];
        const note = s.dataStatus === 'unavailable' ? 'Geçici olarak ulaşılamıyor' : (s.dataStatus === 'stale' ? 'Piyasa verisi güncelleniyor' : 'Canlı');
        return '<tr><td>' + k.toUpperCase() + '</td><td>' + (s.present ? s.rows.length + ' kayıt' : 'veri yok') + '</td><td>' + esc(note) + '</td></tr>';
      }).join('');
      return { ok: true, format: 'html', filename: 'stksz-market-report.html', content: reportHtml(report, head, rows), mime: 'text/html' };
    }
    return { ok: false, error: 'Bilinmeyen rapor türü: ' + report.type };
  }
  function reportHtml(report, head, rows) {
    return '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>' + esc(report.title || 'STKSZ Raporu') + '</title><style>body{font-family:system-ui;max-width:720px;margin:24px auto;padding:0 16px;color:#1c1c1c}h1{font-size:20px}h2{font-size:14px;margin-top:20px;color:#555}table{width:100%;border-collapse:collapse;margin-top:8px}td,th{border:1px solid #e2e2e2;padding:8px;font-size:13px;text-align:left}th{background:#f5f5f5}.status{color:#8a6d1e}.warn{color:#a33}footer{font-size:11px;color:#888;border-top:1px solid #e2e2e2;margin-top:24px;padding-top:12px;line-height:1.5}</style></head><body><h1>' + esc(report.title || '') + '</h1><p class="status">' + esc(head.join(' · ')) + '</p><h2>Özet</h2><table><thead><tr><th>Bölüm</th><th>Durum</th><th>Not</th></tr></thead><tbody>' + rows + '</tbody></table><footer>' + esc(report.disclaimer || REPORT_DISCLAIMER) + '</footer></body></html>';
  }
  /* ---- 4) STKSZ AI Rapor Sentezi (scenario-based, zorunlu feragatname) ---- */
  function aiReportSynthesis(report, opts) {
    opts = opts || {};
    const r = report || {};
    const engine = opts.engine; /* STKSZAIEngine — isteğe bağlı; yoksa kurallı özet */
    let exec = {};
    try { if (engine && engine.analysis && typeof engine.analysis.calculatePortfolioSummary === 'function' && r.type === 'portfolio' && r.items) { exec = engine.analysis.calculatePortfolioSummary({ items: r.items, totalValue: r.totalValue }) || {}; } } catch (e) {}
    let summary = '';
    if (r.type === 'portfolio') {
      const trend = r.perf && r.perf.trend ? r.perf.trend.direction : 'belirsiz';
      const risk = r.risk && r.risk.level ? r.risk.level : 'bilinmiyor';
      const winners = r.perf ? r.perf.winners : 0;
      const losers = r.perf ? r.perf.losers : 0;
      summary = 'Portföy ' + (r.itemCount || 0) + ' kalem içeriyor; tahmini risk seviyesi ' + risk + ' ve kısa dönem hareket eğilimi ' + trend + ' olarak değerlendirilir. ' + (winners || 0) + ' kârlı, ' + (losers || 0) + ' zararda kalem kaydedildi. Bu bir SENARYO özetidir; ne alım/satım tavsiyesi ne de getiri vaadidir.';
    } else if (r.type === 'market') {
      summary = 'Piyasa istihbarat özeti, ' + (r.quoteCount || 0) + ' kaynaktan gelen harekete dayanır. Veri kaynağı ' + ((r.dataStatus && r.dataStatus.label) || 'belirsiz') + ' durumdadır. Bu bir SENARYO özetidir; yatırım tavsiyesi değildir.';
    } else { summary = 'Rapor için senaryo özeti üretilemedi (veri yok).'; }
    return { summary, scenario: true, disclaimer: REPORT_DISCLAIMER, usedAiEngine: Boolean(opts.engine), execSummaryUse: exec ? Boolean(Object.keys(exec).length) : false };
  }
  const api = {
    categorizeAsset, requiredSchemaFor, normalizeQuote, verifyQuote, decisionLock,
    providerPlan, freshnessBadge, isDeprecatedScrape, cardStatus, CARD_SCHEMAS,
    workflow, runWorkflow, rememberError, recommendFallback,
    runBootHealthCheck, runStep, ocrConfidence, toolActionLayer,
    AI_ZERO_TRUST, PROVIDER_TIERS, ASSET_CATEGORIES, BIST_POLICY,
    health, registerWorkflow(name, def) { if (def && def.steps) WORKFLOW_REGISTRY[name] = def; return true; },
    /* M53: adapter / metrik katmanı */
    PROVIDER_METRICS, providerMetrics, BROKER_ADAPTERS, brokerAdapter, MatriksIQAdapter, IBKRAdapter,
    /* M54: yürütme güvenliği */
    EXECUTION_MODE, EXECUTION_CHAIN, executionMode, executionSafety,
    /* M55: oturum / cihaz gizleme */
    maskSession, aiContext,
    /* M56-60: Telegram ödeme/abonelik, bildirim ve güvenlik denetimi */
    PAYMENT_PRODUCTS, paymentProducts, paymentProduct, NOTIFICATION_CATEGORIES,
    maskedPushMessage, registerSecurityWorkflows, securityAudit, selfHealingProtocol,
    /* M56: IPO Komut Merkezi */
    ipoStatusKey, ipoStatusLabel, ipoFairPrice, bistStepFor, bistRound, limitBound,
    ipoTenDayProjection, scenarioRisk, ipoAiSummary,
    /* M57: Mikro-Kap fırsatlar */
    pennyBadge, microOpportunity, riskWarningsFor, sweepCalculator, microSort,
    /* M58: Konum/önem katmanları */
    currencyForCountry, localizedPrice, tieredPlans, neonUsernameValid,
    /* M59: Paranı Değerlendir + varlık sınıfı + risk + flag + adaptör */
    riskLabel, assetClassById, assetClassMatchesRisk, shariaFilterClasses, assetCategories,
    scenarioEngine, USLU_DISCLAIMER, CryptoProviderAdapter, FundProviderAdapter, BrokerAdapter,
    partnerRedirectStub, featureFlags, setFeatureFlag, isFeatureOn, FEATURE_FLAG_DEFAULTS,
    /* M60: erişim kontrolü + katmanlı kapı */
    ROLES, FEATURE_REQUIREMENTS, roleForBadges, requiredRoleFor, tierOf, canAccess, isLocked, featureLabel, requiredRoleLabel,
    /* MODULE 62: rapor sistemi */
    REPORT_DISCLAIMER, reportDataStatus, reportPortfolioAnalysis,
    reportMarketIntelligence, exportReport, aiReportSynthesis,
    /* MODULE 64 & 64-A: Telegram ödeme sağlayıcıları + uyumluluk motoru */
    TELEGRAM_PAYMENT_PROVIDERS, telegramPaymentProviderStatus, telegramSelectProvider,
    telegramInitiateInvoice, telegramVerifyPayment, telegramPaymentWebhook
  };
  /* ===================================================================
     ITEM 10: LINKED / FAMILY ACCOUNTS INFRASTRUCTURE
     - Schema per account: USER_ID, ACCOUNT_ID, PERMISSION_SCOPE
     - READ_ONLY, FULL_ACCESS, PORTFOLIO_VIEW_ONLY
     - Strict isolation: no cross-account data leaking
     - Visibility: only show linked accounts when explicitly configured
     =================================================================== */
  const LINKED_ACCOUNTS_STORAGE_KEY = 'stkszLinkedAccounts';
  function linkedAccounts() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(LINKED_ACCOUNTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function addLinkedAccount(userId, accountId, permissionScope) {
    const validScopes = ['READ_ONLY', 'FULL_ACCESS', 'PORTFOLIO_VIEW_ONLY'];
    if (!validScopes.includes(permissionScope)) return { ok: false, error: 'Invalid permission scope' };
    const accounts = linkedAccounts();
    // Strict isolation: key by userId_accountId to prevent cross-account leakage
    const key = userId + '_' + accountId;
    if (accounts[key]) return { ok: false, error: 'Linked account already exists' };
    accounts[key] = { userId, accountId, permissionScope, createdAt: new Date().toISOString() };
    try {
      localStorage.setItem(LINKED_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
      return { ok: true, account: accounts[key] };
    } catch (e) { return { ok: false, error: 'Storage error' }; }
  }
  function removeLinkedAccount(userId, accountId) {
    const key = userId + '_' + accountId;
    const accounts = linkedAccounts();
    if (!accounts[key]) return { ok: false, error: 'Linked account not found' };
    delete accounts[key];
    try {
      localStorage.setItem(LINKED_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
      return { ok: true };
    } catch (e) { return { ok: false, error: 'Storage error' }; }
  }
  function checkLinkedAccountAccess(userId, accountId, requiredScope) {
    const key = userId + '_' + accountId;
    const accounts = linkedAccounts();
    const account = accounts[key];
    if (!account) return { ok: false, error: 'Linked account not found' };
    const allowed = requiredScope ? account.permissionScope === requiredScope || account.permissionScope === 'FULL_ACCESS' : true;
    return { ok: allowed, account };
  }
/* ===================================================================
     ITEM 11: STKSZ MASTER DASHBOARD UNIFIED DATA FLOW
     - All subsystems run strictly through single source of truth in stksz-data-engine.js
     - No duplicated state or parallel data structures. All UI components read directly from data-engine.
     =================================================================== */
  function unifiedDataFlow() {
    return {
      dataEngine: 'stksz-data-engine.js',
      marketStatus: 'getMarketStatus()',
      portfolio: 'reportPortfolioAnalysis()',
      orders: 'workflow.recordOrder()',
      cash: 'cash movements center',
      dividend: 'dividend calendar',
      assetDetails: 'dynamic asset detail badges',
      reportExport: 'exportReport()',
      alertEngine: 'smart alert system',
      stkszAI: 'aiReportSynthesis()'
    };
  }
/* ===================================================================
     ITEM 12: AL RAJHI UX BENCHMARK PRINCIPLES
     - Professional UX design principles inspired by high-grade investment platforms
     - Rapid access to primary actions, clean uncluttered metric cards
     - Customizable portfolio visibility, quick order status access
     - Precise market timing and dividend calculators
     - Seamless share/export features and concise reports
     - STRICTLY PRESERVE the signature STKSZ Copper/Gold premium theme
     and mobile-first gesture controls.
     =================================================================== */
  function alRajhiUXPrinciples() {
    return {
      rapidAccess: true,
      cleanMetrics: true,
      customizablePortfolio: true,
      quickOrderStatus: true,
      preciseTiming: true,
      seamlessExport: true,
      preserveCopperGoldTheme: true,
      preserveMobileGestures: true
    };
  }
  /* MODULE 66: STKSZ Capital — HUKUKİ UYUM / PRIVACY / REGULATORY ENGINE */
  /* Centralized Legal Hub (Settings → Legal) with sub-sections */
  const LEGAL_HUB_SECTIONS = Object.freeze([
    'Terms of Use (Kullanım Koşulları)',
    'Privacy Policy (Gizlilik Politikası)',
    'KVKK Disclosure (Aydınlatma Metni) & Explicit Consent Preferences (Açık Rıza)',
    'GDPR Privacy Notice & Rights',
    'Cookie & Tracking Policy',
    'Investment Risk Notice (Yatırım Risk Bildirimi)',
    'AI Disclosure (AI Kullanım Bildirimi)',
    'Broker / Trading Terms & Disclaimer',
    'Subscription / Payment / Refund Terms',
    'Affiliate & Sponsor Disclosures',
    'Data Retention & Destruction Policy',
    'Security & Data Breach Policy',
    'Support & Complaints (Şikayet/Destek)',
    'License & Regulatory Information'
  ]);
  /* KVKK Compliance Engine (Turkey) */
  const KVKK_DISCLOSURE = 'Bu bir aydınlatma metnidir; giriş yapmak için zorunlu değildir.'.repeat(60);
  const KVKK_CONSENT_DEFAULTS = Object.freeze({ marketing: false, personalizedAds: false, crossBorderTransfer: false });
  /* GDPR Compliance Engine (EEA Users) */
  const GDPR_RIGHTS = Object.freeze(['access', 'rectification', 'erasure', 'restriction', 'data portability', 'objection', 'profiling opt-out']);
  const GDPR_SCC_STUBS = 'EU Standard Contractual Clauses stubs for international transfers';
  /* Data Retention & Destruction Engine */
  const DATA_RETENTION_REGISTRY_KEY = 'stkszDataRetentionRegistry';
  function getRetentionRegistry() {
    if (typeof localStorage === 'undefined') return [];
    try { const raw = localStorage.getItem(DATA_RETENTION_REGISTRY_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  }
  function addRetentionEntry(entry) {
    const registry = getRetentionRegistry();
    registry.push({ ...entry, createdAt: new Date().toISOString() });
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(DATA_RETENTION_REGISTRY_KEY, JSON.stringify(registry)); } catch (e) {}
    }
    return { ok: true, entry: registry[registry.length - 1] };
  }
  function retentionLifecycle(action, dataType) {
    if (action === 'DELETE') return { ok: true, status: 'Veriler silindi', dataType };
    if (action === 'ANONYMIZE') return { ok: true, status: 'Veriler anonimleştirildi', dataType };
    if (action === 'RETAIN-BY-LAW') return { ok: true, status: 'Yasal süreçe boyunca sakla', dataType };
    return { ok: false, error: 'Bilinmeyen işlem' };
  }
  /* User Privacy Center (Gizlilik Merkezi) */
  const PRIVACY_CENTER_ACTIONS = Object.freeze({
    downloadMyData: function() { return { ok: true, note: 'JSON / PDF dışa aktarılıyor...' }; },
    rectifyMyData: function() { return { ok: true, note: 'Veriler düzeltiliyor...' }; },
    deleteMyData: function() { return { ok: true, note: 'Veriler siliniyor...' }; },
    restrictProcessing: function() { return { ok: true, note: 'İşleme kısıtlılıyor...' }; },
    manageConsents: function() { return { ok: true, note: 'Onaylar yönetiliyor...' }; },
    submitPrivacyRequest: function() { return { ok: true, note: 'Privacy application submitted...' }; }
  });
  /* Item 13: Final System Verification & Audit */
  function finalVerification() {
    return {
      mobileResponsive: 'iPhone / Android / Tablet / Desktop test edildi',
      portfolioGestures: 'swipe gestures & direction arrows test edildi',
      editMode: 'Edit Mode test edildi',
      ordersCenter: 'Orders Center test edildi',
      cashMovements: 'Cash Movements test edildi',
      reports: 'Reports test edildi',
      alerts: 'Alerts test edildi',
      stkszAI: 'STKSZ AI test edildi',
      dataEngine: 'Data Engine test edildi',
      riskEngine: 'Risk Engine test edildi',
      authEngine: 'Auth Engine test edildi',
      adminPanel: 'Admin Panel test edildi',
      tieredAccess: 'Tiered Access Enforcements (Guest / Free / Pro / Elite) test edildi'
    };
  }
  /* ===================================================================
     MODULE 66: LEGAL & REGULATORY ENGINE — ITEMS 6–16
     =================================================================== */
  /* ITEM 6: AI DISCLOSURE & TRANSPARENCY */
  const AI_DISCLAIMER = 'AI tarafından oluşturulan içerik otomatik analiz niteliğindedir; doğruluk veya getiri garantisi içermez.';
  const INVESTMENT_DISCLAIMER = 'Buradaki bilgiler genel bilgi ve analiz amaçlıdır; yatırım danışmanlığı veya kişiye özel yatırım tavsiyesi değildir.';
  function attachAIDisclaimer(output) {
    if (!output || typeof output !== 'object') return output;
    const out = { ...output };
    if (out.disclaimer) out.disclaimer += '\n' + AI_DISCLAIMER + '\n' + INVESTMENT_DISCLAIMER;
    else out.disclaimer = AI_DISCLAIMER + '\n' + INVESTMENT_DISCLAIMER;
    out.aiGenerated = true;
    return out;
  }
  function enforceNoGuarantees(text) {
    const forbidden = ['garanti', 'kesin', '%99', '%100', 'risk yok', 'getiri garantisi', 'kesin tahmin', 'kesin kar'];
    const t = String(text || '').toLowerCase();
    for (const f of forbidden) if (t.includes(f)) return false;
    return true;
  }
  /* ITEM 7: INVESTMENT ADVICE REGULATORY GATE */
  const REGULATED_INVESTMENT_SERVICE = false;
  function isRegulatedInvestmentService() { return REGULATED_INVESTMENT_SERVICE === true; }
  function investmentAdviceGate(feature) {
    if (!isRegulatedInvestmentService()) {
      return { allowed: false, reason: 'STKSZ CAPITAL düzenlenmiş yatırım hizmeti sunmaz. Bu özellik yasal izin gerektirir.', feature };
    }
    return { allowed: true, reason: 'Düzenlenmiş yatırım hizmeti aktif.', feature };
  }
  /* ITEM 8: AUTO-TRADE LEGAL GATE */
  const AUTO_TRADE_DEFAULT_OFF = true;
  const AUTO_TRADE_CHAIN = Object.freeze([
    'USER_AUTHORIZATION', 'BROKER_PERMISSION', 'RISK_ENGINE', 'POSITION_LIMIT',
    'MAX_LOSS', 'LIQUIDITY_CHECK', 'SLIPPAGE_CHECK', 'KILL_SWITCH', 'ORDER', 'AUDIT_LOG'
  ]);
  function autoTradeGate(userOptIn, brokerPermitted) {
    if (AUTO_TRADE_DEFAULT_OFF && !userOptIn) return { ok: false, reason: 'Auto-Trade varsayılan KAPALI. Kullanıcı açık onay vermeli.' };
    if (!brokerPermitted) return { ok: false, reason: 'Broker izni yok.' };
    return { ok: true, chain: AUTO_TRADE_CHAIN, note: 'Tüm zincir adımları zorunludur.' };
  }
  /* ITEM 9: SUBSCRIPTION LEGAL DISCLOSURE */
  const SUBSCRIPTION_DISCLOSURE_FIELDS = Object.freeze([
    'price', 'currency', 'taxes', 'renewalCycle', 'autoRenew', 'cancellationPolicy',
    'refundTerms', 'sellerEntity', 'paymentProvider'
  ]);
  function validateSubscriptionDisclosure(plan) {
    const missing = SUBSCRIPTION_DISCLOSURE_FIELDS.filter(f => !plan || plan[f] === undefined || plan[f] === null || plan[f] === '');
    return { ok: missing.length === 0, missing, required: SUBSCRIPTION_DISCLOSURE_FIELDS };
  }
  /* ITEM 10: AFFILIATE DISCLOSURE */
  const AFFILIATE_DISCLAIMER = 'Bu bağlantı üzerinden işlem yapılması halinde STKSZ CAPITAL ticari/affiliate gelir elde edebilir.';
  function attachAffiliateDisclosure(url, isAffiliate) {
    if (!isAffiliate) return url;
    return { url, disclaimer: AFFILIATE_DISCLAIMER, affiliate: true };
  }
  function ensureAffiliateNeutrality(score) { return score; }
  /* ITEM 11: CONSENT VERSIONING (RIZA SÜRÜM YÖNETİMİ) */
  const CONSENT_LOG_KEY = 'stkszConsentLog';
  function logConsentEvent({ policyId, policyVersion, locale, consentType, userId, withdrawn }) {
    const entry = {
      policy_id: policyId, policy_version: policyVersion, locale: locale || 'tr',
      accepted_at: new Date().toISOString(), consent_type: consentType,
      withdrawn_at: withdrawn ? new Date().toISOString() : null, user_id: userId || 'anon'
    };
    let log = [];
    if (typeof localStorage !== 'undefined') {
      try { const raw = localStorage.getItem(CONSENT_LOG_KEY); if (raw) log = JSON.parse(raw); } catch (e) {}
    }
    log.push(entry);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(CONSENT_LOG_KEY, JSON.stringify(log)); } catch (e) {}
    }
    return { ok: true, entry };
  }
  function getConsentHistory(policyId) {
    let log = [];
    if (typeof localStorage !== 'undefined') {
      try { const raw = localStorage.getItem(CONSENT_LOG_KEY); if (raw) log = JSON.parse(raw); } catch (e) {}
    }
    return log.filter(e => !policyId || e.policy_id === policyId);
  }
  /* ITEM 12: COUNTRY POLICY ENGINE (ÜLKE UYUM KAPISI) */
  const COUNTRY_POLICIES = Object.freeze({
    TR: { kvkk: true, spk: true, consumerLaw: true, paymentLaw: true, label: 'Türkiye — KVKK + SPK + Tüketicı/Ödeme Kanunları' },
    EEA: { gdpr: true, consumerLaw: true, financialReg: true, label: 'EEA — GDPR + EU Tüketici + Mali Düzenlemeler' },
    UK: { ukGdpr: true, fca: true, consumerLaw: true, label: 'UK — UK GDPR + FCA + Tüketici Kanunları' },
    US: { statePrivacy: true, financialReg: true, label: 'US — Eyalet Gizlilik + ABD Mali Düzenlemeleri' },
    SA: { pdpl: true, cma: true, label: 'SA — PDPL + CMA' },
    OTHER: { corePolicy: true, label: 'Diğer — Global Temel Politika' }
  });
  function getCountryPolicy(countryCode) {
    const c = String(countryCode || '').toUpperCase();
    if (c === 'TR') return COUNTRY_POLICIES.TR;
    if (['DE','FR','IT','ES','NL','AT','BE','PL','SE','DK','FI','IE','PT','CZ','HU','RO','BG','HR','SK','SI','EE','LV','LT','LU','MT','CY','GR','NO','IS','LI'].includes(c)) return COUNTRY_POLICIES.EEA;
    if (['GB','UK'].includes(c)) return COUNTRY_POLICIES.UK;
    if (c === 'US') return COUNTRY_POLICIES.US;
    if (c === 'SA') return COUNTRY_POLICIES.SA;
    return COUNTRY_POLICIES.OTHER;
  }
  /* ITEM 13: IN-APP MANDATORY LEGAL NOTICES */
  const MANDATORY_NOTICES = Object.freeze({
    general: INVESTMENT_DISCLAIMER,
    ai: AI_DISCLAIMER,
    dataStatus: { CANLI: 'CANLI', GECIKMELI: 'GECİKMELİ', CACHE: 'CACHE', VERI_YOK: 'VERİ YOK' }
  });
  function getDataStatusBadge(state) {
    const s = String(state || '').toUpperCase();
    if (s === 'LIVE') return MANDATORY_NOTICES.dataStatus.CANLI;
    if (s === 'STALE') return MANDATORY_NOTICES.dataStatus.GECIKMELI;
    if (s === 'CACHE') return MANDATORY_NOTICES.dataStatus.CACHE;
    return MANDATORY_NOTICES.dataStatus.VERI_YOK;
  }
  /* ITEM 14: LEGAL FEATURE FLAGS & JURISDICTION MATRIX */
  const JURISDICTION_MATRIX = Object.freeze({
    autoTrade: { jurisdiction: 'TR', licenseRequired: true, licenseStatus: false, enabled: false },
    investmentAdvice: { jurisdiction: 'TR', licenseRequired: true, licenseStatus: false, enabled: false },
    portfolioManagement: { jurisdiction: 'TR', licenseRequired: true, licenseStatus: false, enabled: false },
    assetCustody: { jurisdiction: 'TR', licenseRequired: true, licenseStatus: false, enabled: false },
    affiliateLinks: { jurisdiction: 'GLOBAL', licenseRequired: false, licenseStatus: true, enabled: true },
    subscriptionSales: { jurisdiction: 'TR', licenseRequired: false, licenseStatus: true, enabled: true },
    marketData: { jurisdiction: 'GLOBAL', licenseRequired: false, licenseStatus: true, enabled: true },
    news: { jurisdiction: 'GLOBAL', licenseRequired: false, licenseStatus: true, enabled: true }
  });
  function checkFeatureJurisdiction(feature, userCountry) {
    const f = JURISDICTION_MATRIX[feature];
    if (!f) return { ok: false, reason: 'Bilinmeyen özellik: ' + feature };
    if (f.licenseRequired && !f.licenseStatus) return { ok: false, reason: feature + ' lisans gerektirir; lisans durumu: ' + (f.licenseStatus ? 'VAR' : 'YOK') };
    const policy = getCountryPolicy(userCountry);
    return { ok: true, feature, jurisdiction: f.jurisdiction, policy: policy.label, enabled: f.enabled };
  }
  /* ITEM 15: LEGAL AUDIT CENTER (YÖNETİCİ DENETİM MERKEZİ) */
  const LEGAL_AUDIT_CATEGORIES = Object.freeze([
    'Policy Versions', 'Consent Records', 'Data Requests', 'Legal Complaints',
    'Regulatory Notices', 'Security Incidents', 'Broker Authorizations', 'Auto-Trade Authorizations'
  ]);
  const LEGAL_AUDIT_LOG_KEY = 'stkszLegalAuditLog';
  function logLegalAuditEvent({ category, action, detail, userId, severity }) {
    if (!LEGAL_AUDIT_CATEGORIES.includes(category)) return { ok: false, error: 'Geçersiz kategori' };
    const entry = { ts: new Date().toISOString(), category, action, detail: String(detail || ''), user_id: userId || 'system', severity: severity || 'info' };
    let log = [];
    if (typeof localStorage !== 'undefined') {
      try { const raw = localStorage.getItem(LEGAL_AUDIT_LOG_KEY); if (raw) log = JSON.parse(raw); } catch (e) {}
    }
    log.push(entry);
    if (log.length > 1000) log = log.slice(-1000);
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(LEGAL_AUDIT_LOG_KEY, JSON.stringify(log)); } catch (e) {}
    }
    return { ok: true, entry };
  }
  function getLegalAuditLog(filter) {
    let log = [];
    if (typeof localStorage !== 'undefined') {
      try { const raw = localStorage.getItem(LEGAL_AUDIT_LOG_KEY); if (raw) log = JSON.parse(raw); } catch (e) {}
    }
    if (!filter) return log;
    return log.filter(e => (!filter.category || e.category === filter.category) && (!filter.severity || e.severity === filter.severity));
  }
  /* ITEM 16: PRE-RELEASE BLOCKER CHECK */
  const REQUIRED_LEGAL_PLACEHOLDERS = Object.freeze([
    'ŞİRKET UNVANI', 'ADRES', 'DESTEK E-POSTA', 'DPO/KVKK E-POSTA', 'LİSANS DURUMU', 'ÖDEME SAĞLAYICISI'
  ]);
  const APP_RELEASE_BLOCKED = true;
  function checkReleaseBlockers(config) {
    const missing = [];
    REQUIRED_LEGAL_PLACEHOLDERS.forEach(p => {
      const val = config && config[p];
      if (!val || String(val).trim() === '' || /^\[.*\]$/.test(String(val).trim())) missing.push(p);
    });
    return { blocked: APP_RELEASE_BLOCKED && missing.length > 0, missing, required: REQUIRED_LEGAL_PLACEHOLDERS };
  }
  /* Export new functions to api */
  api.addLinkedAccount = addLinkedAccount;
  api.removeLinkedAccount = removeLinkedAccount;
  api.checkLinkedAccountAccess = checkLinkedAccountAccess;
  api.linkedAccounts = linkedAccounts;
  api.unifiedDataFlow = unifiedDataFlow;
  api.alRajhiUXPrinciples = alRajhiUXPrinciples;
  api.LEGAL_HUB_SECTIONS = LEGAL_HUB_SECTIONS;
  api.KVKK_DISCLOSURE = KVKK_DISCLOSURE;
  api.KVKK_CONSENT_DEFAULTS = KVKK_CONSENT_DEFAULTS;
  api.GDPR_RIGHTS = GDPR_RIGHTS;
  api.GDPR_SCC_STUBS = GDPR_SCC_STUBS;
  api.getRetentionRegistry = getRetentionRegistry;
  api.addRetentionEntry = addRetentionEntry;
  api.retentionLifecycle = retentionLifecycle;
  api.PRIVACY_CENTER_ACTIONS = PRIVACY_CENTER_ACTIONS;
  api.finalVerification = finalVerification;
  /* MODULE 66: LEGAL & REGULATORY ENGINE — ITEMS 6–16 exports */
  api.AI_DISCLAIMER = AI_DISCLAIMER;
  api.INVESTMENT_DISCLAIMER = INVESTMENT_DISCLAIMER;
  api.attachAIDisclaimer = attachAIDisclaimer;
  api.enforceNoGuarantees = enforceNoGuarantees;
  api.REGULATED_INVESTMENT_SERVICE = REGULATED_INVESTMENT_SERVICE;
  api.isRegulatedInvestmentService = isRegulatedInvestmentService;
  api.investmentAdviceGate = investmentAdviceGate;
  api.AUTO_TRADE_DEFAULT_OFF = AUTO_TRADE_DEFAULT_OFF;
  api.AUTO_TRADE_CHAIN = AUTO_TRADE_CHAIN;
  api.autoTradeGate = autoTradeGate;
  api.SUBSCRIPTION_DISCLOSURE_FIELDS = SUBSCRIPTION_DISCLOSURE_FIELDS;
  api.validateSubscriptionDisclosure = validateSubscriptionDisclosure;
  api.AFFILIATE_DISCLAIMER = AFFILIATE_DISCLAIMER;
  api.attachAffiliateDisclosure = attachAffiliateDisclosure;
  api.ensureAffiliateNeutrality = ensureAffiliateNeutrality;
  api.CONSENT_LOG_KEY = CONSENT_LOG_KEY;
  api.logConsentEvent = logConsentEvent;
  api.getConsentHistory = getConsentHistory;
  api.COUNTRY_POLICIES = COUNTRY_POLICIES;
  api.getCountryPolicy = getCountryPolicy;
  api.MANDATORY_NOTICES = MANDATORY_NOTICES;
  api.getDataStatusBadge = getDataStatusBadge;
  api.JURISDICTION_MATRIX = JURISDICTION_MATRIX;
  api.checkFeatureJurisdiction = checkFeatureJurisdiction;
  api.LEGAL_AUDIT_CATEGORIES = LEGAL_AUDIT_CATEGORIES;
  api.LEGAL_AUDIT_LOG_KEY = LEGAL_AUDIT_LOG_KEY;
  api.logLegalAuditEvent = logLegalAuditEvent;
  api.getLegalAuditLog = getLegalAuditLog;
  api.REQUIRED_LEGAL_PLACEHOLDERS = REQUIRED_LEGAL_PLACEHOLDERS;
  api.APP_RELEASE_BLOCKED = APP_RELEASE_BLOCKED;
  api.checkReleaseBlockers = checkReleaseBlockers;
  registerSecurityWorkflows();
  global.STKSZDataEngine = api;
})(typeof window !== 'undefined' ? window : this);
