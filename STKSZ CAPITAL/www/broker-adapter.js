/* =====================================================================
   STKSZ BROKER ADAPTER KATMANI · v102 (SANAL ADIM 9)
   ---------------------------------------------------------------------
   AMAÇ: Portföy / Grafik / AI / UI katmanları aracı kuruma DOĞRUDAN
   bağlanmaz; her zaman bu tek arayüz üzerinden konuşur:

       UI · AI · Portföy
            ↓
       STKSZBroker.active()   ←— adapter kayıt defteri
            ↓
       ┌───────────────────────────────────────────────┐
       │ MockBrokerAdapter   → SANAL CÜZDAN (bugün)    │
       │ MidasAdapter        → KİLİTLİ iskelet (yarın) │
       │ FutureBrokerAdapter → şablon                  │
       └───────────────────────────────────────────────┘

   Gelecekte gerçek bir aracı kurum API'si (gerekli yetki/anlaşmayla)
   geldiğinde yalnız yeni adapter yazılır ve registerAdapter ile
   eklenir — üst katmanlarda değişiklik GEREKMEZ.

   GÜVENLİK SÖZLEŞMESİ (tüm adapter'lar için bağlayıcı):
   - Aracı kurum API anahtarı/token'ı frontend'e, AI'ya, loglara ASLA
     girmez; yalnız backend ortam secret'ında yaşar. Adapter'lar
     kimlik bilgisini SAKLAMAZ; yalnız backend uç noktası çağırır.
   - capabilities.realMoney=false olan adapter gerçek emir GÖNDEREMEZ.
   - Gerçek emir fonksiyonları (placeOrder vb.) canlı adapter'da bile
     backend onay zinciri + kullanıcı onayı olmadan çalıştırılamaz.
   ===================================================================== */
(function (global) {
  'use strict';

  function ok(data) { return Object.assign({ ok: true }, data); }
  function err(message, code) { return { ok: false, error: String(message || 'Bilinmeyen hata'), code: code || 'error' }; }

  /* ---------- ORTAK ARAYÜZ TANIMI (belgeleyici sözleşme) ----------
     Her adapter şu metotları uygular:
       id, label, capabilities:{realMoney, cancelOrders, liveBalance}
       isConnected()          → bool
       getBrokerBalance()     → {ok, currency, cash, total}
       getBrokerPositions()   → {ok, positions:[{symbol,quantity,averageCost,...}]}
       getBrokerOrders()      → {ok, orders:[...]}
       placeOrder(order)      → {ok, orderId|transaction} — GERÇEK PARA YOK (mock)
       cancelOrder(orderId)   → {ok}
  ------------------------------------------------------------------ */

  /* ============ 1) MockBrokerAdapter — SANAL CÜZDAN (aktif) ============ */
  var MockBrokerAdapter = {
    id: 'mock',
    label: 'Sanal Cüzdan (Simülasyon)',
    capabilities: { realMoney: false, cancelOrders: false, liveBalance: true },
    _engine: function () { return global.STKSZVirtualWallet || null; },
    isConnected: function () { var e = this._engine(); return Boolean(e && e.isInitialized && e.isInitialized()); },
    getBrokerBalance: function () {
      var e = this._engine(); if (!e) return err('Sanal cüzdan motoru yüklü değil.');
      var w = e.getWallet();
      if (!w.initialized) return err('Sanal cüzdan başlatılmadı.', 'not_connected');
      return ok({ currency: 'TRY', cash: w.totalCashTRY, total: w.totalPortfolioValue, realizedNet: w.realizedNet, simulated: true });
    },
    getBrokerPositions: function () {
      var e = this._engine(); if (!e) return err('Sanal cüzdan motoru yüklü değil.');
      return ok({ positions: e.getPositions(), simulated: true });
    },
    getBrokerOrders: function (limit) {
      var e = this._engine(); if (!e) return err('Sanal cüzdan motoru yüklü değil.');
      return ok({ orders: e.getTransactions(typeof limit === 'number' ? limit : 20), simulated: true });
    },
    placeOrder: function (order) {
      /* GERÇEK PARA İŞLEMİ YAPMAZ — sanal motora yönlendirir.
         Kullanıcı onayı üst katmanda (vwTradeConfirm) alınmıştır. */
      var e = this._engine(); if (!e) return err('Sanal cüzdan motoru yüklü değil.');
      var r = e.executeOrder(Object.assign({}, order, { source: (order && order.source) || 'BrokerAdapter · mock' }));
      return r.ok ? ok({ orderId: r.transaction.id, side: r.side, symbol: r.symbol, quantity: r.quantity, price: r.price, commission: r.commission, realizedPnL: typeof r.realizedPnL === 'number' ? r.realizedPnL : undefined, transaction: r.transaction, wallet: r.wallet, simulated: true }) : err(r.error, 'rejected');
    },
    cancelOrder: function () { return err('Sanal cüzdanda bekleyen emir modeli yok; işlemler anında gerçekleşir.', 'unsupported'); }
  };

  /* ============ 2) MidasAdapter — KİLİTLİ İSKELET (gelecek) ============
     Midas'ın resmî/yetkili bir API'si kullanılabilir olduğunda bu
     iskelet doldurulacak. O güne kadar HER metot güvenli şekilde
     reddeder. Kimlik bilgisi burada TUTULMAZ; tüm çağrılar backend'in
     /api/broker/* uçlarına gider (secret yalnız sunucuda). */
  var LOCKED_MESSAGE = 'MidasAdapter henüz etkin değil: resmî aracı kurum API erişimi ve yasal yetki gerektirir. Gerçek emir gönderilmez.';
  var MidasAdapter = {
    id: 'midas',
    label: 'Midas (gelecek · kilitli)',
    capabilities: { realMoney: true, cancelOrders: true, liveBalance: true },
    enabled: false, /* gerçek entegrasyon gününe kadar false — placeOrder çift kilitli */
    _backend: function () {
      var ks = global.STKSZProviders && global.STKSZProviders.apiKeyStore;
      return ks && ks.rawGet ? String(ks.rawGet('stksz_ai_backend_url') || '').trim().replace(/\/+$/, '') : '';
    },
    isConnected: function () { return false; },
    getBrokerBalance: function () { return err(LOCKED_MESSAGE, 'not_enabled'); },
    getBrokerPositions: function () { return err(LOCKED_MESSAGE, 'not_enabled'); },
    getBrokerOrders: function () { return err(LOCKED_MESSAGE, 'not_enabled'); },
    placeOrder: function () {
      /* ÇİFT KİLİT: enabled=false VE backend onay zinciri şartı.
         Bu metot etkinleştirilse bile emir yalnız backend'e iletilir;
         anahtar/imza yalnız sunucudadır. */
      if (!this.enabled) return err(LOCKED_MESSAGE, 'not_enabled');
      return err('Gerçek emir akışı backend onay zinciri olmadan çalıştırılamaz.', 'approval_required');
    },
    cancelOrder: function () { return err(LOCKED_MESSAGE, 'not_enabled'); }
  };

  /* ============ 3) FutureBrokerAdapter — ŞABLON ============ */
  function FutureBrokerAdapter(id, label) {
    return {
      id: id, label: label || id,
      capabilities: { realMoney: false, cancelOrders: false, liveBalance: false },
      enabled: false,
      isConnected: function () { return false; },
      getBrokerBalance: function () { return err(label + ' adapter henüz uygulanmadı.', 'not_implemented'); },
      getBrokerPositions: function () { return err(label + ' adapter henüz uygulanmadı.', 'not_implemented'); },
      getBrokerOrders: function () { return err(label + ' adapter henüz uygulanmadı.', 'not_implemented'); },
      placeOrder: function () { return err(label + ' adapter henüz uygulanmadı.', 'not_implemented'); },
      cancelOrder: function () { return err(label + ' adapter henüz uygulanmadı.', 'not_implemented'); }
    };
  }

  /* ============ KAYIT DEFTERİ ============ */
  var registry = { mock: MockBrokerAdapter, midas: MidasAdapter };
  var activeId = 'mock'; /* bugün: sanal cüzdan */

  var STKSZBroker = {
    registerAdapter: function (adapter) {
      if (!adapter || !adapter.id || typeof adapter.placeOrder !== 'function') return err('Geçersiz adapter.');
      registry[adapter.id] = adapter; return ok({ id: adapter.id });
    },
    list: function () { return Object.values(registry).map(function (a) { return { id: a.id, label: a.label, connected: Boolean(a.isConnected && a.isConnected()), realMoney: Boolean(a.capabilities && a.capabilities.realMoney), enabled: a.enabled !== false }; }); },
    active: function () { return registry[activeId] || MockBrokerAdapter; },
    setActive: function (id) {
      var a = registry[id]; if (!a) return err('Adapter bulunamadı: ' + id);
      if (a.capabilities && a.capabilities.realMoney && a.enabled === false) return err('Gerçek para adapteri kilitli; sanal cüzdan tamamlanmadan etkinleştirilemez.', 'locked');
      activeId = id; return ok({ active: id });
    },
    /* üst katmanların kullanacağı tek kapı */
    placeOrder: function (order) { return this.active().placeOrder(order); },
    cancelOrder: function (orderId) { return this.active().cancelOrder(orderId); },
    getBrokerBalance: function () { return this.active().getBrokerBalance(); },
    getBrokerPositions: function () { return this.active().getBrokerPositions(); },
    getBrokerOrders: function (limit) { return this.active().getBrokerOrders(limit); },
    FutureBrokerAdapter: FutureBrokerAdapter
  };

  global.STKSZBroker = STKSZBroker;
  if (typeof module !== 'undefined' && module.exports) module.exports = STKSZBroker;
})(typeof window !== 'undefined' ? window : globalThis);
