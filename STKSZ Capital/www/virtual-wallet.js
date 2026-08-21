/* =====================================================================
   STKSZ SANAL CÜZDAN MOTORU · v94 (SANAL ADIM 1)
   ---------------------------------------------------------------------
   TAMAMEN SİMÜLASYON KATMANI:
   - GERÇEK PARA DEĞİLDİR. Banka/aracı kurum bağlantısı YOKTUR.
   - Gerçek portföy kaydından (stkszData) TAMAMEN AYRI saklanır:
     localStorage anahtarı: stkszVirtualWallet
   - Tüm hesaplamalar bu TEK merkezi servis üzerinden yapılır;
     UI hiçbir yerde kendi başına tutar hesaplamaz.
   - Fiyat: dışarıdan enjekte edilen priceProvider ile (gerçek doğrulanmış
     piyasa fiyatı varsa o; yoksa null → sahte fiyat ÜRETİLMEZ, pozisyon
     maliyet değeriyle ve "fiyat doğrulanmadı" bayrağıyla raporlanır).
   ===================================================================== */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'stkszVirtualWallet';
  var VERSION = 1;

  function n(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    var x = Number(String(v).replace(',', '.'));
    return Number.isFinite(x) ? x : null;
  }
  function round2(v) { return Math.round(v * 100) / 100; }
  function nowIso() { return new Date().toISOString(); }
  function uid() { return 'vtx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function emptyState() {
    return {
      v: VERSION,
      createdAt: '',
      /* Wallet modeli */
      wallet: { TRY: null, USD: 0, EUR: 0 },
      initialTry: null,
      /* Position modeli listesi */
      positions: [],   // {symbol, quantity, averageCost}
      /* Transaction modeli listesi */
      transactions: [], // {id,symbol,side,quantity,price,commission,totalAmount,currency,timestamp,source,note}
      realized: { profit: 0, loss: 0 },
      settings: { commissionRate: 0 } // varsayılan %0; işlem bazında açık komisyon girilebilir
    };
  }

  var engine = {
    _state: null,
    _priceProvider: null, // fn(symbol) => Number|null (yalnız DOĞRULANMIŞ gerçek fiyat; yoksa null)
    _storage: (typeof localStorage !== 'undefined') ? localStorage : null,

    /* ---------- kalıcılık ---------- */
    _load: function () {
      if (this._state) return this._state;
      var raw = null;
      try { raw = this._storage ? this._storage.getItem(STORAGE_KEY) : null; } catch (e) {}
      var parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
      this._state = this._hydrate(parsed);
      return this._state;
    },
    _hydrate: function (raw) {
      var base = emptyState();
      if (!raw || typeof raw !== 'object') return base;
      if (raw.wallet && typeof raw.wallet === 'object') {
        base.wallet.TRY = n(raw.wallet.TRY);
        base.wallet.USD = n(raw.wallet.USD) || 0;
        base.wallet.EUR = n(raw.wallet.EUR) || 0;
      }
      if (typeof raw.createdAt === 'string') base.createdAt = raw.createdAt;
      if (n(raw.initialTry) !== null) base.initialTry = n(raw.initialTry);
      if (Array.isArray(raw.positions)) base.positions = raw.positions
        .filter(function (p) { return p && p.symbol && n(p.quantity) > 0 && n(p.averageCost) !== null; })
        .map(function (p) { return { symbol: String(p.symbol).toUpperCase(), quantity: n(p.quantity), averageCost: n(p.averageCost) }; });
      if (Array.isArray(raw.transactions)) base.transactions = raw.transactions.slice(-1000);
      if (raw.realized && typeof raw.realized === 'object') {
        base.realized.profit = n(raw.realized.profit) || 0;
        base.realized.loss = n(raw.realized.loss) || 0;
      }
      if (raw.settings && typeof raw.settings === 'object' && n(raw.settings.commissionRate) !== null)
        base.settings.commissionRate = Math.max(0, Math.min(5, n(raw.settings.commissionRate)));
      return base;
    },
    _save: function () {
      try { if (this._storage) this._storage.setItem(STORAGE_KEY, JSON.stringify(this._state)); } catch (e) {}
    },

    /* ---------- kurulum ---------- */
    isInitialized: function () { return n(this._load().wallet.TRY) !== null; },
    init: function (startingTry) {
      var amount = n(startingTry);
      if (amount === null || amount <= 0) return { ok: false, error: 'Geçerli bir başlangıç bakiyesi girin (örn. 100000).' };
      var s = this._load();
      if (this.isInitialized()) return { ok: false, error: 'Sanal cüzdan zaten tanımlı. Önce sıfırlayın.' };
      s.wallet.TRY = round2(amount);
      s.initialTry = round2(amount); /* v101: senkron replay tabanı */
      s.createdAt = nowIso();
      this._save();
      return { ok: true, wallet: this.getWallet() };
    },
    reset: function () {
      this._state = emptyState();
      try { if (this._storage) this._storage.removeItem(STORAGE_KEY); } catch (e) {}
      return { ok: true };
    },
    setPriceProvider: function (fn) { this._priceProvider = (typeof fn === 'function') ? fn : null; },
    setCommissionRate: function (pct) {
      var v = n(pct); if (v === null || v < 0 || v > 5) return { ok: false, error: 'Komisyon oranı %0-%5 aralığında olmalı.' };
      var s = this._load(); s.settings.commissionRate = v; this._save(); return { ok: true };
    },

    /* ---------- İŞLEM MOTORU (AL / SAT) ---------- */
    executeOrder: function (order) {
      var s = this._load();
      if (!this.isInitialized()) return { ok: false, error: 'Önce sanal bakiye tanımlayın.' };
      var symbol = String(order && order.symbol || '').toUpperCase().trim();
      var side = String(order && order.side || '').toUpperCase().trim();
      var quantity = n(order && order.quantity);
      var price = n(order && order.price);
      var explicitCommission = n(order && order.commission);
      if (!/^[A-Z0-9ÇĞİÖŞÜ.]{2,12}$/.test(symbol)) return { ok: false, error: 'Geçersiz sembol.' };
      if (side !== 'AL' && side !== 'SAT') return { ok: false, error: 'İşlem türü AL veya SAT olmalı.' };
      if (quantity === null || quantity <= 0) return { ok: false, error: 'Lot 0\'dan büyük olmalı.' };
      if (price === null || price <= 0) return { ok: false, error: 'Fiyat 0\'dan büyük olmalı.' };

      var gross = quantity * price;
      var commission = explicitCommission !== null ? explicitCommission : round2(gross * s.settings.commissionRate / 100);
      if (commission < 0) return { ok: false, error: 'Komisyon negatif olamaz.' };

      var position = s.positions.find(function (p) { return p.symbol === symbol; });
      var result = { symbol: symbol, side: side, quantity: quantity, price: price, commission: commission };

      if (side === 'AL') {
        var cost = round2(gross + commission);
        if (cost > s.wallet.TRY + 1e-9) return { ok: false, error: 'Yetersiz sanal bakiye. Gerekli: ' + cost.toFixed(2) + ' TL, mevcut: ' + s.wallet.TRY.toFixed(2) + ' TL.' };
        s.wallet.TRY = round2(s.wallet.TRY - cost);
        if (!position) { position = { symbol: symbol, quantity: 0, averageCost: 0 }; s.positions.push(position); }
        /* ortalama maliyet: komisyon dahil ağırlıklı ortalama */
        position.averageCost = (position.quantity * position.averageCost + gross + commission) / (position.quantity + quantity);
        position.quantity += quantity;
        result.totalAmount = cost;
      } else {
        if (!position || position.quantity + 1e-9 < quantity) return { ok: false, error: 'Yetersiz pozisyon: eldeki ' + (position ? position.quantity : 0) + ' lot, satılmak istenen ' + quantity + ' lot.' };
        var proceeds = round2(gross - commission);
        if (proceeds < 0) return { ok: false, error: 'Komisyon satış tutarından büyük olamaz.' };
        s.wallet.TRY = round2(s.wallet.TRY + proceeds);
        var realized = round2((price - position.averageCost) * quantity - commission);
        if (realized >= 0) s.realized.profit = round2(s.realized.profit + realized);
        else s.realized.loss = round2(s.realized.loss + Math.abs(realized));
        position.quantity = round2(position.quantity - quantity) === 0 ? 0 : position.quantity - quantity;
        if (position.quantity <= 1e-9) s.positions = s.positions.filter(function (p) { return p !== position; });
        result.totalAmount = proceeds;
        result.realizedPnL = realized;
      }

      var tx = {
        id: uid(), symbol: symbol, side: side, quantity: quantity, price: price,
        commission: commission, totalAmount: result.totalAmount, currency: 'TRY',
        timestamp: (order && order.timestamp) || nowIso(),
        source: (order && order.source) || 'Sanal cüzdan · manuel',
        note: String(order && order.note || '')
      };
      s.transactions.push(tx);
      s.transactions = s.transactions.slice(-1000);
      this._save();
      result.ok = true; result.transaction = tx; result.wallet = this.getWallet();
      return result;
    },

    /* ---------- SENKRON REPLAY (v101 · ADIM 8) ----------
       İki cihazın işlem listeleri unique ID ile birleştirildikten sonra
       bakiye/pozisyonlar/K-Z, işlemler zaman sırasıyla YENİDEN OYNATILARAK
       deterministik türetilir — çakışmada hiçbir işlem kaybolmaz. */
    replayFromTransactions: function (initialTry, transactions) {
      var start = n(initialTry);
      if (start === null || start < 0) return { ok: false, error: 'Başlangıç bakiyesi geçersiz.' };
      var s = emptyState();
      s.wallet.TRY = round2(start);
      s.initialTry = round2(start); /* replay sonrası taban korunur — senkron zinciri kopmaz */
      s.createdAt = this._load().createdAt || nowIso();
      s.settings = this._load().settings;
      var list = (Array.isArray(transactions) ? transactions : []).slice().sort(function (a, b) { return String(a.timestamp || '').localeCompare(String(b.timestamp || '')); });
      var skipped = [];
      for (var i = 0; i < list.length; i++) {
        var tx = list[i];
        var side = String(tx && tx.side || '').toUpperCase();
        if (side === 'TEMETTÜ') {
          var amt = n(tx.totalAmount); if (amt === null || amt <= 0) { skipped.push(tx.id); continue; }
          s.wallet.TRY = round2(s.wallet.TRY + amt); s.transactions.push(tx); continue;
        }
        var q = n(tx && tx.quantity), p = n(tx && tx.price), c = n(tx && tx.commission) || 0;
        var sym = String(tx && tx.symbol || '').toUpperCase();
        if (!sym || q === null || q <= 0 || p === null || p <= 0) { skipped.push(tx && tx.id); continue; }
        var pos = s.positions.find(function (x) { return x.symbol === sym; });
        if (side === 'AL') {
          var cost = round2(q * p + c);
          s.wallet.TRY = round2(s.wallet.TRY - cost); /* replay'de negatife düşse bile işlem korunur; sonuç raporlanır */
          if (!pos) { pos = { symbol: sym, quantity: 0, averageCost: 0 }; s.positions.push(pos); }
          pos.averageCost = (pos.quantity * pos.averageCost + q * p + c) / (pos.quantity + q);
          pos.quantity += q;
        } else if (side === 'SAT') {
          if (!pos || pos.quantity + 1e-9 < q) { skipped.push(tx.id); continue; }
          s.wallet.TRY = round2(s.wallet.TRY + round2(q * p - c));
          var realized = round2((p - pos.averageCost) * q - c);
          if (realized >= 0) s.realized.profit = round2(s.realized.profit + realized);
          else s.realized.loss = round2(s.realized.loss + Math.abs(realized));
          pos.quantity = pos.quantity - q;
          if (pos.quantity <= 1e-9) s.positions = s.positions.filter(function (x) { return x !== pos; });
        } else { skipped.push(tx && tx.id); continue; }
        s.transactions.push(tx);
      }
      this._state = s; this._save();
      return { ok: true, skipped: skipped.filter(Boolean), wallet: this.getWallet() };
    },
    exportState: function () { return JSON.parse(JSON.stringify(this._load())); },
    importState: function (raw) {
      var incoming = this._hydrate(raw);
      if (raw && raw._needsReplay && n(raw.initialTry) === null) {
        /* sunucu birleşimi: işlemleri koru, bakiyeyi replay ile türet.
           Başlangıç bakiyesi = eldeki kayıttaki createdAt anındaki değer bilinemezse
           mevcut TRY + eski işlemlerin net etkisi geri alınarak hesaplanamaz;
           bu yüzden istemci push öncesi initialTry alanını state'e yazar. */
      }
      this._state = incoming; this._save();
      return { ok: true };
    },
    applyDividend: function (payload) {
      var s = this._load();
      if (!this.isInitialized()) return { ok: false, error: 'Önce sanal bakiye tanımlayın.' };
      var symbol = String(payload && payload.symbol || '').toUpperCase().trim();
      var amount = n(payload && payload.amount);
      if (!/^[A-Z0-9ÇĞİÖŞÜ.]{2,12}$/.test(symbol)) return { ok: false, error: 'Geçersiz sembol.' };
      if (amount === null || amount <= 0) return { ok: false, error: 'Temettü tutarı 0\'dan büyük olmalı.' };
      s.wallet.TRY = round2(s.wallet.TRY + amount);
      var tx = {
        id: uid(), symbol: symbol, side: 'TEMETTÜ', quantity: n(payload && payload.quantity),
        price: n(payload && payload.perShare), commission: 0, totalAmount: round2(amount), currency: 'TRY',
        timestamp: (payload && payload.timestamp) || nowIso(),
        source: (payload && payload.source) || 'Sanal cüzdan · temettü',
        note: String(payload && payload.note || '')
      };
      s.transactions.push(tx); s.transactions = s.transactions.slice(-1000);
      this._save();
      return { ok: true, symbol: symbol, amount: amount, transaction: tx, wallet: this.getWallet() };
    },

    /* ---------- MERKEZİ HESAPLAMA SERVİSİ ---------- */
    _price: function (symbol) {
      if (!this._priceProvider) return null;
      try { var p = n(this._priceProvider(symbol)); return p !== null && p > 0 ? p : null; } catch (e) { return null; }
    },
    getPositions: function () {
      var self = this, s = this._load();
      return s.positions.map(function (p) {
        var current = self._price(p.symbol);
        var marketValue = current !== null ? round2(p.quantity * current) : null;
        var unrealizedPnL = current !== null ? round2((current - p.averageCost) * p.quantity) : null;
        return {
          symbol: p.symbol,
          quantity: p.quantity,
          averageCost: round2(p.averageCost * 10000) / 10000 === p.averageCost ? p.averageCost : p.averageCost,
          currentPrice: current,                       /* null = doğrulanmış fiyat yok (sahte üretilmez) */
          marketValue: marketValue,
          costValue: round2(p.quantity * p.averageCost),
          unrealizedPnL: unrealizedPnL,
          unrealizedPnLPercent: current !== null && p.averageCost > 0 ? round2((current - p.averageCost) / p.averageCost * 10000) / 100 : null,
          priceVerified: current !== null
        };
      });
    },
    getWallet: function () {
      var s = this._load();
      var positions = this.getPositions();
      var priced = 0, unpricedCost = 0, hasUnpriced = false;
      positions.forEach(function (p) {
        if (p.marketValue !== null) priced += p.marketValue;
        else { unpricedCost += p.costValue; hasUnpriced = true; }
      });
      var cashTry = n(s.wallet.TRY);
      return {
        initialized: cashTry !== null,
        createdAt: s.createdAt,
        TRY: cashTry, USD: s.wallet.USD, EUR: s.wallet.EUR,
        totalCashTRY: cashTry,                                     /* USD/EUR sanal bakiye 0; kur uydurulmaz */
        positionsMarketValue: round2(priced),
        positionsCostValue: round2(unpricedCost),
        hasUnpricedPositions: hasUnpriced,
        /* toplam: nakit + fiyatı doğrulanmış pozisyonlar piyasa değerinden + fiyatsızlar maliyetten (etiketli) */
        totalPortfolioValue: cashTry === null ? null : round2(cashTry + priced + unpricedCost),
        realizedProfit: s.realized.profit,
        realizedLoss: s.realized.loss,
        realizedNet: round2(s.realized.profit - s.realized.loss),
        commissionRate: s.settings.commissionRate,
        transactionCount: s.transactions.length
      };
    },
    getTransactions: function (limit) {
      var s = this._load();
      var list = s.transactions.slice().reverse();
      return typeof limit === 'number' ? list.slice(0, limit) : list;
    }
  };

  global.STKSZVirtualWallet = engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
})(typeof window !== 'undefined' ? window : globalThis);
