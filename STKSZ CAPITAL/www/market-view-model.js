(function initStkszMarketViewModel(global) {
  'use strict';

  const REQUIRED_BIST_SYMBOLS = Object.freeze(['THYAO', 'ASELS', 'ISCTR', 'KCHOL', 'TUPRS']);
  const BIST_NAMES = Object.freeze({
    THYAO: 'Türk Hava Yolları',
    ASELS: 'Aselsan',
    ISCTR: 'Türkiye İş Bankası C',
    KCHOL: 'Koç Holding',
    TUPRS: 'Tüpraş'
  });

  function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  class DataProvider {
    normalizeSymbol(symbol) {
      const clean = String(symbol || '').trim().toUpperCase().replace(/^(?:XIST|BIST):/, '').replace(/\.IS$/, '');
      if (!/^[A-Z0-9]{2,12}$/.test(clean)) {
        const error = new Error('Geçersiz BIST sembolü.');
        error.type = 'invalid_symbol';
        throw error;
      }
      return clean;
    }
  }

  class MarketDataProvider extends DataProvider {
    constructor(client = global.STKSZProviders?.marketDataProvider) {
      super();
      this.client = client;
    }

    async quote(symbol, options = {}) {
      const clean = this.normalizeSymbol(symbol);
      if (!this.client?.quote) {
        const error = new Error('Market data provider kullanılamıyor.');
        error.type = 'provider_unavailable';
        throw error;
      }
      return this.client.quote(clean, Boolean(options.refresh));
    }
  }

  class BISTDataProvider extends MarketDataProvider {
    constructor(client) {
      super(client);
      this.micCode = 'XIST';
    }

    async quote(symbol, options = {}) {
      const clean = this.normalizeSymbol(symbol);
      const data = await super.quote(clean, options);
      const price = finite(data?.price);
      if (price === null) {
        const error = new Error('Doğrulanmış BIST fiyat verisi bulunamadı.');
        error.type = 'no_data';
        throw error;
      }
      return { ...data, symbol: clean, price, micCode: data?.micCode || this.micCode };
    }
  }

  class EODDataProvider extends DataProvider {
    normalize(data, symbol) {
      const clean = this.normalizeSymbol(symbol || data?.symbol);
      const dataType = String(data?.dataType || data?.freshness || 'unknown').toUpperCase();
      return {
        symbol: clean,
        companyName: data?.companyName || BIST_NAMES[clean] || null,
        price: finite(data?.price),
        change: finite(data?.change),
        changePct: finite(data?.changePct),
        volume: finite(data?.volume),
        timestamp: data?.timestamp || data?.fetchedAt || null,
        fetchedAt: data?.fetchedAt || null,
        provider: data?.provider || null,
        providerId: data?.providerId || null,
        source: data?.source || data?.provider || null,
        dataType,
        isEod: dataType === 'EOD' || String(data?.freshness || '').toLowerCase() === 'eod',
        isFresh: data?.isFresh !== false,
        freshnessState: data?.freshnessState || null
      };
    }
  }

  class BISTMarketViewModel {
    constructor(options = {}) {
      this.provider = options.provider || new BISTDataProvider();
      this.eodProvider = options.eodProvider || new EODDataProvider();
      this.cacheTtlMs = Math.max(60_000, Number(options.cacheTtlMs) || 15 * 60_000);
      this.cache = new Map();
      this.inFlight = new Map();
    }

    cached(symbol) {
      const entry = this.cache.get(symbol);
      return entry && Date.now() - entry.savedAt < this.cacheTtlMs ? entry.value : null;
    }

    async requestQuote(symbol, refresh = false) {
      const clean = this.provider.normalizeSymbol(symbol);
      if (!refresh) {
        const cached = this.cached(clean);
        if (cached) return cached;
      }
      if (this.inFlight.has(clean)) return this.inFlight.get(clean);

      const task = (async () => {
        let attempt = 0;
        while (attempt < 2) {
          try {
            const raw = await this.provider.quote(clean, { refresh: refresh && attempt === 0 });
            const value = this.eodProvider.normalize(raw, clean);
            if (value.price === null) {
              const error = new Error('Doğrulanmış BIST fiyat verisi bulunamadı.');
              error.type = 'no_data';
              throw error;
            }
            this.cache.set(clean, { savedAt: Date.now(), value });
            return value;
          } catch (error) {
            attempt += 1;
            if (attempt >= 2 || !['network', 'timeout'].includes(error?.type)) throw error;
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        return null;
      })().finally(() => this.inFlight.delete(clean));

      this.inFlight.set(clean, task);
      return task;
    }

    async load(symbols = REQUIRED_BIST_SYMBOLS, options = {}) {
      const unique = [...new Set(symbols.map(symbol => this.provider.normalizeSymbol(symbol)))];
      const rows = [];
      for (const symbol of unique) {
        try {
          rows.push(await this.requestQuote(symbol, Boolean(options.refresh)));
        } catch (error) {
          rows.push({
            symbol,
            companyName: BIST_NAMES[symbol] || null,
            price: null,
            change: null,
            changePct: null,
            volume: null,
            timestamp: null,
            fetchedAt: null,
            provider: null,
            providerId: null,
            source: null,
            dataType: 'DATA_UNAVAILABLE',
            isEod: false,
            isFresh: false,
            freshnessState: 'DATA_UNAVAILABLE',
            error: error?.type || 'provider_unavailable'
          });
        }
      }
      return rows;
    }
  }

  global.STKSZMarket = {
    DataProvider,
    MarketDataProvider,
    BISTDataProvider,
    EODDataProvider,
    BISTMarketViewModel,
    REQUIRED_BIST_SYMBOLS,
    discoveryViewModel: new BISTMarketViewModel()
  };
})(window);
