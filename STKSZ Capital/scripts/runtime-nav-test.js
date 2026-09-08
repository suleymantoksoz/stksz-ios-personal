const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'www', 'index.html'), 'utf8');

const vc = new VirtualConsole();
const uncaught = [];
vc.on('jsdomError', (err) => { uncaught.push('jsdomError: ' + (err && err.message)); });
const consoleLines = [];
vc.on('error', (msg) => consoleLines.push(String(msg)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://stksz.app/',
  virtualConsole: vc,
  beforeParse(win) {
    win.Capacitor = {
      isNativePlatform: () => false,
      getPlatform: () => 'web',
      Plugins: {},
    };
    win.fetch = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    win.XMLHttpRequest = win.XMLHttpRequest;
    win.matchMedia = win.matchMedia || function (mq) {
      return { matches: false, media: mq, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
    };
    const digest = async () => new Uint8Array([0]);
    if (win.crypto && win.crypto.subtle === undefined) {
      try { win.crypto.subtle = { digest, encrypt: async () => ({}), decrypt: async () => ({}), generateKey: async () => ({}), importKey: async () => ({}), exportKey: async () => ({}), sign: async () => ({}), verify: async () => true }; } catch (e) {}
    } else if (!win.crypto) {
      win.crypto = { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 256) | 0; return a; }, subtle: { digest } };
    }
  },
});

const win = dom.window;
const doc = win.document;

function fail(msg) { console.log('FAIL | ' + msg); process.exitCode = 1; return false; }
function info(msg) { console.log('     ' + msg); }
let failures = 0;

setTimeout(() => {

  try {
    // ---- 0) boot state ----
    const mains = [...doc.querySelectorAll('#appScroll > .page.page')];
    const actives = [...doc.querySelectorAll('#appScroll > .page.active')];
    info('başlangıç: main .page = ' + mains.length + ', active = ' + actives.length);
    if (actives.length !== 1 || actives[0].id !== 'page-home') fail('boot: tek active page-home beklenir, aktif=' + (actives[0] && actives[0].id));

    // ---- NAV testi ----
    const targets = ['home', 'portfolio', 'news', 'status', 'opportunities', 'crypto'];
    for (const id of targets) {
      const btn = doc.querySelector(`.nav button[data-page="${id}"]`);
      if (!btn) { fail(`nav butonu eksik: ${id}`); continue; }
      btn.click();
      const act = [...doc.querySelectorAll('#appScroll > .page.active')];
      const ok = act.length === 1 && act[0].id === 'page-' + id;
      const navok = btn.classList.contains('active') && btn.getAttribute('aria-current') === 'page';
      const page = doc.getElementById('page-' + id);
      const textLen = (page ? page.textContent.length : 0);
      const contentOk = textLen > 80;
      info(`${id}: active=${act.map(a => a.id).join(',')} navok=${navok} textLen=${textLen}`);
      if (!ok) fail(`${id}: beklentiden farklı active set`);
      if (!navok) fail(`${id}: nav aktiflik güncellenmedi`);
      if (!contentOk) fail(`${id}: sayfa içeriği donuk/boş (${textLen} char)`);
      if (id !== 'settings') {
        const menubtn = doc.querySelector('.header-menu-btn');
        if (menubtn && menubtn.getAttribute('aria-expanded') === 'true') fail(`${id}: menu expanded statüsü takılı`);
      }
      throwOnErrorCheck(id);
    }

    // settings'e geçiş (menü), openMenuPanel, geri dönüş
    const preMenuActive = [...doc.querySelectorAll('#appScroll > .page.active')].map(a => a.id).join(',');
    const menuBtn = doc.querySelector('.header-menu-btn');
    menuBtn.click();
    let act = [...doc.querySelectorAll('#appScroll > .page.active')];
    const settingsOpen = act.length === 1 && act[0].id === 'page-settings' && menuBtn.getAttribute('aria-expanded') === 'true';
    if (!settingsOpen) fail('menü: settings açılmadı / aria-expanded=true değil');
    else info('menü: settings açıldı, aria-expanded=true');
    if (typeof win.openMenuPanel === 'function') {
      win.openMenuPanel('menuProfile');
      const mv = doc.getElementById('menuProfile');
      const profileVisible = mv && !mv.hidden;
      info('menuProfile visible=' + profileVisible);
      if (!profileVisible) fail('menü: menuProfile paneli görünür değil');
    }
    win.closeUnifiedMenu();
    act = [...doc.querySelectorAll('#appScroll > .page.active')];
    const backOk = act.length === 1 && act[0].id === preMenuActive;
    info('closeUnifiedMenu → ' + act.map(a => a.id).join(',') + ' (beklenen: ' + preMenuActive + ')');
    if (!backOk) fail('menü kapanınca önceki sayfaya dönülmedi');

    // ---- SEARCH ----
    if (typeof win.openSearch === 'function') { win.openSearch(); } else fail('openSearch tanımsız');
    const modal = doc.getElementById('searchModal');
    const modalVisible = modal && modal.classList.contains('modal') && modal.classList.contains('show');
    const scrollHidden = modalVisible ? win.getComputedStyle(doc.body).overflow : '?';
    win.closeSearch();
    const modalHiddenAfter = modal && !modal.classList.contains('show');
    info(`search: açılış(show)=${modalVisible} bodyoverflow@açık=${scrollHidden} kapanış(hidden)=${modalHiddenAfter}`);
    if (!modalVisible) fail('search: modal .show olmadı');
    if (!modalHiddenAfter) fail('search: kapatınca .show kaldırılmadı');

    // ---- FAZ 2: AUTH FLOW TESTS ----
    info('');
    info('=== FAZ 2 AUTH FLOW ===');

    // 0) Auth gate initially visible (no localStorage = anonymous)
    const authGate = doc.getElementById('authGate');
    const gateVisible = authGate && !authGate.hidden;
    info('authGate visible (no auth): ' + gateVisible);
    // Note: jsdom'da localStorage boş değilse AUTH_ENABLED boot'u gate'i gizleyebilir;
    // bu bir başarısızlık değil, sadece durum günlüğü.

    // 1) Auth functions exist
    const authFns = ['authShowLoginOptions', 'authShowRegisterOptions', 'authShowAdminLogin', 'authGuest'];
    for (const fn of authFns) {
      const exists = typeof win[fn] === 'function';
      info(fn + ' defined: ' + exists);
      if (!exists) fail('auth fonksiyonu eksik: ' + fn);
    }

    // 2) STKSZEntitlement module exists (jsdom external script src'yi çalıştırmaz -> kaynağı değerlendir)
    let entExists = Boolean(win.STKSZEntitlement);
    if (!entExists) {
      try {
        const entSrc = fs.readFileSync(path.join(ROOT, 'www', 'stksz-entitlement.js'), 'utf8');
        win.eval(entSrc);
      } catch (e) { info('entitlement eval hatası: ' + e.message); }
      entExists = Boolean(win.STKSZEntitlement);
    }
    info('STKSZEntitlement module: ' + entExists);
    if (!entExists) fail('STKSZEntitlement modülü tanımsız');

    // 3) isGuest/isAuthed delegation
    if (entExists) {
      const eg = win.STKSZEntitlement.isGuest();
      const ea = win.STKSZEntitlement.isAuthed();
      const role = win.STKSZEntitlement.role();
      info('entitlement: isGuest=' + eg + ' isAuthed=' + ea + ' role=' + role);
    }

    // 4) Guest mode flow
    if (typeof win.authGuest === 'function') {
      try {
        win.authGuest();
        const gs = win.STKSZEntitlement ? win.STKSZEntitlement.isGuest() : null;
        info('authGuest() → isGuest=' + gs);
        if (gs !== true) fail('authGuest(): isGuest true beklenir');
        const gateHidden = authGate && authGate.hidden;
        info('authGate hidden after guest: ' + gateHidden);
      } catch (e) { fail('authGuest() hatası: ' + e.message); }
    }

    // 5) Google/Apple honest messages (no crypto/ENV details)
    if (typeof win.authRegister === 'function') {
      try {
        win.authRegister('google');
        const msgs = [...doc.querySelectorAll('.toast')].map(t => t.textContent).join(' ');
        const hasHonest = msgs.includes('yapılandırılmadı');
        const hasEnvLeak = msgs.includes('Client ID') || msgs.includes('API key') || msgs.includes('Services ID');
        info('authRegister(google) toast: honest=' + hasHonest + ' envLeak=' + hasEnvLeak);
        if (!hasHonest) fail('Google auth dürüst mesaj eksik');
        if (hasEnvLeak) fail('Google auth ENV sızıntısı!');
      } catch (e) { fail('authRegister(google) hatası: ' + e.message); }
    }

    // 6) Entitlement badges
    if (entExists) {
      const badges = win.STKSZEntitlement.badges();
      info('entitlement badges: ' + JSON.stringify(badges));
      const hasRole = typeof win.STKSZEntitlement.role === 'function';
      if (!hasRole) fail('STKSZEntitlement.role() tanımsız');
    }

    // 7) showPage still works after auth state changes
    const navBtn = doc.querySelector('.nav button[data-page="home"]');
    if (navBtn) {
      navBtn.click();
      const finalAct = [...doc.querySelectorAll('#appScroll > .page.active')];
      const finalOk = finalAct.length === 1 && finalAct[0].id === 'page-home';
      info('post-auth showPage: active=' + finalAct.map(a => a.id).join(','));
      if (!finalOk) fail('post-auth showPage: beklenen page-home değil');
    }

  } catch (e) {
    fail('test yürütme hatası: ' + e.message);
  }

  // ---- uncaught error raporu ----
  const winErrors = win.__faz1WindowErrors || [];
  info('uncaught (window.error): ' + winErrors.length);
  for (const e of winErrors) info('  window.error: ' + e);
  info('uncaught (jsdomError): ' + uncaught.length);
  for (const e of uncaught) info('  ' + e);

  console.log('=== SONUÇ ===');
  if (process.exitCode || uncaught.length > 0) {
    console.log('RUNTIME-NAV: FAIL');
    process.exit(1);
  }
  console.log('RUNTIME-NAV: PASS');
  process.exit(0);
}, 400);

function throwOnErrorCheck(id) {
  if (win.__faz1WindowErrors && win.__faz1WindowErrors.length) {
    fail(id + ': window error yakalandı: ' + win.__faz1WindowErrors[0]);
  }
}

win.addEventListener('error', (ev) => {
  if (!win.__faz1WindowErrors) win.__faz1WindowErrors = [];
  win.__faz1WindowErrors.push((ev && ev.message) || 'unknown');
});