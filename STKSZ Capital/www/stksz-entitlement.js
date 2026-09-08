/* =====================================================================
   STKSZ CAPITAL · TRİBÜT/TİER TEK KAYNAK (FAZ 2)
   ---------------------------------------------------------------------
   Rol/erişim için TEK merkezi salt-okunur yardımcı.
   Canonical veri kaynakları (yalnız bunlardan okur, YAZMAZ):
     1) Hesap/oturum  -> localStorage 'stkszAuth' (authState)
     2) Rozet/entitlement -> STKSZAIEngine.entitlements (stkszEntitlements)
   Görünüm bu katmandan türer; bu katman görünümü değiştirerek premium
   unlock edemez (gerçek yetki engine + backend'te korunur).
   ===================================================================== */
(function () {
  'use strict';

  var KEY_AUTH = 'stkszAuth';

  function readAuth() {
    try { return JSON.parse(localStorage.getItem(KEY_AUTH) || 'null'); }
    catch (e) { return null; }
  }

  function engineEnt() {
    try {
      var eng = window.STKSZAIEngine;
      return (eng && eng.entitlements) ? eng.entitlements : null;
    } catch (e) { return null; }
  }

  function badgeIds() {
    var ent = engineEnt();
    if (!ent || typeof ent.badges !== 'function') return [];
    try {
      var list = ent.badges();
      return Array.isArray(list) ? list.map(function (b) { return (b && b.id) || b; }) : [];
    } catch (e) { return []; }
  }

  function isAdmin() {
    var ent = engineEnt();
    if (ent && typeof ent.isAdmin === 'function') {
      try { return Boolean(ent.isAdmin()); } catch (e) { return false; }
    }
    return badgeIds().indexOf('ADMIN') >= 0;
  }

  function hasFeature(feature) {
    var f = String(feature || '').toLowerCase();
    var ent = engineEnt();
    if (ent && typeof ent.has === 'function') {
      try { return Boolean(ent.has(f)); } catch (e) {}
    }
    var map = {
      'ai_pro': ['KRAL', 'STKSZ_PRO', 'STKSZ_ELITE', 'ADMIN'],
      'chart_premium': ['KRAL', 'GRAFIK_USTASI', 'STKSZ_ELITE', 'ADMIN'],
      'analysis_pro': ['STRATEJIST', 'STKSZ_ELITE', 'ADMIN'],
      'stksz_editor': ['KRAL', 'STKSZ_ELITE', 'ADMIN'],
      'admin_panel': ['ADMIN']
    };
    var ids = badgeIds();
    return (map[f] || []).some(function (b) { return ids.indexOf(b) >= 0; });
  }

  function isGuest() {
    var a = readAuth();
    return Boolean(a && a.mode === 'guest');
  }

  function isAuthed() {
    var a = readAuth();
    return Boolean(a && (a.mode === 'account' || a.mode === 'guest'));
  }

  function accountName() {
    var a = readAuth();
    return (a && a.username) || '';
  }

  /* TEK rol çözümü: GUEST < FREE < PRO < ELITE < ADMIN */
  function role() {
    if (!isAuthed() || isGuest()) return 'GUEST';
    if (isAdmin()) return 'ADMIN';
    var ids = badgeIds();
    if (ids.indexOf('STKSZ_ELITE') >= 0) return 'ELITE';
    if (ids.indexOf('STKSZ_PRO') >= 0 || ids.indexOf('KRAL') >= 0) return 'PRO';
    return 'FREE';
  }

  /* Kilitli öğeye basınca kısa + giriş yönlendirmesi */
  function lockMessage() {
    return { header: 'GİRİŞ GEREKLİ', body: 'Bu özellik için hesabınla giriş yap. Menü → Profil\'den kayıt olabilirsin.' };
  }

  window.STKSZEntitlement = {
    readAuth: readAuth,
    isGuest: isGuest,
    isAuthed: isAuthed,
    isAdmin: isAdmin,
    has: hasFeature,
    badges: badgeIds,
    role: role,
    accountName: accountName,
    lockMessage: lockMessage
  };
})();