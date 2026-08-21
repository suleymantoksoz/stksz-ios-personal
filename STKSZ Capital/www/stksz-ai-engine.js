/* =====================================================================
   STKSZ AI ENGINE · v121 (2. ADIM)
   ---------------------------------------------------------------------
   STKSZ AI, uygulamanın KENDİ yapay zekâ ürünüdür. Gemini yalnızca
   arka plandaki değiştirilebilir model sağlayıcısıdır (Model Layer).
   Kullanıcı her zaman yalnızca "STKSZ AI" görür.

   MİMARİ:
     KULLANICI → STKSZ AI → STKSZ AI ENGINE
       ├── Model Layer        (bugün: Gemini · yarın: başka model / STKSZ modeli)
       ├── STKSZ Data Layer   (yalnız uygulamadaki DOĞRULANMIŞ veriler)
       ├── STKSZ Tools        (server/TOOL_CATALOG — read-only + onaylı write)
       ├── STKSZ Analysis     (modüller: MARKET/STOCK/NEWS/PORTFOLIO/RISK/CHART)
       ├── STKSZ Memory       (profil, seviye, tercihler, sohbet bağlamı)
       ├── STKSZ Profile      (yatırımcı seviyesi testi + rozetler)
       └── STKSZ Rules        (VERİ YOK ilkesi, güvenlik, yetkiler)

   v121 EKLEMEKLER:
   - DataReaders: uygulama içi verileri okuyan merkezi okuyucular
   - AnalysisTools: teknik analiz, hesaplama,찐 değer analizi araçları
   - WriteTools: kullanıcı verisini değiştiren (portföy, izleme listesi) araçları
   - AdminTools: admin paneli, API yönetimi, rozet yönetimi araçları
   - centralIntelligenceContext(): tüm bağlam kaynaklarını birleştiren

   GÜVENLİK:
   - Bu dosyada API anahtarı YOKTUR ve asla olamaz.
   - Rozet kodları burada TUTULMAZ; kod doğrulaması yalnız backend'dedir.
   - Veri yoksa "VERİ YOK" denir; hiçbir finansal değer uydurulmaz.
   ===================================================================== */
(function initStkszAiEngine(global) {
  'use strict';

  /* ================= 1) MODEL LAYER (soyutlama) ================= */
  const modelRegistry = {};
  function registerModel(id, adapter) { modelRegistry[id] = adapter; }
  function activeModel() { return modelRegistry.default || null; }

  /* ================= 2) ANALYSIS MODULES (yönlendirici) ================= */
  const MODULES = {
    MARKET:    { id: 'MARKET',    label: 'STKSZ MARKET',    hint: 'BIST/piyasa durumu, endeksler, sektörler', keywords: ['piyasa', 'bist', 'borsa', 'endeks', 'sektör', 'xu100', 'bugün piyasada', 'küresel'] },
    STOCK:     { id: 'STOCK',     label: 'STKSZ STOCK',     hint: 'hisse analizi, teknik/temel analiz, STKSZ SCORE', keywords: ['hisse', 'analiz et', 'teknik', 'temel analiz', 'hedef fiyat', 'score', 'skor'] },
    NEWS:      { id: 'NEWS',      label: 'STKSZ NEWS',      hint: 'haber analizi, doğrulanmış haber akışı', keywords: ['haber', 'kap ', 'gündem', 'açıklama', 'duyuru'] },
    PORTFOLIO: { id: 'PORTFOLIO', label: 'STKSZ PORTFOLIO', hint: 'portföy, maliyet, günlük K/Z, gerçekleşen/gerçekleşmemiş kâr-zarar', keywords: ['portföy', 'k/z', 'kâr', 'zarar', 'maliyet', 'işlem', 'pozisyon', 'varlığım', 'bakiye', 'temettü'] },
    RISK:      { id: 'RISK',      label: 'STKSZ RISK',      hint: 'kullanıcı risk profili, portföy risk analizi, risk seviyesi', keywords: ['risk', 'güvenli mi', 'kaybetme', 'volatil', 'dalgalan'] },
    CHART:     { id: 'CHART',     label: 'STKSZ CHART',     hint: 'grafik, teknik göstergeler, STKSZ CORE/SCORE', keywords: ['grafik', 'gösterge', 'rsi', 'macd', 'ortalama', 'destek', 'direnç', 'mum', 'formasyon'] },
    MEMORY:    { id: 'MEMORY',    label: 'STKSZ MEMORY',    hint: 'kullanıcı profili, tercihler, geçmiş bağlam, seviye ve yetkiler', keywords: [] }
  };

  function routeQuestion(question) {
    const q = String(question || '').toLowerCase();
    const matched = [];
    Object.values(MODULES).forEach(m => {
      if (m.keywords.some(k => q.includes(k))) matched.push(m.id);
    });
    if (/\b[A-ZÇĞİÖŞÜ]{3,6}\b/.test(String(question || ''))) {
      if (!matched.includes('STOCK')) matched.push('STOCK');
    }
    if (!matched.length) matched.push('MARKET');
    return matched;
  }

  /* ================= 3) STKSZ RULES (bağlayıcı ilkeler) ================= */
  const RULES = Object.freeze([
    'Sen STKSZ AI\'sın: STKSZ CAPITAL uygulamasının kendi yapay zekâ asistanı. Kendini asla Gemini, Google, OpenAI veya başka bir sağlayıcı olarak tanıtma.',
    'Yalnızca uygulamadaki DOĞRULANMIŞ verilerle konuş. Veri yoksa net biçimde "VERİ YOK" de; fiyat, haber, portföy değeri veya piyasa verisi ASLA uydurma.',
    'API anahtarları, kodlar ve gizli değerler hakkında bilgi verme; bunlar sana hiç gösterilmez.',
    'Yatırım tavsiyesi değil, veri temelli analiz sunarsın; nihai karar kullanıcınındır.',
    'Gerçek para emri iletemezsin; işlem önerilerin yalnızca kullanıcı onayı bekleyen taslaklardır.'
  ]);

  /* ================= 4) STKSZ MEMORY (kullanıcı bağlamı) ================= */
  function safeParse(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
  function readStorage(key) { try { return (global.localStorage || localStorage).getItem(key); } catch (e) { return null; } }
  function writeStorage(key, val) { try { (global.localStorage || localStorage).setItem(key, typeof val === 'string' ? val : JSON.stringify(val)); } catch (e) {} }

  function memorySnapshot() {
    const prefs = safeParse(readStorage('stkszPrefs'), {}) || {};
    const level = safeParse(readStorage('stkszInvestorLevel'), null);
    const ent = safeParse(readStorage('stkszEntitlements'), { badges: [] }) || { badges: [] };
    return {
      profileName: prefs.profileName || '',
      investorProfile: prefs.investorProfile || '',
      investorLevel: level && level.level ? level : null,
      badges: Array.isArray(ent.badges) ? ent.badges.map(b => b.id || b) : []
    };
  }

  function memoryContext() {
    const m = memorySnapshot();
    const parts = [];
    if (m.profileName) parts.push('Kullanıcı adı: ' + m.profileName);
    if (m.investorLevel) parts.push('Yatırımcı seviyesi (STKSZ testi): ' + m.investorLevel.level + ' · ' + (LEVELS[m.investorLevel.level] ? LEVELS[m.investorLevel.level].title : ''));
    else if (m.investorProfile) parts.push('Yatırımcı profili (beyan): ' + m.investorProfile);
    if (m.badges.length) parts.push('Rozetler: ' + m.badges.join(', '));
    return parts.length ? '[STKSZ MEMORY] ' + parts.join(' · ') : '';
  }

  /* ================= 5) DATA READERS (uygulama içi verileri okuma) =================
     Bu fonksiyonlar uygulama içi verileri güvenli bir şekilde okur.
     Dış API çağrısı YAPMAZ; yalnızca localStorage ve uygulama state'inden okur. */
  const DataReaders = {
    portfolio() {
      try {
        const raw = safeParse(readStorage('stkszPortfolio'), null);
        if (!raw || !Array.isArray(raw.items) || !raw.items.length) return null;
        const items = raw.items.map(it => ({
          symbol: it.symbol || '',
          name: it.name || '',
          quantity: Number(it.quantity) || 0,
          avgCost: Number(it.avgCost) || 0,
          currentPrice: Number(it.currentPrice) || 0,
          pnl: Number(it.pnl) || 0,
          pnlPercent: Number(it.pnlPercent) || 0
        }));
        const totalValue = items.reduce((s, i) => s + (i.currentPrice * i.quantity), 0);
        const totalCost = items.reduce((s, i) => s + (i.avgCost * i.quantity), 0);
        const totalPnl = totalValue - totalCost;
        return { items, totalValue, totalCost, totalPnl, itemCount: items.length };
      } catch (e) { return null; }
    },

    watchlist() {
      try {
        const raw = safeParse(readStorage('stkszWatchlist'), null);
        if (!raw || !Array.isArray(raw) || !raw.length) return null;
        return raw.map(w => ({ symbol: w.symbol || w, name: w.name || '' }));
      } catch (e) { return null; }
    },

    cashAccount() {
      try {
        const raw = safeParse(readStorage('stkszCashAccount'), null);
        if (!raw) return null;
        return {
          balance: Number(raw.balance) || 0,
          currency: raw.currency || 'TRY',
          lastUpdate: raw.lastUpdate || ''
        };
      } catch (e) { return null; }
    },

    news() {
      try {
        const raw = safeParse(readStorage('stkszNewsCache'), null);
        if (!raw || !Array.isArray(raw.items) || !raw.items.length) return null;
        return raw.items.slice(0, 10).map(n => ({
          title: n.title || '',
          source: n.source || '',
          date: n.date || n.pubDate || '',
          summary: (n.description || n.summary || '').slice(0, 120)
        }));
      } catch (e) { return null; }
    },

    fxRates() {
      try {
        const raw = safeParse(readStorage('stkszFxRates'), null);
        if (!raw) return null;
        return {
          usdtry: Number(raw.usdtry) || 0,
          eurtry: Number(raw.eurtry) || 0,
          goldUsd: Number(raw.goldUsd) || 0,
          goldTry: Number(raw.goldTry) || 0,
          lastUpdate: raw.lastUpdate || ''
        };
      } catch (e) { return null; }
    },

    riskProfile() {
      try {
        const raw = safeParse(readStorage('stkszRiskProfile'), null);
        if (!raw) return null;
        return {
          riskLevel: raw.riskLevel || raw.level || '',
          score: Number(raw.score) || 0,
          allocation: raw.allocation || {}
        };
      } catch (e) { return null; }
    },

    settings() {
      try {
        const raw = safeParse(readStorage('stkszPrefs'), {}) || {};
        return {
          theme: raw.theme || 'dark',
          language: raw.language || 'tr',
          notifications: raw.notifications !== false,
          aiModel: raw.aiModel || 'default'
        };
      } catch (e) { return { theme: 'dark', language: 'tr' }; }
    },

    userProfile() {
      try {
        const raw = safeParse(readStorage('stkszPrefs'), {}) || {};
        return {
          name: raw.profileName || raw.name || '',
          investorProfile: raw.investorProfile || '',
          riskTolerance: raw.riskTolerance || '',
          goals: raw.goals || ''
        };
      } catch (e) { return {}; }
    },

    transactions() {
      try {
        const raw = safeParse(readStorage('stkszTransactions'), null);
        if (!raw || !Array.isArray(raw)) return null;
        return raw.slice(-20).map(t => ({
          symbol: t.symbol || '',
          type: t.type || '',
          quantity: Number(t.quantity) || 0,
          price: Number(t.price) || 0,
          date: t.date || '',
          total: Number(t.total) || 0
        }));
      } catch (e) { return null; }
    }
  };

  /* ================= 6) ANALYSIS TOOLS (analiz araçları) ================= */
  const AnalysisTools = {
    calculatePortfolioSummary(portfolioData) {
      if (!portfolioData || !portfolioData.items) return null;
      const items = portfolioData.items;
      const totalValue = items.reduce((s, i) => s + (i.currentPrice * i.quantity), 0);
      const totalCost = items.reduce((s, i) => s + (i.avgCost * i.quantity), 0);
      const totalPnl = totalValue - totalCost;
      const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
      const winners = items.filter(i => i.pnl > 0).length;
      const losers = items.filter(i => i.pnl < 0).length;
      const flat = items.length - winners - losers;
      return {
        totalValue: totalValue.toFixed(2),
        totalCost: totalCost.toFixed(2),
        totalPnl: totalPnl.toFixed(2),
        totalPnlPercent: totalPnlPercent.toFixed(2) + '%',
        winners, losers, flat,
        itemCount: items.length,
        diversificationScore: Math.min(100, Math.round((items.length / 10) * 100)),
        topGainer: items.reduce((best, i) => i.pnlPercent > (best?.pnlPercent || -Infinity) ? i : best, null),
        topLoser: items.reduce((worst, i) => i.pnlPercent < (worst?.pnlPercent || Infinity) ? i : worst, null)
      };
    },

    calculateAssetAllocation(portfolioData) {
      if (!portfolioData || !portfolioData.items) return {};
      const total = portfolioData.totalValue || 1;
      const allocation = {};
      portfolioData.items.forEach(item => {
        const pct = ((item.currentPrice * item.quantity) / total) * 100;
        allocation[item.symbol] = { percent: pct.toFixed(1) + '%', value: (item.currentPrice * item.quantity).toFixed(2) };
      });
      return allocation;
    },

    assessRisk(portfolioData, riskProfile) {
      if (!portfolioData) return { level: 'unknown', message: 'Portföy verisi bulunamadı.' };
      const items = portfolioData.items;
      const maxConcentration = items.length > 0 ? Math.max(...items.map(i => ((i.currentPrice * i.quantity) / (portfolioData.totalValue || 1)) * 100)) : 100;
      const avgPnlPercent = items.length > 0 ? items.reduce((s, i) => s + i.pnlPercent, 0) / items.length : 0;
      const volatilityScore = Math.abs(avgPnlPercent) > 15 ? 'high' : Math.abs(avgPnlPercent) > 5 ? 'medium' : 'low';
      const concentrationRisk = maxConcentration > 40 ? 'high' : maxConcentration > 25 ? 'medium' : 'low';
      let overall = 'low';
      if (volatilityScore === 'high' || concentrationRisk === 'high') overall = 'high';
      else if (volatilityScore === 'medium' || concentrationRisk === 'medium') overall = 'medium';
      return { level: overall, volatilityScore, concentrationRisk, maxConcentration: maxConcentration.toFixed(1) + '%', diversification: items.length };
    },

    trendDirection(items) {
      if (!items || items.length < 2) return 'unknown';
      const recent = items.slice(-5);
      const first = recent[0];
      const last = recent[recent.length - 1];
      if (!first || !last) return 'unknown';
      const change = ((last - first) / (first || 1)) * 100;
      if (change > 2) return 'up';
      if (change < -2) return 'down';
      return 'flat';
    },

    movingAverage(data, period) {
      if (!Array.isArray(data) || data.length < period) return null;
      const slice = data.slice(-period);
      return slice.reduce((s, v) => s + Number(v || 0), 0) / period;
    },

    rsi(closes, period) {
      period = period || 14;
      if (!Array.isArray(closes) || closes.length < period + 1) return null;
      let gains = 0, losses = 0;
      for (let i = closes.length - period; i < closes.length; i++) {
        const diff = Number(closes[i] || 0) - Number(closes[i - 1] || 0);
        if (diff > 0) gains += diff; else losses -= diff;
      }
      if (losses === 0) return 100;
      const rs = gains / losses;
      return +(100 - 100 / (1 + rs)).toFixed(2);
    },

    scoreSummary(scores) {
      if (!scores || typeof scores !== 'object') return null;
      const keys = Object.keys(scores);
      if (!keys.length) return null;
      const avg = keys.reduce((s, k) => s + (Number(scores[k]) || 0), 0) / keys.length;
      return { average: +avg.toFixed(2), count: keys.length, breakdown: scores };
    }
  };

  /* ================= 7) WRITE TOOLS (kullanıcı verisi değiştirme — onaylı) ================= */
  const WriteTools = {
    addToWatchlist(symbol, name) {
      if (!symbol) return { ok: false, error: 'Sembol gerekli.' };
      try {
        const list = safeParse(readStorage('stkszWatchlist'), []) || [];
        if (list.some(i => (i.symbol || i) === symbol)) return { ok: true, already: true };
        list.push({ symbol, name: name || symbol, addedAt: new Date().toISOString() });
        writeStorage('stkszWatchlist', list);
        return { ok: true };
      } catch (e) { return { ok: false, error: 'Kayıt hatası.' }; }
    },

    removeFromWatchlist(symbol) {
      if (!symbol) return { ok: false, error: 'Sembol gerekli.' };
      try {
        let list = safeParse(readStorage('stkszWatchlist'), []) || [];
        const before = list.length;
        list = list.filter(i => (i.symbol || i) !== symbol);
        if (list.length === before) return { ok: true, notFound: true };
        writeStorage('stkszWatchlist', list);
        return { ok: true, removed: before - list.length };
      } catch (e) { return { ok: false, error: 'Silme hatası.' }; }
    },

    updateCashBalance(newBalance, currency) {
      try {
        const account = safeParse(readStorage('stkszCashAccount'), { balance: 0, currency: 'TRY' }) || {};
        account.balance = Number(newBalance) || 0;
        account.currency = currency || account.currency || 'TRY';
        account.lastUpdate = new Date().toISOString();
        writeStorage('stkszCashAccount', account);
        return { ok: true };
      } catch (e) { return { ok: false, error: 'Güncelleme hatası.' }; }
    },

    saveUserPreference(key, value) {
      try {
        const prefs = safeParse(readStorage('stkszPrefs'), {}) || {};
        prefs[key] = value;
        writeStorage('stkszPrefs', prefs);
        return { ok: true };
      } catch (e) { return { ok: false, error: 'Kayıt hatası.' }; }
    },

    saveTheme(theme) {
      if (!['dark', 'light'].includes(theme)) return { ok: false, error: 'Geçersiz tema.' };
      return this.saveUserPreference('theme', theme);
    },

    saveProfileName(name) {
      if (!name || typeof name !== 'string') return { ok: false, error: 'İsim gerekli.' };
      return this.saveUserPreference('profileName', name.slice(0, 30));
    },

    clearAllData() {
      try {
        const keys = ['stkszPortfolio', 'stkszWatchlist', 'stkszCashAccount', 'stkszTransactions', 'stkszNewsCache', 'stkszFxRates'];
        keys.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
        return { ok: true, cleared: keys.length };
      } catch (e) { return { ok: false, error: 'Temizleme hatası.' }; }
    }
  };

  /* ================= 8) ADMIN TOOLS (admin-only araçlar) ================= */
  const AdminTools = {
    getSystemInfo() {
      return {
        version: 'v121',
        build: typeof BUILD_VERSION !== 'undefined' ? BUILD_VERSION : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        platform: typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgentData?.platform || 'unknown') : 'unknown',
        localStorageUsed: (() => { try { let total = 0; for (let k in localStorage) total += k.length + localStorage[k].length; return Math.round(total / 1024) + ' KB'; } catch (e) { return 'unknown'; } })(),
        timestamp: new Date().toISOString()
      };
    },

    getUserEntitlements() {
      return {
        badges: userBadges().map(b => b.id),
        level: investorLevel(),
        isAdmin: isAdmin(),
        features: Object.keys(BADGES).filter(id => hasEntitlement(id.split('_')[0]))
      };
    },

    getApiProviders() {
      return {
        gemini: { configured: typeof stkszAiProvider === 'function' },
        twelveData: { configured: typeof getMarketData === 'function' },
        biquote: { configured: typeof getBiQuote === 'function' },
        marketaux: { configured: typeof getMarketauxNews === 'function' },
        openMeteo: { configured: typeof getWeatherData === 'function' },
        googleNews: { configured: typeof getGoogleNews === 'function' }
      };
    },

    resetUserData(type) {
      if (!isAdmin()) return { ok: false, error: 'Yetki yok.' };
      try {
        const keys = {
          portfolio: ['stkszPortfolio'],
          watchlist: ['stkszWatchlist'],
          cash: ['stkszCashAccount'],
          transactions: ['stkszTransactions'],
          all: ['stkszPortfolio', 'stkszWatchlist', 'stkszCashAccount', 'stkszTransactions', 'stkszNewsCache', 'stkszRiskProfile']
        };
        const toClear = keys[type] || keys.all;
        toClear.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
        return { ok: true, cleared: toClear };
      } catch (e) { return { ok: false, error: 'Sıfırlama hatası.' }; }
    }
  };

  /* ================= 9) CENTRAL INTELLIGENCE CONTEXT =================
     Tüm veri kaynaklarını birleştirerek STKSZ AI'a kapsamlı bağlam sunar.
     Bu fonksiyon askStkszAi() context zincirine eklenir. */
  function centralIntelligenceContext() {
    const parts = [];

    /* Profil bağlamı */
    const mem = memoryContext();
    if (mem) parts.push(mem);

    /* Portföy bağlamı */
    const portfolio = DataReaders.portfolio();
    if (portfolio && portfolio.items.length) {
      const summary = AnalysisTools.calculatePortfolioSummary(portfolio);
      if (summary) {
        parts.push('[STKSZ PORTFOLIO] Toplam değer: ₺' + summary.totalValue + ' · K/Z: ₺' + summary.totalPnl + ' (' + summary.totalPnlPercent + ')');
        parts.push('  Kazanan: ' + summary.winners + ' · Kaybeden: ' + summary.losers + ' · Çeşitlendirme: ' + summary.diversificationScore + '/100');
        if (summary.topGainer) parts.push('  En iyi: ' + summary.topGainer.symbol + ' (+' + summary.topGainer.pnlPercent.toFixed(1) + '%)');
        if (summary.topLoser) parts.push('  En kötü: ' + summary.topLoser.symbol + ' (' + summary.topLoser.pnlPercent.toFixed(1) + '%)');
      }
    }

    /* Nakit bağlamı */
    const cash = DataReaders.cashAccount();
    if (cash && cash.balance > 0) {
      parts.push('[STKSZ CASH] Bakiye: ' + cash.balance.toFixed(2) + ' ' + (cash.currency || 'TRY'));
    }

    /* İzleme listesi bağlamı */
    const watchlist = DataReaders.watchlist();
    if (watchlist && watchlist.length) {
      parts.push('[STKSZ WATCHLIST] İzlenen: ' + watchlist.map(w => w.symbol).join(', '));
    }

    /* Döviz/altın bağlamı */
    const fx = DataReaders.fxRates();
    if (fx && (fx.usdtry > 0 || fx.goldTry > 0)) {
      const fxParts = [];
      if (fx.usdtry > 0) fxParts.push('USD/TRY: ' + fx.usdtry.toFixed(2));
      if (fx.eurtry > 0) fxParts.push('EUR/TRY: ' + fx.eurtry.toFixed(2));
      if (fx.goldTry > 0) fxParts.push('Altın/TRY: ' + fx.goldTry.toFixed(2));
      parts.push('[STKSZ FX] ' + fxParts.join(' · '));
    }

    /* Haber bağlamı */
    const news = DataReaders.news();
    if (news && news.length) {
      parts.push('[STKSZ NEWS] Son haberler:');
      news.slice(0, 5).forEach(n => {
        parts.push('  - ' + n.title + (n.source ? ' (' + n.source + ')' : ''));
      });
    }

    /* Risk profili bağlamı */
    const risk = DataReaders.riskProfile();
    if (risk && risk.riskLevel) {
      parts.push('[STKSZ RISK] Risk seviyesi: ' + risk.riskLevel + ' · Puan: ' + risk.score);
    }

    /* Son işlemler bağlamı */
    const txns = DataReaders.transactions();
    if (txns && txns.length) {
      parts.push('[STKSZ TRANSACTIONS] Son ' + txns.length + ' işlem:');
      txns.slice(-5).forEach(t => {
        parts.push('  - ' + t.type + ' ' + t.symbol + ' × ' + t.quantity + ' @ ₺' + t.price);
      });
    }

    return parts.length ? '[STKSZ CENTRAL INTELLIGENCE]\n' + parts.join('\n') : '';
  }

  /* ================= 10) ENGINE CONTEXT (soru → modül + bağlam) ================= */
  function engineContext(question) {
    try {
      const modules = routeQuestion(question);
      const lines = ['[STKSZ AI ENGINE] Aktif modüller: ' + modules.map(id => MODULES[id].label).join(' + ')];
      modules.forEach(id => lines.push('- ' + MODULES[id].label + ': ' + MODULES[id].hint));
      const mem = memoryContext();
      if (mem) lines.push(mem);
      lines.push('[STKSZ RULES] ' + RULES.join(' | '));
      return lines.join('\n');
    } catch (error) { return ''; }
  }

  /* ================= 11) YATIRIMCI SEVİYESİ TESTİ (merkezi) ================= */
  const INVESTOR_TEST = Object.freeze({
    disclaimer: 'Bu test STKSZ CAPITAL\'e aittir; herhangi bir bankanın veya kurumun resmî risk testi değildir. Sonuç yatırım tavsiyesi oluşturmaz.',
    questions: [
      { id: 'q1', text: 'Yatırım süreniz nedir?', options: [
        { text: 'Kısa (0-1 yıl)', score: 1 }, { text: 'Orta (1-5 yıl)', score: 2 }, { text: 'Uzun (5+ yıl)', score: 3 }] },
      { id: 'q2', text: 'Portföyünüz %10 değer kaybederse ne yaparsınız?', options: [
        { text: 'Satış yaparım', score: 1 }, { text: 'Beklerim', score: 2 }, { text: 'Fırsat olarak değerlendiririm', score: 3 }] },
      { id: 'q3', text: 'Önceliğiniz nedir?', options: [
        { text: 'Ana parayı korumak', score: 1 }, { text: 'Dengeli büyüme', score: 2 }, { text: 'Yüksek büyüme', score: 3 }] },
      { id: 'q4', text: 'Yüksek getiri ihtimali olan yüksek riskli yatırımlara yaklaşımınız?', options: [
        { text: 'Uzak dururum', score: 1 }, { text: 'Küçük miktar ayırırım', score: 2 }, { text: 'Risk alabilirim', score: 3 }] },
      { id: 'q5', text: 'Çeşitlendirme yaklaşımınız?', options: [
        { text: 'Tek/az sayıda varlık', score: 1 }, { text: 'Dengeli dağılım', score: 2 }, { text: 'Geniş çeşitlendirme', score: 3 }] }
    ],
    score(answers) {
      if (!Array.isArray(answers) || answers.length !== this.questions.length) return null;
      let total = 0;
      for (let i = 0; i < this.questions.length; i++) {
        const opt = this.questions[i].options[Number(answers[i])];
        if (!opt) return null;
        total += opt.score;
      }
      return total;
    },
    levelFor(total) {
      if (!Number.isFinite(total)) return null;
      if (total <= 8) return 'BRONZ';
      if (total <= 12) return 'GUMUS';
      return 'ALTIN';
    }
  });

  /* ================= 12) SEVİYELER + ROZETLER + ENTITLEMENT ================= */
  const LEVELS = Object.freeze({
    BRONZ: { id: 'BRONZ', title: 'Temkinli Yatırımcı', tone: 'bronz' },
    GUMUS: { id: 'GUMUS', title: 'Dengeli Yatırımcı', tone: 'gumus' },
    ALTIN: { id: 'ALTIN', title: 'İleri Yatırımcı', tone: 'altin' }
  });

  const BADGES = Object.freeze({
    BRONZ:         { id: 'BRONZ',         label: 'BRONZ · Temkinli Yatırımcı', kind: 'level',   entitlements: [] },
    GUMUS:         { id: 'GUMUS',         label: 'GÜMÜŞ · Dengeli Yatırımcı',  kind: 'level',   entitlements: [] },
    ALTIN:         { id: 'ALTIN',         label: 'ALTIN · İleri Yatırımcı',    kind: 'level',   entitlements: ['advanced_chart'] },
    KRAL:          { id: 'KRAL',          label: 'KRAL YATIRIMCI',   kind: 'premium', entitlements: ['ai_pro', 'chart_premium', 'stksz_editor'] },
    STKSZ_PRO:     { id: 'STKSZ_PRO',     label: 'STKSZ PRO',        kind: 'premium', entitlements: ['ai_pro'] },
    GRAFIK_USTASI: { id: 'GRAFIK_USTASI', label: 'GRAFİK USTASI',    kind: 'premium', entitlements: ['advanced_chart', 'chart_premium'] },
    STRATEJIST:    { id: 'STRATEJIST',    label: 'STRATEJİST',       kind: 'premium', entitlements: ['analysis_pro'] },
    STKSZ_ELITE:   { id: 'STKSZ_ELITE',   label: 'STKSZ ELITE',      kind: 'premium', entitlements: ['ai_pro', 'chart_premium', 'analysis_pro', 'stksz_editor'] },
    ADMIN:         { id: 'ADMIN',         label: 'ADMIN',            kind: 'system',  entitlements: ['admin_panel', 'api_management', 'badge_management', 'system_config'] }
  });

  /* ---- entitlement deposu ---- */
  var PROMO_CODES_KEY = 'stkszPromoCodes';
  function readEntitlements() {
    const ent = safeParse(readStorage('stkszEntitlements'), null);
    return ent && Array.isArray(ent.badges) ? ent : { badges: [] };
  }
  function writeEntitlements(ent) { writeStorage('stkszEntitlements', ent); }
  function grantBadge(id, source, expiresAt) {
    if (!BADGES[id]) return { ok: false, error: 'Bilinmeyen rozet: ' + id };
    const ent = readEntitlements();
    if (ent.badges.some(b => (b.id || b) === id)) return { ok: true, already: true };
    var badge = { id: id, grantedAt: new Date().toISOString(), source: String(source || 'manual') };
    if (expiresAt) badge.expiresAt = expiresAt;
    ent.badges.push(badge);
    writeEntitlements(ent);
    return { ok: true };
  }
  function revokeBadge(id) {
    const ent = readEntitlements();
    ent.badges = ent.badges.filter(b => (b.id || b) !== id);
    writeEntitlements(ent);
    return { ok: true };
  }
  function purgeExpiredBadges() {
    var ent = readEntitlements();
    var now = Date.now();
    var removed = [];
    ent.badges = ent.badges.filter(function (b) {
      if (b.expiresAt && new Date(b.expiresAt).getTime() < now) { removed.push(b.id); return false; }
      return true;
    });
    if (removed.length) writeEntitlements(ent);
    return removed;
  }
  function userBadges() {
    purgeExpiredBadges();
    return readEntitlements().badges.map(b => (typeof b === 'string' ? { id: b } : b)).filter(b => BADGES[b.id]);
  }
  function userBadgesAll() {
    purgeExpiredBadges();
    return readEntitlements().badges.map(b => (typeof b === 'string' ? { id: b } : b)).filter(b => BADGES[b.id]);
  }
  function badgeDaysLeft(badge) {
    if (!badge || !badge.expiresAt) return null;
    var diff = new Date(badge.expiresAt).getTime() - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / 86400000);
  }
  function hasEntitlement(feature) {
    const level = safeParse(readStorage('stkszInvestorLevel'), null);
    const ids = userBadges().map(b => b.id);
    if (level && level.level && !ids.includes(level.level)) ids.push(level.level);
    return ids.some(id => (BADGES[id] ? BADGES[id].entitlements : []).includes(feature));
  }

  /* ---- promosyon kod deposu ---- */
  function readPromoCodes() { return safeParse(readStorage(PROMO_CODES_KEY), []) || []; }
  function writePromoCodes(arr) { writeStorage(PROMO_CODES_KEY, arr); }
  function generatePromoCode(badgeId, type, days) {
    if (!BADGES[badgeId]) return { ok: false, error: 'Bilinmeyen rozet.' };
    var hex = '';
    for (var i = 0; i < 6; i++) hex += '0123456789ABCDEF'.charAt(Math.floor(Math.random() * 16));
    var code = 'STKSZ-PROMO-' + hex;
    var promo = {
      code: code, badgeId: badgeId,
      type: type === 'timed' ? 'timed' : 'permanent',
      days: type === 'timed' ? (Number(days) || 29) : null,
      used: false, usedAt: null, usedBy: null,
      createdAt: new Date().toISOString()
    };
    var list = readPromoCodes();
    list.push(promo);
    writePromoCodes(list);
    return { ok: true, code: code, badgeId: badgeId, type: promo.type, days: promo.days };
  }
  function redeemPromoCode(code, userId) {
    var raw = String(code || '').trim().toUpperCase();
    if (!raw) return { ok: false, error: 'Kod boş.' };
    var list = readPromoCodes();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === raw && !list[i].used) { idx = i; break; }
    }
    if (idx === -1) return { ok: false, error: 'Geçersiz veya kullanılmış kod.' };
    var promo = list[idx];
    var expiresAt = null;
    if (promo.type === 'timed' && promo.days) {
      var d = new Date(); d.setDate(d.getDate() + promo.days);
      expiresAt = d.toISOString();
    }
    var result = grantBadge(promo.badgeId, 'promo:' + promo.code, expiresAt);
    if (!result.ok) return result;
    if (result.already) return { ok: false, error: 'Bu rozete zaten sahipsiniz.' };
    promo.used = true;
    promo.usedAt = new Date().toISOString();
    promo.usedBy = userId || 'local';
    list[idx] = promo;
    writePromoCodes(list);
    return { ok: true, badgeId: promo.badgeId, type: promo.type, days: promo.days, expiresAt: expiresAt };
  }

  function saveInvestorLevel(total) {
    const levelId = INVESTOR_TEST.levelFor(total);
    if (!levelId) return null;
    const record = { level: levelId, title: LEVELS[levelId].title, score: total, at: new Date().toISOString() };
    writeStorage('stkszInvestorLevel', record);
    return record;
  }
  function investorLevel() { return safeParse(readStorage('stkszInvestorLevel'), null); }

  /* ================= 13) PERMISSION SYSTEM (yetki) ================= */
  function isAdmin() { return userBadges().some(b => b.id === 'ADMIN'); }

  /* ================= DIŞA AÇILAN API ================= */
  const engine = {
    version: 'v122',
    brand: 'STKSZ AI',
    MODULES, RULES, LEVELS, BADGES, INVESTOR_TEST,
    registerModel, activeModel,
    route: routeQuestion,
    context: engineContext,
    centralContext: centralIntelligenceContext,
    memory: { snapshot: memorySnapshot, context: memoryContext },
    profile: { saveInvestorLevel, investorLevel },
    entitlements: { grant: grantBadge, revoke: revokeBadge, badges: userBadges, has: hasEntitlement, isAdmin, badgeDaysLeft, purgeExpired: purgeExpiredBadges },
    promo: { generate: generatePromoCode, redeem: redeemPromoCode, readAll: readPromoCodes },
    data: DataReaders,
    analysis: AnalysisTools,
    write: WriteTools,
    admin: AdminTools
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  global.STKSZAIEngine = engine;
})(typeof window !== 'undefined' ? window : globalThis);
