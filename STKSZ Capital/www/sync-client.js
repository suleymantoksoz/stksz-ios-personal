/* =====================================================================
   STKSZ SENKRON İSTEMCİSİ · v101 (SANAL ADIM 8)
   ---------------------------------------------------------------------
   iOS ↓↑ STKSZ Backend ↓↑ Database ↑↓ Android — tek hesap, iki cihaz.

   İLKELER:
   - OFFLINE-FIRST: localStorage anlık cache'tir; ekranlar her zaman
     son senkronize veriyi gösterir. Bağlantı gelince otomatik senkron.
   - MERKEZİ KAYNAK: backend/database. push→merge→pull döngüsüyle
     iki cihaz aynı hesapta buluşur.
   - GÜVENLİK: ENR kayıtları ve API anahtarları (stkszApiKeys) ASLA
     senkron edilmez — SYNC_KEYS listesinde yoktur ve gönderim öncesi
     ayrıca süzülür.
   - ÇAKIŞMA: koleksiyon düzeyi LWW; işlem listeleri unique ID
     birleşimi (sunucu) + sanal cüzdan replay (istemci motoru).
   ===================================================================== */
(function (global) {
  'use strict';

  var SYNC_KEYS = ['stkszData', 'stkszVirtualWallet', 'stkszPrefs', 'stkszCardOrder', 'stkszSectionOrder', 'stkszAiHistory'];
  var FORBIDDEN = ['stkszApiKeys', 'stkszEnrPinHash', 'stkszEnrRevealed', 'stkszEnrAuthMethod', 'stkszEnrWebAuthnCredential'];
  var META_KEY = 'stkszSyncMeta';

  function storage() { return (typeof localStorage !== 'undefined') ? localStorage : null; }
  function readMeta() { try { return JSON.parse(storage().getItem(META_KEY) || 'null') || {}; } catch (e) { return {}; } }
  function writeMeta(m) { try { storage().setItem(META_KEY, JSON.stringify(m)); } catch (e) {} }

  var sync = {
    _busy: false,
    _timer: null,
    onStatus: null, /* fn(status, detail) — UI köprüsü */

    /* ---- yapılandırma ---- */
    meta: readMeta,
    baseUrl: function () {
      var ks = global.STKSZProviders && global.STKSZProviders.apiKeyStore;
      var url = ks && ks.rawGet ? String(ks.rawGet('stksz_ai_backend_url') || '') : '';
      return url.trim().replace(/\/+$/, '');
    },
    configured: function () { var m = readMeta(); return Boolean(this.baseUrl() && m.userId && m.token); },
    _status: function (s, d) { try { if (typeof this.onStatus === 'function') this.onStatus(s, d || ''); } catch (e) {} },

    _fetchJson: async function (path, options) {
      var f = global.STKSZProviders && global.STKSZProviders.nativeFetchRaw;
      if (!f) throw new Error('Ağ istemcisi hazır değil.');
      var m = readMeta();
      var headers = { 'Content-Type': 'application/json' };
      if (m.userId && m.token) headers.Authorization = 'Bearer ' + m.userId + '.' + m.token;
      var raw = await f(this.baseUrl() + path, { method: options && options.body ? 'POST' : (options && options.method) || 'GET', headers: headers, body: options && options.body ? JSON.stringify(options.body) : undefined, accept: 'application/json', timeoutMs: 20000 });
      var payload = {}; try { payload = JSON.parse(raw.text); } catch (e) {}
      if (!raw.ok || payload.ok !== true) throw new Error(payload.error || ('Senkron sunucusu hatası: HTTP ' + raw.status));
      return payload;
    },

    /* ---- hesap ---- */
    register: async function () {
      if (!this.baseUrl()) throw new Error('Önce AI Backend URL girin (senkron aynı sunucuyu kullanır).');
      var out = await this._fetchJson('/api/sync/register', { body: {} });
      writeMeta({ userId: out.userId, token: out.token, rev: 0, lastSync: '' });
      return out;
    },
    pair: function (pairCode) {
      var m = String(pairCode || '').trim().match(/^([a-z0-9\-]+)\.([A-Za-z0-9_\-]+)$/i);
      if (!m) return { ok: false, error: 'Eşleştirme kodu biçimi: userId.token' };
      writeMeta({ userId: m[1], token: m[2], rev: 0, lastSync: '' });
      return { ok: true, userId: m[1] };
    },
    unlink: function () { writeMeta({}); },

    /* ---- senkron çekirdeği ---- */
    _collectLocal: function () {
      var s = storage(), out = {}, now = new Date().toISOString();
      SYNC_KEYS.forEach(function (key) {
        if (FORBIDDEN.indexOf(key) !== -1) return;
        var raw = s.getItem(key);
        if (raw === null) return;
        var data = null; try { data = JSON.parse(raw); } catch (e) { return; }
        if (key === 'stkszData' && data && typeof data === 'object') { data = JSON.parse(JSON.stringify(data)); delete data.enr; } /* ENR asla buluta gitmez */
        if (key === 'stkszPrefs' && data && typeof data === 'object') { data = JSON.parse(JSON.stringify(data)); }
        /* v108 (ADIM 15 bulgusu): dokunulmamış koleksiyon 'now' damgasıyla gitmez —
           aksi halde LWW'de eski veri, diğer cihazın yeni verisini ezebilir.
           Damga önceliği: yerel değişiklik zamanı > son senkron zamanı > epoch. */
        var meta = readMeta();
        out[key] = { data: data, updatedAt: (meta.touched || {})[key] || meta.lastSync || '1970-01-01T00:00:00.000Z' };
      });
      return out;
    },
    _applyRemote: function (collections) {
      var s = storage(), applied = [];
      SYNC_KEYS.forEach(function (key) {
        var entry = collections && collections[key];
        if (!entry || typeof entry.data === 'undefined' || entry.data === null) return;
        if (key === 'stkszVirtualWallet' && entry.data && entry.data._needsReplay && global.STKSZVirtualWallet) {
          /* çakışma birleşimi geldi: işlemler unique ID ile birleşik — bakiye replay ile türetilir */
          var initial = entry.data.initialTry;
          var replay = global.STKSZVirtualWallet.replayFromTransactions(initial, entry.data.transactions);
          if (replay && replay.ok) { applied.push(key + ' (replay)'); return; }
        }
        if (key === 'stkszVirtualWallet' && global.STKSZVirtualWallet) {
          /* motor RAM cache'i tazelenir — ekranlar senkron sonrası eski durumu göstermez */
          s.setItem(key, JSON.stringify(entry.data));
          global.STKSZVirtualWallet._state = null;
          applied.push(key);
          return;
        }
        if (key === 'stkszData' && entry.data && typeof entry.data === 'object') {
          /* yereldeki ENR korunur; buluttan gelen veri ENR içermez */
          var localRaw = null; try { localRaw = JSON.parse(s.getItem('stkszData') || 'null'); } catch (e) {}
          if (localRaw && localRaw.enr) entry.data.enr = localRaw.enr;
        }
        s.setItem(key, JSON.stringify(entry.data));
        applied.push(key);
      });
      return applied;
    },
    markTouched: function (key) { var m = readMeta(); m.touched = m.touched || {}; m.touched[key] = new Date().toISOString(); writeMeta(m); },

    syncNow: async function () {
      if (this._busy) return { ok: false, error: 'Senkron zaten sürüyor.' };
      if (!this.configured()) return { ok: false, error: 'Senkron hesabı bağlı değil.' };
      if (global.navigator && global.navigator.onLine === false) { this._status('offline', 'Çevrimdışı — son senkronize veri gösteriliyor.'); return { ok: false, error: 'Çevrimdışı.' }; }
      this._busy = true; this._status('syncing', '');
      try {
        var pushOut = await this._fetchJson('/api/sync/push', { body: { collections: this._collectLocal() } });
        var applied = this._applyRemote(pushOut.collections);
        var m = readMeta(); m.rev = pushOut.rev; m.lastSync = pushOut.serverTime; m.touched = {}; writeMeta(m);
        this._status('ok', 'Senkron tamam · rev ' + pushOut.rev);
        return { ok: true, rev: pushOut.rev, applied: applied, serverTime: pushOut.serverTime };
      } catch (error) {
        this._status('error', error.message);
        return { ok: false, error: error.message };
      } finally { this._busy = false; }
    },

    start: function () {
      var self = this;
      if (this._timer) clearInterval(this._timer);
      this._timer = setInterval(function () { if (self.configured()) self.syncNow(); }, 3 * 60 * 1000);
      if (typeof window !== 'undefined') window.addEventListener('online', function () { if (self.configured()) self.syncNow(); });
      if (self.configured()) setTimeout(function () { self.syncNow(); }, 2500);
    }
  };

  global.STKSZSync = sync;
  if (typeof module !== 'undefined' && module.exports) module.exports = sync;
})(typeof window !== 'undefined' ? window : globalThis);
