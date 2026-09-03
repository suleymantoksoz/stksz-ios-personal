/* =====================================================================
   STKSZ SIFIR GÜVEN ANAHTAR KASASI (M48) · Secret Vault Client
   ---------------------------------------------------------------------
   Kullanıcının girdiği API kimlik bilgileri ARTIK localStorage'da kalıcı
   birincil depo DEĞİLDİR. Varsayılan akış kimlik bilgilerini güvenli
   bağlantıyla backend Secret Vault'a (/api/vault/*) gönderir; uzak
   kasaya ulaşılamadığında yalnızCA çevrimdışı anlık çalışma için eski
   yerel depoyu arka plan acil durum olarak korur.
   - GET  /api/vault/has     → hangi sağlayıcıların anahtarının var olduğu
   - POST /api/vault/set     → anahtar yaz (değer GİZLİ saklanır)
   - POST /api/vault/disable → sağlayıcı durdur/başlat
   - POST /api/vault/clear   → kasayı temizle
   AI'ya anahtar DEĞERİ asla iletilmez; yalnız var/yok durumu.
   ===================================================================== */
(function initStkszSecretVault(global) {
  'use strict';
  const LEGACY_KV = 'stkszApiKeys';
  const SERVER_KEY = 'stksz_ai_backend_url';
  const legacyRead = () => { try { return JSON.parse(localStorage.getItem(LEGACY_KV) || '{}') || {}; } catch (e) { return {}; } };
  const enabledServers = () => {
    const list = [];
    const direct = legacyRead()[SERVER_KEY] || '';
    if (direct) (String(direct).split(',')).forEach(s => { const t = s.trim(); if (t) list.push(t); });
    return list;
  };
  async function vaultFetch(url, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, Object.assign({ method: 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal }, opts || {}));
      let payload = {}; try { payload = await res.json().catch(() => ({})); } catch (e) {}
      return { ok: res.ok, status: res.status, payload };
    } catch (e) { return { ok: false, status: 0, payload: {} }; }
    finally { clearTimeout(timer); }
  }
  async function reachableServers() {
    const servers = enabledServers();
    const out = [];
    for (const s of servers.slice(0, 3)) {
      const health = await vaultFetch((String(s).replace(/\/+$/, '')) + '/api/ai/health');
      if (health.ok) out.push(String(s).replace(/\/+$/, ''));
    }
    return out;
  }
  const api = {
    /* anahtar var mı / değeri ASLA dönmez */
    async has(provider) {
      const servers = await reachableServers();
      if (servers.length) {
        const r = await vaultFetch(servers[0] + '/api/vault/has');
        if (r.ok && r.payload && r.payload.providers) return Object.prototype.hasOwnProperty.call(r.payload.providers, provider) && r.payload.providers[provider] === true;
      }
      const raw = legacyRead()[provider];
      return typeof raw === 'string' && raw.trim() && legacyRead()['disabled_' + provider] !== '1';
    },
    async set(provider, value) {
      const servers = await reachableServers();
      const clean = String(value || '').trim();
      let vaultOk = false;
      for (const s of servers) {
        const r = await vaultFetch(s + '/api/vault/set', { method: 'POST', body: JSON.stringify({ provider, value: clean }) });
        if (r.ok) { vaultOk = true; break; }
      }
      /* çevrimdışı acil durum: uzak kasa yoksa eski yerel depoya geçici yaz */
      if (!vaultOk && !servers.length) {
        const d = legacyRead();
        if (clean) d[provider] = clean; else delete d[provider];
        try { localStorage.setItem(LEGACY_KV, JSON.stringify(d)); return { ok: true, offline: true }; } catch (e) {}
      }
      return { ok: vaultOk || !clean, offline: servers.length === 0 };
    },
    async disable(provider, flag) {
      const servers = await reachableServers();
      if (servers.length) { for (const s of servers) await vaultFetch(s + '/api/vault/disable', { method: 'POST', body: JSON.stringify({ provider, disabled: flag }) }); }
      else { const d = legacyRead(); if (flag) d['disabled_' + provider] = '1'; else delete d['disabled_' + provider]; try { localStorage.setItem(LEGACY_KV, JSON.stringify(d)); } catch (e) {} }
      return true;
    },
    async clear() {
      const servers = await reachableServers();
      if (servers.length) { for (const s of servers) await vaultFetch(s + '/api/vault/clear', { method: 'POST' }); }
      try { localStorage.removeItem(LEGACY_KV); } catch (e) {}
      return true;
    },
    configuredServers() { return enabledServers(); }
  };
  global.STKSZSecretVault = api;
})(typeof window !== 'undefined' ? window : this);
