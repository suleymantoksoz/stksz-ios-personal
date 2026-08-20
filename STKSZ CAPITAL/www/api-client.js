(function initStkszProviders(global) {
  'use strict';

  /* =========================================================
     API ANAHTAR DEPOSU (localStorage · kalıcı, tek seferlik kayıt)
     Kod içinde gömülü anahtar YOKTUR. Kullanıcı anahtarları
     Ayarlar → API Yönetimi panelinden girilir ve yalnızca bu
     cihazın localStorage kaydında (stkszApiKeys) tutulur.
     ========================================================= */
  const API_KEYS_STORAGE = 'stkszApiKeys';
  const keyStore = {
    read() {
      try { return JSON.parse(localStorage.getItem(API_KEYS_STORAGE) || '{}') || {}; }
      catch (error) { return {}; }
    },
    /* DURDURULMUŞ sağlayıcı: anahtar silinmez ama get() boş döner →
       tüm veri zincirleri o kaynağı otomatik atlar. BAŞLAT ile geri açılır. */
    isDisabled(provider) { return this.read()['disabled_' + provider] === '1'; },
    setDisabled(provider, flag) {
      const all = this.read();
      if (flag) all['disabled_' + provider] = '1'; else delete all['disabled_' + provider];
      try { localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(all)); return true; }
      catch (error) { return false; }
    },
    rawGet(provider) {
      const value = this.read()[provider];
      return typeof value === 'string' && value.trim() ? value.trim() : '';
    },
    get(provider) {
      if (this.isDisabled(provider)) return '';
      return this.rawGet(provider);
    },
    set(provider, value) {
      const all = this.read();
      const clean = String(value || '').trim();
      if (clean) all[provider] = clean; else delete all[provider];
      try { localStorage.setItem(API_KEYS_STORAGE, JSON.stringify(all)); return true; }
      catch (error) { return false; }
    },
    clear() { try { localStorage.removeItem(API_KEYS_STORAGE); } catch (error) {} },
    list() { return Object.keys(this.read()); }
  };

  async function fetchJson(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      return { response, payload };
    } finally { clearTimeout(timer); }
  }

  /* =========================================================
     CAPACITOR NATIVE HTTP KÖPRÜSÜ — CORS AŞIMI
     Kurulu uygulamada (iOS/Android) istekler WebView yerine
     native katmandan çıkar; tarayıcı CORS kuralları uygulanmaz.
     Böylece Yahoo, Bigpara, İş Yatırım, Google News RSS gibi
     CORS başlığı olmayan ücretsiz kaynaklar native modda
     doğrudan çalışır. Tarayıcıda otomatik olarak normal
     fetch'e düşer (orada CORS engeli sürebilir — bilinen sınır).
     ========================================================= */
  function capacitorHttp() {
    const cap = global.Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    return cap.Plugins?.CapacitorHttp || cap.Plugins?.Http || null;
  }
  async function nativeFetchRaw(url, options = {}) {
    const http = capacitorHttp();
    if (http) {
      const request = {
        url,
        method: options.method || 'GET',
        /* v92: Bigpara "Mozilla/5.0 (STKSZ)" UA'sını 401 ile reddediyor (canlı doğrulandı) — standart tarayıcı UA şart */
        headers: { Accept: options.accept || 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36', ...(options.headers || {}) },
        readTimeout: options.timeoutMs || 20000,
        connectTimeout: options.timeoutMs || 20000,
        responseType: 'text'
      };
      if (options.body !== undefined) request.data = options.body; /* v96: POST gövdesi (AI backend) */
      const result = await http.request(request);
      const status = Number(result.status) || 0;
      const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data ?? '');
      return { ok: status >= 200 && status < 300, status, text };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
    try {
      const response = await fetch(url, { method: options.method || 'GET', headers: options.headers, body: options.body, cache: 'no-store', signal: controller.signal });
      return { ok: response.ok, status: response.status, text: await response.text() };
    } finally { clearTimeout(timer); }
  }
  async function nativeFetchJson(url, options = {}) {
    const raw = await nativeFetchRaw(url, options);
    let payload = {};
    try { payload = JSON.parse(raw.text); } catch (error) { payload = {}; }
    return { ok: raw.ok, status: raw.status, payload };
  }

  class ProviderClientError extends Error {
    constructor(type, message, provider = 'unknown', status = 0) {
      super(message);
      this.name = 'ProviderClientError';
      this.type = type;
      this.provider = provider;
      this.status = status;
    }
  }

  const runtime = {
    config: null,
    providers: {
      market: { lastSuccess: '', lastError: '', freshness: 'unknown', label: 'API bağlı değil' },
      bist: { lastSuccess: '', lastError: '', freshness: 'unknown', label: 'BIST Veri Kaynağı' },
      fallback: { lastSuccess: '', lastError: '', freshness: 'eod', label: 'Yahoo Finance · BIST EOD Fallback' },
      news: { lastSuccess: '', lastError: '', label: 'API bağlı değil' },
      weather: { lastSuccess: '', lastError: '', label: 'Open-Meteo' },
      fx: { lastSuccess: '', lastError: '', label: 'API bağlı değil' }
    }
  };

  function nowIso() { return new Date().toISOString(); }
  function freshnessLabel(value) {
    return ({ eod: 'EOD', delayed: 'Gecikmeli', realtime: 'Canlı' })[String(value || '').toLowerCase()] || 'Güncellik bilinmiyor';
  }

  function userMessage(type, fallback) {
    const messages = {
      missing_key: 'API anahtarı sunucuda tanımlı değil.',
      invalid_key: 'API anahtarı geçersiz veya yetkisiz.',
      rate_limit: 'API kullanım limiti doldu.',
      timeout: 'Veri kaynağı zaman aşımına uğradı.',
      invalid_symbol: 'Geçersiz sembol veya sembol desteklenmiyor.',
      no_data: 'Doğrulanmış veri bulunamadı.',
      insufficient_data: 'Yetersiz veri.',
      provider_not_configured: 'API bağlı değil.',
      provider_unavailable: 'Veri kaynağına şu anda ulaşılamıyor.',
      forbidden: 'Güvenli server oturumu doğrulanamadı. Sayfayı yenileyip tekrar deneyin.',
      secret_storage: 'API Key sunucuda güvenli olarak kaydedilemedi.',
      invalid_payload: 'API Key kaydetme isteği geçersiz.',
      network: 'API proxy sunucusuna ulaşılamıyor. Canlı önizleme server bağlantısını kontrol edin.',
      offline: 'Çevrimdışı: provider verisi alınamıyor.'
    };
    return messages[type] || fallback || 'Veri kaynağına şu anda ulaşılamıyor.';
  }

  const apiClient = {
    async request(path, options = {}) {
      if (location.protocol === 'file:') throw new ProviderClientError('network', 'API proxy file:// üzerinde kullanılamaz.', 'server');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
      try {
        const hasJsonBody = options.json !== undefined;
        const requestUrl = global.STKSZ_API_ORIGIN && String(path).startsWith('/api/') ? new URL(path, global.STKSZ_API_ORIGIN).toString() : path;
        const response = await fetch(requestUrl, { method: options.method || 'GET', headers: { Accept: 'application/json', ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }, body: hasJsonBody ? JSON.stringify(options.json) : options.body, cache: 'no-store', credentials: 'same-origin', signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          const error = payload.error || {};
          const inferredType = error.type || (response.status === 401 ? 'invalid_key' : response.status === 403 ? 'forbidden' : response.status === 429 ? 'rate_limit' : response.status >= 500 ? 'provider_unavailable' : 'provider_unavailable');
          const rawMessage = error.message || payload.message || '';
          const normalized = new ProviderClientError(inferredType, userMessage(inferredType, rawMessage), error.provider || 'server', response.status);
          normalized.serverMessage = rawMessage;
          throw normalized;
        }
        return payload.data;
      } catch (error) {
        if (error instanceof ProviderClientError) throw error;
        if (error?.name === 'AbortError') throw new ProviderClientError('timeout', userMessage('timeout'), 'server', 504);
        throw new ProviderClientError('network', userMessage('network'), 'server', 0);
      } finally {
        clearTimeout(timer);
      }
    },
    query(path, params = {}) {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
      });
      return this.request(`${path}${search.size ? `?${search}` : ''}`);
    }
  };

  function record(type, success, details = {}) {
    const state = runtime.providers[type];
    if (!state) return;
    if (success) {
      state.lastSuccess = details.timestamp || nowIso();
      state.lastError = '';
      if (details.label) state.label = details.label;
      if (details.freshness) state.freshness = details.freshness;
      if (details.symbol) state.lastSymbol = details.symbol;
      if (details.dataType) state.dataType = details.dataType;
      if (details.dataTimestamp) state.dataTimestamp = details.dataTimestamp;
      if (details.isFresh !== undefined) state.isFresh = details.isFresh;
      if (details.freshnessState) state.freshnessState = details.freshnessState;
      if (details.price !== undefined) state.lastPrice = details.price;
    } else { state.lastError = details.message || 'Veri kaynağına ulaşılamıyor.'; state.errorReason = state.lastError; }
  }

  /* ---------------------------------------------------------
     TWELVE DATA doğrudan istemci (localStorage anahtarıyla).
     Anahtar yoksa server proxy'ye düşer; o da yoksa hata verir.
     --------------------------------------------------------- */
  const twelveDirect = {
    base: 'https://api.twelvedata.com',
    key() { return keyStore.get('twelve_data'); },
    async call(path, params = {}) {
      const key = this.key();
      if (!key) throw new ProviderClientError('missing_key', 'Twelve Data API anahtarı girilmedi. Ayarlar → API Yönetimi bölümünden ekleyin.', 'twelve_data', 0);
      const url = new URL(this.base + path);
      Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v)); });
      url.searchParams.set('apikey', key);
      const { response, payload } = await fetchJson(url.toString());
      if (payload?.status === 'error' || payload?.code) {
        const code = Number(payload.code) || response.status;
        const type = code === 401 ? 'invalid_key' : code === 429 ? 'rate_limit' : 'provider_unavailable';
        const error = new ProviderClientError(type, userMessage(type, payload.message), 'twelve_data', code);
        error.providerCode = code;
        error.serverMessage = payload.message || '';
        throw error;
      }
      if (!response.ok) throw new ProviderClientError('provider_unavailable', 'Twelve Data yanıt vermedi (' + response.status + ').', 'twelve_data', response.status);
      return payload;
    },
    async quote(symbol) {
      const payload = await this.call('/quote', { symbol, mic_code: 'XIST' });
      const price = Number(payload.close);
      return {
        provider: 'Twelve Data', providerId: 'twelve_data', symbol: payload.symbol || symbol,
        companyName: payload.name || '', micCode: payload.mic_code || 'XIST',
        price: Number.isFinite(price) ? price : null,
        open: Number(payload.open) || null, high: Number(payload.high) || null, low: Number(payload.low) || null,
        previousClose: Number(payload.previous_close) || null,
        change: Number(payload.change) || null, changePct: Number(payload.percent_change) || null,
        volume: Number(payload.volume) || null,
        timestamp: payload.datetime || '', marketDate: payload.datetime || '',
        isFresh: payload.is_market_open === true, freshness: payload.is_market_open === true ? 'delayed' : 'eod',
        freshnessState: payload.is_market_open === true ? 'CURRENT_DELAYED' : 'CURRENT_EOD',
        fetchedAt: nowIso()
      };
    },
    async timeSeries(symbol, interval = '1day', outputsize = 30) {
      const payload = await this.call('/time_series', { symbol, mic_code: 'XIST', interval, outputsize });
      return {
        provider: 'Twelve Data', providerId: 'twelve_data', symbol: payload.meta?.symbol || symbol,
        micCode: payload.meta?.mic_code || 'XIST', interval,
        values: Array.isArray(payload.values) ? payload.values : [],
        freshness: 'eod', fetchedAt: nowIso()
      };
    }
  };

  const marketDataProvider = {
    id: 'market',
    async config() { return loadProviderConfig(); },
    hasLocalKey() { return Boolean(twelveDirect.key()); },
    async price(symbol, refresh = false) {
      if (this.hasLocalKey()) { const quote = await twelveDirect.quote(symbol); return { ...quote, price: quote.price }; }
      return apiClient.query('/api/market/price', { symbol, refresh: refresh ? 1 : '' });
    },
    async quote(symbol, refresh = false) {
      if (this.hasLocalKey()) return twelveDirect.quote(symbol);
      return apiClient.query('/api/market/quote', { symbol, refresh: refresh ? 1 : '' });
    },
    async timeSeries(symbol, options = {}) {
      if (this.hasLocalKey()) return twelveDirect.timeSeries(symbol, options.interval || '1day', options.outputsize || 30);
      return apiClient.query('/api/market/time-series', { symbol, interval: options.interval || '1day', outputsize: options.outputsize || 30, refresh: options.refresh ? 1 : '' });
    },
    async stocks(refresh = false) { return apiClient.query('/api/market/stocks', { refresh: refresh ? 1 : '' }); },
    async search(query, refresh = false) { return apiClient.query('/api/market/search', { q: query, refresh: refresh ? 1 : '' }); },
    async portfolioSnapshot(symbols, options = {}) {
      // 1) Kullanıcının kendi Twelve Data anahtarı varsa doğrudan bağlan.
      if (this.hasLocalKey()) {
        try {
          const results = [];
          for (const symbol of symbols) {
            const row = { symbol, quote: null, timeSeries: null };
            try { row.quote = await twelveDirect.quote(symbol); } catch (error) { row.error = error.message; }
            try { row.timeSeries = await twelveDirect.timeSeries(symbol, '1day', options.historySize || 30); } catch (error) {}
            results.push(row);
          }
          // Twelve Data'nın veremediği semboller (kredi limiti / yeni halka arz) ücretsiz zincirle doldurulur
          for (const row of results) {
            if (row.quote && Number.isFinite(row.quote.price)) continue;
            try { row.quote = await freeBistChain.quote(row.symbol); row.error = ''; } catch (gapError) {}
            if (!row.timeSeries) { try { row.timeSeries = await freeBistChain.history(row.symbol, options.historySize || 30); } catch (gapError) {} }
          }
          const anyQuote = results.some(row => row.quote && Number.isFinite(row.quote.price));
          if (!anyQuote) {
            const firstError = results.find(row => row.error)?.error || 'Doğrulanmış veri bulunamadı.';
            throw new ProviderClientError('no_data', firstError, 'twelve_data', 0);
          }
          const snapshot = { provider: 'Twelve Data · Kullanıcı anahtarı', providerId: 'twelve_data', freshness: 'eod', isFresh: true, freshnessState: 'CURRENT_EOD', fetchedAt: nowIso(), results };
          record('market', true, { label: snapshot.provider, freshness: snapshot.freshness, timestamp: snapshot.fetchedAt });
          return snapshot;
        } catch (error) {
          record('market', false, { message: error.message });
          throw error;
        }
      }
      // 2) BiQuote anahtarı + endpoint girildiyse kullanıcı kaynağı olarak dene.
      if (biquoteProvider.ready()) {
        try {
          const results = [];
          for (const symbol of symbols) {
            const row = { symbol, quote: null, timeSeries: null };
            try { row.quote = await biquoteProvider.quote(symbol); } catch (error) { row.error = error.message; }
            try { row.timeSeries = await freeBistChain.history(symbol, options.historySize || 30); } catch (error) {}
            results.push(row);
          }
          if (results.some(row => row.quote && Number.isFinite(row.quote.price))) {
            const snapshot = { provider: 'BiQuote · Kullanıcı anahtarı', providerId: 'biquote', freshness: 'delayed', isFresh: true, freshnessState: 'DELAYED_15MIN', fetchedAt: nowIso(), results };
            record('market', true, { label: snapshot.provider, freshness: snapshot.freshness, timestamp: snapshot.fetchedAt });
            return snapshot;
          }
        } catch (error) { /* BiQuote başarısızsa alttaki zincire düş */ }
      }
      // 3) Server proxy zinciri denenir.
      try {
        const data = await apiClient.query('/api/market/snapshot', { symbols: symbols.join(','), historySize: options.historySize || 30, refresh: options.refresh ? 1 : '' });
        record('market', true, { label: data.provider, freshness: data.freshness, timestamp: data.fetchedAt });
        return data;
      } catch (proxyError) {
        // 4) Varsayılan ücretsiz zincir: Yahoo → Bigpara → İş Yatırım (anahtarsız, sırayla).
        try {
          const results = [];
          let usedProviders = new Set();
          for (const symbol of symbols) {
            const row = { symbol, quote: null, timeSeries: null };
            try { row.quote = await freeBistChain.quote(symbol); if (row.quote?.providerId) usedProviders.add(row.quote.providerId); } catch (error) { row.error = error.message; }
            try { row.timeSeries = await freeBistChain.history(symbol, options.historySize || 30); } catch (error) {}
            results.push(row);
          }
          if (!results.some(row => row.quote && Number.isFinite(row.quote.price))) throw proxyError;
          const providerLabel = usedProviders.has('yahoo_free') ? 'Yahoo Finance · Ücretsiz (gecikmeli)'
            : usedProviders.has('bigpara') ? 'Bigpara · Ücretsiz yedek'
            : 'İş Yatırım · Ücretsiz yedek';
          const snapshot = { provider: providerLabel, providerId: [...usedProviders][0] || 'yahoo_free', freshness: 'delayed', isFresh: true, freshnessState: 'DELAYED_15MIN', fetchedAt: nowIso(), results };
          record('market', true, { label: snapshot.provider, freshness: snapshot.freshness, timestamp: snapshot.fetchedAt });
          return snapshot;
        } catch (freeError) {
          record('market', false, { message: proxyError.message });
          throw proxyError;
        }
      }
    },
    async test() {
      if (this.hasLocalKey()) {
        try {
          const quote = await twelveDirect.quote('THYAO');
          record('market', true, { label: 'Twelve Data · Kullanıcı anahtarı', freshness: quote.freshness });
          return { provider: 'Twelve Data · Kullanıcı anahtarı', freshness: quote.freshness, symbol: quote.symbol, price: quote.price };
        } catch (error) { record('market', false, { message: error.message }); throw error; }
      }
      try { const data = await apiClient.request('/api/market/test'); record('market', true, { label: data.provider, freshness: data.freshness }); return data; } catch (error) {
        const friendly = new ProviderClientError('missing_key', 'Twelve Data anahtarı girilmedi. API Yönetimi bölümünden anahtar ekleyip tekrar test edin.', 'twelve_data', 0);
        record('market', false, { message: friendly.message });
        throw friendly;
      }
    }
  };

  const bistProvider = {
    id: 'bist',
    micCode: 'XIST',
    testSymbol: 'THYAO',
    normalizeSymbol(symbol) {
      const normalized = String(symbol || '').trim().toUpperCase().replace(/^(?:XIST|BIST):/, '').replace(/\.IS$/, '');
      if (!/^[A-Z0-9]{2,12}$/.test(normalized)) throw new ProviderClientError('invalid_symbol', userMessage('invalid_symbol'), 'bist', 400);
      return normalized;
    },
    endpointFor(symbol, endpoint = 'price') {
      const clean = this.normalizeSymbol(symbol);
      const endpointMap = {
        price: '/api/market/price',
        quote: '/api/market/quote',
        time_series: '/api/market/time-series',
        'time-series': '/api/market/time-series'
      };
      const proxyPath = endpointMap[String(endpoint || 'price').toLowerCase()] || endpointMap.price;
      return `${proxyPath}?symbol=${encodeURIComponent(clean)}`;
    },
    getStatus() {
      const serverStatus = runtime.config?.providers?.bist || {};
      const localKey = Boolean(keyStore.get('twelve_data'));
      return {
        id: this.id,
        provider: 'BIST API',
        source: localKey ? 'Twelve Data · Kullanıcı anahtarı' : 'Twelve Data',
        configured: localKey || Boolean(serverStatus.configured),
        localKey,
        micCode: this.micCode,
        testSymbol: this.testSymbol,
        endpoint: this.endpointFor(this.testSymbol)
      };
    },
    async getQuote(symbol) {
      const clean = this.normalizeSymbol(symbol);
      const endpoint = this.endpointFor(clean);
      try {
        // Öncelik: kullanıcı anahtarı (Twelve Data) → BiQuote → server proxy → ücretsiz zincir (Yahoo→Bigpara→İş Yatırım)
        const data = keyStore.get('twelve_data') ? await twelveDirect.quote(clean)
          : biquoteProvider.ready() ? await biquoteProvider.quote(clean).catch(() => freeBistChain.quote(clean))
          : await apiClient.query('/api/market/price', { symbol: clean, refresh: 1 }).catch(() => freeBistChain.quote(clean));
        const price = data?.price === null || data?.price === undefined || data?.price === '' ? null : Number(data.price);
        if (!Number.isFinite(price)) {
          throw new ProviderClientError('no_data', 'Doğrulanmış BIST fiyat verisi bulunamadı.', 'bist', 0);
        }
        const quote = {
          ...data,
          provider: data?.provider || 'BIST API',
          source: data?.source || data?.provider || null,
          symbol: data?.symbol || clean,
          micCode: data?.micCode || this.micCode,
          price,
          httpStatus: 200,
          endpoint,
          fetchedAt: data?.fetchedAt || data?.timestamp || nowIso(),
          freshness: data?.freshness || 'unknown'
        };
        record('bist', true, {
          label: quote.provider,
          timestamp: quote.fetchedAt,
          freshness: quote.freshness,
          symbol: quote.symbol,
          dataType: quote.dataType,
          dataTimestamp: quote.timestamp,
          isFresh: quote.isFresh,
          freshnessState: quote.freshnessState,
          price: quote.price
        });
        return quote;
      } catch (error) {
        if (error && !error.endpoint) error.endpoint = endpoint;
        record('bist', false, { message: error.message });
        throw error;
      }
    },
    async getHistory(symbol, interval = '1day', range = '1month') {
      const clean = this.normalizeSymbol(symbol);
      const normalizedInterval = String(interval || '1day');
      const rangeMap = { '1day': 5, '5day': 5, '1week': 7, '1month': 30, '3month': 90, '6month': 180, '1year': 365 };
      const requestedSize = rangeMap[String(range).toLowerCase()] || Number(range) || 30;
      const outputsize = Math.min(500, Math.max(5, requestedSize));
      const endpoint = this.endpointFor(clean, 'time-series');
      try {
        // Öncelik: kullanıcı anahtarı (Twelve Data) → server proxy → ücretsiz zincir (Yahoo → İş Yatırım)
        const data = keyStore.get('twelve_data') ? await twelveDirect.timeSeries(clean, normalizedInterval, outputsize) : await apiClient.query('/api/market/time-series', {
          symbol: clean,
          interval: normalizedInterval,
          outputsize,
          refresh: 1
        }).catch(() => freeBistChain.history(clean, outputsize));
        const values = (Array.isArray(data?.values) ? data.values : []).map(row => ({
          datetime: row.datetime || null,
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: row.close === null || row.close === undefined || row.close === '' ? NaN : Number(row.close),
          volume: row.volume === null || row.volume === undefined ? null : Number(row.volume)
        })).filter(row => Number.isFinite(row.close));
        if (!values.length) {
          const error = new ProviderClientError('insufficient_data', 'BIST tarihçe verisi bulunamadı.', 'bist', 0);
          error.endpoint = endpoint;
          throw error;
        }
        const history = {
          ...data,
          provider: data?.provider || 'BIST API',
          source: data?.source || data?.provider || null,
          symbol: data?.symbol || clean,
          micCode: data?.micCode || this.micCode,
          interval: normalizedInterval,
          range,
          outputsize,
          endpoint,
          values
        };
        record('bist', true, {
          label: history.provider,
          timestamp: history.fetchedAt,
          freshness: history.freshness,
          symbol: history.symbol,
          dataType: history.dataType,
          dataTimestamp: history.timestamp,
          isFresh: history.isFresh,
          freshnessState: history.freshnessState
        });
        return history;
      } catch (error) {
        if (error && !error.endpoint) error.endpoint = endpoint;
        record('bist', false, { message: error.message });
        throw error;
      }
    }
  };

  const fallbackMarketProvider = {
    id: 'fallback',
    async test() {
      // Ücretsiz zincir sırayla: Yahoo → Bigpara → İş Yatırım (anahtar gerektirmez); server proxy yalnızca yedek.
      try {
        const q = await freeBistChain.quote('THYAO');
        record('fallback', true, { label: q.provider, freshness: 'delayed', timestamp: q.fetchedAt, symbol: q.symbol, dataType: 'DELAYED/EOD', dataTimestamp: q.timestamp, isFresh: q.isFresh !== false, freshnessState: q.freshnessState, price: q.price });
        return { provider: q.provider, symbol: q.symbol, price: q.price, timestamp: q.timestamp, fetchedAt: q.fetchedAt, dataType: 'DELAYED/EOD', freshness: 'delayed', isFresh: q.isFresh !== false, freshnessState: q.freshnessState };
      } catch (directError) {
        try {
          const data = await apiClient.request('/api/market/fallback-test');
          record('fallback', true, { label: data.provider, freshness: data.freshness || 'eod', timestamp: data.fetchedAt, symbol: data.symbol, price: data.price });
          return data;
        } catch (proxyError) {
          const friendly = new ProviderClientError('provider_unavailable', 'Ücretsiz BIST kaynaklarına (Yahoo/Bigpara/İş Yatırım) ulaşılamadı. (Tarayıcıda CORS engeli olabilir; kurulu uygulamada Capacitor Native HTTP ile doğrudan çalışır.)', 'free_chain', 0);
          record('fallback', false, { message: friendly.message });
          throw friendly;
        }
      }
    }
  };

  /* ---------------------------------------------------------
     MARKETAUX doğrudan istemci (localStorage anahtarıyla).
     --------------------------------------------------------- */
  const marketauxDirect = {
    base: 'https://api.marketaux.com/v1/news/all',
    key() { return keyStore.get('marketaux'); },
    categoryQuery(category) {
      const map = {
        'Piyasa': 'borsa istanbul OR bist', 'BIST': 'bist OR "borsa istanbul"', 'Hisseler': 'hisse',
        'Ekonomi': 'ekonomi OR enflasyon OR faiz', 'Halka Arz': 'halka arz OR ipo',
        'Fonlar': 'yatırım fonu OR portföy', 'Altın': 'altın OR gold', 'Petrol': 'petrol OR brent'
      };
      return map[category] || '';
    },
    async news(options = {}) {
      const key = this.key();
      if (!key) throw new ProviderClientError('missing_key', 'Marketaux API anahtarı girilmedi. Ayarlar → API Yönetimi bölümünden ekleyin.', 'marketaux', 0);
      const url = new URL(this.base);
      url.searchParams.set('api_token', key);
      url.searchParams.set('countries', 'tr');
      url.searchParams.set('language', 'tr');
      url.searchParams.set('limit', String(Math.min(Number(options.limit) || 20, 50)));
      if (options.symbol) url.searchParams.set('search', options.symbol);
      else { const query = this.categoryQuery(options.category); if (query) url.searchParams.set('search', query); }
      const { response, payload } = await fetchJson(url.toString());
      if (payload?.error) {
        const code = payload.error.code === 'invalid_api_token' ? 'invalid_key' : payload.error.code === 'usage_limit_reached' ? 'rate_limit' : 'provider_unavailable';
        throw new ProviderClientError(code, userMessage(code, payload.error.message), 'marketaux', response.status);
      }
      if (!response.ok) throw new ProviderClientError('provider_unavailable', 'Marketaux yanıt vermedi (' + response.status + ').', 'marketaux', response.status);
      const items = (payload.data || []).map(item => ({
        title: item.title || '', description: item.description || '', url: item.url || '',
        source: item.source || 'Marketaux', publishedAt: item.published_at || '',
        sentiment: (() => { const entities = Array.isArray(item.entities) ? item.entities : []; const scores = entities.map(entity => Number(entity.sentiment_score)).filter(Number.isFinite); return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null; })(),
        symbols: [...new Set((Array.isArray(item.entities) ? item.entities : []).map(entity => String(entity.symbol || '').replace(/\.IS$/, '').toUpperCase()).filter(Boolean))],
        categories: []
      }));
      return { provider: 'Marketaux · Kullanıcı anahtarı', fetchedAt: nowIso(), items };
    }
  };

  /* ---------------------------------------------------------
     ÜCRETSİZ HABER KAYNAĞI (anahtar gerektirmez)
     Google News RSS (TR ekonomi/borsa) → JSON'a çevrilerek okunur.
     Marketaux anahtarı yoksa otomatik devreye girer.
     Not: Tarayıcıda CORS engellenebilir; kurulu uygulamada çalışır.
     --------------------------------------------------------- */
  const freeNewsProvider = {
    queryFor(category, symbol, symbolName) {
      if (symbol) {
        const name = String(symbolName || '').replace(/["']/g, '').trim();
        // Şirket adı biliniyorsa adıyla ara (CITAS gibi yeni/az bilinen kodlarda kod araması boş döner)
        return name ? '"' + name.split(/\s+/).slice(0, 2).join(' ') + '" OR ' + symbol + ' hisse' : symbol + ' hisse';
      }
      const map = { 'Piyasa': 'borsa istanbul', 'BIST': 'BIST 100', 'Hisseler': 'hisse senedi',
        'Ekonomi': 'türkiye ekonomi', 'Halka Arz': 'halka arz talep toplama',
        'Fonlar': 'yatırım fonu', 'Altın': 'gram altın', 'Petrol': 'brent petrol' };
      return map[category] || 'borsa ekonomi';
    },
    async news(options = {}) {
      const q = this.queryFor(options.category, options.symbol, options.symbolName);
      const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=tr&gl=TR&ceid=TR:tr';
      // 1) Doğrudan RSS (kurulu uygulamada Capacitor Native HTTP CORS'suz; tarayıcıda takılabilir)
      try {
        const response = await nativeFetchRaw(url, { accept: 'application/rss+xml, text/xml, */*', timeoutMs: 15000 });
        if (!response.ok) throw new ProviderClientError('provider_unavailable', 'Haber kaynağına ulaşılamadı (' + response.status + ').', 'google_news', response.status);
        const xml = response.text;
        const items = [];
        const re = /<item>([\s\S]*?)<\/item>/g; let m;
        while ((m = re.exec(xml)) && items.length < (options.limit || 25)) {
          const block = m[1];
          const pick = tag => { const r = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>')); return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim() : ''; };
          const title = pick('title'), link = pick('link'), pub = pick('pubDate'), rawDesc = pick('description');
          const srcMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);
          if (title) items.push({ title, description: stripHtmlText(rawDesc, title), url: link, source: srcMatch ? srcMatch[1].trim() : 'Google News', publishedAt: pub ? new Date(pub).toISOString() : '', sentiment: null, symbols: options.symbol ? [options.symbol] : [], categories: options.category && options.category !== 'Tümü' ? [options.category] : [] });
        }
        if (!items.length) throw new ProviderClientError('no_data', 'Bu filtre için haber bulunamadı.', 'google_news');
        return { provider: 'Google News RSS · Ücretsiz', fetchedAt: nowIso(), items };
      } catch (directError) {
        // 2) Tarayıcı CORS yedeği: rss2json.com (CORS başlıklı ücretsiz JSON köprüsü — bu ortamdan canlı doğrulandı)
        const bridge = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url);
        const { ok, status, payload } = await nativeFetchJson(bridge, { timeoutMs: 15000 });
        const rows = Array.isArray(payload?.items) ? payload.items : [];
        if (!ok || payload?.status !== 'ok' || !rows.length) throw directError;
        const items = rows.slice(0, options.limit || 25).map(row => ({
          title: String(row.title || '').trim(),
          description: stripHtmlText(row.description || row.content || '', row.title),
          url: row.link || '',
          source: (String(row.title || '').match(/ - ([^-]+)$/) || [])[1]?.trim() || payload?.feed?.title || 'Google News',
          publishedAt: row.pubDate ? new Date(row.pubDate.replace(' ', 'T') + (row.pubDate.includes('Z') ? '' : 'Z')).toISOString() : '',
          sentiment: null,
          symbols: options.symbol ? [options.symbol] : [],
          categories: options.category && options.category !== 'Tümü' ? [options.category] : []
        })).filter(item => item.title);
        if (!items.length) throw directError;
        return { provider: 'Google News RSS · Ücretsiz (köprü)', fetchedAt: nowIso(), items };
      }
    }
  };
  /* Haber özetlerindeki HTML etiketlerini temizler; başlıkla aynıysa boş döner (sahte özet üretilmez). */
  function stripHtmlText(html, title = '') {
    const text = String(html || '')
      .replace(/<br\s*\/?>(?=.)/gi, ' · ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ').trim();
    if (!text) return '';
    const clean = text.slice(0, 400);
    const t = String(title || '').trim();
    if (t && (clean === t || clean.startsWith(t.slice(0, Math.min(60, t.length))))) {
      const rest = clean.slice(t.length).replace(/^[\s\-–·|]+/, '').trim();
      return rest.length > 20 ? rest : '';
    }
    return clean;
  }

  const newsProvider = {
    id: 'news',
    hasLocalKey() { return Boolean(marketauxDirect.key()); },
    async news(options = {}) {
      if (this.hasLocalKey()) {
        try {
          const data = await marketauxDirect.news(options);
          record('news', true, { label: data.provider, timestamp: data.fetchedAt });
          return data;
        } catch (error) { record('news', false, { message: error.message }); throw error; }
      }
      // Anahtar yok → 1) ücretsiz Google News RSS  2) server proxy  3) net hata
      try {
        const data = await freeNewsProvider.news(options);
        record('news', true, { label: data.provider, timestamp: data.fetchedAt });
        return data;
      } catch (rssError) {
        try {
          const data = await apiClient.query('/api/news', { category: options.category || 'Tümü', symbol: options.symbol || '', limit: options.limit || 20, refresh: options.refresh ? 1 : '' });
          record('news', true, { label: data.provider, timestamp: data.fetchedAt });
          return data;
        } catch (proxyError) {
          const friendly = new ProviderClientError('missing_key', 'Haber alınamadı. Tarayıcıda ücretsiz kaynak CORS engelli olabilir (kurulu uygulamada çalışır) veya Marketaux anahtarı ekleyin: marketaux.com → ücretsiz kayıt → API token.', 'news', 0);
          record('news', false, { message: friendly.message });
          throw friendly;
        }
      }
    },
    async test() {
      if (this.hasLocalKey()) {
        try { const data = await marketauxDirect.news({ limit: 1 }); record('news', true, { label: data.provider }); return data; }
        catch (error) { record('news', false, { message: error.message }); throw error; }
      }
      try { const data = await apiClient.request('/api/news/test'); record('news', true, { label: data.provider }); return data; } catch (error) { record('news', false, { message: error.message }); throw error; }
    }
  };

  const weatherProvider = {
    id: 'weather',
    // Open-Meteo doğrudan bağlantı: ücretsiz, API anahtarı gerektirmez, CORS destekler.
    async fetchOpenMeteo(latitude, longitude) {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', latitude);
      url.searchParams.set('longitude', longitude);
      url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code');
      url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
      url.searchParams.set('timezone', 'auto');
      url.searchParams.set('forecast_days', '1');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new ProviderClientError('provider_unavailable', 'Open-Meteo yanıt vermedi (' + response.status + ').', 'open_meteo', response.status);
        const payload = await response.json();
        if (!payload?.current) throw new ProviderClientError('provider_unavailable', 'Open-Meteo geçerli veri döndürmedi.', 'open_meteo');
        return {
          provider: 'Open-Meteo',
          fetchedAt: nowIso(),
          utcOffsetSeconds: Number(payload.utc_offset_seconds) || 10800,
          current: {
            temperature: payload.current.temperature_2m,
            apparentTemperature: payload.current.apparent_temperature,
            weatherCode: payload.current.weather_code,
            time: payload.current.time || null
          },
          daily: {
            high: Array.isArray(payload.daily?.temperature_2m_max) ? payload.daily.temperature_2m_max[0] : null,
            low: Array.isArray(payload.daily?.temperature_2m_min) ? payload.daily.temperature_2m_min[0] : null
          }
        };
      } finally { clearTimeout(timer); }
    },
    async current(latitude, longitude, refresh = false) {
      try {
        const data = await this.fetchOpenMeteo(latitude, longitude);
        record('weather', true, { label: data.provider, timestamp: data.fetchedAt });
        return data;
      } catch (directError) {
        // Doğrudan bağlantı başarısızsa varsa server proxy denenir.
        try {
          const data = await apiClient.query('/api/weather', { lat: latitude, lon: longitude, refresh: refresh ? 1 : '' });
          record('weather', true, { label: data.provider, timestamp: data.fetchedAt });
          return data;
        } catch (proxyError) {
          record('weather', false, { message: directError.message });
          throw directError;
        }
      }
    },
    async geocode(query, refresh = false) {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.searchParams.set('name', String(query || '').trim());
      url.searchParams.set('count', '5');
      url.searchParams.set('language', 'tr');
      url.searchParams.set('format', 'json');
      try {
        const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store' });
        if (!response.ok) throw new ProviderClientError('provider_unavailable', 'Open-Meteo konum servisi yanıt vermedi.', 'open_meteo', response.status);
        const payload = await response.json();
        return (payload.results || []).map(item => ({ name: item.name, country: item.country || '', latitude: item.latitude, longitude: item.longitude, timezone: item.timezone || 'auto' }));
      } catch (directError) {
        return apiClient.query('/api/weather/geocode', { q: query, refresh: refresh ? 1 : '' });
      }
    },
    async test() {
      try {
        const data = await this.fetchOpenMeteo(37.18111, 33.215);
        record('weather', true, { label: data.provider });
        return data;
      } catch (error) { record('weather', false, { message: error.message }); throw error; }
    }
  };

  /* ---------------------------------------------------------
     ÜCRETSİZ DÖVİZ + ALTIN sağlayıcıları (anahtar gerektirmez,
     CORS destekler → tarayıcıdan ve uygulamadan doğrudan çalışır)
     - Döviz: open.er-api.com (günlük ~1 kez güncellenir)
     - Altın: gold-api.com (gerçek zamanlıya yakın ons fiyatı)
     Gram altın TL = (Ons USD / 31.1034768) × USD/TRY
     --------------------------------------------------------- */
  const freeFx = {
    cache: { rates: null, at: 0, gold: null, goldAt: 0 },
    async rates() {
      if (this.cache.rates && Date.now() - this.cache.at < 30 * 60 * 1000) return this.cache.rates;
      const { response, payload } = await fetchJson('https://open.er-api.com/v6/latest/USD');
      if (!response.ok || payload.result !== 'success' || !payload.rates) throw new ProviderClientError('provider_unavailable', 'Ücretsiz döviz kaynağına ulaşılamadı.', 'open_er_api', response.status);
      this.cache.rates = { usdtry: Number(payload.rates.TRY) || null, eurtry: (Number(payload.rates.TRY) && Number(payload.rates.EUR)) ? Number(payload.rates.TRY) / Number(payload.rates.EUR) : null, updated: payload.time_last_update_utc || '' };
      this.cache.at = Date.now();
      return this.cache.rates;
    },
    async goldOunceUsd() {
      if (this.cache.gold && Date.now() - this.cache.goldAt < 5 * 60 * 1000) return this.cache.gold;
      const { response, payload } = await fetchJson('https://api.gold-api.com/price/XAU');
      const price = Number(payload?.price);
      if (!response.ok || !Number.isFinite(price)) throw new ProviderClientError('provider_unavailable', 'Ücretsiz altın kaynağına ulaşılamadı.', 'gold_api', response.status);
      this.cache.gold = { price, updatedAt: payload.updatedAt || '' };
      this.cache.goldAt = Date.now();
      return this.cache.gold;
    }
  };

  const fxGoldProvider = {
    id: 'fx',
    // Ücretsiz zincir: doğrudan kaynaklar → (yoksa) server proxy
    async quote(symbol, refresh = false) {
      const clean = String(symbol || '').toUpperCase().replace(/[\/\s]/g, '');
      try {
        if (clean === 'USDTRY' || clean === 'EURTRY') {
          const rates = await freeFx.rates();
          const price = clean === 'USDTRY' ? rates.usdtry : rates.eurtry;
          if (!Number.isFinite(price)) throw new ProviderClientError('no_data', 'Kur verisi bulunamadı.', 'open_er_api');
          const data = { provider: 'open.er-api.com · Ücretsiz', symbol: clean, price, freshness: 'delayed', note: 'Günlük referans kuru', updated: rates.updated, fetchedAt: nowIso() };
          record('fx', true, { label: data.provider }); return data;
        }
        if (clean === 'ONSALTIN' || clean === 'XAUUSD' || clean === 'ONS-ALTIN') {
          const gold = await freeFx.goldOunceUsd();
          const data = { provider: 'gold-api.com · Ücretsiz', symbol: 'XAU/USD', price: gold.price, freshness: 'realtime', updated: gold.updatedAt, fetchedAt: nowIso() };
          record('fx', true, { label: data.provider }); return data;
        }
        if (clean === 'GRAMALTIN' || clean === 'GRAM-ALTIN' || clean === 'XAUTRY') {
          const [gold, rates] = await Promise.all([freeFx.goldOunceUsd(), freeFx.rates()]);
          if (!Number.isFinite(rates.usdtry)) throw new ProviderClientError('no_data', 'USD/TRY kuru alınamadı.', 'open_er_api');
          const gram = gold.price / 31.1034768 * rates.usdtry;
          const data = { provider: 'gold-api.com + open.er-api.com · Ücretsiz', symbol: 'GRAM-ALTIN', price: Math.round(gram * 100) / 100, freshness: 'delayed', note: 'Ons canlı × günlük USD/TRY hesaplaması', fetchedAt: nowIso() };
          record('fx', true, { label: data.provider }); return data;
        }
        throw new ProviderClientError('invalid_symbol', 'Desteklenmeyen kur/emtia sembolü: ' + clean, 'fx');
      } catch (freeError) {
        try { const data = await apiClient.query('/api/fx/quote', { symbol, refresh: refresh ? 1 : '' }); record('fx', true, { label: data.provider }); return data; }
        catch (proxyError) { record('fx', false, { message: freeError.message }); throw freeError; }
      }
    },
    async summary() {
      const [rates, gold] = await Promise.all([freeFx.rates(), freeFx.goldOunceUsd()]);
      const gram = (Number.isFinite(gold.price) && Number.isFinite(rates.usdtry)) ? gold.price / 31.1034768 * rates.usdtry : null;
      record('fx', true, { label: 'Ücretsiz kaynaklar' });
      return { provider: 'open.er-api.com + gold-api.com · Ücretsiz', usdtry: rates.usdtry, eurtry: rates.eurtry, onsUsd: gold.price, gramTry: gram === null ? null : Math.round(gram * 100) / 100, ratesUpdated: rates.updated, goldUpdated: gold.updatedAt, fetchedAt: nowIso() };
    },
    async test() {
      try { const data = await this.summary(); return data; }
      catch (error) { record('fx', false, { message: error.message }); throw error; }
    }
  };

  /* ---------------------------------------------------------
     APINOKTAM · 15 dk gecikmeli BIST (kullanıcı planı).
     Anahtar burada saklanır; resmî endpoint dokümanı
     paylaşıldığında bu istemci üzerinden bağlanır.
     --------------------------------------------------------- */
  const apinoktamProvider = {
    id: 'apinoktam',
    key() { return keyStore.get('apinoktam'); },
    configured() { return Boolean(this.key()); },
    async test() {
      if (!this.key()) throw new ProviderClientError('missing_key', 'apinoktam anahtarı girilmedi.', 'apinoktam', 0);
      throw new ProviderClientError('provider_not_configured', 'Anahtar kayıtlı. Endpoint yapılandırması için apinoktam API dokümanını paylaşın; sistem otomatik bağlanacak şekilde hazır.', 'apinoktam', 0);
    }
  };

  /* ---------------------------------------------------------
     YAHOO FINANCE · BIST yedeği (ücretsiz, anahtarsız, ~15 dk
     gecikmeli / kapanışta EOD). Tarayıcıda CORS engeline takılır;
     Android/iOS uygulamasında CapacitorHttp native köprüsü
     sayesinde doğrudan çalışır. Zincirdeki yeri: Twelve Data
     anahtarı yoksa ve server proxy yoksa denenir.
     --------------------------------------------------------- */
  const yahooFree = {
    async quote(symbol) {
      const clean = String(symbol || '').trim().toUpperCase().replace(/\.IS$/, '');
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(clean + '.IS') + '?interval=1d&range=2d';
      const { ok, status, payload } = await nativeFetchJson(url);
      const meta = payload?.chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (!ok || !Number.isFinite(price)) throw new ProviderClientError('no_data', 'Yahoo Finance BIST verisi alınamadı.', 'yahoo', status);
      const prev = Number(meta.chartPreviousClose) || null;
      return {
        provider: 'Yahoo Finance · Ücretsiz (15 dk gecikmeli/EOD)', providerId: 'yahoo_free',
        symbol: clean, companyName: meta.longName || meta.shortName || '',
        price, previousClose: prev,
        change: prev ? price - prev : null, changePct: prev ? (price - prev) / prev * 100 : null,
        volume: Number(meta.regularMarketVolume) || null,
        high: Number(meta.regularMarketDayHigh) || null, low: Number(meta.regularMarketDayLow) || null,
        timestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : '',
        /* v89: gecikmeli ama BUGÜNÜN verisi → güncel sayılır; GECİKMELİ etiketi korunur */
        isFresh: true, freshness: 'delayed', freshnessState: 'DELAYED_15MIN',
        fetchedAt: nowIso()
      };
    },
    async timeSeries(symbol, interval = '1day', outputsize = 30) {
      const clean = String(symbol || '').trim().toUpperCase().replace(/\.IS$/, '');
      const days = Math.min(730, Math.max(5, Number(outputsize) || 30));
      const range = days <= 7 ? '7d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : '2y';
      const yInterval = interval === '1week' ? '1wk' : interval === '1month' ? '1mo' : '1d';
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(clean + '.IS') + '?interval=' + yInterval + '&range=' + range;
      const { ok, status, payload } = await nativeFetchJson(url);
      const result = payload?.chart?.result?.[0];
      const ts = result?.timestamp || [];
      const q = result?.indicators?.quote?.[0] || {};
      if (!ok || !ts.length) throw new ProviderClientError('no_data', 'Yahoo Finance BIST tarihçesi alınamadı.', 'yahoo', status);
      const values = ts.map((t, i) => ({
        datetime: new Date(t * 1000).toISOString().slice(0, 10),
        open: Number(q.open?.[i]), high: Number(q.high?.[i]), low: Number(q.low?.[i]),
        close: Number(q.close?.[i]), volume: Number(q.volume?.[i]) || null
      })).filter(row => Number.isFinite(row.close)).reverse();
      if (!values.length) throw new ProviderClientError('insufficient_data', 'Yahoo Finance tarihçe satırı yok.', 'yahoo', status);
      return { provider: 'Yahoo Finance · Ücretsiz', providerId: 'yahoo_free', symbol: clean, interval, values, freshness: 'eod', fetchedAt: nowIso() };
    }
  };

  /* ---------------------------------------------------------
     BIGPARA (Hürriyet) · Ücretsiz JSON yedek uç noktası.
     GET bigpara.hurriyet.com.tr/api/v1/borsa/hisseyuzeysel/{SEMBOL}
     Anahtarsız; gün içi görece güncel BIST fiyatı döner.
     CORS başlığı yok → tarayıcıda engellenebilir; kurulu
     uygulamada Capacitor Native HTTP ile doğrudan çalışır.
     (Bu ortamdan canlı doğrulandı: GARAN 131.00 · bugünün damgası)
     --------------------------------------------------------- */
  const bigparaProvider = {
    id: 'bigpara',
    async quote(symbol) {
      const clean = String(symbol || '').trim().toUpperCase().replace(/\.IS$/, '');
      const url = 'https://bigpara.hurriyet.com.tr/api/v1/borsa/hisseyuzeysel/' + encodeURIComponent(clean);
      const { ok, status, payload } = await nativeFetchJson(url);
      const h = payload?.data?.hisseYuzeysel;
      const price = Number(h?.kapanis);
      if (!ok || !h || !Number.isFinite(price) || price <= 0) throw new ProviderClientError('no_data', 'Bigpara BIST verisi alınamadı.', 'bigpara', status);
      const prev = Number(h.dunkukapanis) || Number(h.oncekikapanis) || null;
      return {
        provider: 'Bigpara · Ücretsiz yedek', providerId: 'bigpara',
        symbol: h.sembol || clean, companyName: '',
        price, previousClose: prev,
        change: prev ? price - prev : null, changePct: prev ? (price - prev) / prev * 100 : null,
        open: Number(h.acilis) || null, high: Number(h.yuksek) || null, low: Number(h.dusuk) || null,
        volume: Number(h.hacimlot) || null,
        timestamp: h.tarih || '',
        /* v89: gün içi gecikmeli veri güncel sayılır; GECİKMELİ etiketi korunur */
        isFresh: true, freshness: 'delayed', freshnessState: 'DELAYED_15MIN',
        fetchedAt: nowIso()
      };
    }
  };

  /* ---------------------------------------------------------
     İŞ YATIRIM · Ücretsiz JSON yedek uç noktası (tarihçe odaklı).
     GET isyatirim.com.tr/.../HisseTekil?hisse=SEM&startdate=dd-MM-yyyy&enddate=dd-MM-yyyy
     Anahtarsız; günlük kapanış serisi döner. CORS başlığı yok →
     kurulu uygulamada Capacitor Native HTTP ile doğrudan çalışır.
     (Bu ortamdan canlı doğrulandı: THYAO 32 günlük seri)
     --------------------------------------------------------- */
  const isYatirimProvider = {
    id: 'isyatirim',
    fmtDate(d) {
      const p = n => String(n).padStart(2, '0');
      return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
    },
    async history(symbol, days = 30) {
      const clean = String(symbol || '').trim().toUpperCase().replace(/\.IS$/, '');
      const end = new Date();
      const start = new Date(end.getTime() - Math.min(730, Math.max(5, days)) * 86400000 * 1.6);
      const url = 'https://www.isyatirim.com.tr/_layouts/15/IsYatirim.Website/Common/Data.aspx/HisseTekil'
        + '?hisse=' + encodeURIComponent(clean)
        + '&startdate=' + this.fmtDate(start) + '&enddate=' + this.fmtDate(end);
      const { ok, status, payload } = await nativeFetchJson(url);
      const rows = Array.isArray(payload?.value) ? payload.value : [];
      if (!ok || payload?.ok !== true || !rows.length) throw new ProviderClientError('no_data', 'İş Yatırım BIST verisi alınamadı.', 'isyatirim', status);
      const values = rows.map(row => {
        const [dd, mm, yyyy] = String(row.HGDG_TARIH || '').split('-');
        return {
          datetime: yyyy ? yyyy + '-' + mm + '-' + dd : null,
          open: Number(row.HGDG_KAPANIS), high: Number(row.HGDG_MAX), low: Number(row.HGDG_MIN),
          close: Number(row.HGDG_KAPANIS), volume: Number(row.HGDG_HACIM) || null
        };
      }).filter(row => row.datetime && Number.isFinite(row.close)).reverse();
      if (!values.length) throw new ProviderClientError('insufficient_data', 'İş Yatırım tarihçe satırı yok.', 'isyatirim', status);
      return { provider: 'İş Yatırım · Ücretsiz yedek', providerId: 'isyatirim', symbol: clean, interval: '1day', values, freshness: 'eod', fetchedAt: nowIso() };
    },
    async quote(symbol) {
      const history = await this.history(symbol, 7);
      const last = history.values[0], prev = history.values[1] || null;
      return {
        provider: 'İş Yatırım · Ücretsiz yedek (EOD)', providerId: 'isyatirim',
        symbol: history.symbol, companyName: '',
        price: last.close, previousClose: prev ? prev.close : null,
        change: prev ? last.close - prev.close : null, changePct: prev ? (last.close - prev.close) / prev.close * 100 : null,
        high: last.high, low: last.low, volume: last.volume,
        timestamp: last.datetime || '',
        /* v89: son işlem gününün kapanışı CURRENT_EOD → güncel EOD sayılır */
        isFresh: true, freshness: 'eod', freshnessState: 'CURRENT_EOD',
        fetchedAt: nowIso()
      };
    }
  };

  /* ---------------------------------------------------------
     ÜCRETSİZ BIST ZİNCİRİ — sıralı deneme (VERİ YOK ilkesi:
     hiçbir kaynak doğrulanmış fiyat veremezse hata fırlatılır,
     asla sahte değer üretilmez).
     Sıra: Yahoo (varsayılan) → Bigpara → İş Yatırım.
     --------------------------------------------------------- */
  const freeBistChain = {
    id: 'free_bist_chain',
    order: [
      { name: 'yahoo_free', quote: s => yahooFree.quote(s) },
      { name: 'bigpara', quote: s => bigparaProvider.quote(s) },
      { name: 'isyatirim', quote: s => isYatirimProvider.quote(s) }
    ],
    async quote(symbol) {
      let lastError = null;
      for (const step of this.order) {
        try { return await step.quote(symbol); } catch (error) { lastError = error; }
      }
      const browserNote = capacitorHttp() ? '' : ' Tarayıcıda ücretsiz kaynaklar CORS nedeniyle engellenebilir; kurulu Android/iOS uygulamasında native köprüyle çalışır. Web için Twelve Data anahtarı önerilir.';
      throw lastError ? new ProviderClientError(lastError.type || 'no_data', (lastError.message || 'Ücretsiz BIST kaynaklarından veri alınamadı.') + browserNote, lastError.provider || 'free_chain', lastError.status || 0) : new ProviderClientError('no_data', 'Ücretsiz BIST kaynaklarından veri alınamadı.' + browserNote, 'free_chain', 0);
    },
    async history(symbol, outputsize = 30) {
      try { return await yahooFree.timeSeries(symbol, '1day', outputsize); }
      catch (yahooError) {
        try { return await isYatirimProvider.history(symbol, outputsize); }
        catch (isyError) { throw yahooError; }
      }
    }
  };

  /* ---------------------------------------------------------
     BIQUOTE · Ücretsiz API (kullanıcı kaydıyla anahtar alınır).
     Anahtar + istek adresi (endpoint) kullanıcı tarafından
     API Yönetimi panelinden girilir; canlı test aynı panelden
     yapılır. {SYMBOL} ve {KEY} yer tutucuları desteklenir.
     --------------------------------------------------------- */
  const biquoteProvider = {
    id: 'biquote',
    key() { return keyStore.get('biquote'); },
    endpoint() { return keyStore.get('biquote_endpoint'); },
    configured() { return Boolean(this.key()); },
    ready() { return Boolean(this.key() && this.endpoint()); },
    buildUrl(symbol) {
      const clean = String(symbol || '').trim().toUpperCase().replace(/\.IS$/, '');
      let url = this.endpoint();
      if (!url) return '';
      if (/\{SYMBOL\}/i.test(url)) url = url.replace(/\{SYMBOL\}/gi, encodeURIComponent(clean));
      else url += (url.includes('?') ? '&' : '?') + 'symbol=' + encodeURIComponent(clean);
      if (/\{KEY\}/i.test(url)) url = url.replace(/\{KEY\}/gi, encodeURIComponent(this.key()));
      else url += (url.includes('?') ? '&' : '?') + 'apikey=' + encodeURIComponent(this.key());
      return url;
    },
    pickPrice(payload) {
      const candidates = [payload?.price, payload?.last, payload?.close, payload?.lastPrice,
        payload?.data?.price, payload?.data?.last, payload?.data?.close,
        payload?.result?.price, payload?.result?.last,
        Array.isArray(payload?.data) ? payload.data[0]?.price ?? payload.data[0]?.last ?? payload.data[0]?.close : undefined];
      for (const value of candidates) { const n = Number(value); if (Number.isFinite(n) && n > 0) return n; }
      return null;
    },
    async quote(symbol) {
      if (!this.key()) throw new ProviderClientError('missing_key', 'BiQuote anahtarı girilmedi.', 'biquote', 0);
      if (!this.endpoint()) throw new ProviderClientError('provider_not_configured', 'BiQuote istek adresi (endpoint) girilmedi. BiQuote panelindeki örnek istek URL\'sini API Yönetimi bölümüne yapıştırın.', 'biquote', 0);
      const url = this.buildUrl(symbol);
      const { ok, status, payload } = await nativeFetchJson(url);
      const price = this.pickPrice(payload);
      if (!ok || price === null) throw new ProviderClientError('no_data', 'BiQuote doğrulanmış fiyat döndürmedi (' + status + ').', 'biquote', status);
      return {
        provider: 'BiQuote · Kullanıcı anahtarı', providerId: 'biquote',
        symbol: String(symbol || '').trim().toUpperCase().replace(/\.IS$/, ''),
        price, previousClose: null, change: null, changePct: null,
        timestamp: '', isFresh: false, freshness: 'delayed', freshnessState: 'DELAYED_15MIN',
        fetchedAt: nowIso()
      };
    },
    async test() {
      const quote = await this.quote('THYAO');
      record('market', true, { label: quote.provider, freshness: quote.freshness });
      return quote;
    }
  };

  /* ---------------------------------------------------------
     TELEGRAM BOT · bildirim/hatırlatıcı gönderimi.
     Bot token + chat ID yalnızca localStorage'da (stkszApiKeys)
     saklanır. api.telegram.org CORS başlığı açıktır → tarayıcı,
     PWA ve native uygulamada doğrudan çalışır (backend gerekmez).
     Kurulum: @BotFather'dan bot oluştur → token; botla konuşup
     @userinfobot'tan chat ID al.
     --------------------------------------------------------- */
  const telegramProvider = {
    id: 'telegram',
    token() { return keyStore.get('telegram_token'); },
    chatId() { return keyStore.get('telegram_chat'); },
    configured() { return Boolean(this.token() && this.chatId()); },
    async send(text) {
      if (!this.configured()) throw new ProviderClientError('missing_key', 'Telegram bot token ve chat ID girilmedi. Ayarlar → Bildirimler bölümünden ekleyin.', 'telegram', 0);
      const url = 'https://api.telegram.org/bot' + encodeURIComponent(this.token()) + '/sendMessage';
      const body = JSON.stringify({ chat_id: this.chatId(), text: String(text || '').slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok !== true) {
          const desc = payload.description || ('HTTP ' + response.status);
          const type = response.status === 401 ? 'invalid_key' : response.status === 400 ? 'provider_not_configured' : 'provider_unavailable';
          throw new ProviderClientError(type, 'Telegram gönderimi başarısız: ' + desc + (response.status === 400 ? ' (Chat ID doğru mu? Önce bota /start yazmalısın.)' : ''), 'telegram', response.status);
        }
        return { ok: true, messageId: payload.result?.message_id };
      } finally { clearTimeout(timer); }
    },
    async test() {
      return this.send('✅ STKSZ Komuta Merkezi bağlantı testi başarılı.\nBildirimler bu sohbete gelecek.');
    }
  };

  /* ---------------------------------------------------------
     STKSZ AI · Yapay zekâ yorum motoru.
     Varsayılan sağlayıcı: Google Gemini (ÜCRETSİZ anahtar:
     aistudio.google.com → Get API key). İsteğe bağlı OpenAI.
     Anahtar yalnızca localStorage'da; CORS açık → backend yok.
     İlke: AI yalnızca UYGULAMADAKİ DOĞRULANMIŞ verilerle konuşur;
     anahtar yoksa sahte AI içeriği üretilmez.
     --------------------------------------------------------- */
  const stkszAiProvider = {
    id: 'stksz_ai',
    key() { return keyStore.get('stksz_ai'); },
    engine() { return keyStore.rawGet('stksz_ai_engine') === 'openai' ? 'openai' : 'gemini'; },
    /* v96 (SANAL ADIM 3): ÖNERİLEN MOD — STKSZ AI Backend.
       Anahtar CİHAZDA HİÇ BULUNMAZ; yalnız backend URL kaydedilir.
       Backend: server/stksz-ai-server.js (GEMINI_API_KEY sunucu secret). */
    backendUrl() { return String(keyStore.rawGet('stksz_ai_backend_url') || '').trim().replace(/\/+$/, ''); },
    usesBackend() { return Boolean(this.backendUrl()); },
    configured() { return this.usesBackend() || Boolean(this.key()); },
    async backendHealth() {
      const base = this.backendUrl();
      if (!base) throw new ProviderClientError('missing_key', 'Backend URL girilmedi.', 'stksz_ai', 0);
      const { ok, status, payload } = await nativeFetchJson(base + '/api/ai/health', { timeoutMs: 12000 });
      if (!ok || payload.ok !== true) throw new ProviderClientError('provider_unavailable', 'AI backend yanıt vermedi (HTTP ' + status + ').', 'stksz_ai', status);
      return payload;
    },
    async askBackend(question, context = '', options = {}) {
      const base = this.backendUrl();
      const raw = await nativeFetchRaw(base + '/api/ai/ask', {
        method: 'POST', accept: 'application/json', timeoutMs: 60000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, history: options.history || [], toolResults: options.toolResults || [] })
      });
      let payload = {}; try { payload = JSON.parse(raw.text); } catch (e) {}
      if (!raw.ok || payload.ok !== true) throw new ProviderClientError(raw.status === 503 ? 'missing_key' : 'provider_unavailable', payload.error || ('AI backend hatası: HTTP ' + raw.status), 'stksz_ai', raw.status);
      return { text: payload.text || '', toolCalls: Array.isArray(payload.toolCalls) ? payload.toolCalls : [], engine: 'STKSZ AI' };
    },
    async visionBackend(imageBase64, mimeType) {
      const base = this.backendUrl();
      if (!base) throw new ProviderClientError('missing_key', 'Görsel analizi için AI Backend URL gerekli.', 'stksz_ai', 0);
      const raw = await nativeFetchRaw(base + '/api/ai/vision', {
        method: 'POST', accept: 'application/json', timeoutMs: 90000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType })
      });
      let payload = {}; try { payload = JSON.parse(raw.text); } catch (e) {}
      if (!raw.ok || payload.ok !== true) throw new ProviderClientError('provider_unavailable', payload.error || ('AI backend hatası: HTTP ' + raw.status), 'stksz_ai', raw.status);
      return payload;
    },
    async ask(question, context = '', options = {}) {
      if (this.usesBackend()) return this.askBackend(question, context, options);
      if (!this.key()) throw new ProviderClientError('missing_key', 'STKSZ AI bağlı değil. ÖNERİLEN: API Yönetimi → STKSZ AI kartına Backend URL girin (anahtar cihazda tutulmaz). Alternatif: yedek anahtar.', 'stksz_ai', 0);
      const system = 'Sen STKSZ AI\'sın: STKSZ Komuta Merkezi BIST portföy uygulamasının Türkçe yatırım asistanısın. '
        + 'KURALLAR: 1) YALNIZCA sana verilen doğrulanmış uygulama verisini kullan; veri yoksa "VERİ YOK" de, asla uydurma. '
        + '2) Kısa, maddeli ve net Türkçe yaz. 3) Kesin al/sat emri verme; her yanıtın sonunda tek satır "Bu bir yatırım tavsiyesi değildir." ekle. '
        + '4) Rakamları Türk biçiminde yaz (1.234,56 TL).';
      const prompt = (context ? 'UYGULAMA VERİSİ (doğrulanmış):\n' + context + '\n\n' : '') + 'SORU/GÖREV: ' + question;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        if (this.engine() === 'openai') {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.key() },
            body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 700, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new ProviderClientError(response.status === 401 ? 'invalid_key' : 'provider_unavailable', 'STKSZ AI: ' + (payload.error?.message || 'HTTP ' + response.status), 'stksz_ai', response.status);
          const text = payload.choices?.[0]?.message?.content?.trim();
          if (!text) throw new ProviderClientError('no_data', 'AI yanıtı boş döndü.', 'stksz_ai', 0);
          return { text, toolCalls: [], engine: 'STKSZ AI' };
        }
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + encodeURIComponent(this.key()), {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 800 } })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = payload.error?.message || 'HTTP ' + response.status;
          throw new ProviderClientError(response.status === 400 || response.status === 403 ? 'invalid_key' : response.status === 429 ? 'rate_limit' : 'provider_unavailable', 'STKSZ AI: ' + message, 'stksz_ai', response.status);
        }
        const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (!text) throw new ProviderClientError('no_data', 'AI yanıtı boş döndü (güvenlik filtresi olabilir).', 'stksz_ai', 0);
        return { text, toolCalls: [], engine: 'STKSZ AI' };
      } finally { clearTimeout(timer); }
    },
    async test() { if (this.usesBackend()) { const h = await this.backendHealth(); if (!h.keyConfigured) throw new ProviderClientError('missing_key', 'Backend çalışıyor ancak STKSZ AI sunucu anahtarı tanımlı değil.', 'stksz_ai', 503); return { text: 'STKSZ AI bağlı', engine: 'STKSZ AI' }; } return this.ask('Bağlantı testi: tek cümleyle hazır olduğunu söyle.'); }
  };

  function localOnlyConfig() {
    const twelveKey = Boolean(keyStore.get('twelve_data'));
    const marketauxKey = Boolean(keyStore.get('marketaux'));
    const biquoteReady = biquoteProvider.ready();
    // Öncelik sırası: Twelve Data → BiQuote → ücretsiz zincir (Yahoo→Bigpara→İş Yatırım)
    const marketId = twelveKey ? 'twelve_data' : biquoteReady ? 'biquote' : 'free_chain';
    const marketLabel = twelveKey ? 'Twelve Data · Kullanıcı anahtarı'
      : biquoteReady ? 'BiQuote · Kullanıcı anahtarı'
      : 'Ücretsiz zincir · Yahoo → Bigpara → İş Yatırım';
    return {
      mode: 'local-keys',
      providers: {
        market: { id: marketId, label: marketLabel, configured: true, freshness: twelveKey ? 'eod' : 'delayed', secretEnv: 'localStorage · stkszApiKeys' },
        bist: { label: twelveKey ? 'Twelve Data · XIST' : biquoteReady ? 'BiQuote' : 'Ücretsiz zincir (Yahoo/Bigpara/İş Yatırım)', configured: true, localKey: twelveKey || biquoteReady, secretEnv: 'localStorage · stkszApiKeys' },
        fallback: { label: 'Bigpara + İş Yatırım · Ücretsiz yedek uç noktaları', configured: true },
        news: { id: marketauxKey ? 'marketaux' : 'google_news_rss', label: marketauxKey ? 'Marketaux · Kullanıcı anahtarı' : 'Google News RSS · Ücretsiz', configured: true, secretEnv: 'localStorage · stkszApiKeys' },
        weather: { id: 'open_meteo', label: 'Open-Meteo', configured: true },
        fx: { label: 'open.er-api.com + gold-api.com · Ücretsiz', configured: true }
      }
    };
  }

  async function loadProviderConfig(force = false) {
    if (runtime.config && !force) return runtime.config;
    try {
      const serverConfig = await apiClient.request('/api/config');
      // Yerel anahtarlar server yapılandırmasının üzerine bindirilir: kullanıcı anahtarı öncelikli.
      const local = localOnlyConfig().providers;
      const merged = { ...serverConfig, providers: { ...serverConfig.providers } };
      ['market', 'bist', 'news'].forEach(type => {
        if (local[type]?.configured) merged.providers[type] = { ...(merged.providers[type] || {}), ...local[type] };
      });
      if (!merged.providers.weather) merged.providers.weather = local.weather;
      runtime.config = merged;
    } catch (error) {
      // Server proxy yoksa uygulama tamamen kullanıcı anahtarlarıyla çalışır.
      runtime.config = localOnlyConfig();
    }
    Object.entries(runtime.config.providers || {}).forEach(([type, provider]) => {
      if (runtime.providers[type]) {
        runtime.providers[type].label = provider.label;
        if (provider.freshness) runtime.providers[type].freshness = provider.freshness;
      }
    });
    return runtime.config;
  }



  global.STKSZProviders = {
    ProviderClientError,
    apiClient,
    apiKeyStore: keyStore,
    marketDataProvider,
    bistProvider,
    fallbackMarketProvider,
    newsProvider,
    weatherProvider,
    fxGoldProvider,
    yahooFree,
    bigparaProvider,
    isYatirimProvider,
    freeBistChain,
    biquoteProvider,
    telegramProvider,
    stkszAiProvider,
    apinoktamProvider,
    nativeFetchRaw,
    nativeFetchJson,
    runtime,
    loadProviderConfig,
    freshnessLabel,
    userMessage
  };
})(window);
