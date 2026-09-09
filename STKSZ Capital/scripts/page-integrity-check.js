/**
 * STKSZ Capital - Page Integrity Check
 * FAZ 1/2: DOM + statik kalite kontrolleri
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const htmlPath = path.join(ROOT, 'www', 'index.html');
const cssPath = path.join(ROOT, 'www', 'style.css');
const MAIN_PAGES = [
  'page-home', 'page-portfolio', 'page-news', 'page-status',
  'page-opportunities', 'page-crypto', 'page-settings', 'page-risk',
  'page-crypto-detail'
];

function pass(msg) { console.log('[INTEGRITY] PASS ' + msg); }
function fail(msg) { console.error('[INTEGRITY] FAIL ' + msg); }
function info(msg) { console.log('           ' + msg); }

let hasError = false;

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const doc = dom.window.document;
const main = doc.getElementById('appScroll');

if (!main) { fail('main#appScroll bulunamadı'); process.exit(1); }

// 1. Ana sayfalar
console.log('1) Ana .page sayfaları...');
for (const id of MAIN_PAGES) {
  const el = doc.getElementById(id);
  if (!el) { fail(id + ' eksik'); hasError = true; continue; }
  if (!el.classList.contains('page')) { fail(id + ' .page sınıfı yok'); hasError = true; }
  if (el.parentElement !== main) { fail(id + ' #appScroll çocuğu değil'); hasError = true; }
}
if (!hasError) pass('Tüm ana sayfalar #appScroll altında');

// 2. Nested ana .page
console.log('2) Nested ana .page...');
let nested = 0;
doc.querySelectorAll('.page').forEach(p => {
  const parentPage = p.parentElement ? p.parentElement.closest('.page') : null;
  if (parentPage) { nested++; fail(p.id + ' -> ' + parentPage.id + ' nested'); }
});
if (nested === 0) pass('Nested ana .page = 0');
else hasError = true;

// 3. Active durumu
console.log('3) Active ana sayfa...');
const actives = [...doc.querySelectorAll('#appScroll > .page.active')];
if (actives.length === 1) pass('Active: ' + actives[0].id);
else { fail('Active sayısı=' + actives.length); hasError = true; }

// 4. Duplicate ID
console.log('4) Duplicate ID (tüm doküman)...');
let dupCount = 0;
const seen = {};
doc.querySelectorAll('[id]').forEach(el => {
  const id = el.id;
  if (!id) return;
  seen[id] = (seen[id] || 0) + 1;
});
for (const [id, n] of Object.entries(seen)) {
  if (n > 1) { info('#' + id + ': ' + n + ' adet'); dupCount++; }
}
if (dupCount === 0) pass('Duplicate ID = 0');
else { fail('Duplicate ID: ' + dupCount + ' çoğaltı'); hasError = true; }

// 5. showPage/nav fonksiyonları
console.log('5) Fonksiyon tanımları...');
for (const fn of ['showPage', 'openMenuPanel', 'openUnifiedMenu', 'closeUnifiedMenu', 'authShowLoginOptions', 'authShowRegisterOptions', 'authGuest', 'authRegister', 'openStkszEditorPage']) {
  if (html.includes('function ' + fn)) pass(fn + '() mevcut');
  else { fail(fn + '() eksik'); hasError = true; }
}

// 6. STKSZEntitlement modülü
console.log('6) Entitlement modülü...');
if (html.includes('stksz-entitlement.js')) pass('stksz-entitlement.js bağlanmış');
else { fail('stksz-entitlement.js bağlantı eksik'); hasError = true; }

// 7. isGuest/isAuthed delegation
console.log('7) Auth delegasyonu...');
const isGuestDel = html.includes('function isGuest(){return window.STKSZEntitlement?window.STKSZEntitlement.isGuest()');
const isAuthedDel = html.includes('function isAuthed(){return window.STKSZEntitlement?window.STKSZEntitlement.isAuthed()');
if (isGuestDel) pass('isGuest → STKSZEntitlement delegasyonu');
else { fail('isGuest delegasyonu eksik'); hasError = true; }
if (isAuthedDel) pass('isAuthed → STKSZEntitlement delegasyonu');
else { fail('isAuthed delegasyonu eksik'); hasError = true; }

// 8. Auth duplicate logo
console.log('8) Auth markup...');
const authLogoImgCount = (html.match(/class="auth-logo"/g) || []).length;
const authHeroLogoCount = (html.match(/class="auth-hero-logo"/g) || []).length;
info('auth-logo class: ' + authLogoImgCount + ', auth-hero-logo: ' + authHeroLogoCount);
if (authLogoImgCount === 0) pass('Duplicate .auth-logo kaldırıldı');
else { fail('.auth-logo img hâlâ mevcut (' + authLogoImgCount + ')'); hasError = true; }
if (authHeroLogoCount >= 1) pass('auth-hero-logo mevcut');
else { fail('auth-hero-logo eksik'); hasError = true; }

// 9. Honest OAuth message
console.log('9) OAuth dürüst mesaj...');
const hasHonest = html.includes('Google ile giriş şu anda yapılandırılmadı.') && html.includes('Apple ile giriş şu anda yapılandırılmadı.');
const hasEnvLeak = html.includes('OAuth yapılandırması gerekli') || html.includes('Client ID / Services ID');
if (hasHonest) pass('OAuth dürüst mesajlar mevcut');
else { fail('OAuth dürüst mesaj eksik'); hasError = true; }
if (!hasEnvLeak) pass('ENV sızıntısı yok');
else { fail('ENV sızıntısı tespit edildi'); hasError = true; }

// 10. Cache bust
console.log('10) Cache bust...');
const hasV124Css = html.includes('style.css?v=124');
const hasSWBump = html.includes('service-worker.js?v=20260909-auth-v124');
if (hasV124Css) pass('style.css?v=124');
else { fail('style.css?v=124 eksik'); hasError = true; }
if (hasSWBump) pass('service-worker v124 (20260909-auth-v124)');
else { fail('service-worker v124 eksik'); hasError = true; }

// 11. Neon #00df78 in CSS
console.log('11) CSS neon kalıntıları...');
const neonCount = (css.match(/#00df78/gi) || []).length;
info('#00df78 count: ' + neonCount);
if (neonCount === 0) pass('#00df78 = 0');
else { fail('#00df78 hâlâ mevcut: ' + neonCount); hasError = true; }

// 12. Near-black surfaces
console.log('12) Saf siyah yüzeyler...');
const nearBlack = { '#070a0b': 0, '#0b1012': 0, '#0d0e12': 0, '#0a0d0f': 0, '#0a0e10': 0, '#0a0f11': 0, '#080c0e': 0 };
for (const hex of Object.keys(nearBlack)) {
  nearBlack[hex] = (css.split(hex).length - 1);
  if (nearBlack[hex] > 0) info(hex + ': ' + nearBlack[hex]);
}
const nearBlackTotal = Object.values(nearBlack).reduce((a, b) => a + b, 0);
if (nearBlackTotal === 0) pass('Saf siyah yüzey = 0');
else { fail('Saf siyah yüzey hâlâ mevcut: ' + nearBlackTotal); hasError = true; }

// 13. break-all in CSS (promo-code-item b is legit for machine codes)
console.log('13) break-all CSS...');
const breakAllMatches = css.match(/word-break:\s*break-all/gi) || [];
const breakAll = breakAllMatches.length;
const breakAllInCodeDisplay = (css.match(/\.promo-code-item\s+b[^}]*word-break:\s*break-all/gi) || []).length;
const breakAllNonCode = breakAll - breakAllInCodeDisplay;
info('break-all total: ' + breakAll + ', code-display (ok): ' + breakAllInCodeDisplay + ', other: ' + breakAllNonCode);
if (breakAllNonCode === 0) pass('break-all yalnız promo-code-item b\'de (makine kodu — doğru)');
else { fail('break-allOther yerlerde: ' + breakAllNonCode); hasError = true; }

// 14. Inline #00df78 in HTML
console.log('14) HTML inline neon...');
const htmlNeon = (html.match(/#00df78/gi) || []).length;
if (htmlNeon === 0) pass('HTML inline #00df78 = 0');
else { fail('HTML inline #00df78: ' + htmlNeon); hasError = true; }

// 15. roles / entitlement refs
console.log('15) Entitlement/role referansları...');
const entRefs = ['STKSZEntitlement', 'entitlement.js', 'entitlements'];
let entCount = 0;
for (const ref of entRefs) {
  const n = (html.match(new RegExp(ref, 'gi')) || []).length;
  if (n > 0) { info(ref + ': ' + n); entCount++; }
}
if (entCount > 0) pass('Entitlement referansları mevcut');
else { fail('Entitlement referansları eksik'); hasError = true; }

console.log('\n=== SONUÇ ===');
if (hasError) { fail('PAGE INTEGRITY BAŞARISIZ'); process.exit(1); }
pass('Tüm FAZ 1/2 kontrolleri geçti');
process.exit(0);